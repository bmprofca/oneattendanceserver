import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import getIndianHolidays from "../utils/getIndianHolidays.js";
import { HOLIDAY } from "../constants/permissions.js";
import { sendSuccess, sendError, buildMeta, safeNumber, sanitizeText, } from "../utils/sendResponse.js";
import { formatUTCToIST } from "../utils/time.js";

const router = express.Router();

const formatHoliday = (row, { includeAudit = false } = {}) => {
  const holiday = {
    id: row.id,
    name: row.name,
    date: row.date,
    is_optional: row.is_optional == 1,
    is_active: row.is_active == 1,
    created_at: formatUTCToIST(row.created_at),
    updated_at: formatUTCToIST(row.updated_at),
  };

  if (includeAudit) {
    holiday.created_by = row.created_by_id
      ? { id: row.created_by_id, name: row.created_by_name }
      : null;
    holiday.updated_by = row.updated_by_id
      ? { id: row.updated_by_id, name: row.updated_by_name }
      : null;
  }

  return holiday;
};

const HOLIDAY_QUERIES = {
  selectActiveBase: `
    SELECT id, name, date, is_optional, is_active, created_at, updated_at
    FROM holidays
    WHERE company_id = ? AND is_deleted = 0 AND is_active = 1
  `,
  selectById: `SELECT * FROM holidays WHERE id = ?`,
  insert: `
    INSERT INTO holidays
      (company_id, name, date, is_optional, is_active, created_by, updated_by, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, NOW())
  `,
  restoreSoftDeleted: `
    UPDATE holidays
    SET name = ?, date = ?, is_optional = ?,
        is_deleted = 0, is_active = 1,
        deleted_at = NULL, deleted_by = NULL,
        updated_by = ?, updated_at = NOW()
    WHERE id = ?
  `,
  softDelete: `
    UPDATE holidays
    SET is_deleted = 1, is_active = 0,
        deleted_at = NOW(), deleted_by = ?,
        updated_by = ?, updated_at = NOW()
    WHERE id = ?
  `,
  checkExistingByDate: `
    SELECT id, is_deleted FROM holidays
    WHERE company_id = ? AND date = ?
    LIMIT 1 FOR UPDATE
  `,
  checkDuplicateDate: `
    SELECT id FROM holidays
    WHERE company_id = ? AND id != ? AND is_deleted = 0 AND date = ?
    LIMIT 1
  `,
  countBase: `
    SELECT COUNT(*) as total FROM holidays
    WHERE company_id = ? AND is_deleted = 0 AND is_active = 1
  `,
};

router.get("/master-holidays", async (req, res) => {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const month = req.query.month ? Number(req.query.month) : undefined;

    if (!year) {
      return sendError(res, 400, "Year is required");
    }
    if (month && (month < 1 || month > 12)) {
      return sendError(res, 400, "Month must be between 1 and 12");
    }

    const holidays = await getIndianHolidays({ year, month });
    return sendSuccess(res, 200, "Master holidays fetched", holidays, {
      count: holidays.length,
    });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

router.post("/create", auth(HOLIDAY.MNG), async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { name, date, is_optional } = req.body;
    const company_id = req.company?.id;
    const user_id = req.user?.id;

    if (!company_id) return sendError(res, 400, "Company context missing");

    const cleanName = sanitizeText(name, 100);
    if (!cleanName || !date) return sendError(res, 400, "Name and date are required");

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) return sendError(res, 400, "Date must be in YYYY-MM-DD format");

    await conn.beginTransaction();

    const [existing] = await conn.query(HOLIDAY_QUERIES.checkExistingByDate, [
      company_id,
      date,
    ]);

    let holidayId;

    if (existing.length) {
      const holiday = existing[0];
      if (holiday.is_deleted) {
        await conn.query(HOLIDAY_QUERIES.restoreSoftDeleted, [
          cleanName,
          date,
          is_optional ? 1 : 0,
          user_id,
          holiday.id,
        ]);
        holidayId = holiday.id;
      } else {
        await conn.rollback();
        return sendError(res, 400, `Holiday already exists on ${date}`);
      }
    } else {
      const [result] = await conn.query(HOLIDAY_QUERIES.insert, [
        company_id,
        cleanName,
        date,
        is_optional ? 1 : 0,
        user_id,
        user_id,
      ]);
      holidayId = result.insertId;
    }

    const [rows] = await conn.query(HOLIDAY_QUERIES.selectById, [holidayId]);
    await conn.commit();

    const formatted = formatHoliday(rows[0]);
    return sendSuccess(res, 200, "Holiday created successfully", formatted);
  } catch (err) {
    await conn.rollback();
    return sendError(res, 400, err.message || "Server error");
  } finally {
    conn.release();
  }
});

router.get("/company/list", auth(HOLIDAY.MNG), async (req, res) => {
  try {
    const company_id = req.company?.id;
    if (!company_id) return sendError(res, 400, "Company context missing");

    const page = safeNumber(req.query.page, 1);
    const limit = safeNumber(req.query.limit, 10);
    const offset = (page - 1) * limit;

    const {
      search = "",
      sort_by = "date",
      sort_order = "ASC",
      is_optional,
      from_date,
      to_date,
      month,
      upcoming,
    } = req.query;

    const allowedSortFields = ["date", "name", "created_at"];
    const allowedSortOrder = ["ASC", "DESC"];
    const finalSortBy = allowedSortFields.includes(sort_by) ? sort_by : "date";
    const finalSortOrder = allowedSortOrder.includes(sort_order.toUpperCase())
      ? sort_order.toUpperCase()
      : "ASC";

    let whereClause = "";
    const params = [company_id];
    const countParams = [company_id];

    if (search) {
      const searchPattern = `%${sanitizeText(search, 50)}%`;
      whereClause += ` AND name LIKE ?`;
      params.push(searchPattern);
      countParams.push(searchPattern);
    }
    if (is_optional !== undefined) {
      whereClause += ` AND is_optional = ?`;
      params.push(is_optional);
      countParams.push(is_optional);
    }
    if (from_date && to_date) {
      whereClause += ` AND date BETWEEN ? AND ?`;
      params.push(from_date, to_date);
      countParams.push(from_date, to_date);
    }
    if (month) {
      whereClause += ` AND MONTH(date) = ?`;
      params.push(month);
      countParams.push(month);
    }
    if (upcoming !== undefined) {
      whereClause += ` AND date >= CURDATE()`;
    }

    const selectQuery = `${HOLIDAY_QUERIES.selectActiveBase} ${whereClause} ORDER BY ${finalSortBy} ${finalSortOrder} LIMIT ? OFFSET ?`;
    const countQuery = `${HOLIDAY_QUERIES.countBase} ${whereClause}`;

    const [data] = await db.query(selectQuery, [...params, limit, offset]);
    const [countResult] = await db.query(countQuery, countParams);

    const total = countResult[0].total;
    const meta = buildMeta(page, limit, total, data.length);

    const formattedData = data.map((row) => formatHoliday(row));
    return sendSuccess(res, 200, "Holidays list fetched", formattedData, meta);
  } catch (err) {
    console.error("Holiday List Error:", err);
    return sendError(res, 500, "Something went wrong while fetching holidays");
  }
});

router.put("/update", auth(HOLIDAY.MNG), async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id, name, date, is_optional } = req.body;
    const company_id = req.company?.id;
    const user_id = req.user?.id;

    if (!company_id) return sendError(res, 400, "Company context missing");
    if (!id) return sendError(res, 400, "Holiday id is required");

    await conn.beginTransaction();

    const [existingRows] = await conn.query(
      `SELECT * FROM holidays WHERE id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1 FOR UPDATE`,
      [id, company_id]
    );
    if (!existingRows.length) {
      await conn.rollback();
      return sendError(res, 404, "Holiday not found");
    }

    const existing = existingRows[0];
    const finalName = name !== undefined ? sanitizeText(name, 100) : existing.name;
    const finalDate = date || existing.date;
    const finalIsOptional =
      is_optional !== undefined ? (is_optional ? 1 : 0) : existing.is_optional;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (date && !dateRegex.test(date)) {
      await conn.rollback();
      return sendError(res, 400, "Date must be in YYYY-MM-DD format");
    }

    const [duplicate] = await conn.query(HOLIDAY_QUERIES.checkDuplicateDate, [
      company_id,
      id,
      finalDate,
    ]);
    if (duplicate.length) {
      await conn.rollback();
      return sendError(res, 400, `Another holiday already exists on ${finalDate}`);
    }

    const fields = [];
    const values = [];
    if (name !== undefined) {
      fields.push("name = ?");
      values.push(finalName);
    }
    if (date !== undefined) {
      fields.push("date = ?");
      values.push(finalDate);
    }
    if (is_optional !== undefined) {
      fields.push("is_optional = ?");
      values.push(finalIsOptional);
    }

    if (fields.length === 0) {
      await conn.rollback();
      return sendError(res, 400, "No fields provided to update");
    }

    fields.push("updated_by = ?", "updated_at = NOW()");
    values.push(user_id, id);

    await conn.query(`UPDATE holidays SET ${fields.join(", ")} WHERE id = ?`, values);

    const [rows] = await conn.query(HOLIDAY_QUERIES.selectById, [id]);
    await conn.commit();

    const formatted = formatHoliday(rows[0]);
    return sendSuccess(res, 200, "Holiday updated successfully", formatted);
  } catch (err) {
    await conn.rollback();
    console.error("Update Holiday Error:", err);
    return sendError(res, 500, "Something went wrong while updating holiday");
  } finally {
    conn.release();
  }
});

router.delete("/delete", auth(HOLIDAY.MNG), async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id } = req.body;
    const company_id = req.company?.id;
    const user_id = req.user?.id;

    if (!company_id) return sendError(res, 400, "Company context missing");
    if (!id) return sendError(res, 400, "Holiday id is required");

    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id FROM holidays WHERE id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1 FOR UPDATE`,
      [id, company_id]
    );
    if (!rows.length) {
      await conn.rollback();
      return sendError(res, 404, "Holiday not found or already deleted");
    }

    await conn.query(HOLIDAY_QUERIES.softDelete, [user_id, user_id, id]);
    await conn.commit();

    return sendSuccess(res, 200, "Holiday deleted successfully");
  } catch (err) {
    await conn.rollback();
    console.error("Delete Holiday Error:", err);
    return sendError(res, 500, "Something went wrong while deleting holiday");
  } finally {
    conn.release();
  }
});

export default router;
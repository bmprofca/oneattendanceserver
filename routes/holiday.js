import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import getIndianHolidays from "../utils/getIndianHolidays.js";
import {HOLIDAY} from "../constants/permissions.js";


const router = express.Router();



router.get("/master-holidays", async (req, res) => {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const month = req.query.month ? Number(req.query.month) : undefined;

    
    if (!year) {
      return res.status(400).json({
        success: false,
        message: "Year is required"
      });
    }

    if (month && (month < 1 || month > 12)) {
      return res.status(400).json({
        success: false,
        message: "Month must be between 1 and 12"
      });
    }

    const holidays = await getIndianHolidays({ year, month });

    res.json({
      success: true,
      count: holidays.length,
      data: holidays
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});


router.post("/create", auth(HOLIDAY.MNG), async (req, res) => {
  const conn = await db.getConnection();

  try {
    const { name, date, is_optional } = req.body;
    const company_id = req.company?.id;
    const user_id = req.user?.id;

    if (!company_id) {
      return res.status(400).json({
        success: false,
        message: "Company context missing"
      });
    }

    
    if (!name || !date) {
      return res.status(400).json({
        success: false,
        message: "Name and date are required"
      });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        success: false,
        message: "Date must be in YYYY-MM-DD format"
      });
    }

    const cleanName = name.trim();

    await conn.beginTransaction();

    
    const [existing] = await conn.query(
      `SELECT id, is_deleted FROM holidays
       WHERE company_id = ?
       AND date = ?
       LIMIT 1 FOR UPDATE`,
      [company_id, date]
    );

    let holidayId;

    if (existing.length) {
      const holiday = existing[0];

      if (holiday.is_deleted) {
        
        await conn.query(
          `UPDATE holidays 
           SET name = ?, 
               date = ?, 
               is_optional = ?, 
               is_deleted = 0,
               is_active = 1,
               deleted_at = NULL,
               deleted_by = NULL,
               updated_by = ?,
               updated_at = NOW()
           WHERE id = ?`,
          [
            cleanName,
            date,
            is_optional ? 1 : 0,
            user_id,
            holiday.id
          ]
        );

        holidayId = holiday.id;

      } else {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: `Holiday already exists on ${date}`
        });
      }

    } else {
      
      const [result] = await conn.query(
        `INSERT INTO holidays
        (company_id, name, date, is_optional, is_active, created_by, updated_by, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, NOW())`,
        [
          company_id,
          cleanName,
          date,
          is_optional ? 1 : 0,
          user_id,
          user_id
        ]
      );

      holidayId = result.insertId;
    }

    
    const [rows] = await conn.query(
      `SELECT * FROM holidays WHERE id = ?`,
      [holidayId]
    );

    await conn.commit();

    return res.json({
      success: true,
      message: "Holiday created successfully",
      data: rows[0]
    });

  } catch (err) {
    await conn.rollback();

    return res.status(400).json({
      success: false,
      message: err.message || "Server error"
    });

  } finally {
    conn.release();
  }
});


router.get("/company/list", auth(HOLIDAY.MNG), async (req, res) => {
  try {
    const company_id = req.company?.id;

    if (!company_id) {
      return res.status(400).json({
        success: false,
        message: "Company context missing"
      });
    }

    
    const {
      page = 1,
      limit = 10,
      search = "",
      sort_by = "date",
      sort_order = "ASC",
      is_optional,
      from_date,
      to_date,
      month,
      upcoming
    } = req.query;

    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);
    const offset = (parsedPage - 1) * parsedLimit;

    
    const allowedSortFields = ["date", "name", "created_at"];
    const allowedSortOrder = ["ASC", "DESC"];

    const finalSortBy = allowedSortFields.includes(sort_by)
      ? sort_by
      : "date";

    const finalSortOrder = allowedSortOrder.includes(sort_order.toUpperCase())
      ? sort_order.toUpperCase()
      : "ASC";

    
    let query = `
      SELECT 
        id, 
        name, 
        date, 
        is_optional,
        is_active,
        created_at,
        updated_at
      FROM holidays
      WHERE company_id = ?
        AND is_deleted = 0
        AND is_active = 1
    `;

    let countQuery = `
      SELECT COUNT(*) as total
      FROM holidays
      WHERE company_id = ?
        AND is_deleted = 0
        AND is_active = 1
    `;

    const params = [company_id];
    const countParams = [company_id];

    
    if (search) {
      query += ` AND name LIKE ?`;
      countQuery += ` AND name LIKE ?`;
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }

    

    
    if (is_optional !== undefined) {
      query += ` AND is_optional = ?`;
      countQuery += ` AND is_optional = ?`;
      params.push(is_optional);
      countParams.push(is_optional);
    }

    
    if (from_date && to_date) {
      query += ` AND date BETWEEN ? AND ?`;
      countQuery += ` AND date BETWEEN ? AND ?`;
      params.push(from_date, to_date);
      countParams.push(from_date, to_date);
    }

    
    if (month) {
      query += ` AND MONTH(date) = ?`;
      countQuery += ` AND MONTH(date) = ?`;
      params.push(month);
      countParams.push(month);
    }

    
    if (upcoming !== undefined) {
      query += ` AND date >= CURDATE()`;
      countQuery += ` AND date >= CURDATE()`;
    }

    
    query += ` ORDER BY ${finalSortBy} ${finalSortOrder}`;

    
    query += ` LIMIT ? OFFSET ?`;
    params.push(parsedLimit, offset);

    
    const [data] = await db.query(query, params);
    const [countResult] = await db.query(countQuery, countParams);

    const total = countResult[0].total;

    return res.json({
      success: true,
      meta: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        total_pages: Math.ceil(total / parsedLimit)
      },
      data
    });

  } catch (err) {
    console.error("Holiday List Error:", err);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching holidays"
    });
  }
});


router.put("/update", auth(HOLIDAY.MNG), async (req, res) => {
  const conn = await db.getConnection();

  try {
    const { id, name, date, is_optional } = req.body;

    const company_id = req.company?.id;
    const user_id = req.user?.id;

    

    if (!company_id) {
      return res.status(400).json({
        success: false,
        message: "Company context missing"
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Holiday id is required"
      });
    }

    await conn.beginTransaction();

    
    const [existingRows] = await conn.query(
      `SELECT * FROM holidays
       WHERE id = ? 
         AND company_id = ?
         AND is_deleted = 0
       LIMIT 1 FOR UPDATE`,
      [id, company_id]
    );

    if (!existingRows.length) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "Holiday not found"
      });
    }

    const existing = existingRows[0];

    
    const finalName = name ? name.trim() : existing.name;
    const finalDate = date || existing.date;
    const finalIsOptional =
      is_optional !== undefined ? (is_optional ? 1 : 0) : existing.is_optional;

    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    if (date && !dateRegex.test(date)) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Date must be in YYYY-MM-DD format"
      });
    }

    
    const [duplicate] = await conn.query(
      `SELECT id FROM holidays
       WHERE company_id = ?
         AND id != ?
         AND is_deleted = 0
         AND date = ?
       LIMIT 1`,
      [company_id, id, finalDate]
    );

    if (duplicate.length) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: `Another holiday already exists on ${finalDate}`
      });
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

    
    fields.push("updated_by = ?");
    fields.push("updated_at = NOW()");
    values.push(user_id);

    
    if (fields.length === 2) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "No fields provided to update"
      });
    }

    values.push(id);

    
    await conn.query(
      `UPDATE holidays SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    
    const [rows] = await conn.query(
      `SELECT * FROM holidays WHERE id = ?`,
      [id]
    );

    await conn.commit();

    return res.json({
      success: true,
      message: "Holiday updated successfully",
      data: rows[0]
    });

  } catch (err) {
    await conn.rollback();

    console.error("Update Holiday Error:", err);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while updating holiday"
    });
  } finally {
    conn.release();
  }
});


router.delete("/delete", auth(HOLIDAY.MNG), async (req, res) => {
  const conn = await db.getConnection();

  try {
    const id = req.body.id;
    const company_id = req.company?.id;
    const user_id = req.user?.id;

    
    if (!company_id) {
      return res.status(400).json({
        success: false,
        message: "Company context missing"
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Holiday id is required"
      });
    }

    
    await conn.beginTransaction();

    
    const [rows] = await conn.query(
      `SELECT id FROM holidays
       WHERE id = ?
         AND company_id = ?
         AND is_deleted = 0
       LIMIT 1 FOR UPDATE`,
      [id, company_id]
    );

    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "Holiday not found or already deleted"
      });
    }

    
    await conn.query(
      `UPDATE holidays
       SET is_deleted = 1,
           is_active = 0,
           deleted_at = NOW(),
           deleted_by = ?,
           updated_by = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [user_id, user_id, id]
    );

    await conn.commit();

    return res.json({
      success: true,
      message: "Holiday deleted successfully"
    });

  } catch (err) {
    await conn.rollback();

    console.error("Delete Holiday Error:", err);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while deleting holiday"
    });
  } finally {
    conn.release();
  }
});


export default router;
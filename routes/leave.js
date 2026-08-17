import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import { LEAVE_TYPES, LEAVE_STATUSES, DESIGNATIONS, HALF_DAY_TYPES, } from "../constants/constants_values.js";
import { saveMediaFromUrl, buildFileUrl } from "../utils/fileService.js";
import { adjustEmployeeLeaveBalance } from "../utils/leaveBalanceUtils.js";
import {
  parseDate, isDateAfter, isSameDate, eachDateBetween, getISTNow, formatIST,
  formatUTCToIST, weekendInfo, isBeforeJoining, getYearFromDate, normalizeHalfDayType,
} from "../utils/time.js";
import {
  queueLeaveRequestEmail,
  queueLeaveAcceptanceEmail, queueLeaveRejectionEmail,
} from "../email/services/email.processor.js";
import { getEnumObject } from "../utils/constantsValidator.js";
import { LEAVE, LEAVE_BAL, LEAVE_CFG } from "../constants/permissions.js";
import { sendSuccess, sendError, buildMeta } from "../utils/sendResponse.js";
import { EMAIL_USER } from "../config/config.js";

const router = express.Router();

const LEAVE_CONFIG_FIELDS = `
  lc.id,
  lc.code,
  lc.name,
  lc.is_paid,
  lc.allow_half_day,
  lc.max_balance,
  lc.carry_forward_limit,
  lc.exclude_weekends,
  lc.is_active,
  lc.created_at,
  lc.updated_at
`;

const LEAVE_BALANCE_FIELDS = `
  elb.id,
  elb.company_id,
  elb.employee_id,
  elb.leave_config_id,
  elb.year,
  elb.total_allocated,
  elb.used,
  elb.remaining,
  elb.is_active,
  elb.created_at,
  elb.updated_at
`;

const LEAVE_APPLICATION_FIELDS = `
  el.id,
  el.company_id,
  el.employee_id,
  el.leave_config_id,
  el.start_date,
  el.end_date,
  el.total_days,
  el.is_half_day,
  el.half_day_type,
  el.reason,
  el.status,
  el.applied_at,
  el.approved_at,
  el.cancelled_at,
  el.approval_remarks,
  el.created_at,
  el.updated_at
`;

const LEAVE_APPLICATION_JOIN_FIELDS = `
  ${LEAVE_APPLICATION_FIELDS},
  lc.name AS leave_type_name,
  lc.code AS leave_type_code,
  lc.is_paid,
  e.employee_code,
  u.name AS employee_name,
  u.email AS employee_email
`;

function formatLeaveConfig(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    is_paid: row.is_paid == 1,
    allow_half_day: row.allow_half_day == 1,
    max_balance: row.max_balance,
    carry_forward_limit: row.carry_forward_limit,
    exclude_weekends: row.exclude_weekends == 1,
    is_active: row.is_active == 1,
    created_at: formatUTCToIST(row.created_at),
    updated_at: formatUTCToIST(row.updated_at),
  };
}

function formatLeaveBalance(row) {
  return {
    id: row.id,
    company_id: row.company_id,
    employee_id: row.employee_id,
    leave_config_id: row.leave_config_id,
    year: row.year,
    total_allocated: Number(row.total_allocated),
    used: Number(row.used),
    remaining: Number(row.remaining),
    is_active: row.is_active == 1,
    created_at: formatUTCToIST(row.created_at),
    updated_at: formatUTCToIST(row.updated_at),
  };
}

function formatLeaveApplication(row) {
  return {
    id: row.id,
    company_id: row.company_id,
    employee_id: row.employee_id,
    leave_config_id: row.leave_config_id,
    start_date: formatIST(row.start_date, "YYYY-MM-DD"),
    end_date: formatIST(row.end_date, "YYYY-MM-DD"),
    total_days: Number(row.total_days),
    is_half_day: row.is_half_day == 1,
    half_day_type: row.half_day_type,
    reason: row.reason,
    status: row.status,
    applied_at: formatUTCToIST(row.applied_at),
    approved_at: formatUTCToIST(row.approved_at),
    cancelled_at: formatUTCToIST(row.cancelled_at),
    approval_remarks: row.approval_remarks,
    created_at: formatUTCToIST(row.created_at),
    updated_at: formatUTCToIST(row.updated_at),
    leave_name: row.leave_type_name || row.leave_name,
    leave_code: row.leave_type_code || row.leave_code,
    employee_name: row.employee_name,
    employee_code: row.employee_code,
    employee_email: row.employee_email,
    is_paid: row.is_paid == 1,
    attachments: row.attachments || [],
  };
}

const parseBoolean = (value, field) => {
  if (value === undefined || value === null) {
    return null;
  }
  if (value === true) return 1;
  if (value === false) return 0;
  throw new Error(`${field} must be true or false`);
};

// ============= Leave Config Routes ==============

router.post("/create", auth(LEAVE_CFG.MNG), async (req, res) => {
  let conn;
  try {
    const { code, name, is_paid, allow_half_day, max_balance, carry_forward_limit, exclude_weekends, } = req.body;
    const company_id = Number(req.company?.id);
    const user_id = req.user?.id ? Number(req.user.id) : null;

    if (!company_id) { return sendError(res, 400, "Company context missing"); }
    if (!code || !name) { return sendError(res, 400, "Code and name are required"); }

    const normalizedCode = code.trim().toUpperCase();
    const normalizedName = name.trim();

    let normalizedIsPaid;
    let normalizedAllowHalfDay;
    let normalizedExcludeWeekends;

    try {
      normalizedIsPaid = is_paid === undefined ? 1 : parseBoolean(is_paid, "is_paid");
      normalizedAllowHalfDay = allow_half_day === undefined ? 1 : parseBoolean(allow_half_day, "allow_half_day");
      normalizedExcludeWeekends = exclude_weekends === undefined ? 1 : parseBoolean(exclude_weekends, "exclude_weekends");
    } catch (error) {
      return sendError(res, 400, error.message);
    }

    if (max_balance !== undefined && max_balance !== null && isNaN(Number(max_balance))) {
      return sendError(res, 400, "Invalid max_balance");
    }
    if (carry_forward_limit !== undefined && carry_forward_limit !== null && isNaN(Number(carry_forward_limit))) {
      return sendError(res, 400, "Invalid carry_forward_limit");
    }
    if (max_balance !== undefined && max_balance !== null && Number(max_balance) < 0) {
      return sendError(res, 400, "max_balance cannot be negative");
    }

    if (carry_forward_limit !== undefined && carry_forward_limit !== null && Number(carry_forward_limit) < 0) {
      return sendError(res, 400, "carry_forward_limit cannot be negative");
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [existing] = await conn.query(
      `SELECT id FROM leave_configs WHERE company_id = ? AND code = ? AND is_deleted = 0 LIMIT 1`,
      [company_id, normalizedCode]
    );

    if (existing.length) {
      await conn.rollback();
      return sendError(res, 409, "Leave code already exists");
    }

    await conn.query(
      `INSERT INTO leave_configs (company_id, code, name, is_paid, allow_half_day, max_balance, carry_forward_limit, exclude_weekends, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [company_id, normalizedCode, normalizedName, normalizedIsPaid, normalizedAllowHalfDay, max_balance ?? null, carry_forward_limit ?? 0, normalizedExcludeWeekends, user_id,]
    );

    await conn.commit();

    return sendSuccess(res, 201, "Leave config created");
  } catch (err) {
    if (conn) await conn.rollback();

    console.error("Create Leave Config Error:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return sendError(res, 409, "Duplicate leave code");
    }

    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.put("/update", auth(LEAVE_CFG.MNG), async (req, res) => {
  let conn;

  try {
    const company_id = Number(req.company?.id);
    const user_id = req.user?.id ? Number(req.user.id) : null;
    const id = Number(req.body?.id);

    if (!company_id) {
      return sendError(res, 401, "Company context missing");
    }

    if (!user_id) {
      return sendError(res, 401, "Unauthorized user");
    }

    if (!id || isNaN(id)) {
      return sendError(
        res,
        400,
        "Valid leave config id is required"
      );
    }

    let {
      code,
      name,
      is_paid,
      allow_half_day,
      max_balance,
      carry_forward_limit,
      exclude_weekends,
      is_active,
    } = req.body;

    if (typeof code === "string") {
      code = code.trim().toUpperCase();
    }

    if (typeof name === "string") {
      name = name.trim();
    }

    let normalizedIsPaid;
    let normalizedAllowHalfDay;
    let normalizedExcludeWeekends;
    let normalizedIsActive;

    try {
      if (is_paid !== undefined) {
        normalizedIsPaid = parseBoolean(
          is_paid,
          "is_paid"
        );
      }

      if (allow_half_day !== undefined) {
        normalizedAllowHalfDay = parseBoolean(
          allow_half_day,
          "allow_half_day"
        );
      }

      if (exclude_weekends !== undefined) {
        normalizedExcludeWeekends = parseBoolean(
          exclude_weekends,
          "exclude_weekends"
        );
      }

      if (is_active !== undefined) {
        normalizedIsActive = parseBoolean(
          is_active,
          "is_active"
        );
      }
    } catch (error) {
      return sendError(res, 400, error.message);
    }

    if (code !== undefined) {
      if (typeof code !== "string" || !code) {
        return sendError(
          res,
          400,
          "code must be a valid string"
        );
      }

      if (code.length > 20) {
        return sendError(
          res,
          400,
          "code cannot exceed 20 characters"
        );
      }
    }

    if (name !== undefined) {
      if (typeof name !== "string" || !name) {
        return sendError(
          res,
          400,
          "name must be a valid string"
        );
      }

      if (name.length > 50) {
        return sendError(
          res,
          400,
          "name cannot exceed 50 characters"
        );
      }
    }


    if (max_balance !== undefined && max_balance !== null && isNaN(Number(max_balance))) {
      return sendError(
        res,
        400,
        "Invalid max_balance"
      );
    }

    if (carry_forward_limit !== undefined && carry_forward_limit !== null && isNaN(Number(carry_forward_limit))) {
      return sendError(
        res,
        400,
        "Invalid carry_forward_limit"
      );
    }

    if (
      [max_balance, carry_forward_limit].some(
        (value) =>
          value !== undefined &&
          value !== null &&
          Number(value) < 0
      )) {
      return sendError(
        res,
        400,
        "Value cannot be negative"
      );
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `
        SELECT id
        FROM leave_configs
        WHERE id = ?
          AND company_id = ?
          AND is_deleted = 0
        LIMIT 1
      `,
      [id, company_id]
    );

    if (!existing) {
      await conn.rollback();
      return sendError(res, 404, "Leave config not found");
    }

    if (code !== undefined) {
      const [[dup]] = await conn.query(
        `
          SELECT id
          FROM leave_configs
          WHERE company_id = ?
            AND code = ?
            AND id != ?
            AND is_deleted = 0
          LIMIT 1
        `,
        [company_id, code, id]
      );

      if (dup) {
        await conn.rollback();
        return sendError(res, 409, "Leave code already exists");
      }
    }

    const fields = [];
    const values = [];

    if (code !== undefined) { fields.push("code = ?"); values.push(code); }
    if (name !== undefined) { fields.push("name = ?"); values.push(name); }
    if (is_paid !== undefined) { fields.push("is_paid = ?"); values.push(normalizedIsPaid); }
    if (allow_half_day !== undefined) { fields.push("allow_half_day = ?"); values.push(normalizedAllowHalfDay); }
    if (max_balance !== undefined) { fields.push("max_balance = ?"); values.push(max_balance === null ? null : Number(max_balance)); }
    if (carry_forward_limit !== undefined) { fields.push("carry_forward_limit = ?"); values.push(carry_forward_limit === null ? null : Number(carry_forward_limit)); }
    if (exclude_weekends !== undefined) { fields.push("exclude_weekends = ?"); values.push(normalizedExcludeWeekends); }
    if (is_active !== undefined) { fields.push("is_active = ?"); values.push(normalizedIsActive); }

    if (!fields.length) { await conn.rollback(); return sendError(res, 400, "No fields provided for update"); }

    fields.push("updated_by = ?");
    values.push(user_id);

    await conn.query(
      `
        UPDATE leave_configs
        SET ${fields.join(", ")}
        WHERE id = ?
          AND company_id = ?
          AND is_deleted = 0
      `,
      [
        ...values,
        id,
        company_id,
      ]
    );

    const [[updatedConfig]] = await conn.query(
      `
        SELECT
          ${LEAVE_CONFIG_FIELDS},
          creator.name AS created_by_name,
          updater.name AS updated_by_name
        FROM leave_configs lc
        LEFT JOIN users creator
          ON creator.id = lc.created_by
        LEFT JOIN users updater
          ON updater.id = lc.updated_by
        WHERE lc.id = ?
          AND lc.company_id = ?
          AND lc.is_deleted = 0
        LIMIT 1
      `,
      [id, company_id]
    );

    await conn.commit();

    const message =
      is_active !== undefined
        ? updatedConfig.is_active == 1
          ? "Leave config activated successfully"
          : "Leave config deactivated successfully"
        : "Leave config updated successfully";

    return sendSuccess(res, 200, message);
  } catch (err) {
    if (conn) {
      await conn.rollback();
    }

    console.error("Update Leave Config Error:", err);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.get("/company", auth(LEAVE_CFG.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const company_id = Number(req.company?.id);
    if (!company_id) return sendError(res, 400, "Company context missing");

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const offset = (page - 1) * limit;
    const search = req.query.search?.trim();
    const is_active = req.query.is_active;
    const is_paid = req.query.is_paid;

    const normalizeBoolean = (value) => {
      if (value === "true") return 1;
      if (value === "false") return 0;
      return null;
    };

    let normalizedIsActive = undefined, normalizedIsPaid = undefined;
    if (is_active !== undefined) {
      normalizedIsActive = normalizeBoolean(is_active);
      if (normalizedIsActive === null) return sendError(res, 400, "is_active must be true, or false");
    }
    if (is_paid !== undefined) {
      normalizedIsPaid = normalizeBoolean(is_paid);
      if (normalizedIsPaid === null) return sendError(res, 400, "is_paid must be true, or false");
    }

    let query = `SELECT ${LEAVE_CONFIG_FIELDS} FROM leave_configs lc WHERE lc.company_id = ? AND lc.is_deleted = 0`;
    const params = [company_id];

    if (search) {
      query += ` AND (lc.code LIKE ? OR lc.name LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s);
    }
    if (normalizedIsActive !== undefined) {
      query += ` AND lc.is_active = ?`;
      params.push(normalizedIsActive);
    }
    if (normalizedIsPaid !== undefined) {
      query += ` AND lc.is_paid = ?`;
      params.push(normalizedIsPaid);
    }

    query += ` ORDER BY lc.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await conn.query(query, params);

    let countQuery = `SELECT COUNT(*) AS total FROM leave_configs lc WHERE lc.company_id = ? AND lc.is_deleted = 0`;
    const countParams = [company_id];
    if (search) { countQuery += ` AND (lc.code LIKE ? OR lc.name LIKE ?)`; countParams.push(`%${search}%`, `%${search}%`); }
    if (normalizedIsActive !== undefined) { countQuery += ` AND lc.is_active = ?`; countParams.push(normalizedIsActive); }
    if (normalizedIsPaid !== undefined) { countQuery += ` AND lc.is_paid = ?`; countParams.push(normalizedIsPaid); }

    const [[{ total }]] = await conn.query(countQuery, countParams);
    const data = rows.map(formatLeaveConfig);

    return sendSuccess(res, 200, "Leave configs fetched successfully", data, buildMeta(page, limit, total, data.length));
  } catch (err) {
    console.error("Get Leave Configs Error:", err);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.delete("/delete", auth(LEAVE_CFG.MNG), async (req, res) => {
  let conn;
  let transactionStarted = false;
  let responseSent = false;

  try {
    conn = await db.getConnection();

    const userId = Number(req.user?.id);
    const companyId = Number(req.company?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      responseSent = true;
      return sendError(res, 401, "Unauthorized");
    }

    if (!Number.isInteger(companyId) || companyId <= 0) {
      responseSent = true;
      return sendError(res, 400, "Company context missing");
    }

    const { ids } = req.body;

    if (ids === undefined || ids === null) {
      responseSent = true;
      return sendError(res, 400, "Valid leave config ids are required");
    }

    let leaveConfigIds = [];

    if (typeof ids === "number" || (typeof ids === "string" && ids.trim() !== "" && ids !== "all")) {
      const parsedId = Number(ids);
      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        responseSent = true;
        return sendError(res, 400, "Valid leave config ids are required");
      }
      leaveConfigIds = [parsedId];
    } else if (ids === "all") {
      const [rows] = await conn.query(
        `
          SELECT id
          FROM leave_configs
          WHERE company_id = ?
            AND is_deleted = 0
        `,
        [companyId]
      );

      leaveConfigIds = rows.map((row) => Number(row.id));
    } else if (Array.isArray(ids)) {
      leaveConfigIds = [
        ...new Set(
          ids
            .map((value) => {
              if (typeof value !== "number" && typeof value !== "string") {
                return null;
              }
              const parsedId = Number(value);
              return Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;
            })
            .filter((value) => value !== null)
        ),
      ];

      if (leaveConfigIds.length === 0) {
        responseSent = true;
        return sendError(res, 400, "Valid leave config ids are required");
      }
    } else {
      responseSent = true;
      return sendError(res, 400, "ids must be a number, array, or 'all'");
    }

    if (leaveConfigIds.length === 0) {
      responseSent = true;
      return sendSuccess(res, 200, "No leave configs to delete", { deleted_count: 0, ids: [], });
    }

    await conn.beginTransaction();
    transactionStarted = true;
    const placeholders = leaveConfigIds.map(() => "?").join(", ");

    const [existingConfigs] = await conn.query(
      `
        SELECT
          id,
          company_id,
          is_deleted,
          is_active
        FROM leave_configs
        WHERE company_id = ?
          AND id IN (${placeholders})
          AND is_deleted = 0
        FOR UPDATE
      `,
      [companyId, ...leaveConfigIds]
    );

    const existingIds = new Set(existingConfigs.map((config) => Number(config.id)));
    const missingIds = leaveConfigIds.filter((id) => !existingIds.has(id));

    if (missingIds.length > 0) {
      await conn.rollback();
      transactionStarted = false;
      responseSent = true;

      return sendError(res, 404, `One or more leave configs not found or already deleted: ${missingIds.join(", ")}`);
    }

    const [usedConfigs] = await conn.query(
      `
        SELECT DISTINCT leave_config_id
        FROM employee_leaves
        WHERE leave_config_id IN (${placeholders})
      `,
      leaveConfigIds
    );

    if (usedConfigs.length > 0) {
      const usedIds = usedConfigs.map((row) =>
        Number(row.leave_config_id)
      );

      await conn.rollback();
      transactionStarted = false;

      responseSent = true;

      return sendError(res, 400, `Cannot delete leave configs already used in leaves: ${usedIds.join(", ")}`);
    }

    const [result] = await conn.query(
      `
        UPDATE leave_configs
        SET
          is_deleted = 1,
          is_active = 0,
          deleted_at = NOW(),
          deleted_by = ?
        WHERE company_id = ?
          AND id IN (${placeholders})
          AND is_deleted = 0
      `,
      [
        userId,
        companyId,
        ...leaveConfigIds,
      ]
    );

    await conn.commit();
    transactionStarted = false;

    responseSent = true;

    return sendSuccess(
      res,
      200,
      leaveConfigIds.length === 1
        ? "Leave config deleted successfully"
        : "Leave configs deleted successfully",
      {
        deleted_count: result.affectedRows,
        ids: leaveConfigIds,
      }
    );
  } catch (err) {
    if (transactionStarted && conn) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error(
          "Rollback error:",
          rollbackError
        );
      }
    }

    if (!responseSent) {
      console.error(
        "Delete Leave Config Error:",
        err
      );

      responseSent = true;

      return sendError(
        res,
        500,
        "Internal server error"
      );
    }
  } finally {
    if (conn) {
      conn.release();
    }
  }
});


//============= Leave Balance Mangement Routes ===============

router.get("/my-balance", auth(LEAVE_BAL.EMP), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const company_id = req.company?.id;
    const user_id = req.user?.id;
    if (!company_id || !user_id) return sendError(res, 401, "Unauthorized access");

    let year = new Date().getFullYear();
    if (req.query.year !== undefined) {
      const parsedYear = Number(req.query.year);
      if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) return sendError(res, 400, "Invalid year");
      year = parsedYear;
    }

    const [[employee]] = await conn.query(
      `SELECT e.id AS employee_id FROM employees e WHERE e.user_id = ? AND e.company_id = ? AND e.is_deleted = 0 AND e.is_active = 1 LIMIT 1`,
      [user_id, company_id]
    );
    if (!employee) return sendError(res, 404, "Employee not found");
    const employee_id = employee.employee_id;

    const [rows] = await conn.query(
      `SELECT lc.id AS leave_config_id, lc.code, lc.name, lc.is_paid, lc.allow_half_day, lc.carry_forward_limit, lc.exclude_weekends,
              COALESCE(elb.total_allocated, 0) AS total_allocated,
              COALESCE(SUM(CASE WHEN el.status = 'approved' THEN el.total_days ELSE 0 END), 0) AS used
       FROM leave_configs lc
       LEFT JOIN employee_leave_balances elb ON elb.leave_config_id = lc.id AND elb.employee_id = ? AND elb.company_id = ? AND elb.year = ? AND elb.is_deleted = 0
       LEFT JOIN employee_leaves el ON el.employee_id = ? AND el.leave_config_id = lc.id AND YEAR(el.start_date) = ? AND el.is_deleted = 0
       WHERE lc.company_id = ? AND lc.is_active = 1 AND lc.is_deleted = 0
       GROUP BY lc.id ORDER BY lc.name ASC`,
      [employee_id, company_id, year, employee_id, year, company_id]
    );

    const leaveData = {};
    rows.forEach(row => {
      const total = Number(row.total_allocated), used = Number(row.used), remaining = total - used;
      const key = row.name ? row.name.toLowerCase().replace(/\s+/g, "_") : `leave_${row.leave_config_id}`;
      leaveData[key] = {
        leave_config_id: row.leave_config_id, code: row.code,
        is_paid: row.is_paid == 1, allow_half_day: row.allow_half_day == 1,
        carry_forward_limit: Number(row.carry_forward_limit), exclude_weekends: row.exclude_weekends == 1,
        total, used, remaining
      };
    });
    return sendSuccess(res, 200, "Leave balance fetched successfully", leaveData);
  } catch (err) {
    console.error("❌ Leave Balance API Error:", err);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.put("/upsert-balance", auth(LEAVE_BAL.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = req.company?.id;
    const user_id = req.user?.id;
    const { employee_id, leaves } = req.body;
    const year = new Date().getFullYear();

    if (!company_id || !user_id) {
      return sendError(res, 400, "Invalid company or user");
    }

    if (!employee_id || !Array.isArray(leaves) || leaves.length === 0) {
      return sendError(res, 400, "employee_id and leaves are required");
    }

    const seen = new Set();
    for (const leave of leaves) {
      if (!leave.leave_config_id) {
        return sendError(res, 400, "leave_config_id is required");
      }

      if (seen.has(leave.leave_config_id)) {
        return sendError(
          res,
          400,
          `Duplicate leave_config_id: ${leave.leave_config_id}`
        );
      }

      seen.add(leave.leave_config_id);
    }

    const [employee] = await conn.query(
      `SELECT id
       FROM employees
       WHERE id = ?
         AND company_id = ?
         AND is_deleted = 0
         AND is_active = 1`,
      [employee_id, company_id]
    );

    if (employee.length === 0) {
      return sendError(res, 404, "Employee not found");
    }

    const leaveIds = leaves.map((x) => x.leave_config_id);

    const [configs] = await conn.query(
      `SELECT
          id,
          max_balance
       FROM leave_configs
       WHERE company_id = ?
         AND id IN (?)
         AND is_deleted = 0
         AND is_active = 1`,
      [company_id, leaveIds]
    );

    if (configs.length !== leaveIds.length) {
      return sendError(
        res,
        400,
        "Some leave configurations are invalid or inactive"
      );
    }

    const configMap = Object.fromEntries(
      configs.map((x) => [x.id, x])
    );

    const [balances] = await conn.query(
      `SELECT
          leave_config_id,
          used
       FROM employee_leave_balances
       WHERE company_id = ?
         AND employee_id = ?
         AND year = ?
         AND leave_config_id IN (?)
         AND is_deleted = 0`,
      [company_id, employee_id, year, leaveIds]
    );

    const balanceMap = Object.fromEntries(
      balances.map((x) => [x.leave_config_id, x])
    );

    const values = [];

    for (const leave of leaves) {
      const config = configMap[leave.leave_config_id];

      let allocated = Number(leave.total_allocated);

      if (isNaN(allocated) || allocated < 0) {
        return sendError(
          res,
          400,
          `Invalid total_allocated for leave_config_id: ${leave.leave_config_id}`
        );
      }

      if (
        config.max_balance !== null &&
        allocated > Number(config.max_balance)
      ) {
        allocated = Number(config.max_balance);
      }

      allocated = Number(allocated.toFixed(2));

      const existing = balanceMap[leave.leave_config_id];
      const used = existing ? Number(existing.used) : 0;

      if (allocated < used) {
        return sendError(
          res,
          400,
          `Allocated leave cannot be less than used leave for leave_config_id: ${leave.leave_config_id}`
        );
      }

      values.push([
        company_id,
        employee_id,
        leave.leave_config_id,
        year,
        allocated,
        used,
        Number((allocated - used).toFixed(2)),
        user_id,
        user_id,
        0,
      ]);
    }

    await conn.query(
      `
      INSERT INTO employee_leave_balances
      (
        company_id,
        employee_id,
        leave_config_id,
        year,
        total_allocated,
        used,
        remaining,
        created_by,
        updated_by,
        is_deleted
      )
      VALUES ?
      ON DUPLICATE KEY UPDATE
        total_allocated = VALUES(total_allocated),
        remaining = GREATEST(VALUES(total_allocated) - used, 0),
        updated_by = VALUES(updated_by),
        updated_at = CURRENT_TIMESTAMP,
        is_deleted = 0
      `,
      [values]
    );

    await conn.commit();

    return sendSuccess(
      res,
      200,
      "Leave balance saved successfully"
    );
  } catch (err) {
    if (conn) {
      await conn.rollback();
    }

    console.error("Upsert Leave Balance Error:", err);

    return sendError(
      res,
      err.status || 500,
      err.message || "Internal server error"
    );
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.delete("/delete-balance", auth(LEAVE_BAL.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = req.company?.id;
    const user_id = req.user?.id;
    const employee_id = Number(req.body.employee_id);
    const year = getISTNow().year();

    let { leave_config_ids } = req.body;

    if (!company_id || !user_id) {
      return sendError(res, 400, "Invalid company or user.");
    }

    if (!Number.isInteger(employee_id) || employee_id <= 0) {
      return sendError(res, 400, "Valid employee_id is required.");
    }

    if (!Array.isArray(leave_config_ids) || leave_config_ids.length === 0) {
      return sendError(
        res,
        400,
        "leave_config_ids must be a non-empty array."
      );
    }

    leave_config_ids = [
      ...new Set(
        leave_config_ids
          .map(Number)
          .filter((id) => Number.isInteger(id) && id > 0)
      ),
    ];

    if (leave_config_ids.length === 0) {
      return sendError(res, 400, "Invalid leave_config_ids.");
    }

    const [[employee]] = await conn.query(
      `
        SELECT id
        FROM employees
        WHERE id = ?
          AND company_id = ?
          AND is_active = 1
          AND is_deleted = 0
        `,
      [employee_id, company_id]
    );

    if (!employee) {
      return sendError(res, 404, "Employee not found.");
    }

    const placeholders = leave_config_ids.map(() => "?").join(",");

    const [balances] = await conn.query(
      `
        SELECT id, leave_config_id
        FROM employee_leave_balances
        WHERE company_id = ?
          AND employee_id = ?
          AND year = ?
          AND is_deleted = 0
          AND leave_config_id IN (${placeholders})
        FOR UPDATE
        `,
      [company_id, employee_id, year, ...leave_config_ids]
    );

    if (balances.length !== leave_config_ids.length) {
      return sendError(
        res,
        404,
        "One or more leave balances were not found."
      );
    }

    const [usedLeaves] = await conn.query(
      `
        SELECT DISTINCT
          lc.id,
          lc.code,
          lc.name
        FROM employee_leaves el
        INNER JOIN leave_configs lc
          ON lc.id = el.leave_config_id
        WHERE el.company_id = ?
          AND el.employee_id = ?
          AND el.is_deleted = 0
          AND YEAR(el.start_date) = ?
          AND el.leave_config_id IN (${placeholders})
        `,
      [company_id, employee_id, year, ...leave_config_ids]
    );

    if (usedLeaves.length > 0) {
      await conn.rollback();

      return sendError(
        res,
        400,
        `Cannot delete leave balance. Employee has already used: ${usedLeaves
          .map((leave) => leave.name)
          .join(", ")}.`
      );
    }

    const balanceIds = balances.map((b) => b.id);
    const deletePlaceholders = balanceIds.map(() => "?").join(",");

    await conn.query(
      `
        UPDATE employee_leave_balances
        SET
          is_deleted = 1,
          deleted_at = CURRENT_TIMESTAMP,
          deleted_by = ?
        WHERE id IN (${deletePlaceholders})
        `,
      [user_id, ...balanceIds]
    );

    await conn.commit();

    return sendSuccess(
      res,
      200,
      "Leave balances deleted successfully."
    );
  } catch (err) {
    if (conn) {
      await conn.rollback();
    }

    console.error("Bulk Delete Leave Balance Error:", err);

    return sendError(
      res,
      err.status || 500,
      err.message || "Internal server error"
    );
  } finally {
    if (conn) {
      conn.release();
    }
  }
}
);

router.get("/emp-balances", auth(LEAVE_BAL.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const company_id = req.company?.id;
    if (!company_id) return sendError(res, 400, "Invalid company");

    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const offset = (page - 1) * limit;
    const search = req.query.search?.trim();

    let query = `
      SELECT e.id AS employee_id, u.name AS employee_name, u.email, u.phone AS mobile, u.profile_picture, e.employee_code,
             elb.leave_config_id, elb.total_allocated,
             lc.code, lc.name AS leave_name, lc.is_paid, lc.allow_half_day, lc.max_balance, lc.carry_forward_limit, lc.exclude_weekends,
             COALESCE(SUM(CASE WHEN el.status = 'approved' THEN el.total_days ELSE 0 END), 0) AS used
      FROM employees e
      JOIN users u ON u.id = e.user_id AND u.is_deleted = 0
      INNER JOIN employee_leave_balances elb ON elb.employee_id = e.id AND elb.year = ? AND elb.is_deleted = 0
      LEFT JOIN leave_configs lc ON lc.id = elb.leave_config_id AND lc.is_deleted = 0 AND lc.is_active = 1
      LEFT JOIN employee_leaves el ON el.employee_id = e.id AND el.leave_config_id = elb.leave_config_id AND YEAR(el.start_date) = ? AND el.is_deleted = 0
      WHERE e.company_id = ? AND e.is_deleted = 0 AND e.is_active = 1
    `;
    const params = [year, year, company_id];

    if (search) {
      query += ` AND (u.name LIKE ? OR u.email LIKE ? OR e.employee_code LIKE ? OR lc.name LIKE ? OR lc.code LIKE ?)`;
      const s = `%${search}%`; params.push(s, s, s, s, s);
    }
    query += ` GROUP BY e.id, elb.leave_config_id ORDER BY u.name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await conn.query(query, params);

    let countQuery = `SELECT COUNT(DISTINCT e.id) as total FROM employees e JOIN users u ON u.id = e.user_id AND u.is_deleted = 0 INNER JOIN employee_leave_balances elb ON elb.employee_id = e.id AND elb.year = ? AND elb.is_deleted = 0 WHERE e.company_id = ? AND e.is_deleted = 0 AND e.is_active = 1`;
    const countParams = [year, company_id];
    if (search) { countQuery += ` AND (u.name LIKE ? OR u.email LIKE ? OR e.employee_code LIKE ?)`; const s = `%${search}%`; countParams.push(s, s, s); }

    const [[{ total }]] = await conn.query(countQuery, countParams);

    const normalized = rows.map(row => ({
      ...row,
      is_paid: row.is_paid == 1, allow_half_day: row.allow_half_day == 1, exclude_weekends: row.exclude_weekends == 1
    }));

    const groupedMap = {};
    for (const row of normalized) {
      const empId = row.employee_id;
      if (!groupedMap[empId]) {
        groupedMap[empId] = {
          employee_id: empId,
          employee_name: row.employee_name,
          email: row.email,
          mobile: row.mobile || null,
          profile_picture: buildFileUrl(row.profile_picture) || null,
          employee_code: row.employee_code,
          leaves: []
        };
      }
      const used = Number(row.used || 0), allocated = Number(row.total_allocated || 0);
      groupedMap[empId].leaves.push({
        leave_config_id: row.leave_config_id, type: row.code, name: row.leave_name,
        total_allocated: allocated, used, remaining: allocated - used,
        is_paid: row.is_paid, allow_half_day: row.allow_half_day, max_balance: row.max_balance, carry_forward_limit: row.carry_forward_limit, exclude_weekends: row.exclude_weekends,
      });
    }

    return sendSuccess(res, 200, "Employees with leave balances fetched", Object.values(groupedMap), buildMeta(page, limit, total, Object.keys(groupedMap).length));
  } catch (err) {
    console.error("Leave Balance Error:", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.get("/employee/:employee_id/", auth(LEAVE_BAL.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const companyId = req.company?.id;
    if (!companyId) return sendError(res, 400, "Invalid company");

    const employeeId = Number(req.params.employee_id);
    if (!employeeId) return sendError(res, 400, "Invalid employee");

    const year = Number(req.query.year) || new Date().getFullYear();
    const paid = String(req.query.paid).toLowerCase() === "true";

    const [[employee]] = await conn.query(
      `
      SELECT id
      FROM employees
      WHERE
        id = ?
        AND company_id = ?
        AND is_active = 1
        AND is_deleted = 0
      `,
      [employeeId, companyId]
    );

    if (!employee) {
      return sendError(res, 404, "Employee not found");
    }

    let query = `
      SELECT
        lc.id AS leave_config_id,
        lc.code,
        lc.name,
        lc.is_paid,
        lc.allow_half_day,
        lc.max_balance,
        lc.carry_forward_limit,
        lc.exclude_weekends,
        lc.is_active,

        elb.id AS balance_id,
        elb.year,
        elb.total_allocated,
        elb.used,
        elb.remaining,
        elb.is_active AS balance_active,
        elb.created_at AS allocated_at,
        elb.updated_at AS last_updated

      FROM leave_configs lc

      LEFT JOIN employee_leave_balances elb
        ON elb.leave_config_id = lc.id
        AND elb.employee_id = ?
        AND elb.year = ?
        AND elb.is_deleted = 0

      WHERE
        lc.company_id = ?
        AND lc.is_deleted = 0
        AND lc.is_active = 1
    `;

    if (paid) {
      query += ` AND lc.is_paid = 1`;
    }

    query += `
      ORDER BY
        CASE WHEN elb.id IS NULL THEN 1 ELSE 0 END,
        lc.created_at DESC
    `;

    const [rows] = await conn.query(query, [
      employeeId,
      year,
      companyId,
    ]);

    const data = rows.map((row) => ({
      leave_config_id: row.leave_config_id,
      code: row.code,
      name: row.name,

      is_paid: row.is_paid == 1,
      allow_half_day: row.allow_half_day == 1,
      max_balance: Number(row.max_balance),
      carry_forward_limit: Number(row.carry_forward_limit),
      exclude_weekends: row.exclude_weekends == 1,
      is_active: row.is_active == 1,

      allocated: !!row.balance_id,

      balance: row.balance_id
        ? {
          id: row.balance_id,
          year: row.year,
          total_allocated: Number(row.total_allocated),
          used: Number(row.used),
          remaining: Number(row.remaining),
          is_active: row.balance_active == 1,
          allocated_at: row.allocated_at,
          updated_at: row.last_updated,
        }
        : null,
    }));

    return sendSuccess(
      res,
      200,
      "Available leave configs fetched successfully",
      data
    );
  } catch (err) {
    console.error("Available Leave Configs Error:", err);
    return sendError(
      res,
      err.status || 500,
      err.message || "Internal server error"
    );
  } finally {
    if (conn) conn.release();
  }
});


// ================ leave Management Routes =================

router.post("/management/create", auth(LEAVE.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = Number(req.company?.id);
    const admin_user_id = Number(req.user?.id);
    if (!Number.isInteger(company_id) || company_id <= 0) return sendError(res, 401, "Unauthorized company");
    if (!Number.isInteger(admin_user_id) || admin_user_id <= 0) return sendError(res, 401, "Unauthorized user");

    let {
      employee_id, leave_config_id, start_date, end_date,
      is_half_day = 0, half_day_type = null, reason = null, remarks = null, attachments = []
    } = req.body;

    employee_id = Number(employee_id);
    leave_config_id = Number(leave_config_id);
    is_half_day = (is_half_day === true || is_half_day === 1 || is_half_day === "1" || is_half_day === "true") ? 1 : 0;
    half_day_type = typeof half_day_type === "string" ? half_day_type.trim().toLowerCase() : null;
    reason = typeof reason === "string" ? reason.trim() : null;
    remarks = typeof remarks === "string" ? remarks.trim() : null;
    attachments = Array.isArray(attachments) ? attachments : [];

    if (!Number.isInteger(employee_id) || employee_id <= 0) return sendError(res, 400, "Valid employee_id required");
    if (!Number.isInteger(leave_config_id) || leave_config_id <= 0) return sendError(res, 400, "Valid leave_config_id required");
    if (!start_date || !end_date) return sendError(res, 400, "start_date and end_date are required");
    if (!parseDate(start_date) || !parseDate(end_date)) return sendError(res, 400, "Invalid date format. Use YYYY-MM-DD");
    if (isDateAfter(start_date, end_date)) return sendError(res, 400, "start_date cannot be greater than end_date");
    if (is_half_day && !["first_half", "second_half"].includes(half_day_type)) return sendError(res, 400, "half_day_type must be first_half or second_half");
    if (reason && reason.length > 2000) return sendError(res, 400, "Reason too long");
    if (remarks && remarks.length > 1000) return sendError(res, 400, "Remarks too long");
    if (attachments.length > 10) return sendError(res, 400, "Max 10 attachments");
    for (const url of attachments) if (typeof url !== "string" || !url.trim()) return sendError(res, 400, "Invalid attachment URL");

    const [[employee]] = await conn.query(
      `SELECT e.id, e.user_id, e.employee_code, e.designation, e.joining_date, e.weekends, e.status, e.is_active, u.name, u.email
       FROM employees e INNER JOIN users u ON u.id = e.user_id AND u.is_deleted = 0 AND u.is_active = 1
       WHERE e.id = ? AND e.company_id = ? AND e.is_deleted = 0 LIMIT 1`,
      [employee_id, company_id]
    );
    if (!employee) return sendError(res, 404, "Employee not found");
    if (employee.is_active !== 1 || employee.status !== "active") return sendError(res, 400, "Employee is not active");
    if (isBeforeJoining(start_date, employee.joining_date)) return sendError(res, 400, "Leave cannot be applied before joining date");

    const [[company]] = await conn.query(`SELECT id, name FROM companies WHERE id = ? AND is_active = 1 AND is_deleted = 0 LIMIT 1`, [company_id]);
    if (!company) return sendError(res, 404, "Company not found");

    const [[config]] = await conn.query(
      `SELECT id, code, name, is_paid, allow_half_day, exclude_weekends FROM leave_configs WHERE id = ? AND company_id = ? AND is_active = 1 AND is_deleted = 0 LIMIT 1`,
      [leave_config_id, company_id]
    );
    if (!config) return sendError(res, 404, "Leave configuration not found");
    if (is_half_day && Number(config.allow_half_day) !== 1) return sendError(res, 400, "Half day leave not allowed");

    const [holidayRows] = await conn.query(
      `SELECT date FROM holidays WHERE company_id = ? AND is_optional = 0 AND is_active = 1 AND is_deleted = 0 AND date BETWEEN ? AND ?`,
      [company_id, start_date, end_date]
    );
    const holidaySet = new Set(holidayRows.map(h => formatIST(h.date, "YYYY-MM-DD")));

    const leaveRows = [];
    let total_days = 0;
    let currentRange = null;
    const skippedDates = [];
    eachDateBetween(start_date, end_date, (dateStr) => {
      const isHoliday = holidaySet.has(dateStr);
      const { is_weekend } = weekendInfo(dateStr, employee.weekends);
      const excludeWeekend = Number(config.exclude_weekends) === 1 && is_weekend;
      if (isHoliday || excludeWeekend) {
        skippedDates.push(`${dateStr} (${isHoliday ? "holiday" : "weekend"})`);
        if (currentRange) { leaveRows.push(currentRange); currentRange = null; }
        return;
      }
      if (is_half_day) {
        leaveRows.push({ start_date: dateStr, end_date: dateStr, total_days: 0.5, is_half_day: 1, half_day_type });
        total_days += 0.5;
        return;
      }
      total_days += 1;
      if (!currentRange) {
        currentRange = { start_date: dateStr, end_date: dateStr, total_days: 1, is_half_day: 0, half_day_type: null };
      } else {
        currentRange.end_date = dateStr;
        currentRange.total_days += 1;
      }
    });
    if (currentRange) leaveRows.push(currentRange);
    if (!leaveRows.length) {
      const reason = skippedDates.length
        ? `All dates between ${start_date} and ${end_date} fall on weekends or holidays: ${skippedDates.slice(0, 5).join(", ")}${skippedDates.length > 5 ? ` and ${skippedDates.length - 5} more` : ""}`
        : `No working days found between ${start_date} and ${end_date}`;
      return sendError(res, 400, reason);
    }

    for (const row of leaveRows) {
      const [existingLeaves] = await conn.query(
        `SELECT id, start_date, end_date, is_half_day, half_day_type FROM employee_leaves
         WHERE employee_id = ? AND company_id = ? AND is_deleted = 0 AND LOWER(TRIM(status)) IN ('pending','approved')
           AND NOT (end_date < ? OR start_date > ?)`,
        [employee_id, company_id, row.start_date, row.end_date]
      );
      for (const existing of existingLeaves) {
        if (!row.is_half_day) return sendError(res, 409, `Overlaps with existing leave ${formatIST(existing.start_date, "YYYY-MM-DD")} to ${formatIST(existing.end_date, "YYYY-MM-DD")}`);
        if (Number(existing.is_half_day) === 0) return sendError(res, 409, "Half‑day conflicts with full‑day leave");
        const existingStart = formatIST(existing.start_date, "YYYY-MM-DD");
        if (existingStart !== row.start_date) return sendError(res, 409, "Half‑day overlap on different dates");
        if (existing.half_day_type === row.half_day_type) return sendError(res, 409, "Same half‑day type already exists");
      }
    }

    const leaveYear = getYearFromDate(start_date);
    const [[balance]] = await conn.query(
      `SELECT id, total_allocated, used, remaining FROM employee_leave_balances WHERE company_id=? AND employee_id=? AND leave_config_id=? AND year=? AND is_deleted=0 LIMIT 1 FOR UPDATE`,
      [company_id, employee_id, leave_config_id, leaveYear]
    );

    const approvedAt = getISTNow().format("YYYY-MM-DD HH:mm:ss");
    const insertedLeaveIds = [];
    for (const row of leaveRows) {
      const [result] = await conn.query(
        `INSERT INTO employee_leaves (company_id, employee_id, leave_config_id, start_date, end_date, total_days, is_half_day, half_day_type, reason, status, approved_by, approved_at, approval_remarks, applied_at, created_by, updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [company_id, employee_id, leave_config_id, row.start_date, row.end_date, row.total_days, row.is_half_day, row.half_day_type, reason, "approved", admin_user_id, approvedAt, remarks, approvedAt, admin_user_id, admin_user_id]
      );
      insertedLeaveIds.push(result.insertId);
    }

    const insertedAttachments = [];
    for (const leaveId of insertedLeaveIds) {
      for (const url of attachments) {
        try {
          const media = await saveMediaFromUrl({ url, folder: "leave", optimizeImage: true });
          if (!media?.success) continue;
          const [attRes] = await conn.query(
            `INSERT INTO employee_leave_attachments (leave_id, file_url, file_type, file_size, created_by, updated_by) VALUES (?,?,?,?,?,?)`,
            [leaveId, media.file_url, media.mime_type, media.size_bytes, admin_user_id, admin_user_id]
          );
          insertedAttachments.push({ id: attRes.insertId, leave_id: leaveId, file_url: media.file_url, mime_type: media.mime_type, file_size: media.size_bytes });
        } catch (attErr) { console.error("[ATTACHMENT_ERROR]", attErr); }
      }
    }

    await adjustEmployeeLeaveBalance({ conn, company_id, employee_id, leave_config_id, year: leaveYear, days: total_days, mode: "deduct", user_id: admin_user_id });

    const [createdLeaves] = await conn.query(
      `SELECT ${LEAVE_APPLICATION_JOIN_FIELDS}
       FROM employee_leaves el
       INNER JOIN leave_configs lc ON lc.id = el.leave_config_id
       INNER JOIN employees e ON e.id = el.employee_id
       INNER JOIN users u ON u.id = e.user_id
       WHERE el.id IN (?) ORDER BY el.start_date ASC`,
      [insertedLeaveIds]
    );

    await conn.commit();
    return sendSuccess(res, 201, "Leave created and approved successfully");
  } catch (err) {
    if (conn) await conn.rollback().catch(() => { });
    console.error("[POST /management/create]", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.put("/management/approve-edit", auth(LEAVE.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const approver_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);
    if (!Number.isInteger(approver_id) || approver_id <= 0 || !Number.isInteger(company_id) || company_id <= 0) return sendError(res, 401, "Unauthorized access");

    let { id, start_date = null, end_date = null, is_half_day = null, half_day_type = null, remarks = null } = req.body;
    id = Number(id);
    if (is_half_day !== null) is_half_day = (is_half_day === true || is_half_day === 1 || is_half_day === "1" || is_half_day === "true") ? 1 : 0;
    half_day_type = typeof half_day_type === "string" ? half_day_type.trim().toLowerCase() : null;

    if (!Number.isInteger(id) || id <= 0) return sendError(res, 400, "Valid leave id required");

    const [[leave]] = await conn.query(
      `SELECT el.*, lc.name AS leave_type_name, lc.code AS leave_type_code, e.employee_code, e.designation, e.weekends, u.id AS employee_user_id, u.name AS employee_name, u.email AS employee_email
       FROM employee_leaves el
       INNER JOIN leave_configs lc ON lc.id = el.leave_config_id AND lc.is_deleted = 0
       INNER JOIN employees e ON e.id = el.employee_id AND e.is_deleted = 0
       INNER JOIN users u ON u.id = e.user_id AND u.is_deleted = 0
       WHERE el.id = ? AND el.company_id = ? AND el.is_deleted = 0 LIMIT 1 FOR UPDATE`,
      [id, company_id]
    );
    if (!leave) return sendError(res, 404, "Leave not found");

    const leaveStatus = String(leave.status).trim().toLowerCase();
    if (leaveStatus !== "pending") return sendError(res, 400, leaveStatus === "approved" ? "Approved leave cannot be edited" : `Cannot approve leave in ${leaveStatus} state`);

    start_date = start_date || formatIST(leave.start_date, "YYYY-MM-DD");
    end_date = end_date || formatIST(leave.end_date, "YYYY-MM-DD");
    if (is_half_day === null) is_half_day = Number(leave.is_half_day) === 1 ? 1 : 0;
    half_day_type = half_day_type || leave.half_day_type;

    if (!parseDate(start_date) || !parseDate(end_date)) return sendError(res, 400, "Invalid date format");
    if (isDateAfter(start_date, end_date)) return sendError(res, 400, "start_date cannot exceed end_date");
    if (is_half_day && !["first_half", "second_half"].includes(half_day_type)) return sendError(res, 400, "Invalid half_day_type");
    if (is_half_day && start_date !== end_date) return sendError(res, 400, "Half day must be same day");

    const [[company]] = await conn.query(`SELECT id, name FROM companies WHERE id = ? AND is_active = 1 AND is_deleted = 0 LIMIT 1`, [company_id]);
    if (!company) return sendError(res, 404, "Company not found");

    const [[employee]] = await conn.query(
      `SELECT e.*, u.name, u.email FROM employees e INNER JOIN users u ON u.id = e.user_id AND u.is_active = 1 AND u.is_deleted = 0 WHERE e.id = ? AND e.company_id = ? AND e.is_active = 1 AND e.is_deleted = 0 LIMIT 1`,
      [leave.employee_id, company_id]
    );
    if (!employee) return sendError(res, 404, "Employee not found");

    const [[config]] = await conn.query(
      `SELECT * FROM leave_configs WHERE id = ? AND company_id = ? AND is_active = 1 AND is_deleted = 0 LIMIT 1`,
      [leave.leave_config_id, company_id]
    );
    if (!config) return sendError(res, 404, "Leave config not found");
    if (is_half_day && Number(config.allow_half_day) !== 1) return sendError(res, 400, "Half day leave not allowed");

    const [holidayRows] = await conn.query(
      `SELECT date FROM holidays WHERE company_id = ? AND is_optional = 0 AND is_active = 1 AND is_deleted = 0 AND date BETWEEN ? AND ?`,
      [company_id, start_date, end_date]
    );
    const holidaySet = new Set(holidayRows.map(h => formatIST(h.date, "YYYY-MM-DD")));

    let total_days = 0;
    eachDateBetween(start_date, end_date, (dateStr) => {
      const isHoliday = holidaySet.has(dateStr);
      const { is_weekend } = weekendInfo(dateStr, employee.weekends);
      const excludeWeekend = Number(config.exclude_weekends) === 1 && is_weekend;
      if (!isHoliday && !excludeWeekend) total_days += is_half_day ? 0.5 : 1;
    });
    total_days = Number(total_days.toFixed(2));
    if (!total_days) return sendError(res, 400, `No valid leave days between ${start_date} and ${end_date} — all dates fall on weekends or holidays (exclude_weekends: ${config.exclude_weekends ? "yes" : "no"}, holidays found: ${holidaySet.size})`);

    const [overlaps] = await conn.query(
      `SELECT id, start_date, end_date, is_half_day, half_day_type FROM employee_leaves
       WHERE employee_id = ? AND company_id = ? AND id != ? AND is_deleted = 0 AND LOWER(TRIM(status)) IN ('pending','approved')
         AND NOT (end_date < ? OR start_date > ?)`,
      [leave.employee_id, company_id, id, start_date, end_date]
    );
    if (overlaps.length) {
      let allowed = false;
      if (is_half_day && overlaps.length === 1 && Number(overlaps[0].is_half_day) === 1 &&
        overlaps[0].half_day_type !== half_day_type && formatIST(overlaps[0].start_date, "YYYY-MM-DD") === start_date) {
        allowed = true;
      }
      if (!allowed) return sendError(res, 409, "Leave overlap detected");
    }

    const approvedAt = getISTNow().format("YYYY-MM-DD HH:mm:ss");
    const newLeaveYear = getYearFromDate(start_date);

    await conn.query(
      `UPDATE employee_leaves SET start_date=?, end_date=?, total_days=?, is_half_day=?, half_day_type=?, status='approved', approved_by=?, approved_at=?, approval_remarks=?, updated_by=? WHERE id=?`,
      [start_date, end_date, total_days, is_half_day, is_half_day ? half_day_type : null, approver_id, approvedAt, remarks, approver_id, id]
    );

    const oldDays = Number(leave.total_days);
    if (total_days > oldDays) {
      await adjustEmployeeLeaveBalance({ conn, company_id, employee_id: leave.employee_id, leave_config_id: leave.leave_config_id, year: newLeaveYear, days: total_days - oldDays, mode: "deduct", user_id: approver_id });
    } else if (total_days < oldDays) {
      await adjustEmployeeLeaveBalance({ conn, company_id, employee_id: leave.employee_id, leave_config_id: leave.leave_config_id, year: newLeaveYear, days: oldDays - total_days, mode: "restore", user_id: approver_id });
    }

    const [[balance]] = await conn.query(
      `SELECT total_allocated, used, remaining FROM employee_leave_balances WHERE employee_id = ? AND company_id = ? AND leave_config_id = ? AND year = ? AND is_deleted = 0 LIMIT 1`,
      [leave.employee_id, company_id, leave.leave_config_id, newLeaveYear]
    );

    const [finalLeaves] = await conn.query(
      `SELECT el.*, lc.name AS leave_type_name, lc.code AS leave_type_code, e.employee_code, u.name AS employee_name, u.email AS employee_email
       FROM employee_leaves el INNER JOIN leave_configs lc ON lc.id = el.leave_config_id
       INNER JOIN employees e ON e.id = el.employee_id INNER JOIN users u ON u.id = e.user_id
       WHERE el.id = ? LIMIT 1`,
      [id]
    );

    const [[approver]] = await conn.query(`SELECT id, name, email FROM users WHERE id = ? AND is_active = 1 AND is_deleted = 0 LIMIT 1`, [approver_id]);

    await conn.commit();

    if (employee.email) {
      try {
        await queueLeaveAcceptanceEmail({
          to: employee.email,
          subject: `Leave Approved - ${config.name}`,
          fromEmail: EMAIL_USER,
          fromName: company?.name ? `${company.name} Leave Desk` : "OneAttendance",
          replyTo: approver?.email || null,
          requester: { id: employee.user_id, name: employee.name, email: employee.email },
          employee: { id: employee.id, employee_code: employee.employee_code, designation: getEnumObject(DESIGNATIONS, employee.designation), name: employee.name, email: employee.email },
          company: { id: company.id, name: company.name },
          leave: { start_date, end_date, total_days, is_half_day, half_day_type, reason: leave.reason, approval_remarks: remarks, approved_at: approvedAt },
          leaveConfig: { id: config.id, name: config.name, code: config.code },
          approver: { id: approver?.id, name: approver?.name || "Approver", email: approver?.email },
          leaveBalance: balance ? { total_allocated: Number(balance.total_allocated), used: Number(balance.used), remaining: Number(balance.remaining) } : {},
          maxAttempts: 3
        });
      } catch (emailErr) { console.error("[APPROVE_EDIT_EMAIL_ERROR]", emailErr); }
    }

    return sendSuccess(res, 200, "Leave approved successfully");
  } catch (err) {
    if (conn) await conn.rollback().catch(() => { });
    console.error("[PUT /management/approve-edit]", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.put("/management/bulk-approve-reject", auth(LEAVE.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const approver_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);
    if (!Number.isInteger(approver_id) || approver_id <= 0 || !Number.isInteger(company_id) || company_id <= 0) return sendError(res, 401, "Unauthorized access");

    let { ids, action, remarks = null } = req.body;
    let isAll = false;
    if (ids === "all") isAll = true;
    else {
      if (!Array.isArray(ids)) return sendError(res, 400, "ids must be an array or 'all'");
      ids = [...new Set(ids.map(Number))].filter(v => Number.isInteger(v) && v > 0);
      if (!ids.length) return sendError(res, 400, "At least one valid leave id required");
      if (ids.length > 500) return sendError(res, 400, "Maximum 500 leaves per request");
    }

    action = typeof action === "string" ? action.trim().toLowerCase() : null;
    if (!["approve", "reject"].includes(action)) return sendError(res, 400, "Invalid action. Allowed: approve, reject");
    remarks = typeof remarks === "string" ? remarks.trim() : null;
    if (remarks && remarks.length > 255) return sendError(res, 400, "Remarks too long");

    let leavesQuery;
    if (isAll) {
      leavesQuery = `
        SELECT el.*, e.user_id, e.employee_code, e.designation, e.weekends, e.is_active AS employee_active, e.is_deleted AS employee_deleted,
               lc.name AS leave_name, lc.code AS leave_code, lc.is_paid, lc.allow_half_day, lc.exclude_weekends,
               lc.is_active AS config_active, lc.is_deleted AS config_deleted,
               u.name AS employee_name, LOWER(TRIM(u.email)) AS employee_email,
               c.id AS company_id, c.name AS company_name,
               approverUser.name AS approver_name, approverUser.email AS approver_email
        FROM employee_leaves el
        INNER JOIN employees e ON e.id = el.employee_id AND e.company_id = el.company_id
        INNER JOIN users u ON u.id = e.user_id AND u.is_active = 1 AND u.is_deleted = 0
        INNER JOIN leave_configs lc ON lc.id = el.leave_config_id AND lc.company_id = el.company_id
        INNER JOIN companies c ON c.id = el.company_id AND c.is_active = 1 AND c.is_deleted = 0
        LEFT JOIN users approverUser ON approverUser.id = ?
        WHERE el.company_id = ? AND LOWER(TRIM(el.status)) = 'pending' AND el.is_deleted = 0
        ORDER BY el.id ASC LIMIT 500 FOR UPDATE`;
    } else {
      leavesQuery = `
        SELECT el.*, e.user_id, e.employee_code, e.designation, e.weekends, e.is_active AS employee_active, e.is_deleted AS employee_deleted,
               lc.name AS leave_name, lc.code AS leave_code, lc.is_paid, lc.allow_half_day, lc.exclude_weekends,
               lc.is_active AS config_active, lc.is_deleted AS config_deleted,
               u.name AS employee_name, LOWER(TRIM(u.email)) AS employee_email,
               c.id AS company_id, c.name AS company_name,
               approverUser.name AS approver_name, approverUser.email AS approver_email
        FROM employee_leaves el
        INNER JOIN employees e ON e.id = el.employee_id AND e.company_id = el.company_id
        INNER JOIN users u ON u.id = e.user_id AND u.is_active = 1 AND u.is_deleted = 0
        INNER JOIN leave_configs lc ON lc.id = el.leave_config_id AND lc.company_id = el.company_id
        INNER JOIN companies c ON c.id = el.company_id AND c.is_active = 1 AND c.is_deleted = 0
        LEFT JOIN users approverUser ON approverUser.id = ?
        WHERE el.company_id = ? AND el.id IN (?) AND el.is_deleted = 0 FOR UPDATE`;
    }
    const queryParams = isAll ? [approver_id, company_id] : [approver_id, company_id, ids];
    const [leaves] = await conn.query(leavesQuery, queryParams);

    if (!leaves.length) return sendError(res, 404, isAll ? "No pending leaves" : `Leaves not found: ${ids.join(", ")}`);
    if (!isAll && leaves.length !== ids.length) {
      const found = new Set(leaves.map(l => l.id));
      return sendError(res, 404, `Leaves not found: ${ids.filter(id => !found.has(id)).join(", ")}`);
    }

    let holidaySet = new Set();
    if (action === "approve") {
      let minDate = null, maxDate = null;
      leaves.forEach(l => {
        const s = formatIST(l.start_date, "YYYY-MM-DD"), e = formatIST(l.end_date, "YYYY-MM-DD");
        if (!minDate || s < minDate) minDate = s;
        if (!maxDate || e > maxDate) maxDate = e;
      });
      const [hRows] = await conn.query(
        `SELECT date FROM holidays WHERE company_id = ? AND is_optional = 0 AND is_active = 1 AND is_deleted = 0 AND date BETWEEN ? AND ?`,
        [company_id, minDate, maxDate]
      );
      holidaySet = new Set(hRows.map(h => formatIST(h.date, "YYYY-MM-DD")));
    }

    const calculateActualDays = ({ leave, weekends, exclude_weekends }) => {
      let total = 0;
      eachDateBetween(formatIST(leave.start_date, "YYYY-MM-DD"), formatIST(leave.end_date, "YYYY-MM-DD"), (dateStr) => {
        const { is_weekend } = weekendInfo(dateStr, weekends);
        if (holidaySet.has(dateStr) || (Number(exclude_weekends) === 1 && is_weekend)) return;
        total += Number(leave.is_half_day) === 1 ? 0.5 : 1;
      });
      return Number(total.toFixed(2));
    };

    const emailJobs = [];
    const processedIds = [];

    for (const leave of leaves) {
      const curStatus = String(leave.status).trim().toLowerCase();
      if (curStatus !== "pending") return sendError(res, 400, `Leave ${leave.id} already ${curStatus}`);

      if (action === "reject") {
        const leaveYear = getYearFromDate(formatIST(leave.start_date, "YYYY-MM-DD"));
        await adjustEmployeeLeaveBalance({ conn, company_id, employee_id: leave.employee_id, leave_config_id: leave.leave_config_id, year: leaveYear, days: Number(leave.total_days), mode: "restore", user_id: approver_id });
        await conn.query(`UPDATE employee_leaves SET status='rejected', approved_by=?, approved_at=NOW(), approval_remarks=?, updated_by=? WHERE id=?`, [approver_id, remarks, approver_id, leave.id]);
        const [[rejleave]] = await conn.query(`SELECT approved_at FROM employee_leaves WHERE id = ?`, [leave.id]);
        processedIds.push(leave.id);
        if (leave.employee_email) {
          let rejBalance = null;
          const [[rejBal]] = await conn.query(`SELECT total_allocated, used, remaining FROM employee_leave_balances WHERE company_id=? AND employee_id=? AND leave_config_id=? AND year=? AND is_deleted=0 LIMIT 1`, [company_id, leave.employee_id, leave.leave_config_id, leaveYear]);
          rejBalance = rejBal ? { total_allocated: Number(rejBal.total_allocated), used: Number(rejBal.used), remaining: Number(rejBal.remaining) } : null;
          emailJobs.push(queueLeaveRejectionEmail({
            to: leave.employee_email,
            subject: `Leave Rejected - ${leave.leave_name || "Leave"}`,
            fromEmail: EMAIL_USER,
            fromName: leave.company_name ? `${leave.company_name} Leave Desk` : "OneAttendance",
            replyTo: leave.approver_email || req.user?.email || EMAIL_USER,
            requester: { id: leave.user_id, name: leave.employee_name, email: leave.employee_email },
            employee: { id: leave.employee_id, employee_code: leave.employee_code, designation: getEnumObject(DESIGNATIONS, leave.designation) },
            company: { id: leave.company_id, name: leave.company_name },
            leave: { id: leave.id, start_date: formatIST(leave.start_date, "YYYY-MM-DD"), end_date: formatIST(leave.end_date, "YYYY-MM-DD"), total_days: Number(leave.total_days), reason: leave.reason, approval_remarks: remarks, approved_at: rejleave.approved_at },
            leaveConfig: { id: leave.leave_config_id, name: leave.leave_name, code: leave.leave_code },
            approver: { id: approver_id, name: leave.approver_name || "Approver", email: leave.approver_email },
            leaveBalance: rejBalance
          }));
        }
        continue;
      }

      if (Number(leave.employee_active) !== 1 || Number(leave.employee_deleted) === 1) return sendError(res, 400, `Employee inactive for leave ${leave.id}`);
      if (Number(leave.config_active) !== 1 || Number(leave.config_deleted) === 1) return sendError(res, 400, `Leave config inactive for leave ${leave.id}`);

      const actualDays = calculateActualDays({ leave, weekends: leave.weekends, exclude_weekends: leave.exclude_weekends });
      if (actualDays <= 0) return sendError(res, 400, `No valid days for leave ${leave.id}`);

      const [overlaps] = await conn.query(
        `SELECT id, start_date, end_date, is_half_day, half_day_type FROM employee_leaves WHERE employee_id = ? AND company_id = ? AND id != ? AND is_deleted = 0 AND LOWER(TRIM(status)) IN ('pending','approved') AND NOT (end_date < ? OR start_date > ?)`,
        [leave.employee_id, company_id, leave.id, formatIST(leave.start_date, "YYYY-MM-DD"), formatIST(leave.end_date, "YYYY-MM-DD")]
      );
      if (overlaps.length) {
        let allowed = false;
        if (Number(leave.is_half_day) === 1 && overlaps.length === 1 && Number(overlaps[0].is_half_day) === 1 &&
          overlaps[0].half_day_type !== leave.half_day_type && formatIST(overlaps[0].start_date, "YYYY-MM-DD") === formatIST(leave.start_date, "YYYY-MM-DD")) {
          allowed = true;
        }
        if (!allowed) return sendError(res, 409, `Leave overlap for leave ${leave.id}`);
      }

      let latestBalance = null;
      const leaveYear = getYearFromDate(formatIST(leave.start_date, "YYYY-MM-DD"));
      const [[balance]] = await conn.query(`SELECT total_allocated, used, remaining FROM employee_leave_balances WHERE company_id=? AND employee_id=? AND leave_config_id=? AND year=? AND is_deleted=0 LIMIT 1`, [company_id, leave.employee_id, leave.leave_config_id, leaveYear]);
      latestBalance = balance ? { total_allocated: Number(balance.total_allocated), used: Number(balance.used), remaining: Number(balance.remaining) } : null;

      await conn.query(`UPDATE employee_leaves SET total_days=?, status='approved', approved_by=?, approved_at=NOW(), approval_remarks=?, updated_by=? WHERE id=?`, [actualDays, approver_id, remarks, approver_id, leave.id]);
      processedIds.push(leave.id);

      if (leave.employee_email) {
        emailJobs.push(queueLeaveAcceptanceEmail({
          to: leave.employee_email,
          subject: `Leave Approved - ${leave.leave_name || "Leave"}`,
          fromEmail: EMAIL_USER,
          fromName: leave.company_name ? `${leave.company_name} Leave Desk` : "OneAttendance",
          replyTo: leave.approver_email || req.user?.email || EMAIL_USER,
          requester: { id: leave.user_id, name: leave.employee_name, email: leave.employee_email },
          employee: { id: leave.employee_id, employee_code: leave.employee_code, designation: getEnumObject(DESIGNATIONS, leave.designation) },
          company: { id: leave.company_id, name: leave.company_name },
          leave: { id: leave.id, start_date: formatIST(leave.start_date, "YYYY-MM-DD"), end_date: formatIST(leave.end_date, "YYYY-MM-DD"), total_days: actualDays, reason: leave.reason, approval_remarks: remarks },
          leaveConfig: { id: leave.leave_config_id, name: leave.leave_name, code: leave.leave_code },
          approver: { id: approver_id, name: leave.approver_name || "Approver", email: leave.approver_email },
          leaveBalance: latestBalance
        }));
      }
    }

    const [finalLeaves] = await conn.query(
      `SELECT ${LEAVE_APPLICATION_JOIN_FIELDS}
       FROM employee_leaves el
       INNER JOIN leave_configs lc ON lc.id = el.leave_config_id
       INNER JOIN employees e ON e.id = el.employee_id
       INNER JOIN users u ON u.id = e.user_id
       WHERE el.id IN (?) ORDER BY el.start_date ASC`,
      [processedIds]
    );

    await conn.commit();

    Promise.allSettled(emailJobs).catch(console.error);

    return sendSuccess(res, 200, `${processedIds.length} leave(s) ${action}d successfully`);
  } catch (err) {
    if (conn) await conn.rollback().catch(() => { });
    console.error("[PUT /management/bulk-actions]", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.get("/emp-leaves", auth(LEAVE.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const company_id = req.company?.id;
    if (!company_id) return sendError(res, 400, "Invalid company");

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const offset = (page - 1) * limit;
    const search = (req.query.search || "").trim();
    const status = req.query.status?.trim();
    const start_date = req.query.start_date;
    const end_date = req.query.end_date;
    const employee_id = req.query.employee_id ? Number(req.query.employee_id) : null;
    const leave_type = req.query.leave_type ? Number(req.query.leave_type) : null;

    if (employee_id && (!Number.isInteger(employee_id) || employee_id <= 0))
      return sendError(res, 400, "Invalid employee_id");

    if (leave_type && (!Number.isInteger(leave_type) || leave_type <= 0))
      return sendError(res, 400, "Invalid leave_type");

    const allowedStatuses = ["pending", "approved", "rejected"];
    if (status && !allowedStatuses.includes(status.toLowerCase())) return sendError(res, 400, `Invalid status. Allowed: ${allowedStatuses.join(", ")}`);
    if (start_date && isNaN(new Date(start_date))) return sendError(res, 400, "Invalid start_date");
    if (end_date && isNaN(new Date(end_date))) return sendError(res, 400, "Invalid end_date");

    let query = `
      SELECT ${LEAVE_APPLICATION_FIELDS}, e.employee_code, e.designation,
             u.name AS employee_name, u.email, u.profile_picture,
             lc.code AS leave_code, lc.name AS leave_name, lc.is_paid,
             au.name AS approved_by_name
      FROM employee_leaves el
      JOIN employees e ON e.id = el.employee_id AND e.company_id = ? AND e.is_deleted = 0 AND e.is_active = 1
      JOIN users u ON u.id = e.user_id AND u.is_deleted = 0
      JOIN leave_configs lc ON lc.id = el.leave_config_id AND lc.is_deleted = 0
      LEFT JOIN users au ON au.id = el.approved_by
      WHERE el.company_id = ? AND el.is_deleted = 0 AND LOWER(TRIM(el.status)) != 'cancelled'
    `;
    const params = [company_id, company_id];

    if (status) { query += ` AND el.status = ?`; params.push(status); }
    if (start_date && end_date) { query += ` AND el.start_date BETWEEN ? AND ?`; params.push(start_date, end_date); }
    else if (start_date) { query += ` AND el.start_date >= ?`; params.push(start_date); }
    else if (end_date) { query += ` AND el.start_date <= ?`; params.push(end_date); }
    if (search) {
      const terms = search.toLowerCase().split(" ").filter(Boolean);
      const conditions = terms.map(() => `(LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(e.employee_code) LIKE ? OR LOWER(lc.name) LIKE ? OR LOWER(lc.code) LIKE ? OR LOWER(el.reason) LIKE ?)`).join(" AND ");
      query += ` AND (${conditions})`;
      terms.forEach(term => { const s = `%${term}%`; params.push(s, s, s, s, s, s); });
    }
    if (employee_id) { query += ` AND el.employee_id = ?`; params.push(employee_id); }
    if (leave_type) { query += ` AND el.leave_config_id = ?`; params.push(leave_type); }

    query += ` ORDER BY el.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await conn.query(query, params);
    const leaveIds = rows.map(r => r.id);
    let attachmentMap = {};
    if (leaveIds.length) {
      const [attachments] = await conn.query(`SELECT id, leave_id, file_url, file_type, file_size FROM employee_leave_attachments WHERE leave_id IN (?) AND is_deleted = 0`, [leaveIds]);
      attachmentMap = attachments.reduce((acc, file) => { (acc[file.leave_id] = acc[file.leave_id] || []).push({ id: file.id, file_url: file.file_url, file_type: file.file_type, file_size: file.file_size }); return acc; }, {});
    }

    let countQuery = `SELECT COUNT(*) as total FROM employee_leaves el JOIN employees e ON e.id = el.employee_id AND e.company_id = ? AND e.is_deleted = 0 AND e.is_active = 1 JOIN users u ON u.id = e.user_id AND u.is_deleted = 0 JOIN leave_configs lc ON lc.id = el.leave_config_id AND lc.is_deleted = 0 WHERE el.company_id = ? AND el.is_deleted = 0 AND LOWER(TRIM(el.status)) != 'cancelled'`;
    const countParams = [company_id, company_id];
    if (status) { countQuery += ` AND el.status = ?`; countParams.push(status); }
    if (start_date && end_date) { countQuery += ` AND el.start_date BETWEEN ? AND ?`; countParams.push(start_date, end_date); }
    else if (start_date) { countQuery += ` AND el.start_date >= ?`; countParams.push(start_date); }
    else if (end_date) { countQuery += ` AND el.start_date <= ?`; countParams.push(end_date); }
    if (search) {
      const terms = search.toLowerCase().split(" ").filter(Boolean);
      const conditions = terms.map(() => `(LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(e.employee_code) LIKE ? OR LOWER(lc.name) LIKE ? OR LOWER(lc.code) LIKE ? OR LOWER(el.reason) LIKE ?)`).join(" AND ");
      countQuery += ` AND (${conditions})`;
      terms.forEach(term => { const s = `%${term}%`; countParams.push(s, s, s, s, s, s); });
    }
    if (employee_id) { countQuery += ` AND el.employee_id = ?`; countParams.push(employee_id); }
    if (leave_type) { countQuery += ` AND el.leave_config_id = ?`; countParams.push(leave_type); }

    const [[{ total }]] = await conn.query(countQuery, countParams);

    const data = rows.map(row => ({
      ...formatLeaveApplication(row),
      profile_picture: buildFileUrl(row.profile_picture) || null,
      attachments: attachmentMap[row.id] || []
    }));

    return sendSuccess(res, 200, "Employee leaves fetched successfully", data, buildMeta(page, limit, total, data.length));
  } catch (err) {
    console.error("Leave List Error:", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// ================ Leave Management Routes(Endusers) ====================

router.post("/apply", auth(LEAVE.EMP), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = Number(req.company?.id);
    const user_id = Number(req.user?.id);
    if (!Number.isInteger(company_id) || company_id <= 0) return sendError(res, 401, "Unauthorized company");
    if (!Number.isInteger(user_id) || user_id <= 0) return sendError(res, 401, "Unauthorized user");

    let {
      leave_config_id, start_date, end_date,
      is_half_day = 0, half_day_type = null, reason = null, attachments = []
    } = req.body;

    leave_config_id = Number(leave_config_id);
    is_half_day = (is_half_day === true || is_half_day === 1 || is_half_day === "1" || is_half_day === "true") ? 1 : 0;
    half_day_type = typeof half_day_type === "string" ? half_day_type.trim().toLowerCase() : null;
    reason = typeof reason === "string" ? reason.trim() : null;
    attachments = Array.isArray(attachments) ? attachments : [];

    if (!Number.isInteger(leave_config_id) || leave_config_id <= 0) return sendError(res, 400, "Valid leave_config_id required");
    if (!start_date || !end_date) return sendError(res, 400, "start_date and end_date are required");
    if (!parseDate(start_date) || !parseDate(end_date)) return sendError(res, 400, "Invalid date format. Use YYYY-MM-DD");
    if (isDateAfter(start_date, end_date)) return sendError(res, 400, "start_date cannot be greater than end_date");
    if (is_half_day && !["first_half", "second_half"].includes(half_day_type)) return sendError(res, 400, "half_day_type must be first_half or second_half");
    if (reason && reason.length > 2000) return sendError(res, 400, "Reason too long");
    if (attachments.length > 10) return sendError(res, 400, "Max 10 attachments");
    for (const url of attachments) if (typeof url !== "string" || !url.trim()) return sendError(res, 400, "Invalid attachment URL");

    const [[employee]] = await conn.query(
      `SELECT e.id, e.user_id, e.employee_code, e.designation, e.joining_date, e.weekends, e.status, e.is_active, u.name, u.email
       FROM employees e INNER JOIN users u ON u.id = e.user_id AND u.is_deleted = 0 AND u.is_active = 1
       WHERE e.user_id = ? AND e.company_id = ? AND e.is_deleted = 0 LIMIT 1`,
      [user_id, company_id]
    );
    if (!employee) return sendError(res, 404, "Employee not found");
    if (employee.is_active !== 1 || employee.status !== "active") return sendError(res, 400, "Employee is not active");
    if (isBeforeJoining(start_date, employee.joining_date)) return sendError(res, 400, "Leave cannot be applied before joining date");

    const [[company]] = await conn.query(`SELECT id, name, owner_user_id FROM companies WHERE id = ? AND is_active = 1 AND is_deleted = 0 LIMIT 1`, [company_id]);
    if (!company) return sendError(res, 404, "Company not found");

    const [[config]] = await conn.query(
      `SELECT id, code, name, is_paid, allow_half_day, exclude_weekends FROM leave_configs WHERE id = ? AND company_id = ? AND is_active = 1 AND is_deleted = 0 LIMIT 1`,
      [leave_config_id, company_id]
    );
    if (!config) return sendError(res, 404, "Leave configuration not found");
    if (is_half_day && Number(config.allow_half_day) !== 1) return sendError(res, 400, "Half day leave not allowed");

    const [holidayRows] = await conn.query(
      `SELECT date FROM holidays WHERE company_id = ? AND is_optional = 0 AND is_active = 1 AND is_deleted = 0 AND date BETWEEN ? AND ?`,
      [company_id, start_date, end_date]
    );
    const holidaySet = new Set(holidayRows.map(h => formatIST(h.date, "YYYY-MM-DD")));

    const leaveRows = [];
    let total_days = 0;
    let currentRange = null;
    const skippedDates = [];
    eachDateBetween(start_date, end_date, (dateStr) => {
      const isHoliday = holidaySet.has(dateStr);
      const { is_weekend } = weekendInfo(dateStr, employee.weekends);
      const excludeWeekend = Number(config.exclude_weekends) === 1 && is_weekend;
      if (isHoliday || excludeWeekend) {
        skippedDates.push(`${dateStr} (${isHoliday ? "holiday" : "weekend"})`);
        if (currentRange) { leaveRows.push(currentRange); currentRange = null; }
        return;
      }
      if (is_half_day) {
        leaveRows.push({ start_date: dateStr, end_date: dateStr, total_days: 0.5, is_half_day: 1, half_day_type });
        total_days += 0.5;
        return;
      }
      total_days += 1;
      if (!currentRange) {
        currentRange = { start_date: dateStr, end_date: dateStr, total_days: 1, is_half_day: 0, half_day_type: null };
      } else {
        currentRange.end_date = dateStr;
        currentRange.total_days += 1;
      }
    });
    if (currentRange) leaveRows.push(currentRange);
    if (!leaveRows.length) {
      const reason = skippedDates.length
        ? `All dates between ${start_date} and ${end_date} fall on weekends or holidays: ${skippedDates.slice(0, 5).join(", ")}${skippedDates.length > 5 ? ` and ${skippedDates.length - 5} more` : ""}`
        : `No working days found between ${start_date} and ${end_date}`;
      return sendError(res, 400, reason);
    }

    for (const row of leaveRows) {
      const [existing] = await conn.query(
        `SELECT id, start_date, end_date, is_half_day, half_day_type FROM employee_leaves
         WHERE employee_id = ? AND company_id = ? AND is_deleted = 0 AND LOWER(TRIM(status)) IN ('pending','approved')
           AND NOT (end_date < ? OR start_date > ?)`,
        [employee.id, company_id, row.start_date, row.end_date]
      );
      if (existing.length) {
        let conflict = true;
        if (row.is_half_day && existing.length === 1 && Number(existing[0].is_half_day) === 1 &&
          existing[0].half_day_type !== row.half_day_type &&
          formatIST(existing[0].start_date, "YYYY-MM-DD") === row.start_date) {
          conflict = false;
        }
        if (conflict) return sendError(res, 409, "Leave overlap detected");
      }
    }

    const leaveYear = getYearFromDate(start_date);

    const [[balance]] = await conn.query(
      `SELECT id, total_allocated, used, remaining FROM employee_leave_balances
         WHERE company_id = ? AND employee_id = ? AND leave_config_id = ? AND year = ? AND is_deleted = 0 LIMIT 1 FOR UPDATE`,
      [company_id, employee.id, leave_config_id, leaveYear]
    );
    if (!balance) {
      await conn.rollback();
      return sendError(res, 400, "No leave balance allocated for this leave type");
    }
    if (Number(balance.remaining) < Number(total_days)) {
      await conn.rollback();
      return sendError(res, 400, `Insufficient leave balance. Available: ${Number(balance.remaining)}, Requested: ${total_days}`);
    }

    const appliedAt = getISTNow().format("YYYY-MM-DD HH:mm:ss");
    const insertedLeaveIds = [];
    for (const row of leaveRows) {
      const [result] = await conn.query(
        `INSERT INTO employee_leaves (company_id, employee_id, leave_config_id, start_date, end_date, total_days, is_half_day, half_day_type, reason, status, applied_at, created_by, updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [company_id, employee.id, leave_config_id, row.start_date, row.end_date, row.total_days, row.is_half_day, row.half_day_type, reason, "pending", appliedAt, user_id, user_id]
      );
      insertedLeaveIds.push(result.insertId);
    }

    const insertedAttachments = [];
    for (const leaveId of insertedLeaveIds) {
      for (const url of attachments) {
        try {
          const media = await saveMediaFromUrl({ url, folder: "leave", optimizeImage: true });
          if (!media?.success) continue;
          const [attRes] = await conn.query(
            `INSERT INTO employee_leave_attachments (leave_id, file_url, file_type, file_size, created_by, updated_by) VALUES (?,?,?,?,?,?)`,
            [leaveId, media.file_url, media.mime_type, media.size_bytes, user_id, user_id]
          );
          insertedAttachments.push({ id: attRes.insertId, leave_id: leaveId, file_url: media.file_url, mime_type: media.mime_type, file_size: media.size_bytes });
        } catch (attErr) { console.error("[ATTACHMENT_ERROR]", attErr); }
      }
    }

    let updatedBalance = null;
    if (total_days > 0) {
      const balRes = await adjustEmployeeLeaveBalance({ conn, company_id, employee_id: employee.id, leave_config_id, year: leaveYear, days: total_days, mode: "deduct", user_id });
      updatedBalance = balRes.balance;
    }

    const [reviewers] = await conn.query(
      `SELECT DISTINCT u.id AS user_id, u.name, LOWER(TRIM(u.email)) AS email
       FROM employees e INNER JOIN users u ON u.id = e.user_id AND u.is_active = 1 AND u.is_deleted = 0
       INNER JOIN permission_packages pp ON pp.id = e.permission_package_id AND pp.company_id = e.company_id AND pp.is_active = 1 AND pp.is_deleted = 0
       INNER JOIN permission_package_items ppi ON ppi.package_id = pp.id AND ppi.is_active = 1 AND ppi.is_deleted = 0
       INNER JOIN permissions p ON p.id = ppi.permission_id
       WHERE e.company_id = ? AND e.is_active = 1 AND e.is_deleted = 0 AND p.code = 'leave_management' AND u.email IS NOT NULL AND u.id != ?`,
      [company_id, user_id]
    );
    const [[companyOwner]] = await conn.query(
      `SELECT u.id, u.name, LOWER(TRIM(u.email)) AS email FROM companies c INNER JOIN users u ON u.id = c.owner_user_id AND u.is_active = 1 AND u.is_deleted = 0 WHERE c.id = ? AND c.is_active = 1 AND c.is_deleted = 0 LIMIT 1`,
      [company_id]
    );

    const [createdLeaves] = await conn.query(
      `SELECT ${LEAVE_APPLICATION_JOIN_FIELDS}
       FROM employee_leaves el
       INNER JOIN leave_configs lc ON lc.id = el.leave_config_id
       INNER JOIN employees e ON e.id = el.employee_id
       INNER JOIN users u ON u.id = e.user_id
       WHERE el.id IN (?) ORDER BY el.start_date ASC`,
      [insertedLeaveIds]
    );

    await conn.commit();

    const emailJobs = [];
    const emailPayload = {
      subject: `New Leave Request - ${employee.name}`,
      fromEmail: EMAIL_USER,
      fromName: company?.name ? `${company.name} Leave Desk` : "OneAttendance",
      requester: { id: employee.user_id, name: employee.name, email: employee.email },
      employee: { id: employee.id, employee_code: employee.employee_code, designation: getEnumObject(DESIGNATIONS, employee.designation), name: employee.name, email: employee.email },
      company: { id: company.id, name: company.name },
      leave: { start_date, end_date, total_days, is_half_day, half_day_type: getEnumObject(HALF_DAY_TYPES, half_day_type), reason },
      leaveConfig: { id: config.id, code: config.code, name: config.name, is_paid: config.is_paid },
      leaveBalance: updatedBalance || {},
      attachments: insertedAttachments
    };

    for (const reviewer of reviewers) {
      if (!reviewer?.email) continue;
      emailJobs.push(queueLeaveRequestEmail({ ...emailPayload, to: reviewer.email, adminName: reviewer.name || "Admin", replyTo: employee.email, maxAttempts: 3 }));
    }
    if (companyOwner?.email && companyOwner.email !== employee.email && !reviewers.some(r => r.email === companyOwner.email)) {
      emailJobs.push(queueLeaveRequestEmail({ ...emailPayload, to: companyOwner.email, adminName: companyOwner.name || "Company Owner", replyTo: employee.email, maxAttempts: 3 }));
    }
    Promise.allSettled(emailJobs).catch(console.error);

    return sendSuccess(res, 201, "Leave applied successfully");
  } catch (err) {
    if (conn) await conn.rollback().catch(() => { });
    console.error("[POST /apply]", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.put("/cancel", auth(LEAVE.EMP), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const leaveId = req.body.id;
    const user_id = req.user?.id;
    const company_id = req.company?.id;
    if (!leaveId) return sendError(res, 400, "Leave id is required");
    if (!user_id || !company_id) return sendError(res, 400, "Invalid user/company context");

    const [[employee]] = await conn.query(`SELECT id FROM employees WHERE user_id=? AND company_id=? AND is_active=1 AND is_deleted=0 LIMIT 1`, [user_id, company_id]);
    if (!employee) return sendError(res, 403, "No active employee found");

    const [[leave]] = await conn.query(
      `SELECT el.*, lc.is_paid FROM employee_leaves el INNER JOIN leave_configs lc ON lc.id = el.leave_config_id AND lc.is_deleted = 0 WHERE el.id=? AND el.company_id=? AND el.is_deleted=0 FOR UPDATE`,
      [leaveId, company_id]
    );
    if (!leave) return sendError(res, 404, "Leave not found");
    if (leave.employee_id !== employee.id) return sendError(res, 403, "You can only cancel your own leave");

    const status = String(leave.status).trim().toLowerCase();
    if (status === "cancelled") { await conn.commit(); return sendSuccess(res, 200, "Leave already cancelled"); }
    if (!["pending", "approved"].includes(status)) return sendError(res, 400, `Cannot cancel leave in '${status}' state`);

    const leaveYear = getYearFromDate(formatIST(leave.start_date, "YYYY-MM-DD"));
    await adjustEmployeeLeaveBalance({ conn, company_id, employee_id: leave.employee_id, leave_config_id: leave.leave_config_id, year: leaveYear, days: Number(leave.total_days), mode: "restore", user_id });

    await conn.query(`UPDATE employee_leaves SET status='cancelled', cancelled_at=NOW(), is_active=0, updated_by=? WHERE id=?`, [user_id, leaveId]);
    await conn.commit();
    return sendSuccess(res, 200, "Leave cancelled and removed successfully");
  } catch (err) {
    if (conn) await conn.rollback().catch(() => { });
    console.error("[PUT /cancel]", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.put("/application-update", auth(LEAVE.EMP), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const leave_id = req.body.id;
    const user_id = req.user?.id;
    const company_id = req.company?.id;
    const { leave_config_id, start_date, end_date, is_half_day = 0, half_day_type, reason, attachments = [], deleted_attachments = [] } = req.body;

    if (!leave_id) return sendError(res, 400, "Leave ID is required");
    if (!user_id || !company_id) return sendError(res, 400, "Invalid user/company context");

    const [[employee]] = await conn.query(
      `SELECT e.id, e.weekends FROM employees e
       WHERE e.user_id = ? AND e.company_id = ? AND e.is_active = 1 AND e.is_deleted = 0 LIMIT 1`,
      [user_id, company_id]
    );
    if (!employee) return sendError(res, 403, "No active employee found");

    const [[leave]] = await conn.query(`SELECT * FROM employee_leaves WHERE id=? AND company_id=? AND is_deleted=0 FOR UPDATE`, [leave_id, company_id]);
    if (!leave) return sendError(res, 404, "Leave not found");
    if (leave.employee_id !== employee.id) return sendError(res, 403, "You can only update your own leave");
    if (leave.status !== "pending") return sendError(res, 400, `Cannot update leave in '${leave.status}' state`);

    const newStartDate = start_date || formatIST(leave.start_date, "YYYY-MM-DD");
    const newEndDate = end_date || formatIST(leave.end_date, "YYYY-MM-DD");
    if (!parseDate(newStartDate) || !parseDate(newEndDate)) return sendError(res, 400, "Invalid date format. Use YYYY-MM-DD");
    if (isDateAfter(newStartDate, newEndDate)) return sendError(res, 400, "Start date cannot be after end date");

    const halfDay = (is_half_day === true || is_half_day === 1 || is_half_day === "1" || is_half_day === "true") ? 1 : 0;
    if (halfDay) {
      if (!isSameDate(newStartDate, newEndDate)) return sendError(res, 400, "Half day must be single day");
      if (!["first_half", "second_half"].includes(half_day_type)) return sendError(res, 400, "Invalid half_day_type");
    }
    const attachmentUrls = Array.isArray(attachments) ? attachments : [];

    const newLeaveConfigId = leave_config_id ? Number(leave_config_id) : leave.leave_config_id;
    const oldLeaveConfigId = leave.leave_config_id;
    const leaveConfigChanged = newLeaveConfigId !== oldLeaveConfigId;

    const [[newConfig]] = await conn.query(
      `SELECT * FROM leave_configs WHERE id=? AND company_id=? AND is_active=1 AND is_deleted=0 LIMIT 1`,
      [newLeaveConfigId, company_id]
    );
    if (!newConfig) return sendError(res, 404, "Leave config not found");
    if (halfDay && Number(newConfig.allow_half_day) !== 1) return sendError(res, 400, "Half day leave not allowed for this leave type");

    let oldConfig = newConfig;
    if (leaveConfigChanged) {
      const [[fetchedOldConfig]] = await conn.query(
        `SELECT * FROM leave_configs WHERE id=? AND company_id=? AND is_deleted=0 LIMIT 1`,
        [oldLeaveConfigId, company_id]
      );
      if (fetchedOldConfig) oldConfig = fetchedOldConfig;
    }

    const [holidayRows] = await conn.query(
      `SELECT date FROM holidays WHERE company_id=? AND is_optional=0 AND is_deleted=0 AND is_active=1 AND date BETWEEN ? AND ?`,
      [company_id, newStartDate, newEndDate]
    );
    const holidaySet = new Set(holidayRows.map(h => formatIST(h.date, "YYYY-MM-DD")));

    let new_total_days = 0;
    eachDateBetween(newStartDate, newEndDate, (dateStr) => {
      const isHoliday = holidaySet.has(dateStr);
      const { is_weekend } = weekendInfo(dateStr, employee.weekends);
      const excludeWeekend = Number(newConfig.exclude_weekends) === 1 && is_weekend;
      if (!isHoliday && !excludeWeekend) {
        new_total_days += halfDay ? 0.5 : 1;
      }
    });
    new_total_days = Number(new_total_days.toFixed(2));
    if (new_total_days <= 0) return sendError(res, 400, "No valid working days");

    const oldTotalDays = Number(leave.total_days);
    const newLeaveYear = getYearFromDate(newStartDate);
    const oldLeaveYear = getYearFromDate(formatIST(leave.start_date, "YYYY-MM-DD"));

    if (leaveConfigChanged) {
      if (oldTotalDays > 0) {
        await adjustEmployeeLeaveBalance({
          conn, company_id, employee_id: employee.id,
          leave_config_id: oldLeaveConfigId, year: oldLeaveYear,
          days: oldTotalDays, mode: "restore", user_id
        });
      }

      if (new_total_days > 0) {
        const [[newBalance]] = await conn.query(
          `SELECT id, remaining FROM employee_leave_balances
           WHERE company_id=? AND employee_id=? AND leave_config_id=? AND year=? AND is_deleted=0 LIMIT 1 FOR UPDATE`,
          [company_id, employee.id, newLeaveConfigId, newLeaveYear]
        );
        if (!newBalance) {
          await conn.rollback();
          return sendError(res, 400, "No leave balance allocated for the new leave type");
        }
        if (Number(newBalance.remaining) < new_total_days) {
          await conn.rollback();
          return sendError(res, 400, `Insufficient balance for ${newConfig.name}. Available: ${Number(newBalance.remaining)}, Requested: ${new_total_days}`);
        }
        await adjustEmployeeLeaveBalance({
          conn, company_id, employee_id: employee.id,
          leave_config_id: newLeaveConfigId, year: newLeaveYear,
          days: new_total_days, mode: "deduct", user_id
        });
      }
    } else {
      const diff = new_total_days - oldTotalDays;

      if (diff !== 0) {
        if (diff > 0) {
          const [[balance]] = await conn.query(
            `SELECT id, remaining FROM employee_leave_balances
             WHERE company_id=? AND employee_id=? AND leave_config_id=? AND year=? AND is_deleted=0 LIMIT 1 FOR UPDATE`,
            [company_id, employee.id, newLeaveConfigId, newLeaveYear]
          );
          if (!balance) {
            await conn.rollback();
            return sendError(res, 400, "No leave balance allocated for this leave type");
          }
          if (Number(balance.remaining) < diff) {
            await conn.rollback();
            return sendError(res, 400, `Insufficient balance. Available: ${Number(balance.remaining)}, Additional days needed: ${diff}`);
          }
          await adjustEmployeeLeaveBalance({
            conn, company_id, employee_id: employee.id,
            leave_config_id: newLeaveConfigId, year: newLeaveYear,
            days: diff, mode: "deduct", user_id
          });
        } else {
          await adjustEmployeeLeaveBalance({
            conn, company_id, employee_id: employee.id,
            leave_config_id: newLeaveConfigId, year: newLeaveYear,
            days: Math.abs(diff), mode: "restore", user_id
          });
        }
      }
    }

    await conn.query(
      `UPDATE employee_leaves SET leave_config_id=?, start_date=?, end_date=?, total_days=?, is_half_day=?, half_day_type=?, reason=?, updated_by=? WHERE id=?`,
      [newLeaveConfigId, newStartDate, newEndDate, new_total_days, halfDay, halfDay ? half_day_type : null, reason?.trim() || null, user_id, leave_id]
    );

    if (deleted_attachments.length) {
      await conn.query(`UPDATE employee_leave_attachments SET is_deleted=1, deleted_at=NOW(), deleted_by=? WHERE id IN (?) AND leave_id=?`, [user_id, deleted_attachments, leave_id]);
    }

    for (const url of attachmentUrls) {
      try {
        const media = await saveMediaFromUrl({
          url,
          folder: "leave",
          optimizeImage: true
        });

        if (!media?.success) continue;

        await conn.query(
          `INSERT INTO employee_leave_attachments
       (leave_id, file_url, file_type, file_size, created_by, updated_by)
       VALUES (?,?,?,?,?,?)`,
          [
            leave_id,
            media.file_url,
            media.mime_type,
            media.size_bytes,
            user_id,
            user_id
          ]
        );
      } catch (err) {
        console.error("[ATTACHMENT_ERROR]", err);
      }
    }

    await conn.commit();

    return sendSuccess(res, 200, "Leave updated successfully");
  } catch (err) {
    if (conn) await conn.rollback().catch(() => { });
    console.error("[PUT /application-update]", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.get("/my-applications", auth(LEAVE.EMP), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const user_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);
    if (!user_id || !company_id) return sendError(res, 400, "Invalid user/company context");

    const [[employee]] = await conn.query(`SELECT id FROM employees WHERE user_id=? AND company_id=? AND is_active=1 AND is_deleted=0 LIMIT 1`, [user_id, company_id]);
    if (!employee) return sendError(res, 404, "Employee not found");
    const employee_id = employee.id;

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const offset = (page - 1) * limit;
    const search = req.query.search?.trim() || "";
    const status = req.query.status?.trim()?.toLowerCase() || null;
    const leave_type = req.query.leave_type?.trim() || null;
    const start_date = req.query.start_date || null;
    const end_date = req.query.end_date || null;

    const validStatuses = ["pending", "approved", "rejected", "cancelled"];
    if (status && !validStatuses.includes(status)) return sendError(res, 400, `Invalid status filter. Allowed: ${validStatuses.join(", ")}`);

    let query = `SELECT el.*, lc.id AS leave_type_id, lc.name AS leave_type_name, lc.code AS leave_type_code, lc.is_paid
                 FROM employee_leaves el INNER JOIN leave_configs lc ON lc.id = el.leave_config_id AND lc.is_deleted = 0
                 WHERE el.employee_id = ? AND el.company_id = ? AND el.is_deleted = 0`;
    const params = [employee_id, company_id];

    if (status) { query += ` AND LOWER(el.status) = ?`; params.push(status); }
    if (leave_type) { query += ` AND (LOWER(lc.name) LIKE ? OR LOWER(lc.code) LIKE ?)`; params.push(`%${leave_type}%`, `%${leave_type}%`); }
    if (start_date) { query += ` AND el.start_date >= ?`; params.push(start_date); }
    if (end_date) { query += ` AND el.end_date <= ?`; params.push(end_date); }
    if (search) {
      const terms = search.toLowerCase().split(" ").filter(Boolean);
      const conditions = terms.map(() => `(LOWER(lc.name) LIKE ? OR LOWER(lc.code) LIKE ? OR LOWER(el.reason) LIKE ? OR LOWER(el.status) LIKE ?)`).join(" AND ");
      query += ` AND (${conditions})`;
      terms.forEach(term => { const v = `%${term}%`; params.push(v, v, v, v); });
    }

    query += ` ORDER BY el.created_at DESC, el.id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await conn.query(query, params);
    const leaveIds = rows.map(r => r.id);
    let attachmentMap = {};
    if (leaveIds.length) {
      const [attachments] = await conn.query(`SELECT id, leave_id, file_url, file_type, file_size FROM employee_leave_attachments WHERE leave_id IN (?) AND is_deleted = 0`, [leaveIds]);
      attachmentMap = attachments.reduce((acc, file) => { (acc[file.leave_id] = acc[file.leave_id] || []).push({ id: file.id, file_url: buildFileUrl(file.file_url), file_type: file.file_type, file_size: file.file_size }); return acc; }, {});
    }

    let countQuery = `SELECT COUNT(*) AS total FROM employee_leaves el INNER JOIN leave_configs lc ON lc.id = el.leave_config_id AND lc.is_deleted = 0 WHERE el.employee_id = ? AND el.company_id = ? AND el.is_deleted = 0`;
    const countParams = [employee_id, company_id];
    if (status) { countQuery += ` AND LOWER(el.status) = ?`; countParams.push(status); }
    if (leave_type) { countQuery += ` AND (LOWER(lc.name) LIKE ? OR LOWER(lc.code) LIKE ?)`; countParams.push(`%${leave_type}%`, `%${leave_type}%`); }
    if (start_date) { countQuery += ` AND el.start_date >= ?`; countParams.push(start_date); }
    if (end_date) { countQuery += ` AND el.end_date <= ?`; countParams.push(end_date); }
    if (search) {
      const terms = search.toLowerCase().split(" ").filter(Boolean);
      const conditions = terms.map(() => `(LOWER(lc.name) LIKE ? OR LOWER(lc.code) LIKE ? OR LOWER(el.reason) LIKE ? OR LOWER(el.status) LIKE ?)`).join(" AND ");
      countQuery += ` AND (${conditions})`;
      terms.forEach(term => { const v = `%${term}%`; countParams.push(v, v, v, v); });
    }

    const [[{ total }]] = await conn.query(countQuery, countParams);
    const [statusCounts] = await conn.query(`SELECT status, COUNT(*) AS total FROM employee_leaves WHERE employee_id = ? AND company_id = ? AND is_deleted = 0 GROUP BY status`, [employee_id, company_id]);
    const counts = { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    statusCounts.forEach(item => { counts[item.status] = Number(item.total); });

    const data = rows.map(row => ({
      ...formatLeaveApplication(row),
      attachments: attachmentMap[row.id] || []
    }));

    return sendSuccess(res, 200, "Leave applications fetched successfully", data, {
      filters: { search, status, leave_type, start_date, end_date },
      counts,
      ...buildMeta(page, limit, total, data.length)
    });
  } catch (err) {
    console.error("[GET /my-applications]", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

export default router;
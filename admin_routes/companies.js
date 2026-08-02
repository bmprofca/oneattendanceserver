import express from "express";
import db from "../config/db.js";
import adminAuth from "../middleware/adminAuthMiddleware.js";
import {
  sendSuccess,
  sendError,
  buildMeta,
} from "../utils/sendResponse.js";

const router = express.Router();

// ─── All admin company routes require admin auth ───────────────
router.use(adminAuth());

// ─── GET /admin/companies — List all companies (paginated) ────

router.get("/", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    let { page = 1, limit = 20, search, is_active } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const conditions = ["c.is_deleted = 0"];
    const params = [];

    if (search && typeof search === "string" && search.trim()) {
      conditions.push(
        "(c.name LIKE ? OR c.legal_name LIKE ? OR u.name LIKE ? OR u.email LIKE ?)"
      );
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    if (is_active !== undefined && is_active !== "") {
      conditions.push("c.is_active = ?");
      params.push(Number(is_active) ? 1 : 0);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const [[{ total }]] = await conn.query(
      `
      SELECT COUNT(*) AS total
      FROM companies c
      LEFT JOIN users u ON u.id = c.owner_user_id
      ${whereClause}
      `,
      params
    );

    const [rows] = await conn.query(
      `
      SELECT
        c.id,
        c.name,
        c.legal_name,
        c.logo_url,
        c.is_active,
        c.owner_user_id,
        u.name AS owner_name,
        u.email AS owner_email,
        u.phone AS owner_phone,
        c.address_line1,
        c.address_line2,
        c.city,
        c.state,
        c.postal_code,
        c.country,
        c.gst_no,
        c.transaction_currency,
        c.created_at,
        c.updated_at
      FROM companies c
      LEFT JOIN users u ON u.id = c.owner_user_id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return sendSuccess(
      res,
      200,
      "Companies fetched successfully",
      rows,
      buildMeta(page, limit, total, rows.length)
    );
  } catch (err) {
    console.error("ADMIN GET COMPANIES ERROR:", err);
    return sendError(res, 500, "Failed to fetch companies");
  } finally {
    if (conn) conn.release();
  }
});

// ─── GET /admin/companies/:id — Company details ───────────────
router.get("/:id", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const companyId = req.params.id;

    const [[company]] = await conn.query(
      `
      SELECT
        c.id,
        c.name,
        c.legal_name,
        c.logo_url,
        c.is_active,
        c.owner_user_id,
        u.name  AS owner_name,
        u.email AS owner_email,
        u.phone AS owner_phone,
        u.profile_picture AS owner_profile_picture,
        c.address_line1,
        c.address_line2,
        c.city,
        c.state,
        c.postal_code,
        c.country,
        c.latitude,
        c.longitude,
        c.gst_no,
        c.transaction_currency,
        c.max_distance,
        c.attendance_methods,
        c.created_at,
        c.updated_at,
        (SELECT COUNT(*) FROM employees e WHERE e.company_id = c.id AND e.is_deleted = 0) AS total_employees,
        (SELECT COUNT(*) FROM employees e WHERE e.company_id = c.id AND e.is_deleted = 0 AND e.is_active = 1) AS active_employees,
        (SELECT COUNT(*) FROM bank_accounts ba WHERE ba.company_id = c.id AND ba.is_deleted = 0) AS total_bank_accounts,
        (SELECT COUNT(*) FROM company_subscriptions cs WHERE cs.company_id = c.id AND cs.is_deleted = 0) AS total_subscriptions
      FROM companies c
      LEFT JOIN users u ON u.id = c.owner_user_id
      WHERE c.id = ? AND c.is_deleted = 0
      `,
      [companyId]
    );

    if (!company) {
      return sendError(res, 404, "Company not found");
    }

    // Get the active subscription separately for clarity
    const [[activeSub]] = await conn.query(
      `
      SELECT
        cs.id,
        cs.subscription_package_id,
        sp.name AS package_name,
        cs.employee_limit,
        cs.subscription_type,
        cs.amount_paid,
        cs.starts_at,
        cs.expires_at,
        cs.payment_status,
        cs.is_active
      FROM company_subscriptions cs
      LEFT JOIN subscription_packages sp ON sp.id = cs.subscription_package_id
      WHERE cs.company_id = ? AND cs.is_deleted = 0 AND cs.is_active = 1
      ORDER BY cs.expires_at DESC
      LIMIT 1
      `,
      [companyId]
    );

    company.active_subscription = activeSub || null;

    return sendSuccess(res, 200, "Company details fetched successfully", company);
  } catch (err) {
    console.error("ADMIN GET COMPANY DETAILS ERROR:", err);
    return sendError(res, 500, "Failed to fetch company details");
  } finally {
    if (conn) conn.release();
  }
});

// ─── GET /admin/companies/:id/employees — Company employees ───
router.get("/:id/employees", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const companyId = req.params.id;

    let { page = 1, limit = 20, search, is_active, status, employment_type } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const conditions = ["e.is_deleted = 0", "e.company_id = ?"];
    const params = [companyId];

    if (search && typeof search === "string" && search.trim()) {
      conditions.push("(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR e.employee_code LIKE ? OR e.designation LIKE ?)");
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s, s);
    }

    if (is_active !== undefined && is_active !== "") {
      conditions.push("e.is_active = ?");
      params.push(Number(is_active) ? 1 : 0);
    }

    if (status && typeof status === "string" && status.trim()) {
      conditions.push("e.status = ?");
      params.push(status.trim());
    }

    if (employment_type && typeof employment_type === "string" && employment_type.trim()) {
      conditions.push("e.employment_type = ?");
      params.push(employment_type.trim());
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM employees e LEFT JOIN users u ON u.id = e.user_id ${whereClause}`,
      params
    );

    const [rows] = await conn.query(
      `
      SELECT
        e.id,
        e.user_id,
        u.name,
        u.email,
        u.phone,
        u.profile_picture,
        e.employee_code,
        e.designation,
        e.salary_type,
        e.employment_type,
        e.joining_date,
        e.status,
        e.is_active,
        e.face_enrolled,
        e.fingerprint_mapped,
        e.shift_start,
        e.shift_end,
        e.expected_work_minutes,
        e.enable_overtime,
        e.enable_deduction,
        e.created_at,
        e.updated_at
      FROM employees e
      LEFT JOIN users u ON u.id = e.user_id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return sendSuccess(res, 200, "Company employees fetched successfully", rows, buildMeta(page, limit, total, rows.length));
  } catch (err) {
    console.error("ADMIN GET COMPANY EMPLOYEES ERROR:", err);
    return sendError(res, 500, "Failed to fetch company employees");
  } finally {
    if (conn) conn.release();
  }
});

// ─── GET /admin/companies/:id/subscriptions — Company subscriptions ─
router.get("/:id/subscriptions", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const companyId = req.params.id;

    let { page = 1, limit = 20, is_active, payment_status } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const conditions = ["cs.is_deleted = 0", "cs.company_id = ?"];
    const params = [companyId];

    if (is_active !== undefined && is_active !== "") {
      conditions.push("cs.is_active = ?");
      params.push(Number(is_active) ? 1 : 0);
    }

    if (payment_status !== undefined && payment_status !== "") {
      conditions.push("cs.payment_status = ?");
      params.push(payment_status);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM company_subscriptions cs ${whereClause}`,
      params
    );

    const [rows] = await conn.query(
      `
      SELECT
        cs.id,
        cs.subscription_package_id,
        sp.name AS package_name,
        sp.min_employee_count,
        sp.max_employee_count,
        cs.employee_limit,
        cs.subscription_type,
        cs.amount_paid,
        cs.starts_at,
        cs.expires_at,
        cs.payment_reference,
        cs.payment_status,
        cs.payment_order_id,
        cs.payment_vpa,
        cs.payment_utr,
        cs.is_active,
        cs.created_at,
        cs.updated_at
      FROM company_subscriptions cs
      LEFT JOIN subscription_packages sp ON sp.id = cs.subscription_package_id
      ${whereClause}
      ORDER BY cs.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return sendSuccess(res, 200, "Company subscriptions fetched successfully", rows, buildMeta(page, limit, total, rows.length));
  } catch (err) {
    console.error("ADMIN GET COMPANY SUBSCRIPTIONS ERROR:", err);
    return sendError(res, 500, "Failed to fetch company subscriptions");
  } finally {
    if (conn) conn.release();
  }
});

// ─── GET /admin/companies/:id/transactions — Company transactions ─
router.get("/:id/transactions", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const companyId = req.params.id;

    let { page = 1, limit = 20, transaction_type, entry_type, date_from, date_to } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const conditions = ["t.is_deleted = 0", "t.company_id = ?"];
    const params = [companyId];

    if (transaction_type && typeof transaction_type === "string" && transaction_type.trim()) {
      conditions.push("t.transaction_type = ?");
      params.push(transaction_type.trim());
    }

    if (entry_type && typeof entry_type === "string" && entry_type.trim()) {
      conditions.push("t.entry_type = ?");
      params.push(entry_type.trim());
    }

    if (date_from && typeof date_from === "string" && date_from.trim()) {
      conditions.push("t.transaction_date >= ?");
      params.push(date_from.trim());
    }

    if (date_to && typeof date_to === "string" && date_to.trim()) {
      conditions.push("t.transaction_date <= ?");
      params.push(date_to.trim());
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM transactions t ${whereClause}`,
      params
    );

    // Also get summary totals
    const [[summary]] = await conn.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN t.entry_type = 'credit' THEN t.amount ELSE 0 END), 0) AS total_credit,
        COALESCE(SUM(CASE WHEN t.entry_type = 'debit'  THEN t.amount ELSE 0 END), 0) AS total_debit
      FROM transactions t
      ${whereClause}
      `,
      params
    );

    const [rows] = await conn.query(
      `
      SELECT
        t.id,
        t.transaction_id,
        t.employee_id,
        u.name AS employee_name,
        t.transaction_date,
        t.transaction_type,
        t.entry_type,
        t.amount,
        t.remark,
        t.create_date,
        t.modify_date
      FROM transactions t
      LEFT JOIN employees e ON e.id = t.employee_id
      LEFT JOIN users u ON u.id = e.user_id
      ${whereClause}
      ORDER BY t.create_date DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return sendSuccess(
      res,
      200,
      "Company transactions fetched successfully",
      { transactions: rows, summary },
      buildMeta(page, limit, total, rows.length)
    );
  } catch (err) {
    console.error("ADMIN GET COMPANY TRANSACTIONS ERROR:", err);
    return sendError(res, 500, "Failed to fetch company transactions");
  } finally {
    if (conn) conn.release();
  }
});

// ─── GET /admin/companies/:id/bank-accounts — Company bank accounts ─
router.get("/:id/bank-accounts", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const companyId = req.params.id;

    let { page = 1, limit = 20, account_type, status } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const conditions = ["ba.is_deleted = 0", "ba.company_id = ?"];
    const params = [companyId];

    if (account_type && typeof account_type === "string" && account_type.trim()) {
      conditions.push("ba.account_type = ?");
      params.push(account_type.trim());
    }

    if (status && typeof status === "string" && status.trim()) {
      conditions.push("ba.status = ?");
      params.push(status.trim());
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM bank_accounts ba ${whereClause}`,
      params
    );

    const [rows] = await conn.query(
      `
      SELECT
        ba.id,
        ba.employee_id,
        u.name AS employee_name,
        ba.account_type,
        ba.bank_name,
        ba.account_holder_name,
        ba.account_number,
        ba.ifsc_code,
        ba.branch_name,
        ba.upi_id,
        ba.is_primary,
        ba.status,
        ba.is_active,
        ba.created_at,
        ba.updated_at
      FROM bank_accounts ba
      LEFT JOIN employees e ON e.id = ba.employee_id
      LEFT JOIN users u ON u.id = e.user_id
      ${whereClause}
      ORDER BY ba.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return sendSuccess(res, 200, "Company bank accounts fetched successfully", rows, buildMeta(page, limit, total, rows.length));
  } catch (err) {
    console.error("ADMIN GET COMPANY BANK ACCOUNTS ERROR:", err);
    return sendError(res, 500, "Failed to fetch company bank accounts");
  } finally {
    if (conn) conn.release();
  }
});

// ─── GET /admin/companies/:id/attendance-overview — Attendance stats ─
router.get("/:id/attendance-overview", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const companyId = req.params.id;

    let { date_from, date_to } = req.query;

    // Default to current month if no dates provided
    if (!date_from || !date_to) {
      const now = new Date();
      date_from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      date_to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }

    // Day-status breakdown from shifts
    const [statusBreakdown] = await conn.query(
      `
      SELECT
        s.day_status,
        COUNT(*) AS count
      FROM shifts s
      WHERE s.company_id = ? AND s.is_deleted = 0
        AND s.shift_date BETWEEN ? AND ?
      GROUP BY s.day_status
      `,
      [companyId, date_from, date_to]
    );

    // Overtime & late summary
    const [[timeSummary]] = await conn.query(
      `
      SELECT
        COUNT(DISTINCT s.employee_id)                             AS unique_employees,
        COUNT(*)                                                  AS total_shifts,
        COALESCE(SUM(s.worked_minutes), 0)                        AS total_worked_minutes,
        COALESCE(SUM(s.overtime_minutes), 0)                      AS total_overtime_minutes,
        COALESCE(SUM(s.late_minutes), 0)                          AS total_late_minutes,
        COALESCE(SUM(s.deductible_minutes), 0)                    AS total_deductible_minutes,
        COALESCE(SUM(s.early_leave_minutes), 0)                   AS total_early_leave_minutes
      FROM shifts s
      WHERE s.company_id = ? AND s.is_deleted = 0
        AND s.shift_date BETWEEN ? AND ?
      `,
      [companyId, date_from, date_to]
    );

    // Leave count in period
    const [[leaveSummary]] = await conn.query(
      `
      SELECT
        COUNT(*) AS total_leaves,
        COUNT(DISTINCT el.employee_id) AS employees_on_leave
      FROM employee_leaves el
      JOIN employees e ON e.id = el.employee_id
      WHERE e.company_id = ? AND el.is_deleted = 0
        AND el.start_date <= ? AND el.end_date >= ?
      `,
      [companyId, date_to, date_from]
    );

    return sendSuccess(res, 200, "Attendance overview fetched successfully", {
      period: { from: date_from, to: date_to },
      status_breakdown: statusBreakdown,
      time_summary: timeSummary,
      leave_summary: leaveSummary,
    });
  } catch (err) {
    console.error("ADMIN GET COMPANY ATTENDANCE OVERVIEW ERROR:", err);
    return sendError(res, 500, "Failed to fetch attendance overview");
  } finally {
    if (conn) conn.release();
  }
});

export default router;

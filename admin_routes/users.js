import express from "express";
import db from "../config/db.js";
import adminAuth from "../middleware/adminAuthMiddleware.js";
import { hashPassword } from "../utils/auth.js";
import {
  sendSuccess,
  sendError,
  buildMeta,
} from "../utils/sendResponse.js";

const router = express.Router();

// ─── All admin user routes require admin auth ──────────────────
router.use(adminAuth());

// ─── GET /admin/users — List all users (paginated) ────────────

router.get("/", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    let { page = 1, limit = 20, search, is_active } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const conditions = ["u.is_deleted = 0", "u.is_system_admin = 0"];
    const params = [];

    if (search && typeof search === "string" && search.trim()) {
      conditions.push("(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)");
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }

    if (is_active !== undefined && is_active !== "") {
      conditions.push("u.is_active = ?");
      params.push(Number(is_active) ? 1 : 0);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM users u ${whereClause}`,
      params
    );

    const [rows] = await conn.query(
      `
      SELECT
        u.id,
        u.email,
        u.phone,
        u.name,
        u.profile_picture,
        u.profession,
        u.whatsapp,
        u.is_active,
        u.is_system_admin,
        u.last_login,
        u.created_at,
        u.updated_at
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return sendSuccess(res, 200, "Users fetched successfully", rows, buildMeta(page, limit, total, rows.length));
  } catch (err) {
    console.error("ADMIN GET USERS ERROR:", err);
    return sendError(res, 500, "Failed to fetch users");
  } finally {
    if (conn) conn.release();
  }
});

// ─── GET /admin/users/:id — Single user details ───────────────
router.get("/:id", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const userId = req.params.id;

    const [[user]] = await conn.query(
      `
      SELECT
        u.id,
        u.email,
        u.phone,
        u.name,
        u.profile_picture,
        u.profession,
        u.whatsapp,
        u.is_active,
        u.is_system_admin,
        u.last_login,
        u.created_at,
        u.updated_at,
        (SELECT COUNT(*) FROM companies c WHERE c.owner_user_id = u.id AND c.is_deleted = 0) AS owned_companies_count,
        (SELECT COUNT(*) FROM employees e WHERE e.user_id = u.id AND e.is_deleted = 0) AS employee_memberships_count
      FROM users u
      WHERE u.id = ? AND u.is_deleted = 0 AND u.is_system_admin = 0
      `,
      [userId]
    );

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    return sendSuccess(res, 200, "User details fetched successfully", user);
  } catch (err) {
    console.error("ADMIN GET USER DETAILS ERROR:", err);
    return sendError(res, 500, "Failed to fetch user details");
  } finally {
    if (conn) conn.release();
  }
});

// ─── GET /admin/users/:id/companies — User's companies ────────
router.get("/:id/companies", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const userId = req.params.id;

    let { page = 1, limit = 20, search, is_active } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    // Companies the user owns OR is an employee of
    const conditions = ["c.is_deleted = 0", "(c.owner_user_id = ? OR e.user_id = ?)"];
    const params = [userId, userId];

    if (search && typeof search === "string" && search.trim()) {
      conditions.push("(c.name LIKE ? OR c.legal_name LIKE ?)");
      const s = `%${search.trim()}%`;
      params.push(s, s);
    }

    if (is_active !== undefined && is_active !== "") {
      conditions.push("c.is_active = ?");
      params.push(Number(is_active) ? 1 : 0);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const [[{ total }]] = await conn.query(
      `
      SELECT COUNT(DISTINCT c.id) AS total
      FROM companies c
      LEFT JOIN employees e ON e.company_id = c.id AND e.is_deleted = 0
      ${whereClause}
      `,
      params
    );

    const [rows] = await conn.query(
      `
      SELECT DISTINCT
        c.id,
        c.name,
        c.legal_name,
        c.logo_url,
        c.is_active,
        c.owner_user_id,
        CASE WHEN c.owner_user_id = ? THEN 1 ELSE 0 END AS is_owner,
        c.city,
        c.state,
        c.country,
        c.gst_no,
        c.created_at,
        c.updated_at,
        (SELECT COUNT(*) FROM employees emp WHERE emp.company_id = c.id AND emp.is_deleted = 0) AS employee_count
      FROM companies c
      LEFT JOIN employees e ON e.company_id = c.id AND e.is_deleted = 0
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [userId, ...params, limit, offset]
    );

    return sendSuccess(res, 200, "User companies fetched successfully", rows, buildMeta(page, limit, total, rows.length));
  } catch (err) {
    console.error("ADMIN GET USER COMPANIES ERROR:", err);
    return sendError(res, 500, "Failed to fetch user companies");
  } finally {
    if (conn) conn.release();
  }
});

// ─── GET /admin/users/:id/payments — User's payment transactions ─
router.get("/:id/payments", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const userId = req.params.id;

    let { page = 1, limit = 20, transaction_type, entry_type } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    // Get all employee IDs for this user
    const [empRows] = await conn.query(
      `SELECT id FROM employees WHERE user_id = ? AND is_deleted = 0`,
      [userId]
    );
    const empIds = empRows.map((e) => e.id);

    if (empIds.length === 0) {
      return sendSuccess(res, 200, "No payments found", [], buildMeta(page, limit, 0, 0));
    }

    const conditions = ["t.is_deleted = 0", `t.employee_id IN (?)`];
    const params = [empIds];

    if (transaction_type && typeof transaction_type === "string" && transaction_type.trim()) {
      conditions.push("t.transaction_type = ?");
      params.push(transaction_type.trim());
    }

    if (entry_type && typeof entry_type === "string" && entry_type.trim()) {
      conditions.push("t.entry_type = ?");
      params.push(entry_type.trim());
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM transactions t ${whereClause}`,
      params
    );

    const [rows] = await conn.query(
      `
      SELECT
        t.id,
        t.transaction_id,
        t.company_id,
        c.name AS company_name,
        t.employee_id,
        t.transaction_date,
        t.transaction_type,
        t.entry_type,
        t.amount,
        t.remark,
        t.create_date,
        t.modify_date
      FROM transactions t
      LEFT JOIN companies c ON c.id = t.company_id
      ${whereClause}
      ORDER BY t.create_date DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return sendSuccess(res, 200, "User payments fetched successfully", rows, buildMeta(page, limit, total, rows.length));
  } catch (err) {
    console.error("ADMIN GET USER PAYMENTS ERROR:", err);
    return sendError(res, 500, "Failed to fetch user payments");
  } finally {
    if (conn) conn.release();
  }
});

// ─── GET /admin/users/:id/subscriptions — User's subscription packages ─
router.get("/:id/subscriptions", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const userId = req.params.id;

    let { page = 1, limit = 20, is_active } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    // Get companies owned by this user
    const [compRows] = await conn.query(
      `SELECT id FROM companies WHERE owner_user_id = ? AND is_deleted = 0`,
      [userId]
    );
    const compIds = compRows.map((c) => c.id);

    if (compIds.length === 0) {
      return sendSuccess(res, 200, "No subscriptions found", [], buildMeta(page, limit, 0, 0));
    }

    const conditions = ["cs.is_deleted = 0", "cs.company_id IN (?)"];
    const params = [compIds];

    if (is_active !== undefined && is_active !== "") {
      conditions.push("cs.is_active = ?");
      params.push(Number(is_active) ? 1 : 0);
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
        cs.company_id,
        c.name AS company_name,
        cs.package_id,
        cs.package_type,
        COALESCE(sp.name, csp.name) AS package_name,
        cs.employee_limit,
        cs.subscription_type,
        cs.amount_paid,
        cs.starts_at,
        cs.expires_at,
        cs.payment_reference,
        cs.payment_status,
        cs.payment_order_id,
        cs.is_active,
        cs.created_at,
        cs.updated_at
      FROM company_subscriptions cs
      LEFT JOIN companies c ON c.id = cs.company_id
      LEFT JOIN subscription_packages sp ON cs.package_type = 'normal' AND sp.id = cs.package_id
      LEFT JOIN custom_subscription_packages csp ON cs.package_type = 'custom' AND csp.id = cs.package_id
      ${whereClause}
      ORDER BY cs.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return sendSuccess(res, 200, "User subscriptions fetched successfully", rows, buildMeta(page, limit, total, rows.length));
  } catch (err) {
    console.error("ADMIN GET USER SUBSCRIPTIONS ERROR:", err);
    return sendError(res, 500, "Failed to fetch user subscriptions");
  } finally {
    if (conn) conn.release();
  }
});

// ─── GET /admin/users/:id/bank-accounts — User's bank accounts ─
router.get("/:id/bank-accounts", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const userId = req.params.id;

    let { page = 1, limit = 20, account_type, status } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    // Get all employee IDs for this user
    const [empRows] = await conn.query(
      `SELECT id, company_id FROM employees WHERE user_id = ? AND is_deleted = 0`,
      [userId]
    );
    const empIds = empRows.map((e) => e.id);

    if (empIds.length === 0) {
      return sendSuccess(res, 200, "No bank accounts found", [], buildMeta(page, limit, 0, 0));
    }

    const conditions = ["ba.is_deleted = 0", "ba.employee_id IN (?)"];
    const params = [empIds];

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
        ba.company_id,
        c.name AS company_name,
        ba.employee_id,
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
      LEFT JOIN companies c ON c.id = ba.company_id
      ${whereClause}
      ORDER BY ba.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return sendSuccess(res, 200, "User bank accounts fetched successfully", rows, buildMeta(page, limit, total, rows.length));
  } catch (err) {
    console.error("ADMIN GET USER BANK ACCOUNTS ERROR:", err);
    return sendError(res, 500, "Failed to fetch user bank accounts");
  } finally {
    if (conn) conn.release();
  }
});

export default router;

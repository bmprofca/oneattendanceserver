import express from "express";
import axios from "axios";
import db from "../config/db.js";
import adminAuth from "../middleware/adminAuthMiddleware.js";
import {
  sendSuccess,
  sendError,
  buildMeta,
} from "../utils/sendResponse.js";
import {
  ONECHATTING_TEMPLATE_TOKEN,
  TEMPLATE_LIST_URL,
} from "../config/config.js";

const router = express.Router();

router.use(adminAuth());

const normalizePaymentStatus = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  const normalized = String(value).trim().toLowerCase();

  const mapping = {
    pending: "0",
    success: "1",
    fail: "2",
    failed: "2",
    cancel: "3",
    cancelled: "3",
  };

  return mapping[normalized] ?? normalized;
};

const formatPaymentStatus = (value) => {
  switch (String(value)) {
    case "0":
      return "pending";
    case "1":
      return "success";
    case "2":
      return "fail";
    case "3":
      return "cancel";
    default:
      return value;
  }
};

const normalizeDateValue = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 19).replace("T", " ");
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const isoCandidate = trimmed.replace("Z", "");
    return isoCandidate;
  }

  return value;
};

const formatSubscription = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    company_id: row.company_id,
    company_name: row.company_name,
    company_legal_name: row.company_legal_name,
    owner_user_id: row.owner_user_id,
    owner_name: row.owner_name,
    owner_email: row.owner_email,
    package_id: row.package_id,
    package_type: row.package_type,
    package_name: row.package_name,
    min_employee_count: row.min_employee_count,
    max_employee_count: row.max_employee_count,
    employee_limit: row.employee_limit,
    subscription_type: row.subscription_type,
    amount_paid: Number(row.amount_paid || 0),
    starts_at: row.starts_at,
    expires_at: row.expires_at,
    payment_reference: row.payment_reference,
    payment_status: formatPaymentStatus(row.payment_status),
    payment_order_id: row.payment_order_id,
    payment_vpa: row.payment_vpa,
    payment_utr: row.payment_utr,
    is_active: row.is_active == 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_deleted: row.is_deleted == 1,
    deleted_at: row.deleted_at,
    deleted_by: row.deleted_by,
  };
};

const getSubscriptionBaseQuery = () => `
  SELECT
    cs.id,
    cs.company_id,
    c.name AS company_name,
    c.legal_name AS company_legal_name,
    c.owner_user_id,
    u.name AS owner_name,
    u.email AS owner_email,
    cs.package_id,
    cs.package_type,
    COALESCE(sp.name, csp.name) AS package_name,
    COALESCE(sp.min_employee_count, csp.min_employee_count) AS min_employee_count,
    COALESCE(sp.max_employee_count, csp.max_employee_count) AS max_employee_count,
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
    cs.updated_at,
    cs.is_deleted,
    cs.deleted_at,
    cs.deleted_by
  FROM company_subscriptions cs
  LEFT JOIN companies c ON c.id = cs.company_id
  LEFT JOIN users u ON u.id = c.owner_user_id
  LEFT JOIN subscription_packages sp ON cs.package_type = 'normal' AND sp.id = cs.package_id
  LEFT JOIN custom_subscription_packages csp ON cs.package_type = 'custom' AND csp.id = cs.package_id
`;

router.get("/", async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    let { page = 1, limit = 20, company_id, is_active, payment_status, search } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const conditions = ["cs.is_deleted = 0"];
    const params = [];

    if (company_id !== undefined && company_id !== "") {
      conditions.push("cs.company_id = ?");
      params.push(Number(company_id));
    }

    if (is_active !== undefined && is_active !== "") {
      conditions.push("cs.is_active = ?");
      params.push(Number(is_active) ? 1 : 0);
    }

    if (payment_status !== undefined && payment_status !== "") {
      const normalizedStatus = normalizePaymentStatus(payment_status);
      if (normalizedStatus !== null) {
        conditions.push("cs.payment_status = ?");
        params.push(normalizedStatus);
      }
    }

    if (search && typeof search === "string" && search.trim()) {
      conditions.push("(c.name LIKE ? OR c.legal_name LIKE ? OR sp.name LIKE ? OR csp.name LIKE ? OR u.name LIKE ? OR u.email LIKE ?)");
      const searchTerm = `%${search.trim()}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [[{ total }]] = await conn.query(
      `
      SELECT COUNT(*) AS total
      FROM company_subscriptions cs
      LEFT JOIN companies c ON c.id = cs.company_id
      LEFT JOIN users u ON u.id = c.owner_user_id
      LEFT JOIN subscription_packages sp ON cs.package_type = 'normal' AND sp.id = cs.package_id
      LEFT JOIN custom_subscription_packages csp ON cs.package_type = 'custom' AND csp.id = cs.package_id
      ${whereClause}
      `,
      params
    );

    const [rows] = await conn.query(
      `
      ${getSubscriptionBaseQuery()}
      ${whereClause}
      ORDER BY cs.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    const subscriptions = rows.map(formatSubscription);

    return sendSuccess(
      res,
      200,
      "Subscriptions fetched successfully",
      subscriptions,
      buildMeta(page, limit, total, subscriptions.length)
    );
  } catch (err) {
    console.error("ADMIN GET SUBSCRIPTIONS ERROR:", err);
    return sendError(res, 500, "Failed to fetch subscriptions");
  } finally {
    if (conn) conn.release();
  }
});

router.post("/", async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const {
      company_id,
      package_id,
      package_type = "normal",
      employee_limit,
      subscription_type,
      amount_paid,
      starts_at,
      expires_at,
      payment_reference,
      payment_status,
      payment_order_id,
      payment_vpa,
      payment_utr,
      is_active,
    } = req.body || {};

    if (!company_id || !package_id || !package_type || !subscription_type || amount_paid === undefined || !starts_at || !expires_at) {
      return sendError(res, 400, "Missing required fields");
    }

    if (!['normal', 'custom'].includes(package_type)) {
      return sendError(res, 400, "package_type must be 'normal' or 'custom'");
    }

    const [[company]] = await conn.query("SELECT id FROM companies WHERE id = ? AND is_deleted = 0", [company_id]);
    if (!company) {
      return sendError(res, 404, "Company not found");
    }

    let pkgMaxEmployees = null;
    if (package_type === 'normal') {
      const [[subPackage]] = await conn.query("SELECT id, max_employee_count FROM subscription_packages WHERE id = ? AND is_deleted = 0", [package_id]);
      if (!subPackage) return sendError(res, 404, "Subscription package not found");
      pkgMaxEmployees = subPackage.max_employee_count;
    } else {
      const [[customPkg]] = await conn.query("SELECT id, max_employee_count FROM custom_subscription_packages WHERE id = ? AND is_deleted = 0", [package_id]);
      if (!customPkg) return sendError(res, 404, "Custom subscription package not found");
      pkgMaxEmployees = customPkg.max_employee_count;
    }

    const normalizedStartsAt = normalizeDateValue(starts_at);
    const normalizedExpiresAt = normalizeDateValue(expires_at);
    const normalizedPaymentStatus = payment_status !== undefined ? normalizePaymentStatus(payment_status) : "1";
    const limitToUse = employee_limit || pkgMaxEmployees;
    const activeFlag = is_active !== undefined ? (Number(is_active) ? 1 : 0) : 1;

    if (normalizedStartsAt === null) return sendError(res, 400, "starts_at is invalid");
    if (normalizedExpiresAt === null) return sendError(res, 400, "expires_at is invalid");
    if (normalizedPaymentStatus === null) return sendError(res, 400, "payment_status is invalid");

    const [result] = await conn.query(
      `INSERT INTO company_subscriptions (
        company_id, package_id, package_type, employee_limit, subscription_type,
        amount_paid, starts_at, expires_at, payment_reference, payment_status,
        payment_order_id, payment_vpa, payment_utr, is_active, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id, package_id, package_type, limitToUse, subscription_type,
        amount_paid, normalizedStartsAt, normalizedExpiresAt, payment_reference || null, normalizedPaymentStatus,
        payment_order_id || null, payment_vpa || null, payment_utr || null, activeFlag, req.admin.id || null
      ]
    );

    return sendSuccess(res, 201, "Subscription created successfully", { id: result.insertId });
  } catch (err) {
    console.error("ADMIN CREATE SUBSCRIPTION ERROR:", err);
    return sendError(res, 500, "Failed to create subscription");
  } finally {
    if (conn) conn.release();
  }
});

router.get("/:id", async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const subscriptionId = parseInt(req.params.id);
    if (!subscriptionId || subscriptionId <= 0) {
      return sendError(res, 400, "Valid subscription ID is required");
    }

    const [rows] = await conn.query(
      `
      ${getSubscriptionBaseQuery()}
      WHERE cs.id = ? AND cs.is_deleted = 0
      LIMIT 1
      `,
      [subscriptionId]
    );

    const subscription = rows[0] ? formatSubscription(rows[0]) : null;
    if (!subscription) {
      return sendError(res, 404, "Subscription not found");
    }

    return sendSuccess(res, 200, "Subscription fetched successfully", subscription);
  } catch (err) {
    console.error("ADMIN GET SUBSCRIPTION ERROR:", err);
    return sendError(res, 500, "Failed to fetch subscription");
  } finally {
    if (conn) conn.release();
  }
});

router.patch("/:id/status", async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const subscriptionId = parseInt(req.params.id);
    if (!subscriptionId || subscriptionId <= 0) {
      return sendError(res, 400, "Valid subscription ID is required");
    }

    const { is_active, payment_status, status, starts_at, expires_at } = req.body || {};
    const updateFields = [];
    const values = [];

    if (status !== undefined) {
      if (typeof status === "string") {
        const normalizedStatus = status.trim().toLowerCase();
        if (normalizedStatus === "active") {
          updateFields.push("cs.is_active = ?");
          values.push(1);
        } else if (normalizedStatus === "inactive") {
          updateFields.push("cs.is_active = ?");
          values.push(0);
        } else {
          return sendError(res, 400, "status must be either active or inactive");
        }
      } else {
        return sendError(res, 400, "status must be either active or inactive");
      }
    }

    if (is_active !== undefined) {
      updateFields.push("cs.is_active = ?");
      values.push(Number(is_active) ? 1 : 0);
    }

    if (payment_status !== undefined) {
      const normalizedPaymentStatus = normalizePaymentStatus(payment_status);
      if (normalizedPaymentStatus === null) {
        return sendError(res, 400, "payment_status is invalid");
      }

      updateFields.push("cs.payment_status = ?");
      values.push(normalizedPaymentStatus);
    }

    if (starts_at !== undefined) {
      const normalizedStartsAt = normalizeDateValue(starts_at);
      if (normalizedStartsAt === null) {
        return sendError(res, 400, "starts_at is invalid");
      }

      updateFields.push("cs.starts_at = ?");
      values.push(normalizedStartsAt);
    }

    if (expires_at !== undefined) {
      const normalizedExpiresAt = normalizeDateValue(expires_at);
      if (normalizedExpiresAt === null) {
        return sendError(res, 400, "expires_at is invalid");
      }

      updateFields.push("cs.expires_at = ?");
      values.push(normalizedExpiresAt);
    }

    if (updateFields.length === 0) {
      return sendError(res, 400, "No subscription fields provided");
    }

    updateFields.push("cs.updated_by = ?", "cs.updated_at = NOW()");
    values.push(req.admin.id || null);

    const [result] = await conn.query(
      `
      UPDATE company_subscriptions cs
      SET ${updateFields.join(", ")}
      WHERE cs.id = ? AND cs.is_deleted = 0
      `,
      [...values, subscriptionId]
    );

    if (!result.affectedRows) {
      return sendError(res, 404, "Subscription not found");
    }

    const [rows] = await conn.query(
      `
      ${getSubscriptionBaseQuery()}
      WHERE cs.id = ? AND cs.is_deleted = 0
      LIMIT 1
      `,
      [subscriptionId]
    );

    return sendSuccess(
      res,
      200,
      "Subscription updated successfully",
      rows[0] ? formatSubscription(rows[0]) : null
    );
  } catch (err) {
    console.error("ADMIN UPDATE SUBSCRIPTION STATUS ERROR:", err);
    return sendError(res, 500, "Failed to update subscription status");
  } finally {
    if (conn) conn.release();
  }
});

router.put("/:id", async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const subscriptionId = parseInt(req.params.id);
    if (!subscriptionId || subscriptionId <= 0) {
      return sendError(res, 400, "Valid subscription ID is required");
    }

    const {
      company_id,
      package_id,
      package_type,
      employee_limit,
      subscription_type,
      amount_paid,
      starts_at,
      expires_at,
      payment_reference,
      payment_status,
      payment_order_id,
      payment_vpa,
      payment_utr,
      is_active,
    } = req.body || {};

    const updateFields = [];
    const values = [];

    if (company_id !== undefined) {
      const [[company]] = await conn.query("SELECT id FROM companies WHERE id = ? AND is_deleted = 0", [company_id]);
      if (!company) return sendError(res, 404, "Company not found");
      updateFields.push("cs.company_id = ?");
      values.push(company_id);
    }

    if (package_type !== undefined) {
      if (!['normal', 'custom'].includes(package_type)) {
        return sendError(res, 400, "package_type must be 'normal' or 'custom'");
      }
      updateFields.push("cs.package_type = ?");
      values.push(package_type);
    }

    if (package_id !== undefined) {
      updateFields.push("cs.package_id = ?");
      values.push(package_id);
    }

    if (employee_limit !== undefined) {
      updateFields.push("cs.employee_limit = ?");
      values.push(employee_limit);
    }

    if (subscription_type !== undefined) {
      updateFields.push("cs.subscription_type = ?");
      values.push(subscription_type);
    }

    if (amount_paid !== undefined) {
      updateFields.push("cs.amount_paid = ?");
      values.push(amount_paid);
    }

    if (starts_at !== undefined) {
      const normalizedStartsAt = normalizeDateValue(starts_at);
      if (normalizedStartsAt === null) return sendError(res, 400, "starts_at is invalid");
      updateFields.push("cs.starts_at = ?");
      values.push(normalizedStartsAt);
    }

    if (expires_at !== undefined) {
      const normalizedExpiresAt = normalizeDateValue(expires_at);
      if (normalizedExpiresAt === null) return sendError(res, 400, "expires_at is invalid");
      updateFields.push("cs.expires_at = ?");
      values.push(normalizedExpiresAt);
    }

    if (payment_reference !== undefined) {
      updateFields.push("cs.payment_reference = ?");
      values.push(payment_reference);
    }

    if (payment_status !== undefined) {
      const normalizedPaymentStatus = normalizePaymentStatus(payment_status);
      if (normalizedPaymentStatus === null) return sendError(res, 400, "payment_status is invalid");
      updateFields.push("cs.payment_status = ?");
      values.push(normalizedPaymentStatus);
    }

    if (payment_order_id !== undefined) {
      updateFields.push("cs.payment_order_id = ?");
      values.push(payment_order_id);
    }

    if (payment_vpa !== undefined) {
      updateFields.push("cs.payment_vpa = ?");
      values.push(payment_vpa);
    }

    if (payment_utr !== undefined) {
      updateFields.push("cs.payment_utr = ?");
      values.push(payment_utr);
    }

    if (is_active !== undefined) {
      updateFields.push("cs.is_active = ?");
      values.push(Number(is_active) ? 1 : 0);
    }

    if (updateFields.length === 0) {
      return sendError(res, 400, "No fields to update");
    }

    updateFields.push("cs.updated_by = ?", "cs.updated_at = NOW()");
    values.push(req.admin.id || null);

    const [result] = await conn.query(
      `
      UPDATE company_subscriptions cs
      SET ${updateFields.join(", ")}
      WHERE cs.id = ? AND cs.is_deleted = 0
      `,
      [...values, subscriptionId]
    );

    if (!result.affectedRows) {
      return sendError(res, 404, "Subscription not found");
    }

    const [rows] = await conn.query(
      `
      ${getSubscriptionBaseQuery()}
      WHERE cs.id = ? AND cs.is_deleted = 0
      LIMIT 1
      `,
      [subscriptionId]
    );

    return sendSuccess(
      res,
      200,
      "Subscription updated successfully",
      rows[0] ? formatSubscription(rows[0]) : null
    );
  } catch (err) {
    console.error("ADMIN UPDATE SUBSCRIPTION ERROR:", err);
    return sendError(res, 500, "Failed to update subscription");
  } finally {
    if (conn) conn.release();
  }
});

/**
 * GET /whatsapp-templates
 * Fetches all available WhatsApp templates from OneChatting and returns them
 * with parsed variable info so admin can choose which template to use.
 */
router.get("/whatsapp-templates", async (_req, res) => {
  try {
    const token = String(ONECHATTING_TEMPLATE_TOKEN ?? "").trim();
    if (!token) {
      return sendError(res, 500, "OneChatting template token is not configured");
    }

    const response = await axios.get(TEMPLATE_LIST_URL, {
      headers: { token },
    });

    // Support both response shapes: { data: { data: [...] } } or { data: [...] }
    const rawTemplates = Array.isArray(response.data?.data)
      ? response.data.data
      : Array.isArray(response.data)
      ? response.data
      : [];

    const templates = rawTemplates.map((t) => {
      const bodyComp = t.template?.components?.find((c) => c.type === "BODY");
      const bodyText = bodyComp?.text ?? "";
      const variablePlaceholders = bodyText.match(/\{\{\d+\}\}/g) ?? [];

      return {
        template_name: t.template_name ?? t.name ?? "",
        template_id: t.template_id ?? "",
        waba_template_id: t.waba_template_id ?? "",
        status: t.status ?? "",
        category: t.category ?? "",
        language_code: t.language_code ?? "en",
        body_text: bodyText,
        variable_count: variablePlaceholders.length,
        variables: variablePlaceholders,
        components: t.template?.components ?? [],
      };
    });

    return sendSuccess(res, 200, "WhatsApp templates fetched successfully", templates);
  } catch (err) {
    console.error("ADMIN GET WA TEMPLATES ERROR:", err?.response?.status, err?.response?.data ?? err.message);
    return sendError(res, 502, "Failed to fetch WhatsApp templates from OneChatting");
  }
});

/**
 * GET /alert-config
 * Returns the current subscription WhatsApp alert configuration.
 */
router.get("/alert-config", async (_req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const [rows] = await conn.query(
      `SELECT * FROM subscription_alert_config ORDER BY id ASC LIMIT 1`
    );

    if (!rows[0]) {
      return sendError(res, 404, "Alert config not found — please run the DB migration");
    }

    const cfg = rows[0];
    return sendSuccess(res, 200, "Alert config fetched successfully", {
      id: cfg.id,
      alert_days_before: cfg.alert_days_before,
      alert_template_name: cfg.alert_template_name,
      alert_template_vars: cfg.alert_template_vars ?? [],
      renewal_template_name: cfg.renewal_template_name,
      renewal_template_vars: cfg.renewal_template_vars ?? [],
      is_renewal_enabled: cfg.is_renewal_enabled == 1,
      is_alert_enabled: cfg.is_alert_enabled == 1,
      updated_by: cfg.updated_by,
      updated_at: cfg.updated_at,
      created_at: cfg.created_at,
    });
  } catch (err) {
    console.error("ADMIN GET ALERT CONFIG ERROR:", err);
    return sendError(res, 500, "Failed to fetch alert config");
  } finally {
    if (conn) conn.release();
  }
});

/**
 * PUT /alert-config
 * Admin updates the subscription WhatsApp alert configuration.
 *
 * Body fields (all optional — only provided fields are updated):
 *   alert_days_before      {number}   Days before expiry alerts start (1–90)
 *   alert_template_name    {string}   OneChatting template name for pre-expiry
 *   alert_template_vars    {string[]} Ordered list of variable source keys
 *   renewal_template_name  {string}   Template name for post-expiry renewal notice
 *   renewal_template_vars  {string[]} Variable source keys for renewal template
 *   is_renewal_enabled     {boolean}  Whether to send renewal notices
 *   is_alert_enabled       {boolean}  Master switch for the cron
 *
 * Supported variable source keys:
 *   company_name | package_name | owner_name | subscription_type |
 *   days_remaining | expiry_date
 */
const SUPPORTED_VAR_KEYS = new Set([
  "company_name",
  "package_name",
  "owner_name",
  "subscription_type",
  "days_remaining",
  "expiry_date",
]);

router.put("/alert-config", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const {
      alert_days_before,
      alert_template_name,
      alert_template_vars,
      renewal_template_name,
      renewal_template_vars,
      is_renewal_enabled,
      is_alert_enabled,
    } = req.body || {};

    const updateFields = [];
    const values = [];

    if (alert_days_before !== undefined) {
      const days = parseInt(alert_days_before);
      if (isNaN(days) || days < 1 || days > 90) {
        return sendError(res, 400, "alert_days_before must be a number between 1 and 90");
      }
      updateFields.push("alert_days_before = ?");
      values.push(days);
    }

    if (alert_template_name !== undefined) {
      updateFields.push("alert_template_name = ?");
      values.push(alert_template_name || null);
    }

    if (alert_template_vars !== undefined) {
      if (!Array.isArray(alert_template_vars)) {
        return sendError(res, 400, "alert_template_vars must be an array of strings");
      }
      const invalid = alert_template_vars.filter((k) => !SUPPORTED_VAR_KEYS.has(k));
      if (invalid.length > 0) {
        return sendError(
          res,
          400,
          `Unsupported variable key(s): ${invalid.join(", ")}. Allowed: ${[...SUPPORTED_VAR_KEYS].join(", ")}`
        );
      }
      updateFields.push("alert_template_vars = ?");
      values.push(JSON.stringify(alert_template_vars));
    }

    if (renewal_template_name !== undefined) {
      updateFields.push("renewal_template_name = ?");
      values.push(renewal_template_name || null);
    }

    if (renewal_template_vars !== undefined) {
      if (!Array.isArray(renewal_template_vars)) {
        return sendError(res, 400, "renewal_template_vars must be an array of strings");
      }
      const invalid = renewal_template_vars.filter((k) => !SUPPORTED_VAR_KEYS.has(k));
      if (invalid.length > 0) {
        return sendError(
          res,
          400,
          `Unsupported variable key(s): ${invalid.join(", ")}. Allowed: ${[...SUPPORTED_VAR_KEYS].join(", ")}`
        );
      }
      updateFields.push("renewal_template_vars = ?");
      values.push(JSON.stringify(renewal_template_vars));
    }

    if (is_renewal_enabled !== undefined) {
      updateFields.push("is_renewal_enabled = ?");
      values.push(Number(is_renewal_enabled) ? 1 : 0);
    }

    if (is_alert_enabled !== undefined) {
      updateFields.push("is_alert_enabled = ?");
      values.push(Number(is_alert_enabled) ? 1 : 0);
    }

    if (updateFields.length === 0) {
      return sendError(res, 400, "No fields provided to update");
    }

    updateFields.push("updated_by = ?", "updated_at = NOW()");
    values.push(req.admin.id || null);

    // Upsert: update the first row (or insert if table is somehow empty)
    const [[existing]] = await conn.query(
      `SELECT id FROM subscription_alert_config ORDER BY id ASC LIMIT 1`
    );

    if (existing) {
      await conn.query(
        `UPDATE subscription_alert_config SET ${updateFields.join(", ")} WHERE id = ?`,
        [...values, existing.id]
      );
    } else {
      // No config row yet — create one with defaults merged with provided fields
      await conn.query(
        `INSERT INTO subscription_alert_config
          (alert_days_before, alert_template_name, alert_template_vars,
           renewal_template_name, renewal_template_vars, is_renewal_enabled, is_alert_enabled,
           updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          alert_days_before ?? 5,
          alert_template_name ?? null,
          JSON.stringify(alert_template_vars ?? []),
          renewal_template_name ?? null,
          JSON.stringify(renewal_template_vars ?? []),
          is_renewal_enabled != null ? (Number(is_renewal_enabled) ? 1 : 0) : 0,
          is_alert_enabled != null ? (Number(is_alert_enabled) ? 1 : 0) : 1,
          req.admin.id || null,
        ]
      );
    }

    // Return updated config
    const [rows] = await conn.query(
      `SELECT * FROM subscription_alert_config ORDER BY id ASC LIMIT 1`
    );
    const cfg = rows[0];

    return sendSuccess(res, 200, "Alert config updated successfully", {
      id: cfg.id,
      alert_days_before: cfg.alert_days_before,
      alert_template_name: cfg.alert_template_name,
      alert_template_vars: cfg.alert_template_vars ?? [],
      renewal_template_name: cfg.renewal_template_name,
      renewal_template_vars: cfg.renewal_template_vars ?? [],
      is_renewal_enabled: cfg.is_renewal_enabled == 1,
      is_alert_enabled: cfg.is_alert_enabled == 1,
      updated_by: cfg.updated_by,
      updated_at: cfg.updated_at,
      created_at: cfg.created_at,
    });
  } catch (err) {
    console.error("ADMIN UPDATE ALERT CONFIG ERROR:", err);
    return sendError(res, 500, "Failed to update alert config");
  } finally {
    if (conn) conn.release();
  }
});

/**
 * GET /alert-logs
 * Paginated audit log of all subscription WhatsApp alerts sent.
 * Query params: page, limit, subscription_id, alert_type, status
 */
router.get("/alert-logs", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    let { page = 1, limit = 20, subscription_id, alert_type, status } = req.query;
    page  = Math.max(parseInt(page)  || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params     = [];

    if (subscription_id) {
      conditions.push("sal.subscription_id = ?");
      params.push(Number(subscription_id));
    }
    if (alert_type && ["pre_expiry", "renewal"].includes(alert_type)) {
      conditions.push("sal.alert_type = ?");
      params.push(alert_type);
    }
    if (status && ["sent", "failed"].includes(status)) {
      conditions.push("sal.status = ?");
      params.push(status);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM subscription_alert_log sal ${whereClause}`,
      params
    );

    const [rows] = await conn.query(
      `
      SELECT
        sal.id,
        sal.subscription_id,
        sal.alert_type,
        sal.sent_at,
        sal.days_before,
        sal.mobile,
        sal.template_name,
        sal.status,
        sal.error_message,
        c.name AS company_name
      FROM subscription_alert_log sal
      LEFT JOIN company_subscriptions cs ON cs.id = sal.subscription_id
      LEFT JOIN companies c ON c.id = cs.company_id
      ${whereClause}
      ORDER BY sal.sent_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return sendSuccess(
      res,
      200,
      "Alert logs fetched successfully",
      rows,
      buildMeta(page, limit, total, rows.length)
    );
  } catch (err) {
    console.error("ADMIN GET ALERT LOGS ERROR:", err);
    return sendError(res, 500, "Failed to fetch alert logs");
  } finally {
    if (conn) conn.release();
  }
});

export default router;

import express from "express";
import db from "../config/db.js";
import adminAuth from "../middleware/adminAuthMiddleware.js";
import {
  sendSuccess,
  sendError,
  buildMeta,
} from "../utils/sendResponse.js";
import {
  sendSubscriptionAlertWhatsApp,
  sendSubscriptionRenewalWhatsApp,
} from "../utils/whatsapp.js";

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
    subscription_package_id: row.subscription_package_id,
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
    cs.updated_at,
    cs.is_deleted,
    cs.deleted_at,
    cs.deleted_by
  FROM company_subscriptions cs
  LEFT JOIN companies c ON c.id = cs.company_id
  LEFT JOIN users u ON u.id = c.owner_user_id
  LEFT JOIN subscription_packages sp ON sp.id = cs.subscription_package_id
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
      conditions.push("(c.name LIKE ? OR c.legal_name LIKE ? OR sp.name LIKE ? OR u.name LIKE ? OR u.email LIKE ?)");
      const searchTerm = `%${search.trim()}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [[{ total }]] = await conn.query(
      `
      SELECT COUNT(*) AS total
      FROM company_subscriptions cs
      LEFT JOIN companies c ON c.id = cs.company_id
      LEFT JOIN users u ON u.id = c.owner_user_id
      LEFT JOIN subscription_packages sp ON sp.id = cs.subscription_package_id
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
      subscription_package_id,
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

    if (!company_id || !subscription_package_id || !subscription_type || amount_paid === undefined || !starts_at || !expires_at) {
      return sendError(res, 400, "Missing required fields");
    }

    const [[company]] = await conn.query("SELECT id FROM companies WHERE id = ? AND is_deleted = 0", [company_id]);
    if (!company) {
      return sendError(res, 404, "Company not found");
    }

    const [[subPackage]] = await conn.query("SELECT id, max_employee_count FROM subscription_packages WHERE id = ?", [subscription_package_id]);
    if (!subPackage) {
      return sendError(res, 404, "Subscription package not found");
    }

    const normalizedStartsAt = normalizeDateValue(starts_at);
    const normalizedExpiresAt = normalizeDateValue(expires_at);
    const normalizedPaymentStatus = payment_status !== undefined ? normalizePaymentStatus(payment_status) : "1";
    const limitToUse = employee_limit || subPackage.max_employee_count;
    const activeFlag = is_active !== undefined ? (Number(is_active) ? 1 : 0) : 1;

    if (normalizedStartsAt === null) return sendError(res, 400, "starts_at is invalid");
    if (normalizedExpiresAt === null) return sendError(res, 400, "expires_at is invalid");
    if (normalizedPaymentStatus === null) return sendError(res, 400, "payment_status is invalid");

    const [result] = await conn.query(
      `INSERT INTO company_subscriptions (
        company_id, subscription_package_id, employee_limit, subscription_type,
        amount_paid, starts_at, expires_at, payment_reference, payment_status,
        payment_order_id, payment_vpa, payment_utr, is_active, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id, subscription_package_id, limitToUse, subscription_type,
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
      subscription_package_id,
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
    
    if (subscription_package_id !== undefined) {
      const [[subPackage]] = await conn.query("SELECT id FROM subscription_packages WHERE id = ?", [subscription_package_id]);
      if (!subPackage) return sendError(res, 404, "Subscription package not found");
      updateFields.push("cs.subscription_package_id = ?");
      values.push(subscription_package_id);
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
 * POST /:id/notify
 * Sends a WhatsApp subscription notification to the company owner.
 * - If subscription has EXPIRED  → renewal request message
 * - If subscription is ACTIVE    → pre-expiry alert with details
 */
router.post("/:id/notify", async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const subscriptionId = parseInt(req.params.id);
    if (!subscriptionId || subscriptionId <= 0) {
      return sendError(res, 400, "Valid subscription ID is required");
    }

    // Fetch subscription with owner mobile
    const [rows] = await conn.query(
      `
      SELECT
        cs.id,
        cs.starts_at,
        cs.expires_at,
        cs.is_active,
        c.name        AS company_name,
        sp.name       AS package_name,
        u.mobile      AS owner_mobile,
        u.name        AS owner_name
      FROM company_subscriptions cs
      LEFT JOIN companies c  ON c.id  = cs.company_id
      LEFT JOIN users u      ON u.id  = c.owner_user_id
      LEFT JOIN subscription_packages sp ON sp.id = cs.subscription_package_id
      WHERE cs.id = ? AND cs.is_deleted = 0
      LIMIT 1
      `,
      [subscriptionId]
    );

    const sub = rows[0];
    if (!sub) {
      return sendError(res, 404, "Subscription not found");
    }

    if (!sub.owner_mobile) {
      return sendError(res, 422, "Owner mobile number not found — cannot send WhatsApp message");
    }

    const now        = new Date();
    const expiresAt  = sub.expires_at ? new Date(sub.expires_at) : null;
    const startsAt   = sub.starts_at  ? new Date(sub.starts_at)  : null;

    const formatDate = (date) => {
      if (!date) return "N/A";
      return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    };

    const isExpired = expiresAt ? now > expiresAt : false;

    if (isExpired) {
      // Subscription has already ended — send renewal request
      await sendSubscriptionRenewalWhatsApp(sub.owner_mobile, [
        sub.company_name  || "Your Company",
        sub.package_name  || "Subscription",
        formatDate(startsAt),
        formatDate(expiresAt),
      ]);

      return sendSuccess(res, 200, "Renewal request WhatsApp message sent successfully", {
        type: "renewal_request",
        company_name: sub.company_name,
        package_name: sub.package_name,
        expired_on: formatDate(expiresAt),
        mobile_sent_to: sub.owner_mobile,
      });
    } else {
      // Subscription is still active — send pre-expiry alert
      const msRemaining   = expiresAt ? expiresAt - now : 0;
      const daysRemaining = expiresAt ? Math.ceil(msRemaining / (1000 * 60 * 60 * 24)) : 0;

      await sendSubscriptionAlertWhatsApp(sub.owner_mobile, [
        sub.company_name  || "Your Company",
        sub.package_name  || "Subscription",
        formatDate(startsAt),
        formatDate(expiresAt),
        String(daysRemaining),
      ]);

      return sendSuccess(res, 200, "Subscription alert WhatsApp message sent successfully", {
        type: "expiry_alert",
        company_name: sub.company_name,
        package_name: sub.package_name,
        starts_at: formatDate(startsAt),
        expires_at: formatDate(expiresAt),
        days_remaining: daysRemaining,
        mobile_sent_to: sub.owner_mobile,
      });
    }
  } catch (err) {
    console.error("ADMIN SUBSCRIPTION NOTIFY ERROR:", err);
    return sendError(res, 500, "Failed to send subscription WhatsApp notification");
  } finally {
    if (conn) conn.release();
  }
});

export default router;

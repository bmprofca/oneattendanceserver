import db from "../config/db.js";
import { sendTemplateMessage } from "../utils/whatsapp.js";
import { formatIndianMobileForSend } from "../utils/mobile.js";

// ─────────────────────────────────────────────────────────────
// Supported variable source keys and their resolver functions.
// Each resolver receives the subscription row and returns a string.
// ─────────────────────────────────────────────────────────────
const VAR_RESOLVERS = {
  company_name: (sub) => String(sub.company_name || "Your Company"),
  package_name: (sub) => String(sub.package_name || "Subscription"),
  owner_name: (sub) => String(sub.owner_name || "Valued Customer"),
  subscription_type: (sub) => String(sub.subscription_type || ""),
  days_remaining: (sub) => {
    const now = new Date();
    const expires = sub.expires_at ? new Date(sub.expires_at) : null;
    if (!expires) return "0";
    const ms = expires - now;
    return String(Math.max(Math.ceil(ms / (1000 * 60 * 60 * 24)), 0));
  },
  expiry_date: (sub) => {
    const expires = sub.expires_at ? new Date(sub.expires_at) : null;
    if (!expires) return "N/A";
    return expires.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  },
};

// ─────────────────────────────────────────────────────────────
// Resolve an ordered list of variable source keys → string values
// ─────────────────────────────────────────────────────────────
const resolveVars = (varKeys, sub) => {
  if (!Array.isArray(varKeys) || varKeys.length === 0) return [];
  return varKeys.map((key) => {
    const resolver = VAR_RESOLVERS[key];
    if (!resolver) {
      console.warn(`⚠️  Unknown alert var key: "${key}" — using empty string`);
      return "";
    }
    return resolver(sub);
  });
};

// ─────────────────────────────────────────────────────────────
// Fetch alert config from DB
// ─────────────────────────────────────────────────────────────
const getAlertConfig = async (conn) => {
  const [rows] = await conn.query(
    `SELECT * FROM subscription_alert_config ORDER BY id ASC LIMIT 1`
  );
  return rows[0] || null;
};

// ─────────────────────────────────────────────────────────────
// Fetch active subscriptions expiring within `daysBefore` days
// that still have a valid owner mobile number.
// Excludes subscriptions that have already been alerted TODAY.
// ─────────────────────────────────────────────────────────────
const getSubscriptionsToAlert = async (conn, daysBefore, alertType) => {
  const [rows] = await conn.query(
    `
    SELECT
      cs.id               AS subscription_id,
      cs.expires_at,
      cs.starts_at,
      cs.subscription_type,
      c.name              AS company_name,
      COALESCE(sp.name, csp.name) AS package_name,
      u.phone             AS owner_mobile,
      u.name              AS owner_name
    FROM company_subscriptions cs
    LEFT JOIN companies c   ON c.id  = cs.company_id
    LEFT JOIN users u       ON u.id  = c.owner_user_id
    LEFT JOIN subscription_packages sp
      ON cs.package_type = 'normal' AND sp.id = cs.package_id
    LEFT JOIN custom_subscription_packages csp
      ON cs.package_type = 'custom' AND csp.id = cs.package_id
    WHERE
      cs.is_deleted  = 0
      AND cs.is_active = 1
      AND u.phone IS NOT NULL
      AND u.phone <> ''
      AND cs.expires_at IS NOT NULL
      -- Pre-expiry window: expiry is between NOW and NOW + N days
      AND cs.expires_at > NOW()
      AND cs.expires_at <= DATE_ADD(NOW(), INTERVAL ? DAY)
      -- Not already alerted today
      AND NOT EXISTS (
        SELECT 1 FROM subscription_alert_log sal
        WHERE sal.subscription_id = cs.id
          AND sal.alert_type      = ?
          AND sal.status          = 'sent'
          AND DATE(sal.sent_at)   = CURDATE()
      )
    `,
    [daysBefore, alertType]
  );
  return rows;
};

// ─────────────────────────────────────────────────────────────
// Fetch expired subscriptions for renewal notice cron
// ─────────────────────────────────────────────────────────────
const getExpiredSubscriptionsToAlert = async (conn, alertType) => {
  const [rows] = await conn.query(
    `
    SELECT
      cs.id               AS subscription_id,
      cs.expires_at,
      cs.starts_at,
      cs.subscription_type,
      c.name              AS company_name,
      COALESCE(sp.name, csp.name) AS package_name,
      u.phone             AS owner_mobile,
      u.name              AS owner_name
    FROM company_subscriptions cs
    LEFT JOIN companies c   ON c.id  = cs.company_id
    LEFT JOIN users u       ON u.id  = c.owner_user_id
    LEFT JOIN subscription_packages sp
      ON cs.package_type = 'normal' AND sp.id = cs.package_id
    LEFT JOIN custom_subscription_packages csp
      ON cs.package_type = 'custom' AND csp.id = cs.package_id
    WHERE
      cs.is_deleted  = 0
      AND cs.is_active = 1
      AND u.phone IS NOT NULL
      AND u.phone <> ''
      AND cs.expires_at IS NOT NULL
      -- Subscription has expired (today is the expiry day OR past it)
      AND DATE(cs.expires_at) <= CURDATE()
      -- Not already sent renewal notice today
      AND NOT EXISTS (
        SELECT 1 FROM subscription_alert_log sal
        WHERE sal.subscription_id = cs.id
          AND sal.alert_type      = ?
          AND sal.status          = 'sent'
          AND DATE(sal.sent_at)   = CURDATE()
      )
    `,
    [alertType]
  );
  return rows;
};

// ─────────────────────────────────────────────────────────────
// Log a sent alert to subscription_alert_log
// ─────────────────────────────────────────────────────────────
const logAlert = async (conn, { subscriptionId, alertType, daysBefore, mobile, templateName, status, errorMessage }) => {
  try {
    await conn.query(
      `INSERT INTO subscription_alert_log
        (subscription_id, alert_type, days_before, mobile, template_name, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [subscriptionId, alertType, daysBefore ?? null, mobile, templateName, status, errorMessage ?? null]
    );
  } catch (logErr) {
    console.error("❌ Failed to log alert to DB:", logErr.message);
  }
};

// ─────────────────────────────────────────────────────────────
// Process a single subscription: resolve vars, send WA, log result
// ─────────────────────────────────────────────────────────────
const processSubscription = async (conn, sub, templateName, templateVarKeys, alertType) => {
  let mobile;
  try {
    mobile = formatIndianMobileForSend(sub.owner_mobile);
  } catch {
    mobile = sub.owner_mobile;
  }

  const params = resolveVars(templateVarKeys, sub);

  // Compute days_before for logging
  const now = new Date();
  const expires = sub.expires_at ? new Date(sub.expires_at) : null;
  const daysBefore = expires
    ? Math.ceil((expires - now) / (1000 * 60 * 60 * 24))
    : null;

  try {
    await sendTemplateMessage({ templateName, mobile: sub.owner_mobile, params });

    console.log(
      `✅ Alert sent [${alertType}] → sub#${sub.subscription_id} | ${sub.company_name} | ${mobile} | ${daysBefore}d left`
    );

    await logAlert(conn, {
      subscriptionId: sub.subscription_id,
      alertType,
      daysBefore,
      mobile,
      templateName,
      status: "sent",
    });
  } catch (err) {
    const errMsg = err?.response?.data
      ? JSON.stringify(err.response.data)
      : (err.message || "Unknown error");

    console.error(
      `❌ Alert FAILED [${alertType}] → sub#${sub.subscription_id} | ${sub.company_name} | ${mobile} | ${errMsg}`
    );

    await logAlert(conn, {
      subscriptionId: sub.subscription_id,
      alertType,
      daysBefore,
      mobile,
      templateName,
      status: "failed",
      errorMessage: errMsg,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Main exported function — called by cron/index.js daily
// ─────────────────────────────────────────────────────────────
export const runSubscriptionAlerts = async () => {
  let conn;
  let preExpirySent = 0;
  let renewalSent   = 0;
  let failed        = 0;

  try {
    conn = await db.getConnection();

    // 1. Load config
    const config = await getAlertConfig(conn);
    if (!config) {
      console.log("⚠️  No subscription_alert_config found — skipping.");
      return;
    }
    if (!config.is_alert_enabled) {
      console.log("ℹ️  Subscription alerts are disabled in config — skipping.");
      return;
    }

    const {
      alert_days_before,
      alert_template_name,
      alert_template_vars,
      renewal_template_name,
      renewal_template_vars,
      is_renewal_enabled,
    } = config;

    // Safely parse JSON vars (may already be parsed by MySQL driver)
    const alertVarKeys   = Array.isArray(alert_template_vars)   ? alert_template_vars   : JSON.parse(alert_template_vars   || "[]");
    const renewalVarKeys = Array.isArray(renewal_template_vars) ? renewal_template_vars : JSON.parse(renewal_template_vars || "[]");

    // ── 2. Pre-expiry alerts ──────────────────────────────────
    if (alert_template_name && alertVarKeys.length > 0) {
      const subscriptions = await getSubscriptionsToAlert(conn, alert_days_before, "pre_expiry");
      console.log(`📋 Pre-expiry subscriptions to alert: ${subscriptions.length}`);

      for (const sub of subscriptions) {
        await processSubscription(conn, sub, alert_template_name, alertVarKeys, "pre_expiry");
        // Tally results based on most recent log
        const [lastLog] = await conn.query(
          `SELECT status FROM subscription_alert_log WHERE subscription_id = ? AND alert_type = 'pre_expiry' ORDER BY id DESC LIMIT 1`,
          [sub.subscription_id]
        );
        if (lastLog[0]?.status === "sent") preExpirySent++;
        else failed++;
      }
    } else {
      console.log("ℹ️  Pre-expiry alert template not configured — skipping.");
    }

    // ── 3. Renewal / post-expiry alerts ──────────────────────
    if (is_renewal_enabled && renewal_template_name && renewalVarKeys.length > 0) {
      const expired = await getExpiredSubscriptionsToAlert(conn, "renewal");
      console.log(`📋 Expired subscriptions to send renewal notice: ${expired.length}`);

      for (const sub of expired) {
        await processSubscription(conn, sub, renewal_template_name, renewalVarKeys, "renewal");
        const [lastLog] = await conn.query(
          `SELECT status FROM subscription_alert_log WHERE subscription_id = ? AND alert_type = 'renewal' ORDER BY id DESC LIMIT 1`,
          [sub.subscription_id]
        );
        if (lastLog[0]?.status === "sent") renewalSent++;
        else failed++;
      }
    } else {
      console.log("ℹ️  Renewal alerts disabled or not configured — skipping.");
    }

    console.log(`✅ Subscription alert cron done — pre_expiry: ${preExpirySent} sent, renewal: ${renewalSent} sent, failed: ${failed}`);
  } catch (err) {
    console.error("❌ SUBSCRIPTION ALERT CRON ERROR:", err);
    throw err;
  } finally {
    if (conn) conn.release();
  }
};

export default runSubscriptionAlerts;

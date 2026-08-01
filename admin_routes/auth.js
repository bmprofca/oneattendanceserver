import express from "express";
import db from "../config/db.js";
import {
  generateOTP,
  hashPassword,
  generateSessionToken,
} from "../utils/auth.js";
import { verifyOtpHash } from "../utils/auth.js";
import getClientMeta from "../utils/ipHelper.js";
import adminAuth from "../middleware/adminAuthMiddleware.js";
import { sendSuccess, sendError } from "../utils/sendResponse.js";
import { sendOtpSms } from "../utils/sms.js";
import { sendOtpWhatsApp } from "../utils/whatsapp.js";
// normalizeTenDigitMobile not used here — admin phones stored as 12-digit (91XXXXXXXXXX)

const router = express.Router();

// ─── Helpers ───────────────────────────────────────────────────

const normalizePhone = (value) => {
  // Admin phones are stored as full 12-digit format (e.g. 919XXXXXXXXX).
  // Do NOT strip the country code — just remove non-digits and return as-is.
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
};

// ─── SQL ───────────────────────────────────────────────────────

const SQL = {
  ADMIN_BY_PHONE: `
    SELECT id, email, phone, name, profile_picture, is_active, is_system_admin, is_deleted
    FROM users
    WHERE phone = ? AND is_deleted = 0
    LIMIT 1
  `,
  OTP_RATE_LIMIT: `
    SELECT COUNT(*) AS count
    FROM otps
    WHERE phone = ? AND otp_purpose = 'login'
      AND created_at > NOW() - INTERVAL 30 SECOND
  `,
  OTP_DAILY_LIMIT: `
    SELECT COUNT(*) AS total
    FROM otps
    WHERE phone = ? AND otp_purpose = 'login'
      AND created_at > NOW() - INTERVAL 1 DAY
  `,
  OTP_IP_RATE_LIMIT: `
    SELECT COUNT(*) AS count
    FROM otps
    WHERE ip_address = ? AND otp_purpose = 'login'
      AND created_at > NOW() - INTERVAL 30 SECOND
  `,
  INVALIDATE_PREVIOUS_OTPS: `
    UPDATE otps
    SET used_at = NOW()
    WHERE phone = ? AND otp_purpose = 'login' AND used_at IS NULL
  `,
  INSERT_OTP: `
    INSERT INTO otps (email, phone, otp_purpose, otp_hash, otp_expiry, used_at, ip_address)
    VALUES ('', ?, 'login', ?, ?, NULL, ?)
  `,
  GET_LATEST_OTP: `
    SELECT *
    FROM otps
    WHERE phone = ? AND otp_purpose = 'login' AND used_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE
  `,
  MARK_OTP_VERIFIED: `
    UPDATE otps SET is_verified = 1, verified_at = NOW(), used_at = NOW() WHERE id = ?
  `,
  INSERT_SESSION: `
    INSERT INTO sessions
      (user_id, session_token, ip_v4, ip_v6, latitude, longitude, auth_provider,
       platform, device_name, forced_logged_out, is_active, expires_at,
       last_used_at, created_at, created_by)
    VALUES (?, ?, ?, ?, NULL, NULL, 'admin_otp', 'web', ?, 0, 1, ?, NOW(), NOW(), ?)
  `,
  UPDATE_LAST_LOGIN: `UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = ?`,
};

// ─── POST /admin/auth/send-otp ────────────────────────────────

router.post("/send-otp", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const { phone } = req.body || {};
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone) {
      return sendError(res, 400, "Valid phone number is required");
    }

    const meta = getClientMeta(req);
    const ip = meta?.ip_v4 || meta?.ip_v6 || "unknown";

    // Check user exists and is admin
    const [[user]] = await conn.query(SQL.ADMIN_BY_PHONE, [normalizedPhone]);

    if (!user) {
      return sendError(res, 404, "Admin account not found");
    }

    if (!user.is_active) {
      return sendError(res, 403, "Account is deactivated");
    }

    if (!user.is_system_admin) {
      return sendError(res, 403, "Admin access required");
    }

    // Rate limiting
    const [[phoneRecent]] = await conn.query(SQL.OTP_RATE_LIMIT, [normalizedPhone]);
    if (phoneRecent.count > 0) {
      return sendError(res, 429, "Wait 30 seconds before requesting another OTP");
    }

    const [[ipRecent]] = await conn.query(SQL.OTP_IP_RATE_LIMIT, [ip]);
    if (ipRecent.count > 0) {
      return sendError(res, 429, "Too many requests from this IP. Try again later.");
    }

    const [[dailyLimit]] = await conn.query(SQL.OTP_DAILY_LIMIT, [normalizedPhone]);
    if (dailyLimit.total >= 10) {
      return sendError(res, 429, "Daily OTP limit reached");
    }

    // Generate and store OTP
    const otp = String(generateOTP());
    const otpHash = await hashPassword(otp);
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    console.log(`🔐 Generated ADMIN OTP for ${normalizedPhone}: ${otp} (expires at ${expiry.toISOString()})`) ;

    await conn.query(SQL.INVALIDATE_PREVIOUS_OTPS, [normalizedPhone]);
    await conn.query(SQL.INSERT_OTP, [normalizedPhone, otpHash, expiry, ip]);

    console.log(`🔐 ADMIN OTP for ${normalizedPhone}: ${otp}`);

    // Send via SMS & WhatsApp
    try {
      await sendOtpSms(normalizedPhone, otp);
    } catch (smsErr) {
      console.error("ADMIN OTP SMS ERROR:", smsErr.message);
    }

    try {
      await sendOtpWhatsApp(normalizedPhone, otp);
    } catch (waErr) {
      console.error("ADMIN OTP WHATSAPP ERROR:", waErr.message);
    }

    return sendSuccess(res, 200, "OTP sent successfully");
  } catch (err) {
    console.error("ADMIN SEND OTP ERROR:", err);
    return sendError(res, 500, "Something went wrong");
  } finally {
    if (conn) conn.release();
  }
});

// ─── POST /admin/auth/verify-otp ──────────────────────────────

router.post("/verify-otp", async (req, res) => {
  let conn;
  let transactionStarted = false;

  try {
    conn = await db.getConnection();

    const { phone, otp } = req.body || {};
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone) {
      return sendError(res, 400, "Valid phone number is required");
    }

    if (otp === undefined || otp === null || otp === "") {
      return sendError(res, 400, "OTP is required");
    }

    await conn.beginTransaction();
    transactionStarted = true;

    // Verify user is admin
    const [[user]] = await conn.query(SQL.ADMIN_BY_PHONE, [normalizedPhone]);

    if (!user) {
      await conn.rollback();
      return sendError(res, 404, "Admin account not found");
    }

    if (!user.is_active) {
      await conn.rollback();
      return sendError(res, 403, "Account is deactivated");
    }

    if (!user.is_system_admin) {
      await conn.rollback();
      return sendError(res, 403, "Admin access required");
    }

    // Find and verify OTP
    const [otpRows] = await conn.query(SQL.GET_LATEST_OTP, [normalizedPhone]);

    if (!otpRows.length) {
      const [legacyOtpRows] = await conn.query(
        `SELECT *
         FROM otps
         WHERE phone = ? AND otp_purpose = 'admin_login' AND used_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [normalizedPhone]
      );

      if (!legacyOtpRows.length) {
        await conn.rollback();
        return sendError(res, 400, "OTP not found. Please request a new one.");
      }

      otpRows[0] = legacyOtpRows[0];
    }

    const otpRecord = otpRows[0];

    if (otpRecord.is_verified) {
      await conn.rollback();
      return sendError(res, 400, "OTP already used");
    }

    if (new Date() > new Date(otpRecord.otp_expiry)) {
      await conn.rollback();
      return sendError(res, 400, "OTP expired");
    }

    const isValid = await verifyOtpHash(String(otp), otpRecord.otp_hash);

    if (!isValid) {
      await conn.rollback();
      return sendError(res, 400, "Invalid OTP");
    }

    // Mark OTP as verified
    await conn.query(SQL.MARK_OTP_VERIFIED, [otpRecord.id]);

    // Create session
    const meta = getClientMeta(req);
    const token = generateSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await conn.query(SQL.INSERT_SESSION, [
      user.id,
      token,
      meta.ip_v4 || null,
      meta.ip_v6 || null,
      meta.device_name || "Admin Panel",
      expiresAt,
      user.id,
    ]);

    await conn.query(SQL.UPDATE_LAST_LOGIN, [user.id]);
    await conn.commit();
    transactionStarted = false;

    return sendSuccess(res, 200, "Admin login successful", {
      token,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        profile_picture: user.profile_picture,
        is_system_admin: true,
      },
    });
  } catch (err) {
    if (conn && transactionStarted) {
      try { await conn.rollback(); } catch (_) {}
    }
    console.error("ADMIN VERIFY OTP ERROR:", err);
    return sendError(res, 500, "Something went wrong");
  } finally {
    if (conn) conn.release();
  }
});

// ─── GET /admin/auth/me ───────────────────────────────────────

router.get("/me", adminAuth(), async (req, res) => {
  return sendSuccess(res, 200, "Admin profile fetched", {
    id: req.admin.id,
    email: req.admin.email,
    phone: req.admin.phone,
    name: req.admin.name,
    profile_picture: req.admin.profile_picture,
    is_system_admin: true,
  });
});

// ─── POST /admin/auth/logout ──────────────────────────────────

router.post("/logout", adminAuth(), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const sessionId = req.session?.id;
    const adminId = req.admin?.id;

    if (!sessionId || !adminId) {
      return sendError(res, 400, "Invalid session");
    }

    const [result] = await conn.query(
      `UPDATE sessions SET is_active = 0, forced_logged_out = 0 WHERE id = ? AND user_id = ? AND is_active = 1`,
      [sessionId, adminId]
    );

    return sendSuccess(
      res,
      200,
      result.affectedRows > 0
        ? "Logged out successfully"
        : "Session already logged out"
    );
  } catch (err) {
    console.error("ADMIN LOGOUT ERROR:", err);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

export default router;

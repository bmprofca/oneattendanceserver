import express from "express";
import axios from "axios";
import db from "../config/db.js";
import {
  generateOTP, hashPassword, assessOtp,
  generateSessionToken
} from "../utils/auth.js";
import getClientMeta from "../utils/ipHelper.js";
import auth from "../middleware/authMiddleware.js";
import { OAuth2Client } from "google-auth-library";
import { saveMediaFromUrl } from "../utils/fileService.js";
import { sendSuccess, sendError } from "../utils/sendResponse.js";
import {
  queueSignupOTPEmail, queueLoginOTPEmail,
  sendQueuedWelcomeEmail, queueLoginAlertEmail
} from "../email/services/email.processor.js";
import { sendOtpSms } from "../utils/sms.js";
import { sendOtpWhatsApp } from "../utils/whatsapp.js";
import {
  WEB_GOOGLE_CLIENT_ID, APP_GOOGLE_CLIENT_ID, NODE_ENV, FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET, FRONTEND_URL, TRUECALLER_CLIENT_ID, EMAIL_USER
} from "../config/config.js";
import { normalizeIndianMobile } from "../utils/mobile.js";

const router = express.Router();

const SQL = {
  USER_BY_EMAIL: `SELECT id, email, phone, name, profile_picture, is_active, is_system_admin, is_deleted, last_login FROM users WHERE email = ? AND is_deleted = 0`,
  USER_BY_PHONE: `SELECT id, email, phone, name, profile_picture, is_active, is_system_admin, is_deleted, last_login FROM users WHERE phone = ? AND is_deleted = 0`,
  USER_BY_EMAIL_ACTIVE: `SELECT id, email, phone, name, profile_picture, is_active, is_system_admin, is_deleted, last_login FROM users WHERE email = ? AND is_deleted = 0 AND is_active = 1`,
  USER_BY_PHONE_ACTIVE: `SELECT id, email, phone, name, profile_picture, is_active, is_system_admin, is_deleted, last_login FROM users WHERE phone = ? AND is_deleted = 0 AND is_active = 1`,
  USER_BY_ID: `SELECT id, email, phone, name, profile_picture, is_active, is_system_admin, last_login FROM users WHERE id = ? LIMIT 1`,
  INSERT_USER: `INSERT INTO users (email, phone, name, profile_picture, is_active, last_login, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW(), NOW())`,
  UPDATE_LAST_LOGIN: `UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = ?`,

  OTP_SIGNUP_RATE_LIMIT: (col) =>
    `SELECT COUNT(*) AS count FROM otps WHERE ${col} = ? AND otp_purpose = 'signup' AND created_at > NOW() - INTERVAL 30 SECOND`,
  OTP_IP_RATE_LIMIT: (purpose) =>
    `SELECT COUNT(*) AS count FROM otps WHERE ip_address = ? AND otp_purpose = '${purpose}' AND created_at > NOW() - INTERVAL 30 SECOND`,
  OTP_COMBO_RATE_LIMIT: (col) =>
    `SELECT COUNT(*) AS count FROM otps WHERE ${col} = ? AND ip_address = ? AND otp_purpose = 'signup' AND created_at > NOW() - INTERVAL 60 SECOND`,
  OTP_DAILY_LIMIT: (col, purpose) =>
    `SELECT COUNT(*) AS total FROM otps WHERE ${col} = ? AND otp_purpose = '${purpose}' AND created_at > NOW() - INTERVAL 1 DAY`,
  OTP_DAILY_IP_LIMIT: (purpose) =>
    `SELECT COUNT(*) AS total FROM otps WHERE ip_address = ? AND otp_purpose = '${purpose}' AND created_at > NOW() - INTERVAL 1 DAY`,
  INVALIDATE_OTPS: (col) =>
    `UPDATE otps SET used_at = NOW() WHERE ${col} = ? AND otp_purpose = 'signup' AND used_at IS NULL`,
  INSERT_OTP: `INSERT INTO otps (email, phone, otp_purpose, otp_hash, otp_expiry, used_at, ip_address) VALUES (?, ?, ?, ?, ?, NULL, ?)`,
  GET_OTP_BY_IDENTIFIER: (col, purpose) =>
    `SELECT * FROM otps WHERE ${col} = ? AND otp_purpose = '${purpose}' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
  MARK_OTP_VERIFIED: `UPDATE otps SET is_verified = 1, verified_at = NOW(), used_at = NOW() WHERE id = ?`,
  MARK_OTP_USED: `UPDATE otps SET used_at = NOW() WHERE id = ?`,

  INSERT_SESSION: `INSERT INTO sessions (user_id, session_token, ip_v4, ip_v6, latitude, longitude, auth_provider, platform, device_name, forced_logged_out, is_active, expires_at, last_used_at, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, NOW(), NOW(), ?)`,
  INACTIVATE_SESSIONS: `UPDATE sessions SET is_active = 0, forced_logged_out = 1, forced_logged_out_by_id = ? WHERE user_id = ? AND is_active = 1`,
  GET_SESSIONS_BASE: `SELECT COUNT(*) AS total FROM sessions WHERE user_id = ? AND is_active = 1 AND forced_logged_out = 0 AND expires_at > NOW()`,
  GET_SESSIONS_DATA: `SELECT id, session_token, ip_v4, ip_v6, latitude, longitude, device_name, expires_at, last_used_at, created_at FROM sessions WHERE user_id = ? AND is_active = 1 AND forced_logged_out = 0 AND expires_at > NOW() ORDER BY last_used_at DESC LIMIT ? OFFSET ?`,
  LOGOUT_SESSION: `UPDATE sessions SET is_active = 0, forced_logged_out = 1, forced_logged_out_by_id = ?, forced_logged_out_by_ip = ? WHERE id = ? AND user_id = ? AND is_active = 1`,
  LOGOUT_ALL_OTHER: `UPDATE sessions SET is_active = 0, forced_logged_out = 1, forced_logged_out_by_id = ? WHERE user_id = ? AND id != ? AND is_active = 1`,
};

const normalizePlatform = (value) => {
  if (!value || typeof value !== "string") return null;
  const p = value.toLowerCase().trim();
  return ["web", "android", "ios"].includes(p) ? p : null;
};

const normalizeLoginType = (value) => {
  if (!value || typeof value !== "string") return null;
  const t = value.toLowerCase().trim();
  return t === "email" ? "email" : (t === "phone" || t === "mobile" ? "phone" : null);
};

const normalizeSignupType = (value) => {
  if (!value || typeof value !== "string") return null;
  const t = value.toLowerCase().trim();
  return t === "email" ? "email" : (t === "phone" || t === "mobile" ? "phone" : null);
};

const hasNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

const parseCoordinates = (latitude, longitude) => {
  const lat = latitude !== undefined && latitude !== null && latitude !== "" ? Number(latitude) : null;
  const lng = longitude !== undefined && longitude !== null && longitude !== "" ? Number(longitude) : null;
  if ((lat !== null && lng === null) || (lat === null && lng !== null))
    return { error: "Both latitude and longitude must be provided together" };
  if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) return { error: "Invalid latitude" };
  if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) return { error: "Invalid longitude" };
  return { lat, lng };
};

const rollbackTransaction = async (conn, started) => {
  if (conn && started) {
    try { await conn.rollback(); } catch (_) { }
  }
};

const getUserByLoginType = async (conn, loginType, identifier, onlyActive = false) => {
  const sql = loginType === "email"
    ? (onlyActive ? SQL.USER_BY_EMAIL_ACTIVE : SQL.USER_BY_EMAIL)
    : (onlyActive ? SQL.USER_BY_PHONE_ACTIVE : SQL.USER_BY_PHONE);
  const [rows] = await conn.query(sql, [identifier]);
  return rows[0] || null;
};

const createSession = async (conn, { userId, token, meta, platform, lat, lng, authProvider }) => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await conn.query(SQL.INSERT_SESSION, [
    userId, token, meta.ip_v4 || null, meta.ip_v6 || null,
    lat, lng, authProvider, platform, meta.device_name || null,
    expiresAt, userId
  ]);
  return {
    ip_v4: meta.ip_v4,
    ip_v6: meta.ip_v6,
    latitude: lat,
    longitude: lng,
    device_name: meta.device_name,
    user_agent: "",
    platform
  };
};

const verifyAndMarkOTP = async (conn, identifierCol, identifierVal, purpose, submittedOtp) => {
  const [rows] = await conn.query(SQL.GET_OTP_BY_IDENTIFIER(identifierCol, purpose), [identifierVal]);
  if (!rows.length) return { error: "OTP not found" };
  const record = rows[0];
  if (record.is_verified) return { error: "OTP already used" };
  if (new Date() > new Date(record.otp_expiry)) return { error: "OTP expired" };
  const otpError = await assessOtp(record.id, submittedOtp, record.otp_hash);
  if (otpError) return { error: otpError };
  return { record, error: null };
};

const sendLoginAlert = async (user, session, req, normalizedPlatform) => {
  const enrichedSession = {
    ...session,
    user_agent: req.headers["user-agent"] || "",
    platform: normalizedPlatform
  };
  try {
    await queueLoginAlertEmail({
      to: user.email,
      userName: user.name || user.email || "User",
      session: enrichedSession,
      dashboardUrl: FRONTEND_URL + "/settings?tab=security",
      fromEmail: EMAIL_USER,
      fromName: "OneAttendance Security",
      replyTo: user.email
    });
  } catch (e) {
    console.error("LOGIN ALERT EMAIL ERROR:", e.message);
  }
};

const resolveLoginPayload = (body, { requireOtp = false } = {}) => {
  const { login_type, phone, email, otp } = body || {};
  const loginType = normalizeLoginType(login_type);
  if (!loginType) return { error: { status: 400, message: "Valid login_type is required (email/phone)" } };
  if (requireOtp && (otp === undefined || otp === null || otp === "")) return { error: { status: 400, message: "OTP is required" } };
  let identifier;
  if (loginType === "email") {
    if (!email || typeof email !== "string") return { error: { status: 400, message: "Email is required" } };
    identifier = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) return { error: { status: 400, message: "Invalid email format" } };
  } else {
    if (phone === undefined || phone === null || phone === "") return { error: { status: 400, message: "Phone is required" } };
    identifier = normalizeIndianMobile(phone);
    if (!identifier) return { error: { status: 400, message: "Invalid phone number" } };
  }
  return { loginType, identifier, otp };
};

const resolveSignupRequestPayload = (body) => {
  const { signup_type, email, phone } = body || {};
  const signupType = normalizeSignupType(signup_type);
  if (!signupType) return { error: { status: 400, message: "Valid signup_type is required (email/phone)" } };
  if (signupType === "email") {
    if (!hasNonEmptyString(email)) return { error: { status: 400, message: "Email is required for email signup" } };
    if (hasNonEmptyString(phone)) return { error: { status: 400, message: "Phone is not allowed for email signup. Use phone signup instead." } };
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return { error: { status: 400, message: "Invalid email format" } };
    return { signupType, normalizedEmail: normalized, normalizedPhone: "", otpEmail: normalized };
  }
  if (phone === undefined || phone === null || phone === "") return { error: { status: 400, message: "Phone is required for phone signup" } };
  if (hasNonEmptyString(email)) return { error: { status: 400, message: "Email is not allowed for phone signup. Use email signup instead." } };
  const normalizedPhone = normalizeIndianMobile(phone);
  if (!normalizedPhone) return { error: { status: 400, message: "Invalid phone number" } };
  return { signupType, normalizedEmail: "", normalizedPhone, otpEmail: "" };
};

const resolveSignupPayload = (body) => {
  const { signup_type, email, phone, otp, name } = body || {};
  const signupType = normalizeSignupType(signup_type);
  if (!signupType) return { error: { status: 400, message: "Valid signup_type is required (email/phone)" } };
  if (otp === undefined || otp === null || otp === "") return { error: { status: 400, message: "OTP is required" } };
  if (signupType === "email") {
    if (!hasNonEmptyString(email)) return { error: { status: 400, message: "Email is required for email signup" } };
    if (hasNonEmptyString(phone)) return { error: { status: 400, message: "Phone is not allowed for email signup. Use phone signup instead." } };
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return { error: { status: 400, message: "Invalid email format" } };
    return { signupType, normalizedEmail, normalizedPhone: "", otp, name: name?.trim() || null };
  }
  if (phone === undefined || phone === null || phone === "") return { error: { status: 400, message: "Phone is required for phone signup" } };
  if (hasNonEmptyString(email)) return { error: { status: 400, message: "Email is not allowed for phone signup. Use email signup instead." } };
  const normalizedPhone = normalizeIndianMobile(phone);
  if (!normalizedPhone) return { error: { status: 400, message: "Invalid phone number" } };
  return { signupType, normalizedEmail: "", normalizedPhone, otp, name: name?.trim() || null };
};

const TRUECALLER_TOKEN_URL = "https://oauth-account-noneu.truecaller.com/v1/token";
const TRUECALLER_USERINFO_URL = "https://oauth-account-noneu.truecaller.com/v1/userinfo";

const exchangeTruecallerToken = async (code, codeVerifier) => {
  const response = await axios.post(
    TRUECALLER_TOKEN_URL,
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: TRUECALLER_CLIENT_ID,
      code,
      code_verifier: codeVerifier
    }).toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 15000
    }
  );
  return response.data?.access_token || null;
};

const fetchTruecallerProfile = async (accessToken) => {
  const response = await axios.get(TRUECALLER_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000
  });
  return response.data;
};

const mapTruecallerProfile = (profile) => {
  const phone = normalizeIndianMobile(profile?.phone_number) || profile?.phone_number?.trim() || null;
  const email = profile?.email?.toLowerCase()?.trim() || null;
  const name = [profile?.given_name, profile?.family_name].filter(Boolean).join(" ").trim() || null;
  return {
    phone,
    phoneVerified: profile?.phone_number_verified === true,
    email,
    name,
    pictureUrl: profile?.picture || null
  };
};

const googleClient = new OAuth2Client();
const getGoogleAudiences = () => [WEB_GOOGLE_CLIENT_ID, APP_GOOGLE_CLIENT_ID].filter(Boolean);

router.post("/signup/request-otp", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const resolved = resolveSignupRequestPayload(req.body);
    if (resolved.error) return sendError(res, resolved.error.status, resolved.error.message);
    const { signupType, normalizedEmail, normalizedPhone, otpEmail } = resolved;
    const rateLimitCol = signupType === "phone" ? "phone" : "email";
    const rateLimitVal = signupType === "phone" ? normalizedPhone : normalizedEmail;
    const ip = getClientMeta(req)?.ip_v4 || getClientMeta(req)?.ip_v6 || "unknown";

    const existingUserSql = signupType === "email" ? "email = ?" : "phone = ?";
    const [existingUser] = await conn.query(`SELECT id FROM users WHERE ${existingUserSql} AND is_deleted = 0 LIMIT 1`, [rateLimitVal]);
    if (existingUser.length) return sendError(res, 409, signupType === "email" ? "Email already registered. Please login." : "Phone already registered. Please login.");

    const [[emailRecent]] = await conn.query(SQL.OTP_SIGNUP_RATE_LIMIT(rateLimitCol), [rateLimitVal]);
    if (emailRecent.count > 0) return sendError(res, 429, "Wait 30 seconds before requesting another OTP");
    const [[ipRecent]] = await conn.query(SQL.OTP_IP_RATE_LIMIT("signup"), [ip]);
    if (ipRecent.count > 5) return sendError(res, 429, "Too many requests from this IP. Try again later.");
    const [[comboRecent]] = await conn.query(SQL.OTP_COMBO_RATE_LIMIT(rateLimitCol), [rateLimitVal, ip]);
    if (comboRecent.count > 3) return sendError(res, 429, "Too many attempts. Please wait a minute.");
    const [[dailyEmail]] = await conn.query(SQL.OTP_DAILY_LIMIT(rateLimitCol, "signup"), [rateLimitVal]);
    if (dailyEmail.total >= 10) return sendError(res, 429, "Daily OTP limit reached");
    const [[dailyIp]] = await conn.query(SQL.OTP_DAILY_IP_LIMIT("signup"), [ip]);
    if (dailyIp.total >= 30) return sendError(res, 429, "Too many OTP requests from this IP today");

    const otp = String(generateOTP());
    const otpHash = await hashPassword(otp);
    const expiry = new Date(Date.now() + 5 * 60 * 1000);
    await conn.query(SQL.INVALIDATE_OTPS(rateLimitCol), [rateLimitVal]);
    await conn.query(SQL.INSERT_OTP, [otpEmail, normalizedPhone, "signup", otpHash, expiry, ip]);

    if (signupType === "email" && normalizedEmail) {
      try {
        await queueSignupOTPEmail({
          to: normalizedEmail,
          userName: normalizedEmail || "User",
          otp,
          fromEmail: EMAIL_USER,
          fromName: "OneAttendance",
          replyTo: EMAIL_USER
        });
      } catch (emailErr) {
        console.error("SIGNUP OTP EMAIL QUEUE ERROR:", emailErr.message);
        return sendError(res, 500, "Failed to send signup OTP email");
      }
    } else if (signupType === "phone" && normalizedPhone) {
      try { await sendOtpSms(normalizedPhone, otp); } catch (smsErr) { console.error("SIGNUP OTP SMS ERROR:", smsErr.message); }
      try { await sendOtpWhatsApp(normalizedPhone, otp); } catch (waErr) { console.error("SIGNUP OTP WHATSAPP ERROR:", waErr.message); }
    }

    return sendSuccess(res, 200, signupType === "email" ? "OTP sent to email" : "OTP sent successfully");
  } catch (err) {
    console.error("SIGNUP REQUEST OTP ERROR:", err);
    return sendError(res, 500, "Something went wrong");
  } finally {
    if (conn) conn.release();
  }
});

router.post("/signup/verify-otp", async (req, res) => {
  let conn, transactionStarted = false;
  try {
    conn = await db.getConnection();
    const { platform, latitude, longitude } = req.body || {};
    const resolved = resolveSignupPayload(req.body);
    if (resolved.error) return sendError(res, resolved.error.status, resolved.error.message);
    const { signupType, normalizedEmail, normalizedPhone, otp: submittedOtp, name } = resolved;
    const normalizedPlatform = normalizePlatform(platform);
    if (!normalizedPlatform) return sendError(res, 400, "Valid platform is required (web/android/ios)");
    const coords = parseCoordinates(latitude, longitude);
    if (coords.error) return sendError(res, 400, coords.error);
    const { lat, lng } = coords;
    const meta = getClientMeta(req);

    await conn.beginTransaction();
    transactionStarted = true;

    const otpCol = signupType === "phone" ? "phone" : "email";
    const otpVal = signupType === "phone" ? normalizedPhone : normalizedEmail;
    const { record, error } = await verifyAndMarkOTP(conn, otpCol, otpVal, "signup", submittedOtp);
    if (error) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return sendError(res, 400, error);
    }

    const existingSql = signupType === "email" ? "email = ?" : "phone = ?";
    const [existing] = await conn.query(`SELECT id FROM users WHERE ${existingSql} AND is_deleted = 0 LIMIT 1`, [otpVal]);
    if (existing.length) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return sendError(res, 409, signupType === "email" ? "Email already registered" : "Phone already registered");
    }

    let result;
    try {
      [result] = await conn.query(SQL.INSERT_USER, [normalizedEmail, normalizedPhone, name, null]);
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        await rollbackTransaction(conn, transactionStarted);
        transactionStarted = false;
        return sendError(res, 409, "Email or phone already registered");
      }
      throw err;
    }
    const userId = result.insertId;
    await conn.query(SQL.MARK_OTP_VERIFIED, [record.id]);

    const token = generateSessionToken();
    await createSession(conn, { userId, token, meta, platform: normalizedPlatform, lat, lng, authProvider: "email" });
    await conn.commit();
    transactionStarted = false;

    if (signupType === "email" && normalizedEmail) {
      try {
        await sendQueuedWelcomeEmail({
          to: normalizedEmail,
          userName: name || normalizedEmail || "User",
          dashboardUrl: FRONTEND_URL + "/home",
          fromEmail: EMAIL_USER,
          fromName: "OneAttendance",
          replyTo: EMAIL_USER
        });
      } catch (emailErr) {
        console.error("WELCOME EMAIL QUEUE ERROR:", emailErr.message);
      }
    }

    return sendSuccess(res, 201, "Account created successfully", {
      token,
      user: {
        id: userId,
        email: signupType === "email" ? normalizedEmail : "",
        phone: signupType === "phone" ? normalizedPhone : "",
        name,
        auth_provider: "email",
        is_system_admin: false
      }
    });
  } catch (err) {
    await rollbackTransaction(conn, transactionStarted);
    transactionStarted = false;
    console.error("SIGNUP VERIFY OTP ERROR:", err);
    return sendError(res, 500, "Something went wrong");
  } finally {
    await rollbackTransaction(conn, transactionStarted);
    if (conn) conn.release();
  }
});

router.post("/login/request-otp", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const resolved = resolveLoginPayload(req.body);
    if (resolved.error) return sendError(res, resolved.error.status, resolved.error.message);
    const { loginType, identifier } = resolved;
    const ip = getClientMeta(req)?.ip_v4 || req.ip || "0.0.0.0";

    const user = await getUserByLoginType(conn, loginType, identifier, true);
    if (!user) return sendError(res, 401, "Invalid credentials");

    const identifierColumn = loginType === "email" ? "email" : "phone";
    const [[recentLogin]] = await conn.query(
      `SELECT COUNT(*) AS count FROM otps WHERE ${identifierColumn} = ? AND otp_purpose = 'login' AND created_at > NOW() - INTERVAL 30 SECOND`,
      [identifier]
    );
    if (recentLogin.count > 0) return sendError(res, 429, "Please wait before requesting another OTP");
    const [[ipRecent]] = await conn.query(SQL.OTP_IP_RATE_LIMIT("login"), [ip]);
    if (ipRecent.count > 5) return sendError(res, 429, "Too many OTP requests from this IP");
    const [[dailyLogin]] = await conn.query(SQL.OTP_DAILY_LIMIT(identifierColumn, "login"), [identifier]);
    if (dailyLogin.total >= 10) return sendError(res, 429, "Daily OTP limit reached");

    const otp = String(generateOTP());
    const otpHash = await hashPassword(String(otp));
    const expiry = new Date(Date.now() + 5 * 60 * 1000);
    await conn.query(`DELETE FROM otps WHERE email = ? AND otp_purpose = 'login' AND used_at IS NULL`, [identifier]);
    await conn.query(SQL.INSERT_OTP, [identifier, "", "login", otpHash, expiry, ip]);

    const otpEmailTo = loginType === "email" ? identifier : user.email?.toLowerCase()?.trim() || null;
    if (otpEmailTo) {
      try {
        await queueLoginOTPEmail({
          to: otpEmailTo,
          otp,
          userName: user.name || otpEmailTo || "User",
          fromEmail: EMAIL_USER,
          fromName: "OneAttendance",
          replyTo: EMAIL_USER
        });
      } catch (emailErr) {
        console.error("LOGIN OTP EMAIL QUEUE ERROR:", emailErr.message);
      }
    }
    const phoneTo = loginType === "phone" ? identifier : user.phone || null;
    if (phoneTo) {
      try { await sendOtpSms(phoneTo, otp); } catch (smsErr) { console.error("LOGIN OTP SMS ERROR:", smsErr.message); }
      try { await sendOtpWhatsApp(phoneTo, otp); } catch (waErr) { console.error("LOGIN OTP WHATSAPP ERROR:", waErr.message); }
    }

    return sendSuccess(res, 200, loginType === "email" ? "OTP sent to email" : otpEmailTo ? "OTP sent to registered email" : "OTP sent successfully");
  } catch (err) {
    console.error("LOGIN OTP ERROR:", err);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.post("/login/verify-otp", async (req, res) => {
  let conn, transactionStarted = false;
  try {
    conn = await db.getConnection();
    const { latitude, longitude, platform } = req.body || {};
    const resolved = resolveLoginPayload(req.body, { requireOtp: true });
    if (resolved.error) return sendError(res, resolved.error.status, resolved.error.message);
    const { loginType, identifier, otp: submittedOtp } = resolved;
    const normalizedPlatform = normalizePlatform(platform);
    if (!normalizedPlatform) return sendError(res, 400, "Valid platform is required (web/android/ios)");
    const coords = parseCoordinates(latitude, longitude);
    if (coords.error) return sendError(res, 400, coords.error);
    const { lat, lng } = coords;
    const meta = getClientMeta(req);

    await conn.beginTransaction();
    transactionStarted = true;

    const user = await getUserByLoginType(conn, loginType, identifier, true);
    if (!user) {
      await rollbackTransaction(conn, transactionStarted);
      return sendError(res, 401, "Invalid credentials");
    }
    const { record, error } = await verifyAndMarkOTP(conn, "email", identifier, "login", submittedOtp);
    if (error) {
      await rollbackTransaction(conn, transactionStarted);
      return sendError(res, 400, error);
    }
    await conn.query(SQL.MARK_OTP_VERIFIED, [record.id]);

    const token = generateSessionToken();
    const session = await createSession(conn, { userId: user.id, token, meta, platform: normalizedPlatform, lat, lng, authProvider: "email" });
    await conn.query(SQL.UPDATE_LAST_LOGIN, [user.id]);
    await conn.commit();
    transactionStarted = false;

    if (loginType === "email" && user.email) {
      await sendLoginAlert(user, session, req, normalizedPlatform);
    }

    return sendSuccess(res, 200, "Login successful", {
      token,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        profile_picture: user.profile_picture,
        auth_provider: "email",
        is_system_admin: Boolean(user.is_system_admin)
      }
    });
  } catch (err) {
    await rollbackTransaction(conn, transactionStarted);
    console.error("LOGIN VERIFY ERROR:", err);
    return sendError(res, 500, "Server error");
  } finally {
    await rollbackTransaction(conn, transactionStarted);
    if (conn) conn.release();
  }
});

router.post("/logout", auth(), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const userId = req.user?.id;
    const sessionId = req.session?.id;
    if (!userId || !sessionId) return sendError(res, 400, "Invalid session");

    const [result] = await conn.query(
      `UPDATE sessions SET is_active = 0, forced_logged_out = 0, forced_logged_out_by_id = NULL WHERE id = ? AND user_id = ? AND is_active = 1`,
      [sessionId, userId]
    );
    return sendSuccess(res, 200, result.affectedRows > 0 ? "Logged out successfully" : "Session already logged out");
  } catch (err) {
    console.error("Logout Error:", err);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.get("/sessions", auth(), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const userId = req.user?.id;
    if (!userId) return sendError(res, 400, "Invalid user");

    let { page = 1, limit = 10 } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
    const offset = (page - 1) * limit;

    const [[{ total }]] = await conn.query(SQL.GET_SESSIONS_BASE, [userId]);
    const [sessions] = await conn.query(SQL.GET_SESSIONS_DATA, [userId, limit, offset]);

    const data = sessions.map(s => ({
      id: s.id,
      device_name: s.device_name || "Unknown Device",
      ip_address: s.ip_v4 || s.ip_v6,
      location: { latitude: s.latitude, longitude: s.longitude },
      is_current: s.session_token === req.session?.token,
      last_active: s.last_used_at,
      expires_at: s.expires_at,
      login_at: s.created_at
    }));

    return sendSuccess(
      res,
      200,
      "Active sessions fetched successfully",
      data,
      {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
        is_last_page: offset + data.length >= total,
      }
    );
  } catch (err) {
    console.error("Get Sessions Error:", err);
    return sendError(res, 500, "Failed to fetch sessions");
  } finally {
    if (conn) conn.release();
  }
});

router.post("/logout-session", auth(), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const userId = req.user?.id;
    const currentSessionId = req.session?.id;
    const { session_id } = req.body;
    if (!session_id) return sendError(res, 400, "session_id is required");
    if (Number(session_id) === Number(currentSessionId)) return sendError(res, 400, "Use /logout for current session");

    const meta = getClientMeta(req);
    const [result] = await conn.query(SQL.LOGOUT_SESSION, [userId, meta.ip_v4, session_id, userId]);
    if (result.affectedRows === 0) return sendError(res, 404, "Session not found or already logged out");
    return sendSuccess(res, 200, "Device logged out successfully");
  } catch (err) {
    console.error("Logout Session Error:", err);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.post("/logout-all", auth(), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const userId = req.user?.id;
    const currentSessionId = req.session?.id;
    const [result] = await conn.query(SQL.LOGOUT_ALL_OTHER, [userId, userId, currentSessionId]);
    return sendSuccess(res, 200, "Logged out from all other devices", { affected_sessions: result.affectedRows });
  } catch (err) {
    console.error("Logout All Error:", err);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.post("/continue/google", async (req, res) => {
  let conn, transactionStarted = false;
  try {
    const { credential, platform, latitude, longitude } = req.body || {};
    if (!credential) return sendError(res, 400, "Google credential is required");
    const normalizedPlatform = normalizePlatform(platform);
    if (!normalizedPlatform) return sendError(res, 400, "Valid platform is required (web/android/ios)");
    const coords = parseCoordinates(latitude, longitude);
    if (coords.error) return sendError(res, 400, coords.error);
    const { lat, lng } = coords;

    const audiences = getGoogleAudiences();
    if (!audiences.length) return sendError(res, 500, "Google authentication unavailable");

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: audiences });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      console.log("GOOGLE VERIFY ERROR:", { message: verifyErr.message, platform: normalizedPlatform });
      return sendError(res, 401, "Invalid Google token");
    }
    if (!payload) return sendError(res, 401, "Unable to verify Google account");
    const email = payload.email?.toLowerCase()?.trim() || null;
    if (!email) return sendError(res, 400, "Google email missing");
    if (!payload.email_verified) return sendError(res, 403, "Google email not verified");

    const meta = getClientMeta(req);
    conn = await db.getConnection();
    let user = await getUserByLoginType(conn, "email", email, false);
    let isNewUser = false;
    let profilePicture = null;

    if (!user) {
      isNewUser = true;
      if (payload.picture) {
        try {
          const media = await saveMediaFromUrl({ url: payload.picture, folder: "profile_picture" });
          if (media?.success) profilePicture = media.file_url;
        } catch (mediaErr) {
          console.error("PROFILE IMAGE SAVE ERROR:", mediaErr.message);
        }
      }
    } else {
      if (!user.is_active) return sendError(res, 403, "Account disabled");
    }

    await conn.beginTransaction();
    transactionStarted = true;

    if (isNewUser) {
      const [insertResult] = await conn.query(SQL.INSERT_USER, [email, "", payload.name || null, profilePicture]);
      const [createdUsers] = await conn.query(SQL.USER_BY_ID, [insertResult.insertId]);
      user = createdUsers[0];
      try {
        await sendQueuedWelcomeEmail({
          to: email,
          userName: user.name || email || "User",
          dashboardUrl: FRONTEND_URL + "/home",
          fromEmail: EMAIL_USER,
          fromName: "OneAttendance",
          replyTo: EMAIL_USER
        });
      } catch (emailErr) {
        console.error("WELCOME EMAIL QUEUE ERROR:", emailErr.message);
      }
    } else {
      await conn.query(SQL.UPDATE_LAST_LOGIN, [user.id]);
      user.last_login = new Date();
    }

    const sessionToken = generateSessionToken();
    const session = await createSession(conn, { userId: user.id, token: sessionToken, meta, platform: normalizedPlatform, lat, lng, authProvider: "google" });
    await conn.commit();
    transactionStarted = false;

    if (!isNewUser) {
      await sendLoginAlert(user, session, req, normalizedPlatform);
    }

    return sendSuccess(res, 200, isNewUser ? "Google signup successful" : "Google login successful", {
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        profile_picture: user.profile_picture,
        auth_provider: "google",
        is_system_admin: Boolean(user.is_system_admin)
      }
    });
  } catch (err) {
    await rollbackTransaction(conn, transactionStarted);
    console.error("GOOGLE AUTH ERROR:", err);
    return sendError(res, 500, "Google authentication failed");
  } finally {
    await rollbackTransaction(conn, transactionStarted);
    if (conn) conn.release();
  }
});

router.post("/continue/facebook", async (req, res) => {
  let conn, transactionStarted = false;
  const rollback = async () => {
    await rollbackTransaction(conn, transactionStarted);
    transactionStarted = false;
  };
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionStarted = true;

    const { access_token, platform, latitude, longitude } = req.body;
    if (!access_token || typeof access_token !== "string") {
      await rollback();
      return sendError(res, 400, "Facebook access token is required");
    }
    const normalizedPlatform = normalizePlatform(platform);
    if (!normalizedPlatform) {
      await rollback();
      return sendError(res, 400, "Valid platform is required (web/android/ios)");
    }
    const coords = parseCoordinates(latitude, longitude);
    if (coords.error) {
      await rollback();
      return sendError(res, 400, coords.error);
    }
    const { lat, lng } = coords;

    let fbUser;
    try {
      const debugResp = await axios.get("https://graph.facebook.com/debug_token", {
        params: { input_token: access_token, access_token: `${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}` }
      });
      if (!debugResp?.data?.data?.is_valid) {
        await rollback();
        return sendError(res, 401, "Invalid Facebook token");
      }
      const userResp = await axios.get("https://graph.facebook.com/me", {
        params: { fields: "id,name,email,picture.type(large)", access_token }
      });
      fbUser = userResp.data;
    } catch (err) {
      console.error("FACEBOOK VERIFY ERROR:", err?.response?.data || err);
      await rollback();
      return sendError(res, 401, "Invalid Facebook token");
    }
    if (!fbUser) {
      await rollback();
      return sendError(res, 401, "Unable to verify Facebook account");
    }

    const email = fbUser.email?.toLowerCase()?.trim() || null;
    if (!email) {
      await rollback();
      return sendError(res, 400, "Facebook email missing");
    }

    const meta = getClientMeta(req);
    let user = await getUserByLoginType(conn, "email", email, false);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      let profilePicture = null;
      const pictureUrl = fbUser?.picture?.data?.url || null;
      if (pictureUrl) {
        try {
          const media = await saveMediaFromUrl({ url: pictureUrl, folder: "profile_picture" });
          if (media?.success) profilePicture = media.file_url;
        } catch (e) { }
      }
      const [insertResult] = await conn.query(SQL.INSERT_USER, [email, "", fbUser.name || null, profilePicture]);
      const [newUsers] = await conn.query(SQL.USER_BY_ID, [insertResult.insertId]);
      user = newUsers[0];
    } else {
      if (!user.is_active) {
        await rollback();
        return sendError(res, 403, "Account disabled");
      }
      await conn.query(SQL.UPDATE_LAST_LOGIN, [user.id]);
      user.last_login = new Date();
    }

    const sessionToken = generateSessionToken();
    await createSession(conn, { userId: user.id, token: sessionToken, meta, platform: normalizedPlatform, lat, lng, authProvider: "facebook" });
    await conn.commit();
    transactionStarted = false;

    return sendSuccess(res, 200, isNewUser ? "Facebook signup successful" : "Facebook login successful", { token: sessionToken });
  } catch (err) {
    await rollback();
    console.error("FACEBOOK LOGIN ERROR:", err);
    return sendError(res, 500, "Facebook authentication failed");
  } finally {
    if (conn) {
      if (transactionStarted) try { await conn.rollback(); } catch (_) { }
      conn.release();
    }
  }
});

router.post("/continue/truecaller", async (req, res) => {
  let conn, transactionStarted = false;
  try {
    const { code, code_verifier, platform, latitude, longitude } = req.body || {};
    if (!code || typeof code !== "string") return sendError(res, 400, "Truecaller authorization code is required");
    if (!code_verifier || typeof code_verifier !== "string") return sendError(res, 400, "Truecaller code_verifier is required");
    const normalizedPlatform = normalizePlatform(platform);
    if (!normalizedPlatform) return sendError(res, 400, "Valid platform is required (web/android/ios)");
    const coords = parseCoordinates(latitude, longitude);
    if (coords.error) return sendError(res, 400, coords.error);
    const { lat, lng } = coords;
    if (!TRUECALLER_CLIENT_ID) return sendError(res, 500, "Truecaller authentication unavailable");

    let accessToken;
    try {
      accessToken = await exchangeTruecallerToken(code, code_verifier);
    } catch (tokenErr) {
      console.error("TRUECALLER TOKEN ERROR:", tokenErr.response?.data || tokenErr.message);
      return sendError(res, 401, "Invalid or expired Truecaller authorization");
    }
    if (!accessToken) return sendError(res, 401, "Unable to get Truecaller access token");

    let profile;
    try {
      profile = await fetchTruecallerProfile(accessToken);
    } catch (profileErr) {
      console.error("TRUECALLER PROFILE ERROR:", profileErr.response?.data || profileErr.message);
      return sendError(res, 401, "Unable to fetch Truecaller profile");
    }
    const tcUser = mapTruecallerProfile(profile);
    if (!tcUser.phone) return sendError(res, 400, "Truecaller phone number missing");
    if (!tcUser.phoneVerified) return sendError(res, 403, "Truecaller phone number is not verified");

    const meta = getClientMeta(req);
    conn = await db.getConnection();
    let user = await getUserByLoginType(conn, "phone", tcUser.phone, false);
    let isNewUser = !user;

    if (user && !user.is_active) return sendError(res, 403, "Account disabled");

    let signupEmail = "";
    if (isNewUser && tcUser.email) {
      const [emailRows] = await conn.query(`SELECT id FROM users WHERE email = ? AND email <> '' AND is_deleted = 0 LIMIT 1`, [tcUser.email]);
      if (!emailRows.length) signupEmail = tcUser.email;
    }

    let profilePicture = user?.profile_picture || null;
    if (isNewUser && tcUser.pictureUrl) {
      try {
        const media = await saveMediaFromUrl({ url: tcUser.pictureUrl, folder: "profile_picture" });
        if (media?.success) profilePicture = media.file_url;
      } catch (mediaErr) {
        console.error("TRUECALLER PROFILE IMAGE ERROR:", mediaErr.message);
      }
    }

    await conn.beginTransaction();
    transactionStarted = true;

    if (isNewUser) {
      const [insertResult] = await conn.query(SQL.INSERT_USER, [signupEmail, tcUser.phone, tcUser.name, profilePicture]);
      const [newRows] = await conn.query(SQL.USER_BY_ID, [insertResult.insertId]);
      user = newRows[0];
    } else {
      await conn.query(SQL.UPDATE_LAST_LOGIN, [user.id]);
      user.last_login = new Date();
    }

    const sessionToken = generateSessionToken();
    await createSession(conn, { userId: user.id, token: sessionToken, meta, platform: normalizedPlatform, lat, lng, authProvider: "truecaller" });
    await conn.commit();
    transactionStarted = false;

    return sendSuccess(res, 200, isNewUser ? "Truecaller signup successful" : "Truecaller login successful", {
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        profile_picture: user.profile_picture,
        auth_provider: "truecaller",
        is_system_admin: Boolean(user.is_system_admin)
      }
    });
  } catch (err) {
    await rollbackTransaction(conn, transactionStarted);
    console.error("TRUECALLER AUTH ERROR:", err);
    return sendError(res, 500, "Truecaller authentication failed");
  } finally {
    await rollbackTransaction(conn, transactionStarted);
    if (conn) conn.release();
  }
});

export default router;
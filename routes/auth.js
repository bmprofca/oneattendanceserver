import express from "express";
import axios from "axios";
import db from "../config/db.js";
import {
  generateOTP, hashPassword, comparePassword, verifyOtpHash,
  generateSessionToken, generateRandomPassword
} from "../utils/auth.js";
import getClientMeta from "../utils/ipHelper.js";
import auth from "../middleware/authMiddleware.js";
import { OAuth2Client } from "google-auth-library";
import { saveMediaFromUrl } from "../utils/fileService.js";
import { sendSuccess, sendError } from "../utils/sendResponse.js";
import {
  queueSignupOTPEmail, queueLoginOTPEmail, queueForgotPasswordOTPEmail,
  sendQueuedWelcomeEmail, queueLoginAlertEmail
} from "../email/services/email.processor.js";
import { sendOtpSms } from "../utils/sms.js";
import { sendOtpWhatsApp } from "../utils/whatsapp.js";
import {
  WEB_GOOGLE_CLIENT_ID,
  APP_GOOGLE_CLIENT_ID,
  NODE_ENV,
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
  FRONTEND_URL,
  TRUECALLER_CLIENT_ID
} from "../config/config.js";

const router = express.Router();

if (!WEB_GOOGLE_CLIENT_ID) {
  throw new Error("WEB_GOOGLE_CLIENT_ID missing");
}

const googleClient = new OAuth2Client();

const getGoogleAudiences = () =>
  [WEB_GOOGLE_CLIENT_ID, APP_GOOGLE_CLIENT_ID].filter(Boolean);


const normalizePlatform = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const platform =
    value
      .toLowerCase()
      .trim();

  const allowedPlatforms = [
    "web",
    "android",
    "ios"
  ];

  return allowedPlatforms.includes(platform)
    ? platform
    : null;
};

const rollbackTransaction = async (conn, transactionStarted) => {
  if (!conn || !transactionStarted) {
    return;
  }

  try {
    await conn.rollback();
  } catch (_) {

  }
};

const normalizeLoginType = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const loginType =
    value
      .toLowerCase()
      .trim();

  if (loginType === "email") {
    return "email";
  }

  if (loginType === "phone" || loginType === "mobile") {
    return "phone";
  }

  return null;
};

const normalizePhone = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();

  if (!trimmed) {
    return null;
  }

  const digits = trimmed.replace(/\D/g, "");

  return digits.length >= 10
    ? digits
    : null;
};

const resolveLoginPayload = (
  body,
  { requirePassword = false, requireOtp = false } = {}
) => {
  const {
    login_type,
    phone,
    email,
    password,
    otp
  } = body || {};

  const loginType = normalizeLoginType(login_type);

  if (!loginType) {
    return {
      error: {
        status: 400,
        message: "Valid login_type is required (email/phone)"
      }
    };
  }

  if (requirePassword && !password) {
    return {
      error: {
        status: 400,
        message: "Password is required"
      }
    };
  }

  if (requireOtp && (otp === undefined || otp === null || otp === "")) {
    return {
      error: {
        status: 400,
        message: "OTP is required"
      }
    };
  }

  let identifier;

  if (loginType === "email") {
    if (!email || typeof email !== "string") {
      return {
        error: {
          status: 400,
          message: "Email is required"
        }
      };
    }

    identifier = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(identifier)) {
      return {
        error: {
          status: 400,
          message: "Invalid email format"
        }
      };
    }
  } else {
    if (phone === undefined || phone === null || phone === "") {
      return {
        error: {
          status: 400,
          message: "Phone is required"
        }
      };
    }

    identifier = normalizePhone(phone);

    if (!identifier) {
      return {
        error: {
          status: 400,
          message: "Invalid phone number"
        }
      };
    }
  }

  return {
    loginType,
    identifier,
    password,
    otp
  };
};

const normalizeSignupType = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const signupType =
    value
      .toLowerCase()
      .trim();

  if (signupType === "email") {
    return "email";
  }

  if (signupType === "phone" || signupType === "mobile") {
    return "phone";
  }

  return null;
};

const hasNonEmptyString = (value) =>
  typeof value === "string" && value.trim() !== "";

const resolveSignupPayload = (body) => {
  const {
    signup_type,
    email,
    phone,
    otp,
    password,
    name
  } = body || {};

  const signupType = normalizeSignupType(signup_type);

  if (!signupType) {
    return {
      error: {
        status: 400,
        message: "Valid signup_type is required (email/phone)"
      }
    };
  }

  if (!password) {
    return {
      error: {
        status: 400,
        message: "Password is required"
      }
    };
  }

  if (typeof password !== "string" || password.length < 6) {
    return {
      error: {
        status: 400,
        message: "Password must be at least 6 characters"
      }
    };
  }

  if (otp === undefined || otp === null || otp === "") {
    return {
      error: {
        status: 400,
        message: "OTP is required"
      }
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (signupType === "email") {
    if (!hasNonEmptyString(email)) {
      return {
        error: {
          status: 400,
          message: "Email is required for email signup"
        }
      };
    }

    if (hasNonEmptyString(phone)) {
      return {
        error: {
          status: 400,
          message: "Phone is not allowed for email signup. Use phone signup instead."
        }
      };
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!emailRegex.test(normalizedEmail)) {
      return {
        error: {
          status: 400,
          message: "Invalid email format"
        }
      };
    }

    return {
      signupType,
      normalizedEmail,
      normalizedPhone: "",
      password,
      otp,
      name: name?.trim() || null
    };
  }

  if (phone === undefined || phone === null || phone === "") {
    return {
      error: {
        status: 400,
        message: "Phone is required for phone signup"
      }
    };
  }

  if (hasNonEmptyString(email)) {
    return {
      error: {
        status: 400,
        message: "Email is not allowed for phone signup. Use email signup instead."
      }
    };
  }

  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    return {
      error: {
        status: 400,
        message: "Invalid phone number"
      }
    };
  }

  return {
    signupType,
    normalizedEmail: "",
    normalizedPhone,
    password,
    otp,
    name: name?.trim() || null
  };
};

const resolveSignupRequestPayload = (body) => {
  const { signup_type, email, phone } = body || {};

  const signupType = normalizeSignupType(signup_type);

  if (!signupType) {
    return {
      error: {
        status: 400,
        message: "Valid signup_type is required (email/phone)"
      }
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (signupType === "email") {
    if (!hasNonEmptyString(email)) {
      return {
        error: {
          status: 400,
          message: "Email is required for email signup"
        }
      };
    }

    if (hasNonEmptyString(phone)) {
      return {
        error: {
          status: 400,
          message: "Phone is not allowed for email signup. Use phone signup instead."
        }
      };
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!emailRegex.test(normalizedEmail)) {
      return {
        error: {
          status: 400,
          message: "Invalid email format"
        }
      };
    }

    return {
      signupType,
      normalizedEmail,
      normalizedPhone: "",
      otpEmail: normalizedEmail
    };
  }

  if (phone === undefined || phone === null || phone === "") {
    return {
      error: {
        status: 400,
        message: "Phone is required for phone signup"
      }
    };
  }

  if (hasNonEmptyString(email)) {
    return {
      error: {
        status: 400,
        message: "Email is not allowed for phone signup. Use email signup instead."
      }
    };
  }

  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    return {
      error: {
        status: 400,
        message: "Invalid phone number"
      }
    };
  }

  return {
    signupType,
    normalizedEmail: "",
    normalizedPhone,
    otpEmail: ""
  };
};

const getSignupOtpRateLimitColumn = (signupType) =>
  signupType === "phone"
    ? "phone"
    : "email";

const DEFAULT_SIGNUP_OTP = "123456";

const parseOptionalCoordinates = (latitude, longitude) => {
  const lat =
    latitude !== undefined && latitude !== null && latitude !== ""
      ? Number(latitude)
      : null;

  const lng =
    longitude !== undefined && longitude !== null && longitude !== ""
      ? Number(longitude)
      : null;

  if ((lat !== null && lng === null) || (lat === null && lng !== null)) {
    return {
      error: "Both latitude and longitude must be provided together"
    };
  }

  if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) {
    return { error: "Invalid latitude" };
  }

  if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) {
    return { error: "Invalid longitude" };
  }

  return { lat, lng };
};

const normalizeForgotType = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const forgotType =
    value
      .toLowerCase()
      .trim();

  if (forgotType === "email") {
    return "email";
  }

  if (
    forgotType === "phone" ||
    forgotType === "mobile"
  ) {
    return "phone";
  }

  return null;
};

const resolveForgotPasswordPayload = (
  body,
  {
    requireOtp = false,
    requirePassword = false
  } = {}
) => {

  const {
    forgot_type,
    email,
    phone,
    otp,
    new_password
  } = body || {};

  const forgotType =
    normalizeForgotType(forgot_type);

  if (!forgotType) {
    return {
      error: {
        status: 400,
        message:
          "Valid forgot_type is required (email/phone)"
      }
    };
  }

  if (
    requireOtp &&
    (
      otp === undefined ||
      otp === null ||
      otp === ""
    )
  ) {
    return {
      error: {
        status: 400,
        message: "OTP is required"
      }
    };
  }

  if (
    requirePassword &&
    !new_password
  ) {
    return {
      error: {
        status: 400,
        message: "new_password is required"
      }
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let identifier;

  if (forgotType === "email") {

    if (
      !email ||
      typeof email !== "string"
    ) {
      return {
        error: {
          status: 400,
          message: "Email is required"
        }
      };
    }

    identifier =
      email
        .trim()
        .toLowerCase();

    if (
      !emailRegex.test(identifier)
    ) {
      return {
        error: {
          status: 400,
          message: "Invalid email format"
        }
      };
    }

  } else {

    if (
      phone === undefined ||
      phone === null ||
      phone === ""
    ) {
      return {
        error: {
          status: 400,
          message: "Phone is required"
        }
      };
    }

    identifier =
      normalizePhone(phone);

    if (!identifier) {
      return {
        error: {
          status: 400,
          message: "Invalid phone number"
        }
      };
    }
  }

  if (
    requirePassword &&
    (
      typeof new_password !== "string" ||
      new_password.length < 6
    )
  ) {
    return {
      error: {
        status: 400,
        message:
          "Password must be at least 6 characters"
      }
    };
  }

  return {
    forgotType,
    identifier,
    otp,
    new_password
  };
};


router.post("/signup/request-otp", async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const resolved = resolveSignupRequestPayload(req.body);

    if (resolved.error) {
      return sendError(
        res,
        resolved.error.status,
        resolved.error.message
      );
    }

    const {
      signupType,
      normalizedEmail,
      normalizedPhone,
      otpEmail
    } = resolved;

    const rateLimitColumn = getSignupOtpRateLimitColumn(signupType);
    const rateLimitValue =
      signupType === "phone"
        ? normalizedPhone
        : normalizedEmail;

    const clientMeta = getClientMeta(req);

    const ip =
      clientMeta?.ip_v4 ||
      clientMeta?.ip_v6 ||
      "unknown";

    const existingUserSql =
      signupType === "email"
        ? `email = ?`
        : `phone = ?`;

    const existingUserParams =
      signupType === "email"
        ? [normalizedEmail]
        : [normalizedPhone];

    const [existingUser] = await conn.query(
      `
      SELECT id
      FROM users
      WHERE ${existingUserSql}
        AND is_deleted = 0
      LIMIT 1
      `,
      existingUserParams
    );

    if (existingUser.length > 5000) {
      return sendError(
        res,
        409,
        signupType === "email"
          ? "Email already registered. Please login."
          : "Phone already registered. Please login."
      );
    }

    const [[emailRecent]] = await conn.query(
      `
      SELECT COUNT(*) AS count
      FROM otps
      WHERE ${rateLimitColumn} = ?
        AND otp_purpose = 'signup'
        AND created_at > NOW() - INTERVAL 30 SECOND
      `,
      [rateLimitValue]
    );

    if (emailRecent.count > 50000) {
      return sendError(res, 429, "Wait 30 seconds before requesting another OTP");
    }

    const [[ipRecent]] = await conn.query(
      `
      SELECT COUNT(*) AS count
      FROM otps
      WHERE ip_address = ?
        AND otp_purpose = 'signup'
        AND created_at > NOW() - INTERVAL 30 SECOND
      `,
      [ip]
    );

    if (ipRecent.count > 50000) {
      return sendError(res, 429, "Too many requests from this IP. Try again later.");
    }

    const [[comboRecent]] = await conn.query(
      `
      SELECT COUNT(*) AS count
      FROM otps
      WHERE ${rateLimitColumn} = ?
        AND ip_address = ?
        AND otp_purpose = 'signup'
        AND created_at > NOW() - INTERVAL 60 SECOND
      `,
      [rateLimitValue, ip]
    );

    if (comboRecent.count > 50000) {
      return sendError(res, 429, "Too many attempts. Please wait a minute.");
    }

    const [[dailyEmail]] = await conn.query(
      `
      SELECT COUNT(*) AS count
      FROM otps
      WHERE ${rateLimitColumn} = ?
        AND otp_purpose = 'signup'
        AND created_at > NOW() - INTERVAL 1 DAY
      `,
      [rateLimitValue]
    );

    if (dailyEmail.count >= 50000) {
      return sendError(res, 429, "Daily OTP limit reached");
    }

    const [[dailyIp]] = await conn.query(
      `
      SELECT COUNT(*) AS count
      FROM otps
      WHERE ip_address = ?
        AND otp_purpose = 'signup'
        AND created_at > NOW() - INTERVAL 1 DAY
      `,
      [ip]
    );

    if (dailyIp.count >= 50000) {
      return sendError(res, 429, "Too many OTP requests from this IP today");
    }

    const otp = DEFAULT_SIGNUP_OTP;

    const otpHash = await hashPassword(otp);

    const otpExpiry = new Date(
      Date.now() + 5 * 60 * 1000
    );

    const invalidateOtpSql =
      signupType === "phone"
        ? `phone = ? AND otp_purpose = 'signup' AND used_at IS NULL`
        : `email = ? AND otp_purpose = 'signup' AND used_at IS NULL`;

    const invalidateOtpParams =
      signupType === "phone"
        ? [normalizedPhone]
        : [otpEmail];

    await conn.query(
      `
      UPDATE otps
      SET used_at = NOW()
      WHERE ${invalidateOtpSql}
      `,
      invalidateOtpParams
    );

    await conn.query(
      `
      INSERT INTO otps (
        email,
        phone,
        otp_purpose,
        otp_hash,
        otp_expiry,
        used_at,
        ip_address
      )
      VALUES (?, ?, 'signup', ?, ?, NULL, ?)
      `,
      [
        otpEmail,
        normalizedPhone,
        otpHash,
        otpExpiry,
        ip
      ]
    );

    console.log(
      `Sign Up OTP (${signupType}) for ${signupType === "email" ? normalizedEmail : normalizedPhone}:`,
      otp
    );

    if (signupType === "email" && normalizedEmail) {
      try {
        await queueSignupOTPEmail({
          to: normalizedEmail,
          userName: normalizedEmail || "User",
          otp,
        });
      } catch (emailErr) {
        console.error("SIGNUP OTP EMAIL QUEUE ERROR:", emailErr.message);
        return sendError(res, 500, "Failed to send signup OTP email");
      }
    } else if (signupType === "phone" && normalizedPhone) {
      try {
        await sendOtpSms(normalizedPhone, otp);
      } catch (smsErr) {
        console.error("SIGNUP OTP SMS ERROR:", smsErr.message);
      }
      try {
        await sendOtpWhatsApp(normalizedPhone, otp);
      } catch (waErr) {
        console.error("SIGNUP OTP WHATSAPP ERROR:", waErr.message);
      }
    }

    const successMessage =
      signupType === "email"
        ? "OTP sent to email"
        : "OTP sent successfully";

    return sendSuccess(res, 200, successMessage);
  } catch (err) {
    console.error(
      "SIGNUP REQUEST OTP ERROR:",
      err
    );

    return sendError(res, 500, "Something went wrong");
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.post("/signup/verify-otp", async (req, res) => {
  let conn;
  let transactionStarted = false;

  try {
    conn = await db.getConnection();

    const {
      platform,
      latitude,
      longitude
    } = req.body || {};

    const resolved = resolveSignupPayload(req.body);

    if (resolved.error) {
      return sendError(
        res,
        resolved.error.status,
        resolved.error.message
      );
    }

    const {
      signupType,
      normalizedEmail,
      normalizedPhone,
      password,
      otp: submittedOtp,
      name
    } = resolved;

    const normalizedPlatform = normalizePlatform(platform);

    if (!normalizedPlatform) {
      return sendError(res, 400, "Valid platform is required (web/android/ios)");
    }

    const coords = parseOptionalCoordinates(latitude, longitude);

    if (coords.error) {
      return sendError(res, 400, coords.error);
    }

    const { lat, lng } = coords;

    const meta = getClientMeta(req);

    const otpLookupSql =
      signupType === "phone"
        ? `
          phone = ?
          AND otp_purpose = 'signup'
          AND used_at IS NULL
        `
        : `
          email = ?
          AND otp_purpose = 'signup'
          AND used_at IS NULL
        `;

    const otpLookupParams =
      signupType === "phone"
        ? [normalizedPhone]
        : [normalizedEmail];

    await conn.beginTransaction();
    transactionStarted = true;

    const [otpRows] = await conn.query(
      `
      SELECT
        id,
        otp_hash,
        otp_expiry,
        is_verified,
        used_at
      FROM otps
      WHERE ${otpLookupSql}
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
      `,
      otpLookupParams
    );

    if (!otpRows.length) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return sendError(res, 400, "OTP not found");
    }

    const record = otpRows[0];

    if (record.is_verified) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return sendError(res, 400, "OTP already used");
    }

    if (new Date() > new Date(record.otp_expiry)) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return sendError(res, 400, "OTP expired");
    }

    const isOtpValid =
      await verifyOtpHash(submittedOtp, record.otp_hash);

    if (!isOtpValid) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return sendError(res, 400, "Invalid OTP");
    }

    const existingUserSql =
      signupType === "email"
        ? `email = ?`
        : `phone = ?`;

    const existingUserParams =
      signupType === "email"
        ? [normalizedEmail]
        : [normalizedPhone];

    const [existingUsers] = await conn.query(
      `
      SELECT id
      FROM users
      WHERE ${existingUserSql}
        AND is_deleted = 0
      LIMIT 1
      `,
      existingUserParams
    );

    if (existingUsers.length) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return sendError(
        res,
        409,
        signupType === "email"
          ? "Email already registered"
          : "Phone already registered"
      );
    }

    const hashedPassword = await hashPassword(password);

    let result;

    try {
      [result] = await conn.query(
        `
        INSERT INTO users (email, password, name, phone)
        VALUES (?, ?, ?, ?)
        `,
        [
          normalizedEmail,
          hashedPassword,
          name,
          normalizedPhone
        ]
      );
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        await rollbackTransaction(conn, transactionStarted);
        transactionStarted = false;
        return sendError(res, 409, "Email or phone already registered");
      }

      throw err;
    }

    const userId = result.insertId;

    await conn.query(
      `
      UPDATE otps
      SET is_verified = 1,
          verified_at = NOW(),
          used_at = NOW()
      WHERE id = ?
      `,
      [record.id]
    );

    const token = generateSessionToken();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await conn.query(
      `
      INSERT INTO sessions
      (user_id, session_token, ip_v4, ip_v6, latitude, longitude, auth_provider, platform, device_name, expires_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'email', ?, ?, ?, ?)
      `,
      [
        userId,
        token,
        meta.ip_v4,
        meta.ip_v6,
        lat,
        lng,
        normalizedPlatform,
        meta.device_name,
        expiresAt,
        userId
      ]
    );

    await conn.commit();
    transactionStarted = false;

    if (signupType === "email" && normalizedEmail) {
      try {
        await sendQueuedWelcomeEmail({
          to: normalizedEmail,
          userName: name || normalizedEmail || "User",
          dashboardUrl: FRONTEND_URL + "/home",
        });
      } catch (emailErr) {
        console.error("WELCOME EMAIL QUEUE ERROR:", emailErr.message);
      }
    }

    return sendSuccess(
      res,
      201,
      "Account created successfully",
      {
        token,
        user: {
          id: userId,
          email: signupType === "email" ? normalizedEmail : "",
          phone: signupType === "phone" ? normalizedPhone : "",
          name,
          auth_provider: "email",
          is_system_admin: false
        }
      }
    );
  } catch (err) {
    await rollbackTransaction(conn, transactionStarted);
    transactionStarted = false;

    console.error("SIGNUP VERIFY OTP ERROR:", err);

    return sendError(res, 500, "Something went wrong");
  } finally {
    await rollbackTransaction(conn, transactionStarted);

    if (conn) {
      conn.release();
    }
  }
});

router.post("/login/request-otp", async (req, res) => {
  let conn;

  try {

    conn = await db.getConnection();

    const resolved = resolveLoginPayload(req.body, {
      requirePassword: true
    });

    if (resolved.error) {
      return sendError(
        res,
        resolved.error.status,
        resolved.error.message
      );
    }

    const {
      loginType,
      identifier,
      password
    } = resolved;

    const clientMeta = getClientMeta(req);

    const ip =
      clientMeta?.ip_v4 ||
      req.ip ||
      "0.0.0.0";

    const userLookupSql =
      loginType === "email"
        ? "email = ?"
        : "phone = ?";

    const [users] = await conn.query(
      `
      SELECT
        id,
        email,
        phone,
        password,
        name,
        is_active,
        is_deleted
      FROM users
      WHERE ${userLookupSql}
        AND is_deleted = 0
        AND is_active = 1
      LIMIT 1
      `,
      [identifier]
    );

    if (!users.length) {
      return sendError(res, 401, "Invalid credentials");
    }

    const user = users[0];

    const isPasswordValid =
      await comparePassword(
        password,
        user.password
      );

    if (!isPasswordValid) {
      return sendError(res, 401, "Invalid credentials");
    }

    const [[emailRecent]] =
      await conn.query(
        `
        SELECT COUNT(*) AS count
        FROM otps
        WHERE email = ?
          AND otp_purpose = 'login'
          AND created_at >
              NOW() - INTERVAL 30 SECOND
        `,
        [identifier]
      );

    if (emailRecent.count > 5000) {
      return sendError(
        res,
        429,
        "Please wait before requesting another OTP"
      );
    }

    const [[ipRecent]] =
      await conn.query(
        `
        SELECT COUNT(*) AS count
        FROM otps
        WHERE ip_address = ?
          AND otp_purpose = 'login'
          AND created_at >
              NOW() - INTERVAL 30 SECOND
        `,
        [ip]
      );

    if (ipRecent.count > 5000) {
      return sendError(
        res,
        429,
        "Too many OTP requests from this IP"
      );
    }


    const otp = "123456";

    const otpHash =
      await hashPassword(String(otp));

    const otpExpiry =
      new Date(
        Date.now() + 5 * 60 * 1000
      );

    await conn.query(
      `
      DELETE FROM otps
      WHERE email = ?
        AND otp_purpose = 'login'
        AND used_at IS NULL
      `,
      [identifier]
    );

    await conn.query(
      `
      INSERT INTO otps (
        email,
        otp_purpose,
        otp_hash,
        otp_expiry,
        used_at,
        ip_address
      )
      VALUES (
        ?,
        'login',
        ?,
        ?,
        NULL,
        ?
      )
      `,
      [
        identifier,
        otpHash,
        otpExpiry,
        ip
      ]
    );

    const otpEmailTo =
      loginType === "email"
        ? identifier
        : user.email?.toLowerCase()?.trim() || null;

    const successMessage =
      loginType === "email"
        ? "OTP sent to email"
        : otpEmailTo
          ? "OTP sent to registered email"
          : "OTP sent successfully";

    if (otpEmailTo) {
      try {
        await queueLoginOTPEmail({
          to: otpEmailTo,
          otp,
          userName: user.name || otpEmailTo || "User"
        });
      } catch (emailErr) {
        console.error("LOGIN OTP EMAIL QUEUE ERROR:", emailErr.message);
      }
    }

    const phoneTo = loginType === "phone" ? identifier : user.phone || null;
    if (phoneTo) {
      try {
        await sendOtpSms(phoneTo, otp);
      } catch (smsErr) {
        console.error("LOGIN OTP SMS ERROR:", smsErr.message);
      }
      try {
        await sendOtpWhatsApp(phoneTo, otp);
      } catch (waErr) {
        console.error("LOGIN OTP WHATSAPP ERROR:", waErr.message);
      }
    }

    if (process.env.NODE_ENV !== "production") {
      console.log(`🔐 LOGIN OTP for ${identifier}: ${otp}`);
    }

    return sendSuccess(res, 200, successMessage);

  } catch (error) {

    console.error(
      "LOGIN OTP ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Internal server error"
    );

  } finally {

    if (conn) {
      conn.release();
    }
  }
});

router.post("/login/verify-otp", async (req, res) => {
  let conn;
  let transactionStarted = false;

  try {
    conn = await db.getConnection();

    const {
      latitude,
      longitude,
      platform
    } = req.body || {};

    const resolved = resolveLoginPayload(req.body, {
      requirePassword: true,
      requireOtp: true
    });

    if (resolved.error) {
      return res.status(resolved.error.status).json({
        success: false,
        message: resolved.error.message
      });
    }

    const {
      loginType,
      identifier,
      password,
      otp: submittedOtp
    } = resolved;

    const normalizedPlatform = normalizePlatform(platform);

    if (!normalizedPlatform) {
      return res.status(400).json({
        success: false,
        message: "Valid platform is required (web/android/ios)"
      });
    }

    const lat =
      latitude !== undefined && latitude !== null && latitude !== ""
        ? Number(latitude)
        : null;

    const lng =
      longitude !== undefined && longitude !== null && longitude !== ""
        ? Number(longitude)
        : null;

    if ((lat !== null && lng === null) || (lat === null && lng !== null)) {
      return res.status(400).json({
        success: false,
        message: "Both latitude and longitude required together"
      });
    }

    if (lat !== null && (isNaN(lat) || lat < -90 || lat > 90)) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude"
      });
    }

    if (lng !== null && (isNaN(lng) || lng < -180 || lng > 180)) {
      return res.status(400).json({
        success: false,
        message: "Invalid longitude"
      });
    }

    const meta = getClientMeta(req);

    await conn.beginTransaction();
    transactionStarted = true;

    const userLookupSql =
      loginType === "email"
        ? "email = ?"
        : "phone = ?";

    const [users] = await conn.query(
      `
      SELECT
        id,
        email,
        phone,
        password,
        name,
        profile_picture,
        is_system_admin,
        is_active,
        is_deleted
      FROM users
      WHERE ${userLookupSql}
        AND is_deleted = 0
        AND is_active = 1
      LIMIT 1
      `,
      [identifier]
    );

    if (!users.length) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const user = users[0];

    const isPasswordValid =
      await comparePassword(
        password,
        user.password
      );

    if (!isPasswordValid) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const [otpRows] = await conn.query(
      `
      SELECT
        id,
        otp_hash,
        otp_expiry,
        is_verified
      FROM otps
      WHERE email = ?
        AND otp_purpose = 'login'
        AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
      `,
      [identifier]
    );

    if (!otpRows.length) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "OTP not found"
      });
    }

    const record = otpRows[0];

    if (record.is_verified) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "OTP already used"
      });
    }

    if (new Date() > new Date(record.otp_expiry)) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "OTP expired"
      });
    }

    const isOtpValid =
      await verifyOtpHash(submittedOtp, record.otp_hash);

    if (!isOtpValid) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    await conn.query(
      `UPDATE otps
       SET is_verified = 1,
           verified_at = NOW(),
           used_at = NOW()
       WHERE id = ?`,
      [record.id]
    );

    const token = generateSessionToken();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [sessionResult] = await conn.query(
      `INSERT INTO sessions
       (user_id, session_token, ip_v4, ip_v6, latitude, longitude, auth_provider, platform, device_name, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'email', ?, ?, ?, ?)`,
      [
        user.id,
        token,
        meta.ip_v4,
        meta.ip_v6,
        lat,
        lng,
        normalizedPlatform,
        meta.device_name,
        expiresAt,
        user.id
      ]
    );

    const session = {
      ip_v4: meta.ip_v4,
      ip_v6: meta.ip_v6,
      latitude: lat,
      longitude: lng,
      device_name: meta.device_name,
      user_agent: req.headers["user-agent"] || "",
      platform: normalizedPlatform
    };

    await conn.query(
      `UPDATE users
       SET last_login = NOW(),
           updated_at = NOW(),
           updated_by = ?
       WHERE id = ?`,
      [user.id, user.id]
    );

    await conn.commit();
    transactionStarted = false;

    if (loginType === "email" && user.email) {
      try {
        await queueLoginAlertEmail({
          to: user.email,
          userName: user.name || user.email || "User",
          session,
          dashboardUrl: FRONTEND_URL + "/settings?tab=security",
        });
      } catch (emailErr) {
        console.error("LOGIN ALERT EMAIL QUEUE ERROR:", emailErr.message);
      }
    }

    return res.json({
      success: true,
      message: "Login successful",
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
    transactionStarted = false;

    console.error("LOGIN VERIFY ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  } finally {
    await rollbackTransaction(conn, transactionStarted);

    if (conn) {
      conn.release();
    }
  }
});

router.post("/forgot-password/request-otp", async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const resolved = resolveForgotPasswordPayload(req.body);

    if (resolved.error) {
      return sendError(
        res,
        resolved.error.status,
        resolved.error.message
      );
    }

    const { forgotType, identifier } = resolved;

    const ip =
      getClientMeta(req)?.ip_v4 ||
      req.ip ||
      "0.0.0.0";

    const [users] =
      await conn.query(
        `
          SELECT id
          FROM users
          WHERE ${forgotType === "email" ? "email" : "phone"} = ?
            AND is_deleted = 0
            AND is_active = 1
          LIMIT 1
          `,
        [identifier]
      );

    if (!users.length) {
      return sendError(res, 404, `User not found`);
    }

    const [[cooldown]] =
      await conn.query(
        `
          SELECT COUNT(*) AS total
          FROM otps
          WHERE ${forgotType === "email" ? "email" : "phone"} = ?
            AND otp_purpose = 'forgot_password'
            AND created_at >
              NOW() - INTERVAL 30 SECOND
          `,
        [identifier]
      );

    if (cooldown.total > 0) {
      return sendError(res, 429, "Please wait 30 seconds before requesting another OTP");
    }

    const [[ipCooldown]] =
      await conn.query(
        `
          SELECT COUNT(*) AS total
          FROM otps
          WHERE ip_address = ?
            AND otp_purpose = 'forgot_password'
            AND created_at >
              NOW() - INTERVAL 30 SECOND
          `,
        [ip]
      );

    if (ipCooldown.total > 0) {
      return sendError(res, 429, "Too many OTP requests from this IP. Please wait before retrying.");
    }

    const [[dailyLimit]] =
      await conn.query(
        `
          SELECT COUNT(*) AS total
          FROM otps
          WHERE ${forgotType === "email" ? "email" : "phone"} = ?
            AND otp_purpose = 'forgot_password'
            AND created_at >
              NOW() - INTERVAL 1 DAY
          `,
        [identifier]
      );

    if (
      dailyLimit.total >= 10
    ) {
      return sendError(res, 429, `Daily OTP request limit reached for this ${forgotType}`);
    }

    const [[dailyIpLimit]] =
      await conn.query(
        `
          SELECT COUNT(*) AS total
          FROM otps
          WHERE ip_address = ?
            AND otp_purpose = 'forgot_password'
            AND created_at >
              NOW() - INTERVAL 1 DAY
          `,
        [ip]
      );

    if (
      dailyIpLimit.total >= 20
    ) {
      return sendError(res, 429, "Too many OTP requests from this IP today");
    }

    const otp =
      String(generateOTP());

    const otpHash =
      await hashPassword(otp);

    const expiry =
      new Date(
        Date.now() +
        5 * 60 * 1000
      );

    await conn.query(
      `
        INSERT INTO otps (
          email,
          phone,
          otp_purpose,
          otp_hash,
          otp_expiry,
          is_verified,
          verified_at,
          used_at,
          ip_address
        )
        VALUES (
          ?,
          ?,
          'forgot_password',
          ?,
          ?,
          0,
          NULL,
          NULL,
          ?
        )
        `,
      [
        forgotType === "email" ? identifier : "",
        forgotType === "phone" ? identifier : "",
        otpHash,
        expiry,
        ip
      ]
    );

    console.log("Forget Password OTP:", otp);

    if (forgotType === "email" && identifier) {
      try {
        await queueForgotPasswordOTPEmail({
          to: identifier,
          userName: "User",
          otp,
        });
      } catch (emailErr) {
        console.error("FORGOT PASSWORD OTP EMAIL QUEUE ERROR:", emailErr.message);
        return sendError(res, 500, "Failed to send forgot password OTP email");
      }
    } else if (forgotType === "phone" && identifier) {
      try {
        console.log("forget sms paass", identifier, otp)
        await sendOtpSms(identifier, otp);
      } catch (smsErr) {
        console.error("FORGOT PASSWORD OTP SMS ERROR:", smsErr.message);
      }
      try {
        console.log("forget wha paass", identifier, otp)
        await sendOtpWhatsApp(identifier, otp);
      } catch (waErr) {
        console.error("FORGOT PASSWORD OTP WHATSAPP ERROR:", waErr.message);
      }
    }

    return sendSuccess(res, 200, `If this ${forgotType} is registered, an OTP has been sent`);
  } catch (err) {
    console.error(
      "FORGOT PASSWORD REQUEST OTP ERROR:",
      err
    );

    if (
      err.code ===
      "ER_CON_COUNT_ERROR"
    ) {
      return sendError(res, 503, "Database temporarily unavailable");
    }

    if (
      err.code ===
      "PROTOCOL_CONNECTION_LOST"
    ) {
      return sendError(res, 503, "Database connection lost");
    }

    return sendError(res, 500, "Something went wrong while processing OTP request");
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.post("/forgot-password/verify-otp", async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const resolved = resolveForgotPasswordPayload(req.body, { requireOtp: true });

    if (resolved.error) {
      return res.status(resolved.error.status).json({
        success: false,
        message: resolved.error.message
      });
    }

    const { forgotType, identifier, otp: submittedOtp } = resolved;

    await conn.beginTransaction();

    const [otpRows] = await conn.query(
      `SELECT *
       FROM otps
       WHERE ${forgotType === "email" ? "email" : "phone"} = ?
         AND otp_purpose = 'forgot_password'
         AND used_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [identifier]
    );

    if (!otpRows.length) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "OTP not found"
      });
    }

    const record = otpRows[0];

    if (record.is_verified) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "OTP already verified"
      });
    }

    if (new Date() > new Date(record.otp_expiry)) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "OTP expired"
      });
    }

    const isOtpValid = await verifyOtpHash(submittedOtp, record.otp_hash);

    if (!isOtpValid) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    await conn.query(
      `UPDATE otps
       SET is_verified = 1,
           verified_at = NOW()
       WHERE id = ?`,
      [record.id]
    );

    await conn.commit();

    return res.json({
      success: true,
      message: "OTP verified successfully",
      verified: true
    });
  } catch (err) {
    if (conn) await conn.rollback();

    console.error("FORGOT PASSWORD VERIFY ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Something went wrong"
    });
  } finally {
    if (conn) conn.release();
  }
});

router.post("/forgot-password/reset", async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const resolved = resolveForgotPasswordPayload(req.body);

    if (resolved.error) {
      return res.status(resolved.error.status).json({
        success: false,
        message: resolved.error.message
      });
    }

    const { forgotType, identifier } = resolved;
    const { new_password } = req.body;

    if (!new_password) {
      return res.status(400).json({
        success: false,
        message: "new_password is required"
      });
    }

    if (typeof new_password !== "string" || new_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters"
      });
    }

    await conn.beginTransaction();

    const [otpRows] = await conn.query(
      `SELECT *
       FROM otps
       WHERE ${forgotType === "email" ? "email" : "phone"} = ?
         AND otp_purpose = 'forgot_password'
         AND is_verified = 1
         AND used_at IS NULL
       ORDER BY verified_at DESC, created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [identifier]
    );

    if (!otpRows.length) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "OTP verification required"
      });
    }

    const record = otpRows[0];

    if (new Date() > new Date(record.otp_expiry)) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "OTP expired"
      });
    }

    const [users] = await conn.query(
      `SELECT id
       FROM users
       WHERE ${forgotType === "email" ? "email" : "phone"} = ?
         AND is_deleted = 0
         AND is_active = 1
       LIMIT 1
       FOR UPDATE`,
      [identifier]
    );

    if (!users.length) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid request"
      });
    }

    const user = users[0];
    const hashedPassword = await hashPassword(new_password);

    await conn.query(
      `UPDATE users
       SET password = ?,
           updated_by = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [hashedPassword, user.id, user.id]
    );

    await conn.query(
      `UPDATE otps
       SET used_at = NOW()
       WHERE id = ?`,
      [record.id]
    );

    await conn.query(
      `UPDATE sessions
       SET is_active = 0,
           forced_logged_out = 1,
           forced_logged_out_by_id = ?
       WHERE user_id = ?
         AND is_active = 1`,
      [user.id, user.id]
    );

    await conn.commit();

    return res.json({
      success: true,
      message: "Password reset successfully. Please login again."
    });
  } catch (err) {
    if (conn) await conn.rollback();

    console.error("PASSWORD RESET ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Something went wrong"
    });
  } finally {
    if (conn) conn.release();
  }
});

router.post("/logout", auth(), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const user_id = req.user?.id;
    const session_id = req.session?.id;

    if (!user_id || !session_id) {
      return res.status(400).json({
        success: false,
        message: "Invalid session"
      });
    }

    const [result] = await conn.query(
      `UPDATE sessions
       SET is_active = 0,
           forced_logged_out = 0,
           forced_logged_out_by_id = NULL
       WHERE id = ?
         AND user_id = ?
         AND is_active = 1`,
      [session_id, user_id]
    );

    return res.json({
      success: true,
      message:
        result.affectedRows > 0
          ? "Logged out successfully"
          : "Session already logged out"
    });
  } catch (err) {
    console.error("Logout Error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  } finally {
    if (conn) conn.release();
  }
});

router.get("/sessions", auth(), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const user_id = req.user?.id;
    const current_token = req.session?.token;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "Invalid user"
      });
    }

    let { page = 1, limit = 10 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    page = !isNaN(page) && page > 0 ? page : 1;
    limit = !isNaN(limit) && limit > 0 ? limit : 10;
    if (limit > 100) limit = 100;

    const offset = (page - 1) * limit;
    const baseParams = [user_id];

    const baseQuery = `
      FROM sessions
      WHERE user_id = ?
        AND is_active = 1
        AND forced_logged_out = 0
        AND expires_at > NOW()
    `;

    const [[countResult]] = await conn.query(
      `SELECT COUNT(*) AS total ${baseQuery}`,
      baseParams
    );

    const total = countResult.total || 0;

    const [sessions] = await conn.query(
      `SELECT
         id,
         session_token,
         ip_v4,
         ip_v6,
         latitude,
         longitude,
         device_name,
         expires_at,
         last_used_at,
         created_at
       ${baseQuery}
       ORDER BY last_used_at DESC
       LIMIT ? OFFSET ?`,
      [...baseParams, limit, offset]
    );

    const data = sessions.map((s) => ({
      id: s.id,
      device_name: s.device_name || "Unknown Device",
      ip_address: s.ip_v4 || s.ip_v6,
      location: {
        latitude: s.latitude,
        longitude: s.longitude
      },
      is_current: s.session_token === current_token,
      last_active: s.last_used_at,
      expires_at: s.expires_at,
      login_at: s.created_at
    }));

    return res.status(200).json({
      success: true,
      message: "Active sessions fetched successfully",
      sessions: data,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
        is_last_page: offset + data.length >= total
      }
    });
  } catch (err) {
    console.error("Get Sessions Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch sessions"
    });
  } finally {
    if (conn) conn.release();
  }
});

router.post("/logout-session", auth(), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const user_id = req.user?.id;
    const current_session_id = req.session?.id;
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        success: false,
        message: "session_id is required"
      });
    }

    if (Number(session_id) === Number(current_session_id)) {
      return res.status(400).json({
        success: false,
        message: "Use /logout for current session"
      });
    }

    const meta = getClientMeta(req);

    const [result] = await conn.query(
      `UPDATE sessions
       SET is_active = 0,
           forced_logged_out = 1,
           forced_logged_out_by_id = ?,
           forced_logged_out_by_ip = ?
       WHERE id = ?
         AND user_id = ?
         AND is_active = 1`,
      [user_id, meta.ip_v4, session_id, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Session not found or already logged out"
      });
    }

    return res.json({
      success: true,
      message: "Device logged out successfully"
    });
  } catch (err) {
    console.error("Logout Session Error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  } finally {
    if (conn) conn.release();
  }
});

router.post("/logout-all", auth(), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const user_id = req.user?.id;
    const current_session_id = req.session?.id;

    const [result] = await conn.query(
      `UPDATE sessions
       SET is_active = 0,
           forced_logged_out = 1,
           forced_logged_out_by_id = ?
       WHERE user_id = ?
         AND id != ?
         AND is_active = 1`,
      [user_id, user_id, current_session_id]
    );

    return res.json({
      success: true,
      message: "Logged out from all other devices",
      affected_sessions: result.affectedRows
    });
  } catch (err) {
    console.error("Logout All Error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  } finally {
    if (conn) conn.release();
  }
});

router.post("/continue/google", async (req, res) => {
  let conn;
  let transactionStarted = false;

  try {
    const { credential, platform, latitude, longitude } = req.body || {};

    if (!credential || typeof credential !== "string") {
      return sendError(res, 400, "Google credential is required");
    }

    const normalizedPlatform = normalizePlatform(platform);

    if (!normalizedPlatform) {
      return sendError(res, 400, "Valid platform is required (web/android/ios)");
    }

    const lat =
      latitude !== undefined && latitude !== null && latitude !== ""
        ? Number(latitude)
        : null;

    const lng =
      longitude !== undefined && longitude !== null && longitude !== ""
        ? Number(longitude)
        : null;

    if ((lat !== null && lng === null) || (lat === null && lng !== null)) {
      return sendError(
        res,
        400,
        "Both latitude and longitude are required together"
      );
    }

    if (
      lat !== null &&
      (Number.isNaN(lat) || lat < -90 || lat > 90)
    ) {
      return sendError(res, 400, "Invalid latitude");
    }

    if (
      lng !== null &&
      (Number.isNaN(lng) || lng < -180 || lng > 180)
    ) {
      return sendError(res, 400, "Invalid longitude");
    }

    const googleAudiences = getGoogleAudiences();

    if (!googleAudiences.length) {
      return sendError(res, 500, "Google authentication unavailable");
    }

    let payload;

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: googleAudiences,
      });

      payload = ticket.getPayload();
    } catch (verifyErr) {
      console.log("GOOGLE VERIFY ERROR:", {
        message: verifyErr.message,
        platform: normalizedPlatform,
      });

      return sendError(res, 401, "Invalid Google token");
    }

    if (!payload) {
      return sendError(res, 401, "Unable to verify Google account");
    }

    const email = payload.email?.toLowerCase()?.trim() || null;

    if (!email) {
      return sendError(res, 400, "Google email missing");
    }

    if (!payload.email_verified) {
      return sendError(res, 403, "Google email not verified");
    }

    const meta = getClientMeta(req);

    conn = await db.getConnection();

    const [users] = await conn.query(
      `
      SELECT
        id,
        email,
        phone,
        name,
        profile_picture,
        is_active,
        is_system_admin,
        last_login
      FROM users
      WHERE email = ?
        AND is_deleted = 0
      LIMIT 1
      `,
      [email]
    );

    let user = null;
    let isNewUser = false;
    let profilePicture = null;

    if (!users.length) {
      isNewUser = true;

      if (payload.picture) {
        try {
          const media = await saveMediaFromUrl({
            url: payload.picture,
            folder: "profile_picture",
          });

          if (media?.success) {
            profilePicture = media.file_url;
          }
        } catch (mediaErr) {
          console.error("PROFILE IMAGE SAVE ERROR:", mediaErr.message);
        }
      }
    } else {
      user = users[0];

      if (!user.is_active) {
        return sendError(res, 403, "Account disabled");
      }
    }

    await conn.beginTransaction();
    transactionStarted = true;

    if (isNewUser) {
      const randomPassword = generateRandomPassword();
      const hashedPassword = await hashPassword(randomPassword);

      const [insertResult] = await conn.query(
        `
        INSERT INTO users (
          email,
          phone,
          password,
          name,
          profile_picture,
          is_active,
          last_login,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW(), NOW())
        `,
        [email, "", hashedPassword, payload.name || null, profilePicture]
      );

      const [createdUsers] = await conn.query(
        `
        SELECT
          id,
          email,
          phone,
          name,
          profile_picture,
          is_active,
          is_system_admin,
          last_login
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [insertResult.insertId]
      );

      user = createdUsers[0];

      try {
        await sendQueuedWelcomeEmail({
          to: email,
          userName: user.name || user.email || "User",
          password: randomPassword,
          dashboardUrl: FRONTEND_URL + "/home",
        });
      } catch (emailErr) {
        console.error("WELCOME EMAIL QUEUE ERROR:", emailErr.message);
      }

    } else {
      await conn.query(
        `
        UPDATE users
        SET last_login = NOW(),
            updated_at = NOW()
        WHERE id = ?
        `,
        [user.id]
      );

      user.last_login = new Date();
    }

    const sessionToken = generateSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [sessionResult] = await conn.query(
      `
      INSERT INTO sessions (
        user_id,
        session_token,
        ip_v4,
        ip_v6,
        latitude,
        longitude,
        auth_provider,
        platform,
        device_name,
        forced_logged_out,
        is_active,
        expires_at,
        last_used_at,
        created_at,
        created_by
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, 'google', ?, ?, 0, 1, ?, NOW(), NOW(), ?
      )
      `,
      [
        user.id,
        sessionToken,
        meta.ip_v4 || null,
        meta.ip_v6 || null,
        lat,
        lng,
        normalizedPlatform,
        meta.device_name || null,
        expiresAt,
        user.id,
      ]
    );

    const session = {
      ip_v4: meta.ip_v4,
      ip_v6: meta.ip_v6,
      latitude: lat,
      longitude: lng,
      device_name: meta.device_name,
      user_agent: req.headers["user-agent"] || "",
      platform: normalizedPlatform
    };

    await conn.commit();
    transactionStarted = false;

    if (!isNewUser) {
      try {
        await queueLoginAlertEmail({
          to: user.email,
          userName: user.name || user.email || "User",
          session,
          dashboardUrl: FRONTEND_URL + "/settings?tab=security",
        });
      } catch (emailErr) {
        console.error("LOGIN ALERT EMAIL QUEUE ERROR:", emailErr.message);
      }
    }

    return sendSuccess(
      res,
      200,
      isNewUser ? "Google signup successful" : "Google login successful",
      {
        token: sessionToken,
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          name: user.name,
          profile_picture: user.profile_picture,
          auth_provider: "google",
          is_system_admin: Boolean(user.is_system_admin),
        },
      }
    );
  } catch (err) {
    await rollbackTransaction(conn, transactionStarted);
    transactionStarted = false;

    console.error("GOOGLE AUTH ERROR:", {
      message: err.message,
      stack: NODE_ENV === "development" ? err.stack : undefined,
    });

    return sendError(res, 500, "Google authentication failed");
  } finally {
    await rollbackTransaction(conn, transactionStarted);

    if (conn) {
      conn.release();
    }
  }
});

router.post("/continue/facebook", async (req, res) => {
  let conn;
  let transactionStarted = false;

  const rollback = async () => {
    await rollbackTransaction(conn, transactionStarted);
    transactionStarted = false;
  };

  try {
    conn = await db.getConnection();

    await conn.beginTransaction();
    transactionStarted = true;

    const {
      access_token,
      latitude,
      longitude,
      platform
    } = req.body;

    if (
      !access_token ||
      typeof access_token !== "string"
    ) {
      await rollback();
      return sendError(res, 400, "Facebook access token is required");
    }

    const normalizedPlatform = normalizePlatform(platform);

    if (!normalizedPlatform) {
      await rollback();
      return sendError(res, 400, "Valid platform is required (web/android/ios)");
    }

    const lat =
      latitude !== undefined &&
        latitude !== null &&
        latitude !== ""
        ? Number(latitude)
        : null;

    const lng =
      longitude !== undefined &&
        longitude !== null &&
        longitude !== ""
        ? Number(longitude)
        : null;

    if (
      (lat !== null && lng === null) ||
      (lat === null && lng !== null)
    ) {
      await rollback();
      return sendError(res, 400, "Both latitude and longitude are required together");
    }

    if (
      lat !== null &&
      (
        Number.isNaN(lat) ||
        lat < -90 ||
        lat > 90
      )
    ) {
      await rollback();
      return sendError(res, 400, "Invalid latitude");
    }

    if (
      lng !== null &&
      (
        Number.isNaN(lng) ||
        lng < -180 ||
        lng > 180
      )
    ) {
      await rollback();
      return sendError(res, 400, "Invalid longitude");
    }

    let fbUser;

    try {
      const debugResponse =
        await axios.get(
          "https://graph.facebook.com/debug_token",
          {
            params: {
              input_token: access_token,
              access_token:
                `${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`
            }
          }
        );

      const tokenData =
        debugResponse?.data?.data;

      if (
        !tokenData ||
        !tokenData.is_valid
      ) {
        await rollback();
        return sendError(res, 401, "Invalid Facebook token");
      }

      const userResponse =
        await axios.get(
          "https://graph.facebook.com/me",
          {
            params: {
              fields:
                "id,name,email,picture.type(large)",
              access_token
            }
          }
        );

      fbUser = userResponse.data;
    } catch (err) {
      console.error(
        "FACEBOOK VERIFY ERROR:",
        err?.response?.data || err
      );

      await rollback();
      return sendError(res, 401, "Invalid Facebook token");
    }

    if (!fbUser) {
      await rollback();
      return sendError(res, 401, "Unable to verify Facebook account");
    }

    const email =
      fbUser.email
        ?.toLowerCase()
        ?.trim() || null;

    if (!email) {
      await rollback();
      return sendError(res, 400, "Facebook email missing");
    }

    const meta = getClientMeta(req);

    const [users] = await conn.query(
      `
      SELECT
        id,
        email,
        phone,
        name,
        profile_picture,
        is_active,
        is_system_admin,
        is_deleted,
        last_login
      FROM users
      WHERE email = ?
        AND is_deleted = 0
      LIMIT 1
      `,
      [email]
    );

    let user;

    let isNewUser = false;

    if (!users.length) {
      isNewUser = true;

      let profilePicture = null;

      const pictureUrl =
        fbUser?.picture?.data?.url || null;

      if (pictureUrl) {
        try {
          const media =
            await saveMediaFromUrl({
              url: pictureUrl,
              folder: "profile_picture"
            });

          if (media?.success) {
            profilePicture =
              media.file_url;
          }
        } catch (mediaErr) {
          console.error(
            "PROFILE IMAGE SAVE ERROR:",
            mediaErr.message
          );
        }
      }

      const randomPassword =
        generateRandomPassword();

      const hashedPassword =
        await hashPassword(
          randomPassword
        );

      const [insertResult] =
        await conn.query(
          `
          INSERT INTO users (
            email,
            phone,
            password,
            name,
            profile_picture,
            is_active,
            last_login,
            created_at,
            updated_at
          )
          VALUES (
            ?, ?, ?, ?, ?, 1, NOW(), NOW(), NOW()
          )
          `,
          [
            email,
            "",
            hashedPassword,
            fbUser.name || null,
            profilePicture
          ]
        );

      const [createdUsers] =
        await conn.query(
          `
          SELECT
            id,
            email,
            phone,
            name,
            profile_picture,
            is_active,
            is_system_admin,
            last_login
          FROM users
          WHERE id = ?
          LIMIT 1
          `,
          [insertResult.insertId]
        );

      user = createdUsers[0];
    } else {
      user = users[0];

      if (!user.is_active) {
        await rollback();
        return sendError(res, 403, "Account disabled");
      }

      await conn.query(
        `
        UPDATE users
        SET
          last_login = NOW()
        WHERE id = ?
        `,
        [user.id]
      );

      user.last_login =
        new Date();
    }

    const sessionToken =
      generateSessionToken();

    const expiresAt =
      new Date();

    expiresAt.setDate(
      expiresAt.getDate() + 7
    );

    await conn.query(
      `
      INSERT INTO sessions (
        user_id,
        session_token,
        ip_v4,
        ip_v6,
        latitude,
        longitude,
        auth_provider,
        platform,
        device_name,
        forced_logged_out,
        is_active,
        expires_at,
        last_used_at,
        created_at,
        created_by
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, 'facebook', ?, ?, 0, 1, ?, NOW(), NOW(), ?
      )
      `,
      [
        user.id,
        sessionToken,
        meta.ip_v4 || null,
        meta.ip_v6 || null,
        lat,
        lng,
        normalizedPlatform,
        meta.device_name || null,
        expiresAt,
        user.id
      ]
    );

    await conn.commit();
    transactionStarted = false;

    return sendSuccess(
      res,
      200,

      isNewUser
        ? "Facebook signup successful"
        : "Facebook login successful",

      {
        token: sessionToken
      }
    );
  } catch (err) {
    await rollback();

    console.error(
      "FACEBOOK LOGIN ERROR:",
      {
        message: err.message,
        stack:
          NODE_ENV === "development"
            ? err.stack
            : undefined
      }
    );

    return sendError(res, 500, "Facebook authentication failed");
  } finally {
    if (conn) {
      if (transactionStarted) {
        try {
          await conn.rollback();
        } catch (_) { }
      }

      conn.release();
    }
  }
});

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
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      timeout: 15000
    }
  );

  return response.data?.access_token || null;
};

const fetchTruecallerProfile = async (accessToken) => {
  const response = await axios.get(TRUECALLER_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    timeout: 15000
  });

  return response.data;
};

const mapTruecallerProfile = (profile) => {
  const phone =
    normalizePhone(profile?.phone_number) ||
    profile?.phone_number?.trim() ||
    null;

  const email =
    profile?.email?.toLowerCase()?.trim() || null;

  const name =
    [profile?.given_name, profile?.family_name]
      .filter(Boolean)
      .join(" ")
      .trim() || null;

  return {
    phone,
    phoneVerified: profile?.phone_number_verified === true,
    email,
    name,
    pictureUrl: profile?.picture || null
  };
};

router.post("/continue/truecaller", async (req, res) => {
  let conn;
  let transactionStarted = false;

  try {
    const {
      code,
      code_verifier,
      platform,
      latitude,
      longitude
    } = req.body || {};

    if (!code || typeof code !== "string") {
      return sendError(res, 400, "Truecaller authorization code is required");
    }

    if (!code_verifier || typeof code_verifier !== "string") {
      return sendError(res, 400, "Truecaller code_verifier is required");
    }

    const normalizedPlatform = normalizePlatform(platform);

    if (!normalizedPlatform) {
      return sendError(res, 400, "Valid platform is required (web/android/ios)");
    }

    const coords = parseOptionalCoordinates(latitude, longitude);

    if (coords.error) {
      return sendError(res, 400, coords.error);
    }

    const { lat, lng } = coords;

    if (!TRUECALLER_CLIENT_ID) {
      return sendError(res, 500, "Truecaller authentication unavailable");
    }


    let accessToken;

    try {
      accessToken = await exchangeTruecallerToken(code, code_verifier);
    } catch (tokenErr) {
      console.error("TRUECALLER TOKEN ERROR:", tokenErr.response?.data || tokenErr.message);
      return sendError(res, 401, "Invalid or expired Truecaller authorization");
    }

    if (!accessToken) {
      return sendError(res, 401, "Unable to get Truecaller access token");
    }

    let profile;

    try {
      profile = await fetchTruecallerProfile(accessToken);
    } catch (profileErr) {
      console.error("TRUECALLER PROFILE ERROR:", profileErr.response?.data || profileErr.message);
      return sendError(res, 401, "Unable to fetch Truecaller profile");
    }

    const tcUser = mapTruecallerProfile(profile);

    if (!tcUser.phone) {
      return sendError(res, 400, "Truecaller phone number missing");
    }

    if (!tcUser.phoneVerified) {
      return sendError(res, 403, "Truecaller phone number is not verified");
    }

    const meta = getClientMeta(req);


    conn = await db.getConnection();

    const [existingRows] = await conn.query(
      `
      SELECT
        id,
        email,
        phone,
        name,
        profile_picture,
        is_active,
        is_system_admin,
        last_login
      FROM users
      WHERE phone = ?
        AND is_deleted = 0
      LIMIT 1
      `,
      [tcUser.phone]
    );

    let user = existingRows[0] || null;
    let isNewUser = !user;

    if (user && !user.is_active) {
      return sendError(res, 403, "Account disabled");
    }

    let signupEmail = "";

    if (isNewUser && tcUser.email) {
      const [emailRows] = await conn.query(
        `
        SELECT id
        FROM users
        WHERE email = ?
          AND email <> ''
          AND is_deleted = 0
        LIMIT 1
        `,
        [tcUser.email]
      );

      if (!emailRows.length) {
        signupEmail = tcUser.email;
      }
    }


    let profilePicture = user?.profile_picture || null;

    if (isNewUser && tcUser.pictureUrl) {
      try {
        const media = await saveMediaFromUrl({
          url: tcUser.pictureUrl,
          folder: "profile_picture"
        });

        if (media?.success) {
          profilePicture = media.file_url;
        }
      } catch (mediaErr) {
        console.error("TRUECALLER PROFILE IMAGE ERROR:", mediaErr.message);
      }
    }


    await conn.beginTransaction();
    transactionStarted = true;

    if (isNewUser) {
      const hashedPassword = await hashPassword(generateRandomPassword());

      const [insertResult] = await conn.query(
        `
        INSERT INTO users (
          email,
          phone,
          password,
          name,
          profile_picture,
          is_active,
          last_login,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW(), NOW())
        `,
        [
          signupEmail,
          tcUser.phone,
          hashedPassword,
          tcUser.name,
          profilePicture
        ]
      );

      const [newRows] = await conn.query(
        `
        SELECT
          id,
          email,
          phone,
          name,
          profile_picture,
          is_active,
          is_system_admin,
          last_login
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [insertResult.insertId]
      );

      user = newRows[0];
    } else {
      await conn.query(
        `
        UPDATE users
        SET last_login = NOW(),
            updated_at = NOW()
        WHERE id = ?
        `,
        [user.id]
      );

      user.last_login = new Date();
    }

    const sessionToken = generateSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await conn.query(
      `
      INSERT INTO sessions (
        user_id,
        session_token,
        ip_v4,
        ip_v6,
        latitude,
        longitude,
        auth_provider,
        platform,
        device_name,
        forced_logged_out,
        is_active,
        expires_at,
        last_used_at,
        created_at,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, 'truecaller', ?, ?, 0, 1, ?, NOW(), NOW(), ?)
      `,
      [
        user.id,
        sessionToken,
        meta.ip_v4 || null,
        meta.ip_v6 || null,
        lat,
        lng,
        normalizedPlatform,
        meta.device_name || null,
        expiresAt,
        user.id
      ]
    );

    await conn.commit();
    transactionStarted = false;

    return sendSuccess(
      res,
      200,
      isNewUser ? "Truecaller signup successful" : "Truecaller login successful",
      {
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
      }
    );
  } catch (err) {
    await rollbackTransaction(conn, transactionStarted);
    transactionStarted = false;

    console.error("TRUECALLER AUTH ERROR:", {
      message: err.message,
      stack: NODE_ENV === "development" ? err.stack : undefined
    });

    return sendError(res, 500, "Truecaller authentication failed");
  } finally {
    await rollbackTransaction(conn, transactionStarted);

    if (conn) {
      conn.release();
    }
  }
});


export default router;

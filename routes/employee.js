import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import { DESIGNATIONS, EMPLOYMENT_TYPES, SALARY_TYPES, INVITE_STATUSES } from "../constants/constants_values.js"
import {
  validateFields, employmentValidation, salaryValidation, designationValidation, attendanceMethodValidation,
  getEnumObject
} from "../utils/constantsValidator.js";
import {
  toISTString, convertToISTFields, normalizeWeekends, formatTime, diffMinutes, isValidDate,
  getCurrentDate,
} from "../utils/time.js";
import { sendSuccess, sendError, safeNumber, toBoolean } from "../utils/sendResponse.js"
import { buildFileUrl } from "../utils/fileService.js";
import { EMP, PROFILE } from "../constants/permissions.js";
import getClientMeta from "../utils/ipHelper.js";
import {
  generateOTP, hashPassword, comparePassword, verifyOtpHash,
  generateSessionToken, generateRandomPassword, generateRandomToken
} from "../utils/auth.js";
import { queueSignupOTPEmail, sendQueuedWelcomeEmail } from "../email/services/email.processor.js";
import axios from "axios";
import { runFaceCheck } from "../utils/faceCheckUtil.js";

const FACE_SERVICE_URL = (process.env.FACE_SERVICE_URL || "http://localhost:8000").replace(
  /\/$/,
  ""
);


const router = express.Router();

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

const resolveSignupPayload = (body) => {

  const {
    signup_type,
    email,
    phone,
    otp,
    name
  } = body || {};

  const signupType =
    normalizeSignupType(signup_type);

  if (!signupType) {
    return {
      error: {
        status: 400,
        message: "Valid signup_type is required (email/phone)"
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

  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

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

  const normalizedPhone =
    normalizePhone(phone);

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
    otp,
    name: name?.trim() || null
  };
};

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

const getSignupOtpRateLimitColumn = (signupType) =>
  signupType === "phone"
    ? "phone"
    : "email";

const rollbackTransaction = async (conn, transactionStarted) => {
  if (!conn || !transactionStarted) {
    return;
  }

  try {
    await conn.rollback();
  } catch (_) {

  }
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

router.post("/request-create-otp", auth(EMP.MNG), async (req, res) => {

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

    const companyId =
      req.company?.id;

    const createdBy =
      req.user?.id;

    if (!companyId) {
      return sendError(res, 400, "Company context missing");
    }

    const rateLimitColumn = getSignupOtpRateLimitColumn(signupType);

    const rateLimitValue =
      signupType === "phone"
        ? normalizedPhone
        : normalizedEmail;

    const clientMeta =
      getClientMeta(req);

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

    if (existingUser.length) {
      return sendError(
        res,
        409,
        signupType === "email"
          ? "Email already registered"
          : "Phone already registered"
      );
    }

    const [[recentOtp]] = await conn.query(
      `
      SELECT COUNT(*) AS count
      FROM otps
      WHERE ${rateLimitColumn} = ?
        AND otp_purpose = 'employee_create'
        AND created_at > NOW() - INTERVAL 30 SECOND
      `,
      [rateLimitValue]
    );

    if (recentOtp.count >= 5) {
      return sendError(res, 429, "Wait 30 seconds before requesting another OTP");
    }

    const [[recentIp]] = await conn.query(
      `
      SELECT COUNT(*) AS count
      FROM otps
      WHERE ip_address = ?
        AND otp_purpose = 'employee_create'
        AND created_at > NOW() - INTERVAL 30 SECOND
      `,
      [ip]
    );

    if (recentIp.count >= 10) {
      return sendError(res, 429, "Too many requests from this IP");
    }

    const otp = generateOTP();

    const otpHash = await hashPassword(otp);

    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    const invalidateOtpSql =
      signupType === "phone"
        ? `phone = ? AND otp_purpose = 'employee_create' AND used_at IS NULL`
        : `email = ? AND otp_purpose = 'employee_create' AND used_at IS NULL`;

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
      VALUES (?, ?, 'employee_create', ?, ?, NULL, ?)
      `,
      [
        otpEmail,
        normalizedPhone,
        otpHash,
        otpExpiry,
        ip,
      ]
    );

    if (signupType === "email" && normalizedEmail) {

      try {

        await queueSignupOTPEmail({
          to: normalizedEmail,
          userName: normalizedEmail || "User",
          otp
        });

      } catch (err) {

        console.error("EMPLOYEE OTP EMAIL ERROR:", err);

        return sendError(res, 500, "Failed to send OTP email");
      }
    }

    return sendSuccess(
      res,
      200,
      signupType === "email"
        ? "OTP sent to email"
        : "OTP sent successfully to Phone"
    );

  } catch (err) {

    console.error("EMPLOYEE CREATE OTP ERROR:", err);

    return sendError(res, 500, "Something went wrong");

  } finally {

    if (conn) {
      conn.release();
    }
  }
});

router.post("/create", auth(EMP.MNG), async (req, res) => {

  let conn;
  let transactionStarted = false;

  try {

    conn = await db.getConnection();

    const {
      platform,
      latitude,
      longitude,
      permission_package_id,
      designation,
      salary_type,
      joining_date,
      employment_type,
      weekends,
      shift_start,
      shift_end,
      break_minutes,
      grace_minutes,
      base_amount,
      effective_from,
      effective_to,
      components = []
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
      otp,
      name
    } = resolved;

    const companyId = req.company?.id;

    const createdBy = req.user?.id;

    const normalizedName = name?.trim();

    if (!normalizedName || normalizedName.length < 3) {
      return sendError(
        res,
        400,
        "Invalid employee name. It must be at least 3 characters long."
      );
    }

    if (!companyId) {
      return sendError(
        res,
        400,
        "Company context missing"
      );
    }

    const normalizedPlatform = normalizePlatform(platform);

    if (!normalizedPlatform) {
      return sendError(
        res,
        400,
        "Valid platform is required"
      );
    }

    const coords = parseOptionalCoordinates(latitude, longitude);

    if (coords.error) {
      return sendError(
        res,
        400,
        coords.error
      );
    }

    const { lat, lng } = coords;

    const normalizedShiftStart = formatTime(shift_start);

    const normalizedShiftEnd = formatTime(shift_end);

    if (!normalizedShiftStart || !normalizedShiftEnd) {

      return sendError(
        res,
        400,
        "Valid shift start and shift end are required"
      );
    }

    const expected_work_minutes = diffMinutes(normalizedShiftStart, normalizedShiftEnd);

    if (expected_work_minutes <= 0) {

      return sendError(
        res,
        400,
        "Expected work minutes must be greater than 0"
      );
    }

    const finalJoiningDate = isValidDate(joining_date) ? joining_date : getCurrentDate();

    const random = generateRandomToken({ size: 1, encoding: "hex", uppercase: true });

    const employee_code = `EMP-${companyId}${random}`;

    const meta = getClientMeta(req);

    const otpLookupSql =
      signupType === "phone"
        ? `phone = ? AND otp_purpose = 'employee_create' AND used_at IS NULL`
        : `email = ? AND otp_purpose = 'employee_create' AND used_at IS NULL`;

    const otpLookupParams = signupType === "phone" ? [normalizedPhone] : [normalizedEmail];

    await conn.beginTransaction();

    transactionStarted = true;

    const [otpRows] = await conn.query(
      `
      SELECT
        id,
        otp_hash,
        otp_expiry,
        is_verified
      FROM otps
      WHERE ${otpLookupSql}
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
      `,
      otpLookupParams
    );

    if (!otpRows.length) {

      await rollbackTransaction(
        conn,
        transactionStarted
      );

      transactionStarted = false;

      return sendError(
        res,
        400,
        "OTP not found"
      );
    }

    const otpRecord = otpRows[0];

    if (otpRecord.is_verified) {

      await rollbackTransaction(
        conn,
        transactionStarted
      );

      transactionStarted = false;

      return sendError(
        res,
        400,
        "OTP already used"
      );
    }

    if (new Date() > new Date(otpRecord.otp_expiry)) {
      await rollbackTransaction(
        conn,
        transactionStarted
      );

      transactionStarted = false;

      return sendError(
        res,
        400,
        "OTP expired"
      );
    }

    const isOtpValid = await verifyOtpHash(otp, otpRecord.otp_hash);

    if (!isOtpValid) {

      await rollbackTransaction(
        conn,
        transactionStarted
      );

      transactionStarted = false;

      return sendError(
        res,
        400,
        "Invalid OTP"
      );
    }

    const existingUserSql =
      signupType === "email"
        ? `email = ?`
        : `phone = ?`;

    const existingUserParams =
      signupType === "email"
        ? [normalizedEmail]
        : [normalizedPhone];

    const [existingUsers] =
      await conn.query(
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

      await rollbackTransaction(
        conn,
        transactionStarted
      );

      transactionStarted = false;

      return sendError(
        res,
        409,
        signupType === "email"
          ? "Email already registered"
          : "Phone already registered"
      );
    }

    const generatedPassword =
      generateRandomPassword();

    const hashedPassword =
      await hashPassword(
        generatedPassword
      );

    let userResult;

    try {

      [userResult] = await conn.query(
        `
        INSERT INTO users (
          email,
          phone,
          password,
          name,
          created_by
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          normalizedEmail,
          normalizedPhone,
          hashedPassword,
          normalizedName,
          createdBy
        ]
      );

    } catch (err) {

      if (err.code === "ER_DUP_ENTRY") {

        await rollbackTransaction(
          conn,
          transactionStarted
        );

        transactionStarted = false;

        return sendError(
          res,
          409,
          "Email or phone already registered"
        );
      }

      throw err;
    }

    const userId = userResult.insertId;


    const packageId = Number(permission_package_id);

    if (!packageId) {
      return sendError(
        res,
        400,
        "Valid permission package is required"
      );
    }

    const [[permissionPackage]] = await conn.query(
      `
        SELECT id
        FROM permission_packages
        WHERE id = ?
          AND company_id = ?
          AND is_active = 1
          AND is_deleted = 0
        LIMIT 1
        `,
      [
        packageId,
        companyId
      ]
    );

    if (!permissionPackage) {
      return sendError(
        res,
        404,
        "Permission package not found"
      );
    }

    const [employeeResult] = await conn.query(
      `
      INSERT INTO employees (
        company_id,
        user_id,
        permission_package_id,
        employee_code,
        designation,
        salary_type,
        joining_date,
        status,
        employment_type,
        weekends,
        shift_start,
        shift_end,
        expected_work_minutes,
        break_minutes,
        grace_minutes,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        companyId,
        userId,
        packageId,
        employee_code,
        designation,
        salary_type,
        finalJoiningDate,
        employment_type,
        JSON.stringify(normalizeWeekends(weekends || [])),
        normalizedShiftStart,
        normalizedShiftEnd,
        expected_work_minutes,
        Math.max(
          0,
          Number(break_minutes) || 0
        ),
        Math.max(
          0,
          Number(grace_minutes) || 0
        ),
        createdBy
      ]
    );

    const employeeId = employeeResult.insertId;

    if (base_amount && effective_from) {
      const salaryBaseAmount = Number(base_amount);

      if (salaryBaseAmount <= 0) {
        return sendError(
          res,
          400,
          "Invalid base_amount"
        );
      }

      const salaryFrom = new Date(effective_from);

      const salaryTo = effective_to
        ? new Date(effective_to)
        : null;

      if (isNaN(salaryFrom.getTime())) {
        return sendError(
          res,
          400,
          "Invalid effective_from"
        );
      }

      if (
        salaryTo &&
        (
          isNaN(salaryTo.getTime()) ||
          salaryTo < salaryFrom
        )
      ) {
        return sendError(
          res,
          400,
          "Invalid effective_to"
        );
      }

      if (!Array.isArray(components)) {
        return sendError(
          res,
          400,
          "components must be an array"
        );
      }

      const componentIds = components.map(
        c => Number(c.component_id)
      );

      if (componentIds.some(id => !id)) {
        return sendError(
          res,
          400,
          "Invalid component_id found"
        );
      }

      const uniqueIds = new Set(componentIds);

      if (uniqueIds.size !== componentIds.length) {
        return sendError(
          res,
          400,
          "Duplicate salary components are not allowed"
        );
      }

      const [salaryResult] = await conn.query(
        `
        INSERT INTO salary_structures
        (
          company_id,
          employee_id,
          base_amount,
          effective_from,
          effective_to,
          is_active,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, 1, ?)
        `,
        [
          companyId,
          employeeId,
          salaryBaseAmount,
          effective_from,
          effective_to || null,
          createdBy
        ]
      );

      const salaryId = salaryResult.insertId;

      if (components.length > 0) {

        const [validComponents] = await conn.query(
          `
          SELECT
            id,
            name,
            type
          FROM salary_components
          WHERE id IN (?)
            AND company_id = ?
            AND is_deleted = 0
          `,
          [componentIds, companyId]
        );

        if (validComponents.length !== components.length) {
          return sendError(
            res,
            400,
            "Some salary components are invalid or unavailable"
          );
        }

        const validComponentIds = new Set(validComponents.map(c => Number(c.id)));

        const componentRows = [];

        for (const c of components) {

          const componentId =
            Number(c.component_id);

          if (!validComponentIds.has(componentId)) {
            return sendError(
              res,
              400,
              `Invalid component_id: ${componentId}`
            );
          }

          if (!["fixed", "percentage"].includes(c.calc_type)) {
            return sendError(
              res,
              400,
              `Invalid calc_type for component ${componentId}`
            );
          }

          const calcValue = Number(c.calc_value);

          if (isNaN(calcValue) || calcValue < 0) {
            return sendError(
              res,
              400,
              `Invalid calc_value for component ${componentId}`
            );
          }

          componentRows.push([
            companyId,
            employeeId,
            salaryId,
            componentId,
            c.calc_type,
            calcValue,
            c.reason || null,
            1,
            createdBy
          ]);
        }

        await conn.query(
          `
          INSERT INTO employee_salary_component
          (
            company_id,
            employee_id,
            salary_id,
            component_id,
            calc_type,
            calc_value,
            remark,
            is_active,
            created_by
          )
          VALUES ?
          `,
          [componentRows]
        );
      }
    }

    await conn.query(
      `
      UPDATE otps
      SET
        is_verified = 1,
        verified_at = NOW(),
        used_at = NOW()
      WHERE id = ?
      `,
      [otpRecord.id]
    );

    const token = generateSessionToken();

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
        expires_at,
        created_by
      )
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
        createdBy
      ]
    );

    if (normalizedEmail) {

      try {

        await sendQueuedWelcomeEmail({
          to: normalizedEmail,
          userName: normalizedName || normalizedName,
          password: generatedPassword,
          dashboardUrl: process.env.FRONTEND_URL + "/home"
        });

      } catch (err) {

        console.error(
          "WELCOME EMAIL ERROR:",
          err
        );
      }
    }

    await conn.commit();

    transactionStarted = false;

    return sendSuccess(
      res,
      201,
      "Employee created successfully"
    );

  } catch (err) {

    await rollbackTransaction(
      conn,
      transactionStarted
    );

    transactionStarted = false;

    console.error(
      "EMPLOYEE CREATE ERROR:",
      err
    );

    return sendError(
      res,
      500,
      "Something went wrong"
    );

  } finally {

    await rollbackTransaction(
      conn,
      transactionStarted
    );

    if (conn) {
      conn.release();
    }
  }
});

router.get("/list", auth(EMP.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    let {
      search = "",
      status,
      page = 1,
      limit = 20
    } = req.query;

    search = typeof search === "string" ? search.trim() : "";

    const pageNum = Math.max(Number(page) || 1, 1);

    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const offset = (pageNum - 1) * limitNum;

    const companyId = req.company?.id;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid company context"
      });
    }

    let whereClause = `
      WHERE e.company_id = ?
    `;

    const queryParams = [companyId];

    if (search.length >= 3) {

      whereClause += `
        AND (
          e.employee_code LIKE ?
          OR e.designation LIKE ?
          OR u.name LIKE ?
          OR u.email LIKE ?
          OR u.phone LIKE ?
        )
      `;

      const s = `%${search}%`;

      queryParams.push(
        s,
        s,
        s,
        s,
        s
      );
    }

    if (typeof status === "string" && status.trim()) {
      whereClause += `
        AND e.status = ?
      `;
      queryParams.push(status.trim());
    } else {
      whereClause += `
        AND e.status = 'active'
      `;
    }

    const statsQuery = `
      SELECT
        COUNT(
          CASE
            WHEN e.is_active = 1
            THEN 1
          END
        ) AS active_employee_count,

        COUNT(
          CASE
            WHEN e.is_active = 0
            THEN 1
          END
        ) AS inactive_employee_count

      FROM employees e

      WHERE e.company_id = ?
    `;

    const [statsResult] =
      await conn.query(
        statsQuery,
        [companyId]
      );

    const activeEmployeeCount = statsResult[0]?.active_employee_count || 0;

    const inactiveEmployeeCount = statsResult[0]?.inactive_employee_count || 0;

    const countQuery = `
      SELECT COUNT(*) AS total

      FROM employees e

      LEFT JOIN users u
        ON u.id = e.user_id

      ${whereClause}
    `;

    const [countResult] =
      await conn.query(
        countQuery,
        queryParams
      );

    const total = countResult[0]?.total || 0;

    const dataQuery = `
      SELECT
        e.id,
        e.company_id,
        e.permission_package_id,
        e.employee_code,
        e.designation,
        e.salary_type,
        e.face_enrolled,
        e.fingerprint_mapped,
        e.joining_date,
        e.status,
        e.employment_type,
        e.weekends,
        e.shift_start,
        e.shift_end,
        e.expected_work_minutes,
        e.break_minutes,
        e.grace_minutes,
        e.created_at,
        e.updated_at,

        u.name,
        u.email,
        u.phone,
        u.is_system_admin,
        u.last_login,
        u.profile_picture,

        pp.id AS package_id,
        pp.package_name,
        pp.group_code,
        pp.description,
        
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'permission_id', p.id,
              'code', p.code,
              'name', p.name,
              'action', p.action
            )
          )

          FROM permission_package_items ppi

          JOIN permissions p
            ON p.id = ppi.permission_id

          WHERE ppi.package_id = pp.id
          AND ppi.is_active = 1
          AND ppi.is_deleted = 0
        ) AS permissions,

        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'method', eam.method,
              'is_auto', eam.is_auto
            )
          )

          FROM employee_attendance_methods eam

          WHERE eam.employee_id = e.id
          AND eam.is_deleted = 0
          AND eam.is_active = 1
        ) AS attendance_methods,

        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'leave_config_id', lc.id,
              'leave_code', lc.code,
              'leave_name', lc.name,
              'is_paid', lc.is_paid,
              'allow_half_day', lc.allow_half_day,
              'total_allocated', elb.total_allocated,
              'used', elb.used,
              'remaining', elb.remaining
            )
          )

          FROM employee_leave_balances elb

          JOIN leave_configs lc
            ON lc.id = elb.leave_config_id
            AND lc.is_deleted = 0
            AND lc.is_active = 1

          WHERE elb.employee_id = e.id
          AND elb.company_id = e.company_id
          AND elb.is_deleted = 0
          AND elb.is_active = 1
        ) AS leave_balances

      FROM employees e

      LEFT JOIN users u
        ON u.id = e.user_id
        AND u.is_deleted = 0
        AND u.is_active = 1

      LEFT JOIN permission_packages pp
        ON pp.id = e.permission_package_id
        AND pp.is_deleted = 0
        AND pp.is_active = 1

      ${whereClause}

      ORDER BY e.id DESC

      LIMIT ? OFFSET ?
    `;

    const [rows] = await conn.query(
      dataQuery,
      [
        ...queryParams,
        limitNum,
        offset
      ]
    );

    const safeJSON = (val) => {

      if (!val) return [];

      if (typeof val === "object") {
        return val;
      }

      try {
        return JSON.parse(val);
      } catch {
        return [];
      }
    };

    const data = rows.map((emp) => {

      const permissions =
        safeJSON(
          emp.permissions
        ).filter(Boolean);

      const methods =
        safeJSON(
          emp.attendance_methods
        ).filter(Boolean);

      const leaveBalances =
        safeJSON(
          emp.leave_balances
        ).filter(Boolean);

      const weekendsObj =
        typeof emp.weekends === "string"
          ? safeJSON(emp.weekends)
          : emp.weekends;

      return {
        ...emp,

        designation: getEnumObject(DESIGNATIONS, emp.designation),
        employment_type: getEnumObject(EMPLOYMENT_TYPES, emp.employment_type),
        salary_type: getEnumObject(SALARY_TYPES, emp.salary_type),
        break_minutes: emp.break_minutes || 0,

        profile_picture: buildFileUrl(emp.profile_picture),

        face_enrolled: Boolean(emp.face_enrolled),

        fingerprint_mapped: Boolean(emp.fingerprint_mapped),

        is_system_admin: Boolean(emp.is_system_admin),

        permissions,

        attendance_methods:
          methods.map((m) => ({
            ...m,
            is_auto:
              Boolean(m.is_auto),
          })),

        leave_balances:
          leaveBalances.map((l) => ({
            ...l,
            is_paid:
              Boolean(l.is_paid),

            allow_half_day: Boolean(l.allow_half_day),

            total_allocated: Number(l.total_allocated || 0),

            used: Number(l.used || 0),

            remaining: Number(l.remaining || 0),
          })),

        weekends: normalizeWeekends(weekendsObj),
      };
    });

    return res.status(200).json({
      success: true,
      message:
        "Employee list retrieved successfully",

      data,

      meta: {
        total,

        active:
          activeEmployeeCount,

        inactive:
          inactiveEmployeeCount,

        total_pages:
          Math.ceil(
            total / limitNum
          ),

        page: pageNum,

        limit: limitNum,

        is_last_page:
          offset + data.length >= total,
      },
    });

  } catch (error) {

    console.error(
      "EMPLOYEE_LIST_ERROR:",
      {
        message: error.message,
        stack: error.stack,
      }
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to fetch employee list",
    });

  } finally {

    if (conn) {
      conn.release();
    }
  }
});

router.put("/update", auth(EMP.MNG), async (req, res) => {

  let conn;

  const VALID_WEEK_DAYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday"
  ];

  try {

    conn = await db.getConnection();

    const {
      employee_id,
      designation,
      salary_type,
      employment_type,
      permission_package_id,
      attendance_methods,
      weekends,
      auto_approve = false,
      shift_start,
      shift_end,
      break_minutes,
      grace_minutes
    } = req.body;

    const companyId =
      safeNumber(
        req.company?.id,
        0
      );

    const updatedBy =
      safeNumber(
        req.user?.id,
        0
      );

    const parseTimeToMinutes = (
      value
    ) => {

      if (
        value === null ||
        value === undefined
      ) {
        return NaN;
      }

      if (
        typeof value === "number" &&
        Number.isFinite(value)
      ) {

        return Math.floor(value);
      }

      if (
        typeof value === "string"
      ) {

        const trimmed =
          value.trim();

        if (!trimmed) {
          return NaN;
        }

        if (/^\d+$/.test(trimmed)) {
          return Number(trimmed);
        }

        const parts =
          trimmed
            .split(":")
            .map(Number);

        if (
          parts.length < 2 ||
          parts.some(isNaN)
        ) {
          return NaN;
        }

        const [
          hours,
          minutes,
          seconds = 0
        ] = parts;

        return (
          hours * 60 +
          minutes +
          Math.floor(seconds / 60)
        );
      }

      return NaN;
    };

    const toTimeMinutes = (
      value
    ) => {

      if (!value) {
        return NaN;
      }

      const parts =
        value
          .split(":")
          .map(Number);

      if (
        parts.length < 2 ||
        parts.some(isNaN)
      ) {
        return NaN;
      }

      const [
        hours,
        minutes,
        seconds = 0
      ] = parts;

      return (
        hours * 60 +
        minutes +
        Math.floor(seconds / 60)
      );
    };

    const normalizeAttendanceMethods = (
      methods = []
    ) => {

      if (!Array.isArray(methods)) {
        return [];
      }

      const unique = new Map();

      for (const method of methods) {

        const err = attendanceMethodValidation(method);

        if (err) {
          throw new Error(err);
        }

        const normalized =
          String(method)
            .trim()
            .toLowerCase();

        unique.set(
          normalized,
          {
            method: normalized,
            is_auto: toBoolean(auto_approve)
              ? 1
              : 0
          }
        );
      }

      return Array.from(
        unique.values()
      );
    };

    const normalizeWeekendsSafe = (
      value
    ) => {

      if (
        value === null ||
        value === undefined
      ) {

        return null;
      }

      if (!Array.isArray(value)) {
        return sendError(
          res,
          400,
          "weekends must be an array"
        );
      }

      if (!value.length) {
        return [];
      }

      const cleaned =
        [
          ...new Set(
            value
              .map((day) =>
                String(day)
                  .trim()
                  .toLowerCase()
              )
          )
        ];

      for (const day of cleaned) {

        if (!VALID_WEEK_DAYS.includes(day)) {

          return sendError(
            res,
            400,
            `Invalid weekend '${day}'`
          );
        }
      }

      return cleaned;
    };

    const normalizedBreakMinutes =
      break_minutes !== undefined
        ? parseTimeToMinutes(
          break_minutes
        )
        : undefined;

    const normalizedGraceMinutes =
      grace_minutes !== undefined
        ? parseTimeToMinutes(
          grace_minutes
        )
        : undefined;

    if (!companyId) {

      return sendError(
        res,
        400,
        "Invalid company context"
      );
    }

    if (
      !employee_id ||
      !Number.isInteger(
        Number(employee_id)
      )
    ) {

      return sendError(
        res,
        400,
        "Invalid employee ID"
      );
    }

    const hasUpdates = [

      designation,
      salary_type,
      employment_type,
      permission_package_id,
      attendance_methods,
      weekends,
      shift_start,
      shift_end,
      break_minutes,
      grace_minutes

    ].some(
      (value) =>
        value !== undefined
    );

    if (!hasUpdates) {

      return sendError(
        res,
        400,
        "No fields provided for update"
      );
    }

    const validations = [];

    if (
      designation !== undefined
    ) {

      validations.push({
        field: "designation",
        value: designation,
        validator:
          designationValidation
      });
    }

    if (
      salary_type !== undefined
    ) {

      validations.push({
        field: "salary_type",
        value: salary_type,
        validator:
          salaryValidation
      });
    }

    if (
      employment_type !== undefined
    ) {

      validations.push({
        field: "employment_type",
        value: employment_type,
        validator:
          employmentValidation
      });
    }

    const validationErrors =
      validateFields(
        validations
      );

    if (
      validationErrors.length
    ) {

      return sendError(
        res,
        422,
        "Validation failed",
        validationErrors
      );
    }

    const timeRegex =
      /^\d{2}:\d{2}(:\d{2})?$/;

    if (
      shift_start !== undefined &&
      !timeRegex.test(
        shift_start
      )
    ) {

      return sendError(
        res,
        422,
        "Invalid shift_start"
      );
    }

    if (
      shift_end !== undefined &&
      !timeRegex.test(
        shift_end
      )
    ) {

      return sendError(
        res,
        422,
        "Invalid shift_end"
      );
    }

    if (
      (
        shift_start !== undefined &&
        shift_end === undefined
      ) ||

      (
        shift_end !== undefined &&
        shift_start === undefined
      )
    ) {

      return sendError(
        res,
        422,
        "Both shift_start and shift_end are required"
      );
    }

    if (
      normalizedBreakMinutes !== undefined
    ) {

      if (
        !Number.isInteger(
          normalizedBreakMinutes
        ) ||

        normalizedBreakMinutes < 0
      ) {

        return sendError(
          res,
          422,
          "Invalid break_minutes"
        );
      }
    }

    if (
      normalizedGraceMinutes !== undefined
    ) {

      if (
        !Number.isInteger(
          normalizedGraceMinutes
        ) ||

        normalizedGraceMinutes < 0
      ) {

        return sendError(
          res,
          422,
          "Invalid grace_minutes"
        );
      }
    }

    let calculatedMinutes =
      null;

    if (
      shift_start !== undefined &&
      shift_end !== undefined
    ) {

      let start =
        toTimeMinutes(
          shift_start
        );

      let end =
        toTimeMinutes(
          shift_end
        );

      if (
        Number.isNaN(start) ||
        Number.isNaN(end)
      ) {

        return sendError(
          res,
          422,
          "Invalid shift timing"
        );
      }

      if (end < start) {
        end += 1440;
      }

      calculatedMinutes =
        end - start;

      const breakMins =
        normalizedBreakMinutes ?? 0;

      if (
        breakMins >
        calculatedMinutes
      ) {

        return sendError(
          res,
          422,
          "Break time cannot exceed shift duration"
        );
      }

      if (
        !Number.isInteger(
          calculatedMinutes
        ) ||

        calculatedMinutes <= 0
      ) {

        return sendError(
          res,
          422,
          "Invalid work duration"
        );
      }
    }

    let cleanedAttendance =
      null;

    if (
      attendance_methods !== undefined
    ) {

      try {

        cleanedAttendance =
          normalizeAttendanceMethods(
            attendance_methods
          );

      } catch (error) {

        return sendError(
          res,
          422,
          error.message
        );
      }
    }

    let normalizedWeekends =
      undefined;

    if (
      weekends !== undefined
    ) {

      try {

        normalizedWeekends =
          normalizeWeekendsSafe(
            weekends
          );

      } catch (error) {

        return sendError(
          res,
          422,
          error.message
        );
      }
    }

    await conn.beginTransaction();

    const [employeeRows] =
      await conn.query(
        `
        SELECT
          id,
          company_id
        FROM employees
        WHERE
          id = ?
          AND company_id = ?
          AND is_deleted = 0
          AND is_active = 1
        LIMIT 1
        `,
        [
          employee_id,
          companyId
        ]
      );

    if (
      !employeeRows.length
    ) {

      await conn.rollback();

      return sendError(
        res,
        404,
        "Employee not found"
      );
    }

    if (
      permission_package_id !== undefined &&
      permission_package_id !== null
    ) {

      const [packageRows] =
        await conn.query(
          `
          SELECT id
          FROM permission_packages
          WHERE
            id = ?
            AND company_id = ?
            AND is_deleted = 0
            AND is_active = 1
          LIMIT 1
          `,
          [
            permission_package_id,
            companyId
          ]
        );

      if (
        !packageRows.length
      ) {

        await conn.rollback();

        return sendError(
          res,
          404,
          "Invalid permission package"
        );
      }
    }

    const updateFields = [];
    const updateValues = [];

    if (
      designation !== undefined
    ) {

      updateFields.push(
        "designation=?"
      );

      updateValues.push(
        designation
      );
    }

    if (
      salary_type !== undefined
    ) {

      updateFields.push(
        "salary_type=?"
      );

      updateValues.push(
        salary_type
      );
    }

    if (
      employment_type !== undefined
    ) {

      updateFields.push(
        "employment_type=?"
      );

      updateValues.push(
        employment_type
      );
    }

    if (
      permission_package_id !== undefined
    ) {

      updateFields.push(
        "permission_package_id=?"
      );

      updateValues.push(
        permission_package_id ?? null
      );
    }

    if (
      shift_start !== undefined &&
      shift_end !== undefined
    ) {

      updateFields.push(
        "shift_start=?",
        "shift_end=?",
        "expected_work_minutes=?"
      );

      updateValues.push(
        shift_start,
        shift_end,
        calculatedMinutes
      );
    }

    if (
      normalizedBreakMinutes !== undefined
    ) {

      updateFields.push(
        "break_minutes=?"
      );

      updateValues.push(
        normalizedBreakMinutes
      );
    }

    if (
      normalizedGraceMinutes !== undefined
    ) {

      updateFields.push(
        "grace_minutes=?"
      );

      updateValues.push(
        normalizedGraceMinutes
      );
    }

    if (
      normalizedWeekends !== undefined
    ) {

      updateFields.push(
        "weekends=?"
      );

      updateValues.push(
        normalizedWeekends.length
          ? JSON.stringify(
            normalizedWeekends
          )
          : null
      );
    }

    updateFields.push(
      "updated_by=?"
    );

    updateValues.push(
      updatedBy
    );

    await conn.query(
      `
      UPDATE employees
      SET ${updateFields.join(", ")}
      WHERE
        id = ?
        AND company_id = ?
      `,
      [
        ...updateValues,
        employee_id,
        companyId
      ]
    );

    if (
      cleanedAttendance !== null
    ) {

      const [existingRows] =
        await conn.query(
          `
          SELECT
            id,
            method,
            is_deleted
          FROM employee_attendance_methods
          WHERE employee_id = ?
          `,
          [employee_id]
        );

      const existingMap =
        new Map(
          existingRows.map(
            (item) => [
              item.method,
              item
            ]
          )
        );

      const incomingMethods =
        cleanedAttendance.map(
          (item) =>
            item.method
        );

      const deleteIds =
        existingRows
          .filter(
            (item) =>
              item.is_deleted === 0 &&
              !incomingMethods.includes(
                item.method
              )
          )
          .map(
            (item) =>
              item.id
          );

      if (
        deleteIds.length
      ) {

        await conn.query(
          `
          UPDATE employee_attendance_methods
          SET
            is_deleted = 1,
            deleted_at = NOW(),
            deleted_by = ?
          WHERE id IN (?)
          `,
          [
            updatedBy,
            deleteIds
          ]
        );
      }

      for (const methodData of cleanedAttendance) {

        const existing =
          existingMap.get(
            methodData.method
          );

        if (!existing) {

          await conn.query(
            `
            INSERT INTO employee_attendance_methods (
              employee_id,
              method,
              is_auto,
              created_by
            )
            VALUES (?, ?, ?, ?)
            `,
            [
              employee_id,
              methodData.method,
              methodData.is_auto,
              updatedBy
            ]
          );
        }

        else if (
          existing.is_deleted === 1
        ) {

          await conn.query(
            `
            UPDATE employee_attendance_methods
            SET
              is_deleted = 0,
              deleted_at = NULL,
              deleted_by = NULL,
              is_auto = ?,
              updated_by = ?
            WHERE id = ?
            `,
            [
              methodData.is_auto,
              updatedBy,
              existing.id
            ]
          );
        }

        else {

          await conn.query(
            `
            UPDATE employee_attendance_methods
            SET
              is_auto = ?,
              updated_by = ?
            WHERE id = ?
            `,
            [
              methodData.is_auto,
              updatedBy,
              existing.id
            ]
          );
        }
      }
    }

    await conn.commit();

    return sendSuccess(
      res,
      200,
      "Employee updated successfully"
    );

  } catch (error) {

    if (conn) {

      try {
        await conn.rollback();
      } catch (_) { }
    }

    console.error(
      "[EMPLOYEE_UPDATE_ERROR]",
      error
    );

    return sendError(
      res,
      500,
      "Failed to update employee"
    );

  } finally {

    if (conn) {
      conn.release();
    }
  }
});

router.delete("/delete", auth(EMP.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const { id } = req.body;
    const deletedBy = req.user?.id;
    const companyId = req.company?.id;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "Invalid company context"
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Employee ID is required"
      });
    }

    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id, company_id, is_deleted
       FROM employees
       WHERE id=? AND company_id=?
       LIMIT 1 FOR UPDATE`,
      [id, companyId]
    );

    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    const employee = rows[0];

    if (employee.is_deleted) {
      await conn.rollback();
      return res.status(200).json({
        success: true,
        message: "Employee already deleted",
        data: { id }
      });
    }

    const [updateResult] = await conn.query(
      `UPDATE employees
       SET is_deleted = 1,
           is_active = 0,
           status = 'inactive',
           deleted_at = NOW(),
           deleted_by = ?
       WHERE id = ? AND company_id = ?`,
      [deletedBy, id, companyId]
    );

    if (!updateResult.affectedRows) {
      await conn.rollback();
      return res.status(500).json({
        success: false,
        message: "Failed to delete employee"
      });
    }

    await conn.query(
      `UPDATE employee_attendance_methods
       SET is_deleted = 1,
           is_active = 0,
           deleted_at = NOW(),
           deleted_by = ?
       WHERE employee_id = ?
         AND is_deleted = 0`,
      [deletedBy, id]
    );

    await conn.commit();

    return res.status(200).json({
      success: true,
      message: "Employee deleted successfully",
      data: { id },
    });

  } catch (error) {
    if (conn) await conn.rollback();

    console.error("EMPLOYEE_DELETE_ERROR:", {
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to delete employee"
    });

  } finally {
    if (conn) conn.release();
  }
});

router.get("/all-list", auth(EMP.MNG), async (req, res) => {
  try {
    let { search } = req.query;
    search = typeof search === "string" ? search.trim() : "";

    const queryParams = [];
    const companyId = req.company.id;

    let whereClause = `
            WHERE e.is_deleted = '0'
            AND e.company_id = ?
        `;
    queryParams.push(companyId);


    if (search) {
      whereClause += `
                AND (
                    e.employee_code LIKE ?
                    OR e.designation LIKE ?
                    OR u.name LIKE ?
                    OR u.email LIKE ?
                    OR u.phone LIKE ?
                )
            `;

      const s = `%${search}%`;
      queryParams.push(s, s, s, s, s);
    }


    const query = `
            SELECT
                e.id,
                e.employee_code,
                e.designation,
                e.status,
                e.salary_type,
                e.joining_date,
                e.employment_type,

                u.name,
                u.email,
                u.phone,
                u.profile_picture

            FROM employees e

            LEFT JOIN users u
                ON u.id = e.user_id
                AND u.is_deleted = '0'

            ${whereClause}

            ORDER BY e.id DESC
        `;

    const [rows] = await db.query(query, queryParams);

    return res.status(200).json({
      success: true,
      message: "Employee list retrieved successfully",
      count: rows.length,
      data: rows
    });

  } catch (error) {
    console.error("Error fetching employee list:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch employee list",
      error: error.message
    });
  }
});


const ALLOWED_INCLUDES = new Set([
  "basic",
  "permissions",
  "attendance",
  "salary",
  "payroll",
  "leaves",
  "shifts",
  "banks",
]);

function getPagination(query, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(query.limit, 10) || defaultLimit, maxLimit);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function buildMeta(total, page, limit, offset, dataLength) {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    total,
    total_pages: totalPages,
    page,
    limit,
    has_prev: page > 1,
    has_next: offset + dataLength < total,
    is_last_page: offset + dataLength >= total,
  };
}

function buildDateFilter(query, column) {
  if (query.date) {
    return { clause: `DATE(${column}) = ?`, params: [query.date] };
  }

  if (query.month && query.year) {
    const mm = String(query.month).padStart(2, "0");
    const first = `${query.year}-${mm}-01`;
    return {
      clause: `${column} BETWEEN ? AND LAST_DAY(?)`,
      params: [first, first],
    };
  }

  if (query.year) {
    return {
      clause: `${column} BETWEEN ? AND ?`,
      params: [`${query.year}-01-01`, `${query.year}-12-31`],
    };
  }

  if (query.from_date && query.to_date) {
    return {
      clause: `${column} BETWEEN ? AND ?`,
      params: [query.from_date, query.to_date],
    };
  }

  return { clause: null, params: [] };
}

function transformWeekends(raw) {
  if (!raw) return [];
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Object.entries(obj).map(([day, type]) => ({ day, type }));
  } catch {
    return [];
  }
}

function formatEmployeeRow(r) {
  return {
    ...r,
    profile_picture: buildFileUrl(r.profile_picture),
    weekends: transformWeekends(r.weekends),
    is_active: !!r.is_active,
    is_deleted: !!r.is_deleted,
    face_enrolled: !!r.face_enrolled,
    fingerprint_mapped: !!r.fingerprint_mapped,
  };
}

function buildDayStatusPayload(dayStatus, value1, value2) {
  const normalizedStatus = String(dayStatus || "").trim().toLowerCase();
  if (normalizedStatus === "half_day") {
    return { half_day_session: value1 || null };
  }
  if (normalizedStatus === "leave") {
    const leaveType = value1 || null;
    const payload = { leave_type: leaveType };
    if (String(leaveType || "").trim().toLowerCase() === "paid") {
      payload.leave_sub_type = value2 || null;
    }
    return payload;
  }
  return {};
}

router.get("/:id(\\d+)", auth(PROFILE.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const employeeId = parseInt(req.params.id, 10);
    const companyId = req.company?.id;

    if (!employeeId || employeeId <= 0 || !companyId) {
      return res.status(400).json({ success: false, message: "Invalid request" });
    }


    const rawIncludes = (req.query.include || "")
      .split(",")
      .map(i => i.trim())
      .filter(Boolean);

    if (rawIncludes.length > 1) {
      return res.status(400).json({
        success: false,
        message: "Only one include is allowed per request",
      });
    }

    const include = rawIncludes[0] || "basic";

    if (!ALLOWED_INCLUDES.has(include)) {
      return res.status(400).json({
        success: false,
        message: `Invalid include "${include}". Allowed: ${[...ALLOWED_INCLUDES].join(", ")}`,
      });
    }

    const result = await EmployeeService.getSection(conn, employeeId, companyId, include, req.query);

    console.log(result.data);


    return res.json({ success: true, data: result.data, meta: result.meta });

  } catch (err) {
    console.error("[GET /employees/:id]", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  } finally {
    conn?.release();
  }
});

function formatEmployeeBankAccount(row) {
  const base = {
    id: row.id,
    account_type: row.account_type,
    is_primary: !!row.is_primary,
    status: row.status,
  };

  if (row.account_type === "upi") {
    return {
      ...base,
      upi_id: row.upi_id,
      account_holder_name: row.account_holder_name,
    };
  }

  if (row.account_type === "cash") {
    return {
      ...base,
      account_holder_name: row.account_holder_name,
    };
  }

  return {
    ...base,
    bank_name: row.bank_name,
    account_holder_name: row.account_holder_name,
    account_number: row.account_number,
    ifsc_code: row.ifsc_code,
    branch_name: row.branch_name,
  };
}

class EmployeeService {

  static async getSection(conn, employeeId, companyId, include, query) {
    const [[exists]] = await conn.query(
      `SELECT id FROM employees WHERE id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1`,
      [employeeId, companyId]
    );
    if (!exists) return sendError(res, 404, "Employee not found");

    const handlers = {
      basic: EmployeeService._basic,
      permissions: EmployeeService._permissions,
      attendance: EmployeeService._attendance,
      salary: EmployeeService._salary,
      payroll: EmployeeService._payroll,
      leaves: EmployeeService._leaves,
      shifts: EmployeeService._shifts,
      banks: EmployeeService._banks,
    };

    return handlers[include](conn, employeeId, companyId, query);
  }

  static async _basic(conn, employeeId, companyId) {
    const [rows] = await conn.query(
      `SELECT
         e.id, e.company_id, e.user_id, e.employee_code, e.designation,
         e.salary_type, e.employment_type, e.joining_date, e.status,
         e.face_enrolled, e.fingerprint_mapped,
         e.shift_start, e.shift_end, e.expected_work_minutes,
         e.break_minutes, e.grace_minutes,
         e.weekends, e.is_active, e.is_deleted,
         e.created_at, e.updated_at,
         u.name, u.email, u.phone, u.profile_picture,
         pp.id           AS package_id,
         pp.package_name,
         pp.group_code
       FROM employees e
       JOIN users               u  ON  u.id  = e.user_id             AND u.is_deleted  = 0
       JOIN permission_packages pp ON pp.id  = e.permission_package_id AND pp.is_deleted = 0
       WHERE e.id = ? AND e.company_id = ? AND e.is_deleted = 0`,
      [employeeId, companyId]
    );

    const data = rows[0] ? formatEmployeeRow(rows[0]) : null;
    const n = data ? 1 : 0;

    return {
      data: { basic: data },
      meta: { basic: buildMeta(n, 1, 1, 0, n) },
    };
  }

  static async _permissions(conn, employeeId, _companyId, query) {
    const { page, limit, offset } = getPagination(query, 50, 200);

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM employees e
       JOIN permission_package_items ppi
         ON  ppi.package_id = e.permission_package_id
         AND ppi.is_deleted = 0
         AND ppi.is_active  = 1
       WHERE e.id = ? AND e.is_deleted = 0`,
      [employeeId]
    );

    const [rows] = await conn.query(
      `SELECT
         ppi.permission_id AS id,
         p.code,
         p.name,
         p.action
       FROM employees e
       JOIN permission_package_items ppi
         ON  ppi.package_id = e.permission_package_id
         AND ppi.is_deleted = 0
         AND ppi.is_active  = 1
       JOIN permissions p ON p.id = ppi.permission_id
       WHERE e.id = ? AND e.is_deleted = 0
       ORDER BY p.code ASC
       LIMIT ? OFFSET ?`,
      [employeeId, limit, offset]
    );

    return {
      data: { permissions: rows },
      meta: { permissions: buildMeta(total, page, limit, offset, rows.length) },
    };
  }

  static async _attendance(conn, employeeId, companyId, query) {
    const { page, limit, offset } = getPagination(query, 30, 100);
    const dateFilter = buildDateFilter(query, "a.attendance_date");

    let where = "a.employee_id = ? AND a.company_id = ? AND a.type = 'attendance'";
    const params = [employeeId, companyId];

    if (dateFilter.clause) {
      where += ` AND ${dateFilter.clause}`;
      params.push(...dateFilter.params);
    }


    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM attendance a WHERE ${where}`,
      params
    );


    const [rows] = await conn.query(
      `SELECT
         a.id,
         a.attendance_date,
         a.start_time,
         a.end_time,
         a.is_overtime,
         a.day_status,
         a.value1,
         a.value2,
         a.value3,
         a.is_deductible,
         a.is_verified,
         a.remark,
         a.created_by,

         lin.method        AS punch_in_method,
         lin.ip_address    AS punch_in_ip,
         lin.latitude      AS punch_in_latitude,
         lin.longitude     AS punch_in_longitude,

         lout.method       AS punch_out_method,
         lout.ip_address   AS punch_out_ip,
         lout.latitude     AS punch_out_latitude,
         lout.longitude    AS punch_out_longitude,

         b.id              AS break_id,
         b.start_time      AS break_start,
         b.end_time        AS break_end,
         b.is_deductible   AS break_is_deductible,
         b.remark          AS break_remark,

         blin.method       AS break_start_method,
         blout.method      AS break_end_method

       FROM attendance a

       /* punch-in log: latest 'start' entry */
       LEFT JOIN attendance_logs lin
         ON  lin.attendance_id = a.id
         AND lin.log_type      = 'start'
         AND lin.status        = 1
         AND lin.id = (
               SELECT MIN(al2.id)
               FROM   attendance_logs al2
               WHERE  al2.attendance_id = a.id
                 AND  al2.log_type = 'start'
                 AND  al2.status   = 1
             )

       /* punch-out log: latest 'end' entry */
       LEFT JOIN attendance_logs lout
         ON  lout.attendance_id = a.id
         AND lout.log_type      = 'end'
         AND lout.status        = 1
         AND lout.id = (
               SELECT MIN(al3.id)
               FROM   attendance_logs al3
               WHERE  al3.attendance_id = a.id
                 AND  al3.log_type = 'end'
                 AND  al3.status   = 1
             )

       /* same-day breaks (no explicit FK — matched by employee + date) */
       LEFT JOIN attendance b
         ON  b.employee_id     = a.employee_id
         AND b.company_id      = a.company_id
         AND b.attendance_date = a.attendance_date
         AND b.type            = 'break'

       /* break start log */
       LEFT JOIN attendance_logs blin
         ON  blin.attendance_id = b.id
         AND blin.log_type      = 'start'
         AND blin.status        = 1
         AND blin.id = (
               SELECT MIN(bl1.id)
               FROM   attendance_logs bl1
               WHERE  bl1.attendance_id = b.id
                 AND  bl1.log_type = 'start'
                 AND  bl1.status   = 1
             )

       /* break end log */
       LEFT JOIN attendance_logs blout
         ON  blout.attendance_id = b.id
         AND blout.log_type      = 'end'
         AND blout.status        = 1
         AND blout.id = (
               SELECT MIN(bl2.id)
               FROM   attendance_logs bl2
               WHERE  bl2.attendance_id = b.id
                 AND  bl2.log_type = 'end'
                 AND  bl2.status   = 1
             )

       WHERE ${where}
       ORDER BY a.attendance_date DESC, a.start_time DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );


    const grouped = {};
    const seenBreaks = {};

    for (const r of rows) {
      if (!grouped[r.id]) {
        grouped[r.id] = {
          id: r.id,
          attendance_date: r.attendance_date,
          start_time: r.start_time,
          end_time: r.end_time,
          day_status: r.day_status,
          ...buildDayStatusPayload(r.day_status, r.value1, r.value2),
          flags: {
            overtime: {
              enabled: !!r.is_overtime,
              minutes: r.value3 ? Number(r.value3) : 0
            },
            deductible: {
              enabled: !!r.is_deductible
            },
            half_day: {
              enabled: r.day_status === 'half_day'
            }
          },
          is_verified: !!r.is_verified,
          remark: r.remark,
          punch_in_method: r.punch_in_method,
          punch_in_ip: r.punch_in_ip,
          punch_in_latitude: r.punch_in_latitude,
          punch_in_longitude: r.punch_in_longitude,
          punch_out_method: r.punch_out_method,
          punch_out_ip: r.punch_out_ip,
          punch_out_latitude: r.punch_out_latitude,
          punch_out_longitude: r.punch_out_longitude,
          breaks: [],
        };
        seenBreaks[r.id] = new Set();
      }

      if (r.break_id && !seenBreaks[r.id].has(r.break_id)) {
        seenBreaks[r.id].add(r.break_id);
        grouped[r.id].breaks.push({
          id: r.break_id,
          start_time: r.break_start,
          end_time: r.break_end,
          is_deductible: !!r.break_is_deductible,
          remark: r.break_remark,
          break_start_method: r.break_start_method,
          break_end_method: r.break_end_method,
        });
      }
    }

    const data = Object.values(grouped);
    return {
      data: { attendance: data },
      meta: { attendance: buildMeta(total, page, limit, offset, data.length) },
    };
  }

  static async _salary(conn, employeeId, _companyId, query) {
    const { page, limit, offset } = getPagination(query, 10, 50);
    const dateFilter = buildDateFilter(query, "ss.effective_from");

    let where = "ss.employee_id = ? AND ss.is_deleted = 0";
    const params = [employeeId];

    if (dateFilter.clause) {
      where += ` AND ${dateFilter.clause}`;
      params.push(...dateFilter.params);
    }

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM salary_structures ss WHERE ${where}`,
      params
    );

    const [rows] = await conn.query(
      `SELECT
         ss.id             AS salary_id,
         ss.base_amount,
         ss.effective_from,
         ss.effective_to,
         ss.is_active      AS is_active,
         esc.id            AS component_id,
         sc.name           AS component_name,
         sc.code           AS component_code,
         sc.type,
         esc.calc_type,
         esc.calc_value
       FROM salary_structures ss
       LEFT JOIN employee_salary_component esc
         ON  esc.salary_id  = ss.id
         AND esc.is_deleted = 0
         AND esc.is_active  = 1
       LEFT JOIN salary_components sc
         ON  sc.id         = esc.component_id
         AND sc.is_deleted = 0
       WHERE ${where}
       ORDER BY ss.effective_from DESC, sc.type ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const grouped = {};

    for (const r of rows) {
      if (!grouped[r.salary_id]) {
        grouped[r.salary_id] = {
          salary_id: r.salary_id,

          base_amount: Number(r.base_amount) || 0,
          effective_from: r.effective_from,
          effective_to: r.effective_to,

          components: [],
        };
      }

      if (r.component_id) {
        grouped[r.salary_id].components.push({
          id: r.component_id,
          code: r.component_code,
          name: r.component_name,
          type: r.type,
          calc_type: r.calc_type,
          calc_value: r.calc_value,
        });
      }
    }

    const data = Object.values(grouped).map((salary) => {
      const base = Number(salary.base_amount) || 0;

      let total_earnings = base;
      let total_deductions = 0;
      let employer_contributions = 0;

      salary.components.forEach((c) => {
        let amount =
          c.calc_type === "percentage"
            ? (base * Number(c.calc_value)) / 100
            : Number(c.calc_value);

        amount = Number(amount.toFixed(2));

        c.amount = amount;

        if (c.type === "earning") {
          total_earnings += amount;
        } else if (c.type === "deduction") {
          total_deductions += amount;
        } else if (c.type === "employer_contribution") {
          employer_contributions += amount;
        }
      });

      const gross_salary = Number(total_earnings.toFixed(2));
      const total_deductions_clean = Number(total_deductions.toFixed(2));
      const employer_contributions_clean = Number(
        employer_contributions.toFixed(2)
      );

      const net_salary = Math.max(
        0,
        Number((gross_salary - total_deductions_clean).toFixed(2))
      );

      const ctc = Number(
        (gross_salary + employer_contributions_clean).toFixed(2)
      );

      return {
        salary_id: salary.salary_id,

        base_amount: base,
        effective_from: salary.effective_from,
        effective_to: salary.effective_to,

        ctc,
        gross_salary,
        employer_contributions: employer_contributions_clean,
        total_deductions: total_deductions_clean,
        net_salary,

        components: salary.components,
      };
    });

    return {
      data: { salary: data },
      meta: {
        salary: buildMeta(
          total,
          page,
          limit,
          offset,
          data.length
        ),
      },
    };
  }

  static async _payroll(conn, employeeId, _companyId, query) {
    const { page, limit, offset } = getPagination(query, 12, 24);
    const dateFilter = buildDateFilter(query, "pe.payroll_period");

    let where = "pe.employee_id = ? AND pe.is_deleted = 0";
    const params = [employeeId];

    if (dateFilter.clause) {
      where += ` AND ${dateFilter.clause}`;
      params.push(...dateFilter.params);
    }

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM payroll_entries pe WHERE ${where}`,
      params
    );

    const [rows] = await conn.query(
      `SELECT
         pe.id,
         pe.payroll_period,
         pe.net_salary,
         pe.total_earnings,
         pe.total_deductions,
         pe.working_days,
         pe.present_days,
         pe.absent_days,
         pe.paid_leave_days,
         pe.unpaid_leave_days,
         pe.overtime_minutes,
         pe.worked_minutes,
         pe.deduction_minutes,
         pe.snapshot_designation,
         pe.snapshot_employment_type,
         pe.snapshot_salary_type,
         pe.snapshot_base_amount,
         pec.component_code,
         pec.component_name,
         pec.component_type,
         pec.amount
       FROM payroll_entries pe
       LEFT JOIN payroll_entry_components pec
         ON  pec.entry_id  = pe.id
         AND pec.is_active = 1
       WHERE ${where}
       ORDER BY pe.payroll_period DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const grouped = {};

    for (const r of rows) {
      if (!grouped[r.id]) {
        const payrollDate = new Date(r.payroll_period);
        grouped[r.id] = {
          payroll: {
            id: r.id,

            month: payrollDate.getMonth() + 1,
            year: payrollDate.getFullYear(),

            net_salary: r.net_salary,
            total_earnings: r.total_earnings,
            total_deductions: r.total_deductions,

            attendance: {
              working_days: r.working_days,
              present_days: r.present_days,
              absent_days: r.absent_days,
              paid_leave_days: r.paid_leave_days,
              unpaid_leave_days: r.unpaid_leave_days
            },

            work: {
              worked_minutes: r.worked_minutes || 0,
              overtime_minutes: r.overtime_minutes || 0,
              deduction_minutes: r.deduction_minutes || 0
            },

            components_breakdown: {
              earnings: [],
              deductions: []
            },

            adjustments: [],

            snapshot: {
              designation: r.snapshot_designation,
              employment_type: r.snapshot_employment_type,
              salary_type: r.snapshot_salary_type,
              base_amount: r.snapshot_base_amount
            }
          }
        };
      }

      if (r.component_code) {
        const component = {
          name: r.component_name,
          amount: r.amount
        };

        if (r.component_type === "earning") {
          grouped[r.id]
            .payroll
            .components_breakdown
            .earnings
            .push(component);
        }

        if (r.component_type === "deduction") {
          grouped[r.id]
            .payroll
            .components_breakdown
            .deductions
            .push(component);
        }
      }
    }

    const data = Object.values(grouped);

    return {
      data: data,
      meta: {
        payroll: buildMeta(
          total,
          page,
          limit,
          offset,
          data.length
        )
      }
    };
  }

  static async _leaves(conn, employeeId, _companyId, query) {
    const { page, limit, offset } = getPagination(query, 20, 100);
    const year = parseInt(query.year, 10) || new Date().getFullYear();
    const dateFilter = buildDateFilter(query, "el.start_date");


    let where = "el.employee_id = ? AND el.is_deleted = 0";
    const params = [employeeId];

    if (dateFilter.clause) {
      where += ` AND ${dateFilter.clause}`;
      params.push(...dateFilter.params);
    }
    if (query.status) {
      where += " AND el.status = ?";
      params.push(query.status);
    }
    if (query.leave_code) {
      where += " AND lc.code = ?";
      params.push(query.leave_code);
    }

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM employee_leaves el
       JOIN leave_configs lc ON lc.id = el.leave_config_id AND lc.is_deleted = 0
       WHERE ${where}`,
      params
    );

    const [rows] = await conn.query(
      `SELECT
         el.id,
         el.start_date,
         el.end_date,
         el.total_days,
         el.status,
         el.reason,
         el.is_half_day,
         el.half_day_type,
         el.applied_at,
         el.approved_at,
         el.approval_remarks,
         lc.name AS leave_type,
         lc.code AS leave_code,
         lc.is_paid,
         ela.file_url,
         ela.file_type
       FROM employee_leaves el
       JOIN leave_configs lc
         ON  lc.id         = el.leave_config_id
         AND lc.is_deleted = 0
       LEFT JOIN employee_leave_attachments ela
         ON  ela.leave_id   = el.id
         AND ela.is_deleted = 0
       WHERE ${where}
       ORDER BY el.start_date DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.id]) {
        grouped[r.id] = {
          id: r.id,
          start_date: r.start_date,
          end_date: r.end_date,
          total_days: r.total_days,
          status: r.status,
          reason: r.reason,
          is_half_day: !!r.is_half_day,
          half_day_type: r.half_day_type,
          applied_at: r.applied_at,
          approved_at: r.approved_at,
          approval_remarks: r.approval_remarks,
          leave_type: r.leave_type,
          leave_code: r.leave_code,
          is_paid: !!r.is_paid,
          attachments: [],
        };
      }
      if (r.file_url) {
        grouped[r.id].attachments.push({ file_url: r.file_url, file_type: r.file_type });
      }
    }


    const [balRows] = await conn.query(
      `SELECT
         elb.leave_config_id,
         lc.code,
         lc.name,
         lc.is_paid,
         elb.year,
         elb.total_allocated,
         elb.used,
         elb.remaining
       FROM employee_leave_balances elb
       JOIN leave_configs lc
         ON  lc.id         = elb.leave_config_id
         AND lc.is_deleted = 0
       WHERE elb.employee_id = ?
         AND elb.year        = ?
         AND elb.is_deleted  = 0
         AND elb.is_active   = 1
       ORDER BY lc.name ASC`,
      [employeeId, year]
    );

    const data = Object.values(grouped);
    return {
      data: { leaves: data, leave_balances: balRows },
      meta: { leaves: { ...buildMeta(total, page, limit, offset, data.length), year } },
    };
  }

  static async _shifts(conn, employeeId, companyId, query) {
    const { page, limit, offset } = getPagination(query, 30, 100);
    const dateFilter = buildDateFilter(query, "shift_date");

    let where = "employee_id = ? AND company_id = ? AND is_deleted = 0";
    const params = [employeeId, companyId];

    if (dateFilter.clause) {
      where += ` AND ${dateFilter.clause}`;
      params.push(...dateFilter.params);
    }

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total
     FROM shifts
     WHERE ${where}`,
      params
    );

    const [rows] = await conn.query(
      `SELECT
       id,
       shift_date,
       start_time,
       end_time,
       expected_work_minutes,
       worked_minutes,
       allowed_break_minutes,
       extra_break_minutes,
       early_leave_minutes,
       late_minutes,
       overtime_minutes,
       deductible_minutes,
       day_status,
       value1,
       value2,
       is_deductible,
       is_overtime
     FROM shifts
     WHERE ${where}
     ORDER BY shift_date DESC
     LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map((r) => {
      const item = {
        id: r.id,

        shift_date: r.shift_date,

        start_time: r.start_time,
        end_time: r.end_time,

        expected_work_minutes: r.expected_work_minutes,
        worked_minutes: r.worked_minutes,

        allowed_break_minutes: r.allowed_break_minutes,
        extra_break_minutes: r.extra_break_minutes,

        late_minutes: r.late_minutes,
        early_leave_minutes: r.early_leave_minutes,

        overtime_minutes: r.overtime_minutes,
        deductible_minutes: r.deductible_minutes,

        day_status: r.day_status,

        is_deductible: !!r.is_deductible,
        is_overtime: !!r.is_overtime,
      };

      if (r.day_status === "half_day") {
        item.half_day_type = r.value1 || null;
      }

      if (r.day_status === "leave") {
        item.leave_type = r.value1 || null;
        item.leave_type_value = r.value2 || null;
      }

      return item;
    });

    return {
      data: data,
      meta: {
        shifts: buildMeta(
          total,
          page,
          limit,
          offset,
          data.length
        ),
      },
    };
  }

  static async _banks(conn, employeeId, companyId, query) {
    const { page, limit, offset } = getPagination(query, 20, 100);

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM bank_accounts
       WHERE employee_id = ? AND company_id = ? AND is_deleted = 0`,
      [employeeId, companyId]
    );

    const [rows] = await conn.query(
      `SELECT
         id,
         account_type,
         bank_name,
         account_holder_name,
         account_number,
         ifsc_code,
         branch_name,
         upi_id,
         is_primary,
         status
       FROM bank_accounts
       WHERE employee_id = ? AND company_id = ? AND is_deleted = 0
       ORDER BY is_primary DESC, created_at ASC
       LIMIT ? OFFSET ?`,
      [employeeId, companyId, limit, offset]
    );

    const data = rows.map(formatEmployeeBankAccount);

    return {
      data: { banks: data },
      meta: { banks: buildMeta(total, page, limit, offset, data.length) },
    };
  }
}

const handleFaceEnrollCheck = async (req, res) => {
  let conn;

  try {
    const companyId = safeNumber(req.company?.id, 0);
    const employeeId = safeNumber(
      req.body?.employee_id ?? req.query?.employee_id,
      0
    );
    const imageUrl = String(req.body?.image ?? req.query?.image ?? "").trim();

    if (!companyId || companyId <= 0) {
      return sendError(res, 401, "Unauthorized company");
    }

    if (!imageUrl) {
      return sendError(res, 400, "Valid image URL required");
    }

    conn = await db.getConnection();

    const result = await runFaceCheck(conn, {
      companyId,
      imageUrl,
      employeeId
    });

    if (result.success) {
      return sendSuccess(res, 200, result.message, result.responseData);
    }

    return sendError(
      res,
      result.statusCode,
      result.message,
      result.responseData
    );
  } catch (error) {
    console.error("Face enroll check ERROR:", error);
    const message =
      error?.response?.data?.message ||
      error?.message ||
      "Failed to check face enrollment";
    const status = error?.response ? 400 : 500;
    return sendError(res, status, message);
  } finally {
    if (conn) conn.release();
  }
};

router.post("/face-enroll/set", auth(EMP.MNG), async (req, res) => {
  try {
    const companyId = safeNumber(req.company?.id, 0);
    const employeeId = safeNumber(req.body?.employee_id, 0);
    const imageUrl = String(req.body?.image || "").trim();

    if (!companyId || companyId <= 0) {
      return sendError(res, 401, "Unauthorized company");
    }

    if (!employeeId || employeeId <= 0) {
      return sendError(res, 400, "Valid employee_id required");
    }

    if (!imageUrl) {
      return sendError(res, 400, "Valid image URL required");
    }

    const payload = {
      employee_id: employeeId,
      company_id: companyId,
      image: imageUrl
    };

    const { data } = await axios.post(`${FACE_SERVICE_URL}/set`, payload);

    console.log("[FACE_SET_RESPONSE]", {
      payload,
      response: data
    });

    if (data?.success) {
      return sendSuccess(res, 200, data.message || "Face enrolled successfully", {
        employee_id: data.employee_id ?? employeeId,
        employee_name: data.employee_name ?? null,
        company_id: data.company_id ?? companyId,
        face_enrolled: true
      });
    }

    const status =
      String(data?.message || "")
        .toLowerCase()
        .includes("not found")
        ? 404
        : 400;

    return sendError(res, status, data?.message || "Failed to enroll face");
  } catch (error) {
    console.error("POST /employees/face-enroll/set ERROR:", error);
    const message =
      error?.response?.data?.message ||
      error?.message ||
      "Failed to enroll face";
    const status = error?.response ? 400 : 500;
    return sendError(res, status, message);
  }
});

router.get("/face-enroll/check", auth(EMP.MNG), handleFaceEnrollCheck);
router.post("/face-enroll/check", auth(EMP.MNG), handleFaceEnrollCheck);

router.put("/face-enroll/delete", auth(EMP.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const companyId = safeNumber(req.company?.id, 0);
    const employeeId = safeNumber(req.body?.employee_id, 0);

    if (!companyId || companyId <= 0) {
      return sendError(res, 401, "Unauthorized company");
    }

    if (!employeeId || employeeId <= 0) {
      return sendError(res, 400, "Valid employee_id required");
    }

    const [[employee]] = await conn.query(
      `SELECT id, face_enrolled, face_data
       FROM employees
       WHERE user_id = ?
         AND company_id = ?
         AND is_deleted = 0
       LIMIT 1`,
      [employeeId, companyId]
    );

    if (!employee) {
      return sendError(res, 404, "Employee not found");
    }

    const isFaceEnrolled =
      toBoolean(employee.face_enrolled) || Boolean(employee.face_data);

    if (!isFaceEnrolled) {
      return sendError(res, 400, "Face enrollment is not set for this employee");
    }

    await conn.query(
      `UPDATE employees
       SET
         face_enrolled = 0,
         face_data = NULL,
         updated_by = ?,
         updated_at = NOW()
       WHERE user_id = ?
         AND company_id = ?`,
      [req.user?.id || null, employeeId, companyId]
    );

    return sendSuccess(res, 200, "Face enrollment deleted successfully", {
      employee_id: employeeId,
      face_enrolled: false
    });
  } catch (error) {
    console.error("PUT /employees/face-enroll/delete ERROR:", error);
    return sendError(res, 500, "Failed to delete face enrollment");
  } finally {
    if (conn) conn.release();
  }
});

router.get("/face-enroll/list", auth(EMP.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const companyId = safeNumber(req.company?.id, 0);
    const { page, limit, offset } = getPagination(req.query, 20, 100);
    const search = String(req.query?.search || "").trim();

    if (!companyId || companyId <= 0) {
      return sendError(res, 401, "Unauthorized company");
    }

    let whereClause = `
      WHERE e.company_id = ?
        AND e.is_deleted = 0
        AND u.is_deleted = 0
    `;
    const queryParams = [companyId];

    if (search) {
      whereClause += `
        AND (
          e.employee_code LIKE ?
          OR e.designation LIKE ?
          OR u.name LIKE ?
          OR u.email LIKE ?
          OR u.phone LIKE ?
        )
      `;
      const keyword = `%${search}%`;
      queryParams.push(keyword, keyword, keyword, keyword, keyword);
    }

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM employees e
       INNER JOIN users u ON u.id = e.user_id
       ${whereClause}`,
      queryParams
    );

    const [rows] = await conn.query(
      `SELECT
         e.user_id AS employee_id,
         e.employee_code,
         e.face_enrolled,
         u.name,
         u.email,
         u.phone,
         u.profile_picture
       FROM employees e
       INNER JOIN users u ON u.id = e.user_id
       ${whereClause}
       ORDER BY u.name ASC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );


    const data = [];

    for (const row of rows) {
      data.push({
        employee_id: row.employee_id,
        employee_code: row.employee_code,
        name: row.name,
        email: row.email,
        phone: row.phone,
        profile_picture: buildFileUrl(row.profile_picture),
        face_enrolled: toBoolean(row.face_enrolled)
      });
    }

    return res.status(200).json({
      success: true,
      message: "Face enrolled employee list fetched successfully",
      data,
      meta: {
        total,
        page,
        limit,
        offset,
        total_pages: Math.ceil(total / limit) || 1
      }
    });
  } catch (error) {
    console.error("GET /employees/face-enroll/list ERROR:", error);
    return sendError(res, 500, "Failed to fetch face enrolled employee list");
  } finally {
    if (conn) conn.release();
  }
});

export default router;
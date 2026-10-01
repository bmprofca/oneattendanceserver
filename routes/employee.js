import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import { DESIGNATIONS, EMPLOYMENT_TYPES, SALARY_TYPES } from "../constants/constants_values.js";
import {
  validateFields, employmentValidation, salaryValidation,
  designationValidation, attendanceMethodValidation, getEnumObject,
} from "../utils/constantsValidator.js";
import {
  sendSuccess, sendError, safeNumber, buildMeta, parseJSONSafe, sanitizeText
} from "../utils/sendResponse.js";
import { buildFileUrl } from "../utils/fileService.js";
import { PERMISSIONS } from "../constants/permissions.js";
import getClientMeta from "../utils/ipHelper.js";
import {
  generateOTP, hashPassword, assessOtp, generateSessionToken, generateRandomToken,
} from "../utils/auth.js";
import { queueSignupOTPEmail, sendQueuedWelcomeEmail } from "../email/services/email.processor.js";
import { runFaceCheck } from "../utils/faceCheckUtil.js";
import { parseFaceEmbedding } from "../utils/faceEmbedding.js";
import {
  parseDate, parseTime, formatIST, getCurrentDate, getCurrentTime, diffMinutes,
  addMinutesToTime, isValidTimeRange, buildShiftAnchor, alignTimeToShift,
  shiftNextDayIfBefore, diffMinutesBetween, formatDatetime, formatTime12Hour,
  formatMinutes, addDays, getDaysInMonth, buildMonthDateRange, normalizeWeekends,
  getDayName, weekendInfo, getSalaryStatus, normalizeHalfDayType, parseOvertimeValue,
  diffMilliseconds, earliestDt, latestDt, parseISTDateTime, isDateAfter, isDateBefore,
  isSameDate, isBeforeJoining, isDateTimeBefore, isDateTimeAfter, isDateTimeSame,
  getDateTimeDiffDays, getISTNow, toIST, compareDates, compareDateTimes, formatUTCToIST,
} from "../utils/time.js";
import { FRONTEND_URL, EMAIL_USER } from "../config/config.js";
import { normalizeIndianMobile } from "../utils/mobile.js";
import { sendOtpSms } from "../utils/sms.js";
import { sendOtpWhatsApp } from "../utils/whatsapp.js";


const timeStringToMinutes = (value) => {
  if (value === null || value === undefined) return NaN;
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return NaN;
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    const parsed = parseTime(trimmed);
    if (parsed) {
      return parsed.hour() * 60 + parsed.minute() + Math.floor(parsed.second() / 60);
    }
  }
  return NaN;
};

const isValidDate = (value) => !!parseDate(value);

const formatEmployee = (row) => {
  const weekendsObj = parseJSONSafe(row.weekends, []);
  return {
    id: row.id,
    company_id: row.company_id,
    user_id: row.user_id,
    employee_code: row.employee_code,
    designation: getEnumObject(DESIGNATIONS, row.designation),
    salary_type: getEnumObject(SALARY_TYPES, row.salary_type),
    employment_type: getEnumObject(EMPLOYMENT_TYPES, row.employment_type),
    joining_date: row.joining_date,
    status: row.status,
    face_enrolled: !!row.face_enrolled,
    fingerprint_mapped: !!row.fingerprint_mapped,
    shift_start: row.shift_start,
    shift_end: row.shift_end,
    expected_work_minutes: row.expected_work_minutes,
    break_minutes: row.break_minutes || 0,
    grace_minutes: row.grace_minutes || 0,
    enable_overtime: !!row.enable_overtime,
    enable_deduction: !!row.enable_deduction,
    weekends: normalizeWeekends(weekendsObj),
    is_active: !!row.is_active,
    is_deleted: !!row.is_deleted,
    created_at: row.created_at,
    updated_at: row.updated_at,
    name: row.name,
    email: row.email,
    phone: row.phone,
    is_system_admin: !!row.is_system_admin,
    last_login: row.last_login,
    profile_picture: buildFileUrl(row.profile_picture),
    package: {
      id: row.package_id,
      package_name: row.package_name,
      group_code: row.group_code,
      description: row.description,
    },
  };
};

const normalizeSignupType = (value) => {
  if (!value || typeof value !== "string") return null;
  const type = value.toLowerCase().trim();
  if (type === "email") return "email";
  if (type === "phone" || type === "mobile") return "phone";
  return null;
};

const hasNonEmptyString = (value) =>
  typeof value === "string" && value.trim() !== "";

const resolveSignupRequestPayload = (body) => {
  const { signup_type, email, phone } = body || {};
  const signupType = normalizeSignupType(signup_type);
  if (!signupType) {
    return { error: { status: 400, message: "Valid signup_type is required (email/phone)" } };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (signupType === "email") {
    if (!hasNonEmptyString(email)) {
      return { error: { status: 400, message: "Email is required for email signup" } };
    }
    if (hasNonEmptyString(phone)) {
      return { error: { status: 400, message: "Phone is not allowed for email signup" } };
    }
    const normalizedEmail = email.trim().toLowerCase().replace(/[^\w@.+_-]/g, '').replace(/^,+|,+$/g, '');
    if (!emailRegex.test(normalizedEmail)) {
      return { error: { status: 400, message: "Invalid email format" } };
    }
    return { signupType, normalizedEmail, normalizedPhone: "", otpEmail: normalizedEmail };
  }
  if (phone === undefined || phone === null || phone === "") {
    return { error: { status: 400, message: "Phone is required for phone signup" } };
  }
  if (hasNonEmptyString(email)) {
    return { error: { status: 400, message: "Email is not allowed for phone signup" } };
  }
  const normalizedPhone = normalizeIndianMobile(phone);
  if (!normalizedPhone) {
    return { error: { status: 400, message: "Invalid phone number" } };
  }
  return { signupType, normalizedEmail: "", normalizedPhone, otpEmail: "" };
};

const resolveSignupPayload = (body) => {
  const { signup_type, email, phone, otp, name } = body || {};
  const signupType = normalizeSignupType(signup_type);
  if (!signupType) {
    return { error: { status: 400, message: "Valid signup_type is required (email/phone)" } };
  }
  if (!otp) {
    return { error: { status: 400, message: "OTP is required" } };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (signupType === "email") {
    if (!hasNonEmptyString(email)) {
      return { error: { status: 400, message: "Email is required for email signup" } };
    }
    if (hasNonEmptyString(phone)) {
      return { error: { status: 400, message: "Phone is not allowed for email signup" } };
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) {
      return { error: { status: 400, message: "Invalid email format" } };
    }
    return { signupType, normalizedEmail, normalizedPhone: "", otp, name: name?.trim() || null };
  }
  if (!hasNonEmptyString(phone)) {
    return { error: { status: 400, message: "Phone is required for phone signup" } };
  }
  if (hasNonEmptyString(email)) {
    return { error: { status: 400, message: "Email is not allowed for phone signup" } };
  }
  const normalizedPhone = normalizeIndianMobile(phone);
  if (!normalizedPhone) {
    return { error: { status: 400, message: "Invalid phone number" } };
  }
  return { signupType, normalizedEmail: "", normalizedPhone, otp, name: name?.trim() || null };
};

const getPagination = (query, defaultLimit = 20, maxLimit = 100) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(query.limit, 10) || defaultLimit, maxLimit);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const EMPLOYEE_COLUMNS = [
  "e.id", "e.company_id", "e.user_id", "e.employee_code", "e.designation",
  "e.salary_type", "e.employment_type", "e.joining_date", "e.status",
  "e.face_enrolled", "e.fingerprint_mapped",
  "e.shift_start", "e.shift_end", "e.expected_work_minutes",
  "e.break_minutes", "e.grace_minutes", "e.enable_overtime", "e.enable_deduction",
  "e.weekends", "e.is_active", "e.is_deleted",
  "e.created_at", "e.updated_at"
].join(", ");

const USER_COLUMNS = "u.name, u.email, u.phone, u.is_system_admin, u.last_login, u.profile_picture";
const PACKAGE_COLUMNS = "pp.id AS package_id, pp.package_name, pp.group_code, pp.description";

const FULL_EMPLOYEE_SELECT = `${EMPLOYEE_COLUMNS}, ${USER_COLUMNS}, ${PACKAGE_COLUMNS}`;

const PERMISSIONS_SUBQUERY = `(
  SELECT JSON_ARRAYAGG(JSON_OBJECT('permission_id', p.id, 'code', p.code, 'description', p.description, 'action', p.action, 'category', p.category))
  FROM permission_package_items ppi
  JOIN permissions p ON p.id = ppi.permission_id
  WHERE ppi.package_id = pp.id AND ppi.is_active = 1 AND ppi.is_deleted = 0
) AS permissions`;

const ATTENDANCE_METHODS_SUBQUERY = `e.attendance_methods, e.is_auto`;

const LEAVE_BALANCES_SUBQUERY = `(
  SELECT JSON_ARRAYAGG(JSON_OBJECT(
    'leave_config_id', lc.id, 'leave_code', lc.code, 'leave_name', lc.name,
    'is_paid', lc.is_paid, 'allow_half_day', lc.allow_half_day,
    'total_allocated', elb.total_allocated, 'used', elb.used, 'remaining', elb.remaining
  ))
  FROM employee_leave_balances elb
  JOIN leave_configs lc ON lc.id = elb.leave_config_id AND lc.is_deleted = 0 AND lc.is_active = 1
  WHERE elb.employee_id = e.id AND elb.company_id = e.company_id
    AND elb.is_deleted = 0 AND elb.is_active = 1
) AS leave_balances`;

const USER_LEFT_JOIN = `LEFT JOIN users u ON u.id = e.user_id AND u.is_deleted = 0`;
const USER_INNER_JOIN = `JOIN users u ON u.id = e.user_id AND u.is_deleted = 0`;

const PACKAGE_LEFT_JOIN = `LEFT JOIN permission_packages pp ON pp.id = e.permission_package_id AND pp.is_deleted = 0 AND pp.is_active = 1`;
const PACKAGE_INNER_JOIN = `JOIN permission_packages pp ON pp.id = e.permission_package_id AND pp.is_deleted = 0`;

const router = express.Router();

router.post("/request-create-otp", auth([PERMISSIONS.EMPLOYEES]), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const resolved = resolveSignupRequestPayload(req.body);
    if (resolved.error) {
      return sendError(res, resolved.error.status, resolved.error.message);
    }

    const { signupType, normalizedEmail, normalizedPhone, otpEmail } = resolved;
    const companyId = req.company?.id;

    if (!companyId) {
      return sendError(res, 400, "Company context missing");
    }

    const [[loggedInUser]] = await conn.query(
      `SELECT email, phone FROM users WHERE id = ? AND is_deleted = 0 LIMIT 1`,
      [req.user?.id]
    );
    const loggedInEmail = loggedInUser?.email?.trim().toLowerCase() || "";
    let loggedInPhone = loggedInUser?.phone ? String(loggedInUser.phone) : "";
    if (loggedInPhone) {
      try {
        loggedInPhone = normalizeIndianMobile(loggedInPhone);
      } catch {
        loggedInPhone = loggedInPhone.replace(/\D/g, "");
      }
    }

    const isSelfSignup = signupType === "email"
      ? loggedInEmail === normalizedEmail
      : loggedInPhone === normalizedPhone || loggedInPhone === String(normalizedPhone).replace(/^91/, "");
    if (isSelfSignup) {
      return sendError(res, 400, "You cannot add yourself as an employee");
    }

    const ownerContactColumn = signupType === "email" ? "u.email" : "u.phone";
    const ownerContactValue = signupType === "email" ? normalizedEmail : normalizedPhone;
    const [[companyOwner]] = await conn.query(
      `SELECT c.owner_user_id
       FROM companies c
       INNER JOIN users u ON u.id = c.owner_user_id AND u.is_deleted = 0
       WHERE c.id = ? AND ${ownerContactColumn} = ?
       LIMIT 1`,
      [companyId, ownerContactValue]
    );
    if (companyOwner) {
      return sendError(res, 409, "Company owner cannot be added as an employee");
    }

    const employeeContactColumn = signupType === "email" ? "u.email" : "u.phone";
    const employeeContactValue = signupType === "email" ? normalizedEmail : normalizedPhone;
    const [[existingEmployee]] = await conn.query(
      `SELECT e.id
       FROM employees e
       INNER JOIN users u ON u.id = e.user_id AND u.is_deleted = 0
       WHERE e.company_id = ? AND e.is_deleted = 0 AND ${employeeContactColumn} = ?
       LIMIT 1`,
      [companyId, employeeContactValue]
    );
    if (existingEmployee) {
      return sendError(res, 409, "User is already an employee in this company");
    }

    const [[existingUser]] = await conn.query(
      `SELECT id, name FROM users WHERE ${signupType === "email" ? "email" : "phone"} = ? AND is_deleted = 0 LIMIT 1`,
      [employeeContactValue]
    );

    const rateLimitColumn = signupType === "phone" ? "phone" : "email";
    const rateLimitValue = signupType === "phone" ? normalizedPhone : normalizedEmail;
    const clientMeta = getClientMeta(req);
    const ip = clientMeta?.ip_v4 || clientMeta?.ip_v6 || "unknown";

    const [[recentOtp]] = await conn.query(
      `SELECT COUNT(*) AS count FROM otps WHERE ${rateLimitColumn} = ? AND otp_purpose = 'employee_create' AND created_at > NOW() - INTERVAL 30 SECOND`,
      [rateLimitValue]
    );
    if (recentOtp.count >= 5) {
      return sendError(res, 429, "Wait 30 seconds before requesting another OTP");
    }
    const [[recentIp]] = await conn.query(
      `SELECT COUNT(*) AS count FROM otps WHERE ip_address = ? AND otp_purpose = 'employee_create' AND created_at > NOW() - INTERVAL 30 SECOND`,
      [ip]
    );
    if (recentIp.count >= 10) {
      return sendError(res, 429, "Too many requests from this IP");
    }

    const otp = generateOTP();
    const otpHash = await hashPassword(otp);
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    const invalidateOtpSql = signupType === "phone"
      ? `phone = ? AND otp_purpose = 'employee_create' AND used_at IS NULL`
      : `email = ? AND otp_purpose = 'employee_create' AND used_at IS NULL`;
    const invalidateOtpParams = signupType === "phone" ? [normalizedPhone] : [otpEmail];
    await conn.query(`UPDATE otps SET used_at = NOW() WHERE ${invalidateOtpSql}`, invalidateOtpParams);

    await conn.query(
      `INSERT INTO otps (email, phone, otp_purpose, otp_hash, otp_expiry, used_at, ip_address)
       VALUES (?, ?, 'employee_create', ?, ?, NULL, ?)`,
      [otpEmail, normalizedPhone, otpHash, otpExpiry, ip]
    );

    if (signupType === "email" && normalizedEmail) {
      try {
        await queueSignupOTPEmail({
          to: normalizedEmail,
          userName: normalizedEmail,
          otp,
          fromEmail: EMAIL_USER,
          fromName: "OneAttendance",
          replyTo: EMAIL_USER
        });
      } catch (err) {
        console.error("EMPLOYEE OTP EMAIL ERROR:", err);
        return sendError(res, 500, "Failed to send OTP email");
      }
    } else if (signupType === "phone" && normalizedPhone) {
      try {
        await sendOtpSms(normalizedPhone, otp);
      } catch (err) {
        console.error("EMPLOYEE OTP SMS ERROR:", err.message);
      }
      try {
        await sendOtpWhatsApp(normalizedPhone, otp);
      } catch (err) {
        console.error("EMPLOYEE OTP WHATSAPP ERROR:", err.message);
      }
    }

    return sendSuccess(
      res,
      200,
      signupType === "email" ? "OTP sent to email" : "OTP sent to phone",
      {
        existing_user: Boolean(existingUser),
        name: existingUser?.name?.trim() || null,
      }
    );
  } catch (err) {
    console.error("EMPLOYEE CREATE OTP ERROR:", err);
    return sendError(res, 500, "Something went wrong");
  } finally {
    if (conn) conn.release();
  }
});

router.post("/create", auth([PERMISSIONS.EMPLOYEES]), async (req, res) => {
  let conn;
  let transactionStarted = false;

  try {
    conn = await db.getConnection();

    const {
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
      return sendError(res, resolved.error.status, resolved.error.message);
    }

    const { signupType, normalizedEmail, normalizedPhone, otp, name } = resolved;
    const companyId = req.company?.id;
    const createdBy = req.user?.id;

    const normalizedName = sanitizeText(name, 200);
    if (!companyId) {
      return sendError(res, 400, "Company context missing");
    }

    const normalizedShiftStart = parseTime(shift_start, "HH:mm:ss");
    const normalizedShiftEnd = parseTime(shift_end, "HH:mm:ss");
    if (!normalizedShiftStart || !normalizedShiftEnd) {
      return sendError(res, 400, "Valid shift start and shift end required");
    }
    const expected_work_minutes = diffMinutes(normalizedShiftStart, normalizedShiftEnd);
    if (expected_work_minutes <= 0) {
      return sendError(res, 400, "Work duration must be > 0");
    }

    const finalJoiningDate = isValidDate(joining_date) ? joining_date : getCurrentDate();
    const employee_code = `EMP-${companyId}${generateRandomToken({ size: 1, encoding: "hex", uppercase: true })}`;

    const otpLookupSql = signupType === "phone"
      ? "phone = ? AND otp_purpose = 'employee_create' AND used_at IS NULL"
      : "email = ? AND otp_purpose = 'employee_create' AND used_at IS NULL";
    const otpLookupParams = signupType === "phone" ? [normalizedPhone] : [normalizedEmail];

    await conn.beginTransaction();
    transactionStarted = true;

    const [otpRows] = await conn.query(
      `SELECT id, otp_hash, otp_expiry, is_verified FROM otps
       WHERE ${otpLookupSql}
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      otpLookupParams
    );
    if (!otpRows.length) {
      await conn.rollback();
      transactionStarted = false;
      return sendError(res, 400, "OTP not found");
    }

    const otpRecord = otpRows[0];
    if (otpRecord.is_verified) {
      await conn.rollback();
      transactionStarted = false;
      return sendError(res, 400, "OTP already used");
    }
    if (new Date() > new Date(otpRecord.otp_expiry)) {
      await conn.rollback();
      transactionStarted = false;
      return sendError(res, 400, "OTP expired");
    }

    const otpError = await assessOtp(otpRecord.id, otp, otpRecord.otp_hash);
    if (otpError) {
      await conn.rollback();
      transactionStarted = false;
      return sendError(res, 400, otpError);
    }

    const existingUserSql = signupType === "email" ? "email = ?" : "phone = ?";
    const existingUserParams = signupType === "email" ? [normalizedEmail] : [normalizedPhone];
    const [existingUsers] = await conn.query(
      `SELECT id, name FROM users WHERE ${existingUserSql} AND is_deleted = 0 LIMIT 1 FOR UPDATE`,
      existingUserParams
    );
    const existingUserId = existingUsers[0]?.id || null;
    const employeeName = existingUserId
      ? sanitizeText(existingUsers[0]?.name, 200)
      : normalizedName;
    if (!employeeName || employeeName.length < 3) {
      await conn.rollback();
      transactionStarted = false;
      return sendError(res, 400, "Invalid employee name (min 3 characters)");
    }

    if (existingUserId) {
      const [[companyOwner]] = await conn.query(
        `SELECT owner_user_id FROM companies WHERE id = ? AND owner_user_id = ? LIMIT 1`,
        [companyId, existingUserId]
      );
      if (companyOwner) {
        await conn.rollback();
        transactionStarted = false;
        return sendError(res, 409, "Company owner cannot be added as an employee");
      }

      const [existingEmployees] = await conn.query(
        `SELECT id FROM employees WHERE company_id = ? AND user_id = ? AND is_deleted = 0 LIMIT 1`,
        [companyId, existingUserId]
      );
      if (existingEmployees.length) {
        await conn.rollback();
        transactionStarted = false;
        return sendError(res, 409, "User is already an employee in this company");
      }
    }

    let userId;
    if (existingUserId) {
      userId = existingUserId;
    } else {
      let userResult;
      try {
        [userResult] = await conn.query(
          `INSERT INTO users (email, phone, name, created_by) VALUES (?, ?, ?, ?)`,
          [normalizedEmail, normalizedPhone, employeeName, createdBy]
        );
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
          await conn.rollback();
          transactionStarted = false;
          return sendError(res, 409, "Email or phone already registered");
        }
        throw err;
      }
      userId = userResult.insertId;
    }

    if (!userId) {
      await conn.rollback();
      transactionStarted = false;
      return sendError(res, 500, "Unable to resolve user account");
    }

    const packageId = safeNumber(permission_package_id, 0);
    if (!packageId) {
      await conn.rollback();
      transactionStarted = false;
      return sendError(res, 400, "Valid permission package required");
    }
    const [[pkg]] = await conn.query(
      `SELECT id FROM permission_packages WHERE id = ? AND company_id = ? AND is_active = 1 AND is_deleted = 0 LIMIT 1`,
      [packageId, companyId]
    );
    if (!pkg) {
      await conn.rollback();
      transactionStarted = false;
      return sendError(res, 404, "Permission package not found");
    }

    const [employeeResult] = await conn.query(
      `INSERT INTO employees (
         company_id, user_id, permission_package_id, employee_code, designation,
         salary_type, joining_date, status, employment_type, weekends,
         shift_start, shift_end, expected_work_minutes, break_minutes, grace_minutes, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        Math.max(0, Number(break_minutes) || 0),
        Math.max(0, Number(grace_minutes) || 0),
        createdBy
      ]
    );
    const employeeId = employeeResult.insertId;

    if (base_amount && effective_from) {
      const salaryBaseAmount = Number(base_amount);
      if (salaryBaseAmount <= 0) {
        await conn.rollback();
        transactionStarted = false;
        return sendError(res, 400, "Invalid base_amount");
      }
      const salaryFrom = new Date(effective_from);
      const salaryTo = effective_to ? new Date(effective_to) : null;
      if (isNaN(salaryFrom.getTime())) {
        await conn.rollback();
        transactionStarted = false;
        return sendError(res, 400, "Invalid effective_from");
      }
      if (salaryTo && (isNaN(salaryTo.getTime()) || salaryTo < salaryFrom)) {
        await conn.rollback();
        transactionStarted = false;
        return sendError(res, 400, "Invalid effective_to");
      }

      if (!Array.isArray(components)) {
        await conn.rollback();
        transactionStarted = false;
        return sendError(res, 400, "components must be an array");
      }
      const componentIds = components.map(c => safeNumber(c.component_id));
      if (componentIds.some(id => !id)) {
        await conn.rollback();
        transactionStarted = false;
        return sendError(res, 400, "Invalid component_id found");
      }
      if (new Set(componentIds).size !== componentIds.length) {
        await conn.rollback();
        transactionStarted = false;
        return sendError(res, 400, "Duplicate salary components not allowed");
      }

      const [salaryResult] = await conn.query(
        `INSERT INTO salary_structures (company_id, employee_id, base_amount, effective_from, effective_to, is_active, created_by)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
        [companyId, employeeId, salaryBaseAmount, effective_from, effective_to || null, createdBy]
      );
      const salaryId = salaryResult.insertId;

      if (components.length > 0) {
        const [validComponents] = await conn.query(
          `SELECT id, name, type FROM salary_components
           WHERE id IN (?) AND company_id = ? AND is_deleted = 0`,
          [componentIds, companyId]
        );
        if (validComponents.length !== components.length) {
          await conn.rollback();
          transactionStarted = false;
          return sendError(res, 400, "Some salary components are invalid/unavailable");
        }
        const validComponentIds = new Set(validComponents.map(c => Number(c.id)));
        const componentRows = [];
        for (const c of components) {
          const componentId = safeNumber(c.component_id);
          if (!validComponentIds.has(componentId)) {
            await conn.rollback();
            transactionStarted = false;
            return sendError(res, 400, `Invalid component_id: ${componentId}`);
          }
          if (!["fixed", "percentage"].includes(c.calc_type)) {
            await conn.rollback();
            transactionStarted = false;
            return sendError(res, 400, `Invalid calc_type for component ${componentId}`);
          }
          const calcValue = Number(c.calc_value);
          if (isNaN(calcValue) || calcValue < 0) {
            await conn.rollback();
            transactionStarted = false;
            return sendError(res, 400, `Invalid calc_value for component ${componentId}`);
          }
          componentRows.push([
            companyId, employeeId, salaryId, componentId,
            c.calc_type, calcValue, c.reason || null, 1, createdBy
          ]);
        }
        await conn.query(
          `INSERT INTO employee_salary_component
           (company_id, employee_id, salary_id, component_id, calc_type, calc_value, remark, is_active, created_by)
           VALUES ?`,
          [componentRows]
        );
      }
    }

    await conn.query(
      `UPDATE otps SET is_verified = 1, verified_at = NOW(), used_at = NOW() WHERE id = ?`,
      [otpRecord.id]
    );

    if (normalizedEmail) {
      try {
        await sendQueuedWelcomeEmail({
          to: normalizedEmail,
          userName: employeeName,
          dashboardUrl: FRONTEND_URL + "/home",
          fromEmail: EMAIL_USER,
          fromName: "OneAttendance",
          replyTo: EMAIL_USER
        });
      } catch (err) {
        console.error("WELCOME EMAIL ERROR:", err);
      }
    }

    await conn.commit();
    transactionStarted = false;
    return sendSuccess(res, 201, "Employee created successfully");
  } catch (err) {
    if (conn && transactionStarted) await conn.rollback();
    console.error("EMPLOYEE CREATE ERROR:", err);
    return sendError(res, 500, "Something went wrong");
  } finally {
    if (conn) conn.release();
  }
});

router.get("/list", auth(), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    let { search = "", status, page = 1, limit = 20 } = req.query;
    search = sanitizeText(search) || "";
    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (pageNum - 1) * limitNum;
    const companyId = req.company?.id;
    if (!companyId) {
      return sendError(res, 400, "Invalid company context");
    }

    let where = "WHERE e.company_id = ?";
    const params = [companyId];

    if (search.length >= 3) {
      where += ` AND (e.employee_code LIKE ? OR e.designation LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }
    if (typeof status === "string" && status.trim()) {
      where += " AND e.status = ?";
      params.push(status.trim());
    } else {
      where += " AND e.status = 'active'";
    }

    const [stats] = await conn.query(
      `SELECT
         COUNT(CASE WHEN e.is_active = 1 THEN 1 END) AS active,
         COUNT(CASE WHEN e.is_active = 0 THEN 1 END) AS inactive
      FROM employees e WHERE e.company_id = ?`,
          [companyId]
    );
    const activeCount = stats[0]?.active || 0;
    const inactiveCount = stats[0]?.inactive || 0;

    const [countResult] = await conn.query(
      `SELECT COUNT(*) AS total FROM employees e ${USER_LEFT_JOIN} ${where}`,
      params
    );
    const total = countResult[0]?.total || 0;

    const listSelect = `
      ${FULL_EMPLOYEE_SELECT},
      ${PERMISSIONS_SUBQUERY},
      ${ATTENDANCE_METHODS_SUBQUERY},
      ${LEAVE_BALANCES_SUBQUERY}
    `;

    const [rows] = await conn.query(
      `SELECT ${listSelect}
       FROM employees e
       ${USER_LEFT_JOIN}
       ${PACKAGE_LEFT_JOIN}
       ${where}
       ORDER BY e.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const data = rows.map((row) => {
      const base = formatEmployee(row);
      const permissions = parseJSONSafe(row.permissions, []).filter(Boolean);
      const empMethods = parseJSONSafe(row.attendance_methods, []).filter(Boolean);
      const methods = empMethods.map(m => ({
        method: m,
        is_auto: !!row.is_auto
      }));
      const leaveBalances = parseJSONSafe(row.leave_balances, []).filter(Boolean).map(l => ({
        ...l,
        is_paid: !!l.is_paid,
        allow_half_day: !!l.allow_half_day,
        total_allocated: Number(l.total_allocated || 0),
        used: Number(l.used || 0),
        remaining: Number(l.remaining || 0)
      }));
      return {
        ...base,
        permissions,
        attendance_methods: methods,
        leave_balances: leaveBalances,
      };
    });

    const meta = {
      ...buildMeta(pageNum, limitNum, total, data.length),
      active: activeCount,
      inactive: inactiveCount,
    };

    return sendSuccess(res, 200, "Employee list retrieved", data, meta);
  } catch (error) {
    console.error("EMPLOYEE_LIST_ERROR:", error);
    return sendError(res, 500, "Unable to fetch employee list");
  } finally {
    if (conn) conn.release();
  }
});

router.put("/update", auth([PERMISSIONS.EMPLOYEES]), async (req, res) => {
  let conn;
  const VALID_WEEK_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

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
      grace_minutes,
      joining_date,
      enable_overtime,
      enable_deduction
    } = req.body;

    const companyId = safeNumber(req.company?.id, 0);
    const updatedBy = safeNumber(req.user?.id, 0);

    if (!companyId || !employee_id || !Number.isInteger(Number(employee_id))) {
      return sendError(res, 400, "Invalid company context or employee ID");
    }

    const hasUpdates = [
      designation, salary_type, employment_type, permission_package_id,
      attendance_methods, weekends, shift_start, shift_end,
      break_minutes, grace_minutes, joining_date, enable_overtime, enable_deduction
    ].some(v => v !== undefined);
    if (!hasUpdates) return sendError(res, 400, "No fields provided for update");

    if (designation !== undefined && designationValidation(designation)) {
      return sendError(res, 422, "Invalid designation");
    }
    if (salary_type !== undefined && salaryValidation(salary_type)) {
      return sendError(res, 422, "Invalid salary_type");
    }
    if (employment_type !== undefined && employmentValidation(employment_type)) {
      return sendError(res, 422, "Invalid employment_type");
    }

    if (shift_start !== undefined || shift_end !== undefined) {
      if (!shift_start || !shift_end) return sendError(res, 422, "Both shift_start and shift_end required");
      const start = parseTime(shift_start);
      const end = parseTime(shift_end);
      if (!start || !end) return sendError(res, 422, "Invalid shift time format");
    }

    const normBreak = break_minutes !== undefined ? timeStringToMinutes(break_minutes) : undefined;
    const normGrace = grace_minutes !== undefined ? timeStringToMinutes(grace_minutes) : undefined;
    if (normBreak !== undefined && (!Number.isInteger(normBreak) || normBreak < 0)) {
      return sendError(res, 422, "Invalid break_minutes");
    }
    if (normGrace !== undefined && (!Number.isInteger(normGrace) || normGrace < 0)) {
      return sendError(res, 422, "Invalid grace_minutes");
    }
    if (joining_date !== undefined && joining_date !== null && !isValidDate(joining_date)) {
      return sendError(res, 422, "Invalid joining_date");
    }

    let normalizedWeekends = undefined;
    if (weekends !== undefined) {
      if (!Array.isArray(weekends)) return sendError(res, 400, "weekends must be an array");
      const cleaned = [...new Set(weekends.map(d => String(d).trim().toLowerCase()))];
      for (const d of cleaned) {
        if (!VALID_WEEK_DAYS.includes(d)) return sendError(res, 400, `Invalid weekend '${d}'`);
      }
      normalizedWeekends = cleaned.length ? JSON.stringify(cleaned) : null;
    }

    let cleanedAttendance = null;
    if (attendance_methods !== undefined) {
      if (!Array.isArray(attendance_methods)) return sendError(res, 400, "attendance_methods must be an array");
      const unique = new Map();
      for (const m of attendance_methods) {
        const err = attendanceMethodValidation(m);
        if (err) return sendError(res, 422, err);
        const method = String(m).trim().toLowerCase();
        unique.set(method, { method, is_auto: !!auto_approve ? 1 : 0 });
      }
      cleanedAttendance = Array.from(unique.values());
    }

    await conn.beginTransaction();

    const [empRows] = await conn.query(
      `SELECT id, company_id, user_id FROM employees WHERE id = ? AND company_id = ? AND is_deleted = 0 AND is_active = 1 LIMIT 1`,
      [employee_id, companyId]
    );
    if (!empRows.length) {
      await conn.rollback();
      return sendError(res, 404, "Employee not found");
    }

    if (Number(empRows[0].user_id) === updatedBy) {
      await conn.rollback();
      return sendError(res, 403, "You cannot update your own employee configuration");
    }

    if (permission_package_id !== undefined && permission_package_id !== null) {
      const [pkgRows] = await conn.query(
        `SELECT id FROM permission_packages WHERE id = ? AND company_id = ? AND is_deleted = 0 AND is_active = 1 LIMIT 1`,
        [permission_package_id, companyId]
      );
      if (!pkgRows.length) {
        await conn.rollback();
        return sendError(res, 404, "Invalid permission package");
      }
    }

    const updateFields = [];
    const updateValues = [];

    if (designation !== undefined) { updateFields.push("designation = ?"); updateValues.push(designation); }
    if (salary_type !== undefined) { updateFields.push("salary_type = ?"); updateValues.push(salary_type); }
    if (employment_type !== undefined) { updateFields.push("employment_type = ?"); updateValues.push(employment_type); }
    if (permission_package_id !== undefined) { updateFields.push("permission_package_id = ?"); updateValues.push(permission_package_id ?? null); }
    if (shift_start && shift_end) {
      const start = parseTime(shift_start);
      const end = parseTime(shift_end);
      const expected = diffMinutes(start.format("HH:mm:ss"), end.format("HH:mm:ss"));
      updateFields.push("shift_start = ?", "shift_end = ?", "expected_work_minutes = ?");
      updateValues.push(shift_start, shift_end, expected);
    }
    if (normBreak !== undefined) { updateFields.push("break_minutes = ?"); updateValues.push(normBreak); }
    if (normGrace !== undefined) { updateFields.push("grace_minutes = ?"); updateValues.push(normGrace); }
    if (joining_date !== undefined) { updateFields.push("joining_date = ?"); updateValues.push(joining_date); }
    if (enable_overtime !== undefined) { updateFields.push("enable_overtime = ?"); updateValues.push(!!enable_overtime ? 1 : 0); }
    if (enable_deduction !== undefined) { updateFields.push("enable_deduction = ?"); updateValues.push(!!enable_deduction ? 1 : 0); }
    if (normalizedWeekends !== undefined) { updateFields.push("weekends = ?"); updateValues.push(normalizedWeekends); }
    updateFields.push("updated_by = ?");
    updateValues.push(updatedBy);

    await conn.query(
      `UPDATE employees SET ${updateFields.join(", ")} WHERE id = ? AND company_id = ?`,
      [...updateValues, employee_id, companyId]
    );

    if (cleanedAttendance !== null) {
      const methodNames = cleanedAttendance.map(m => m.method);
      const isAutoValue = cleanedAttendance.some(m => m.is_auto) ? 1 : 0;
      await conn.query(
        `UPDATE employees SET attendance_methods = ?, is_auto = ?, updated_by = ? WHERE id = ? AND company_id = ?`,
        [JSON.stringify(methodNames), isAutoValue, updatedBy, employee_id, companyId]
      );
    }

    await conn.commit();
    return sendSuccess(res, 200, "Employee updated successfully");
  } catch (error) {
    if (conn) await conn.rollback();
    console.error("[EMPLOYEE_UPDATE_ERROR]", error);
    return sendError(res, 500, "Failed to update employee");
  } finally {
    if (conn) conn.release();
  }
});

router.delete("/delete", auth([PERMISSIONS.EMPLOYEES]), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const { id } = req.body;
    const deletedBy = req.user?.id;
    const companyId = req.company?.id;

    if (!companyId || !id) {
      return sendError(res, 400, "Invalid request");
    }

    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id, company_id, user_id, is_deleted FROM employees WHERE id = ? AND company_id = ? LIMIT 1 FOR UPDATE`,
      [id, companyId]
    );
    if (!rows.length) {
      await conn.rollback();
      return sendError(res, 404, "Employee not found");
    }
    const employee = rows[0];
    if (Number(employee.user_id) === Number(deletedBy)) {
      await conn.rollback();
      return sendError(res, 403, "You cannot delete yourself as an employee");
    }
    if (employee.is_deleted) {
      await conn.rollback();
      return sendSuccess(res, 200, "Employee already deleted");
    }

    await conn.query(
      `UPDATE employees SET is_deleted = 1, is_active = 0, status = 'inactive', deleted_at = NOW(), deleted_by = ? WHERE id = ? AND company_id = ?`,
      [deletedBy, id, companyId]
    );


    await conn.commit();
    return sendSuccess(res, 200, "Employee deleted successfully");
  } catch (error) {
    if (conn) await conn.rollback();
    console.error("EMPLOYEE_DELETE_ERROR:", error);
    return sendError(res, 500, "Failed to delete employee");
  } finally {
    if (conn) conn.release();
  }
});

router.get("/all-list", auth(), async (req, res) => {
  try {
    let { search } = req.query;
    search = sanitizeText(search) || "";
    const companyId = req.company.id;
    let where = "WHERE e.is_deleted = 0 AND e.company_id = ?";
    const params = [companyId];

    if (search) {
      where += ` AND (e.employee_code LIKE ? OR e.designation LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }

    const [rows] = await db.query(
      `SELECT e.id, e.user_id, e.employee_code, e.designation, e.status, e.salary_type, e.joining_date, e.employment_type,
              u.name, u.email, u.phone, u.profile_picture
       FROM employees e
       LEFT JOIN users u ON u.id = e.user_id AND u.is_deleted = 0
       ${where}
       ORDER BY e.id DESC`,
      params
    );
    return sendSuccess(res, 200, "Employee list retrieved", rows);
  } catch (error) {
    console.error("Error fetching employee list:", error);
    return sendError(res, 500, "Failed to fetch employee list");
  }
});

// GET /employees/:id - Fetch single employee details
router.get("/:id", auth(), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const companyId = safeNumber(req.company?.id, 0);
    const employeeId = safeNumber(req.params.id, 0);

    if (!companyId || !employeeId) {
      return sendError(res, 400, "Invalid company context or employee ID");
    }

    const [rows] = await conn.query(
      `SELECT
         e.id, e.company_id, e.user_id, e.employee_code,
         e.designation, e.salary_type, e.employment_type,
         e.joining_date, e.status,
         e.shift_start, e.shift_end, e.expected_work_minutes,
         e.break_minutes, e.grace_minutes,
         e.enable_overtime, e.enable_deduction,
         e.weekends, e.attendance_methods, e.is_auto,
         e.is_active, e.is_deleted,
         u.name, u.email, u.phone, u.last_login, u.profile_picture
       FROM employees e
       ${USER_LEFT_JOIN}
       WHERE e.id = ? AND e.company_id = ? AND e.is_deleted = 0
       LIMIT 1`,
      [employeeId, companyId]
    );

    if (!rows.length) {
      return sendError(res, 404, "Employee not found");
    }

    const row = rows[0];

    const weekendsObj = parseJSONSafe(row.weekends, []);
    const attendanceMethods = parseJSONSafe(row.attendance_methods, []);

    const data = {
      id: row.id,
      company_id: row.company_id,
      user_id: row.user_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      employee_code: row.employee_code,
      designation: getEnumObject(DESIGNATIONS, row.designation),
      salary_type: getEnumObject(SALARY_TYPES, row.salary_type),
      employment_type: getEnumObject(EMPLOYMENT_TYPES, row.employment_type),
      joining_date: row.joining_date,
      status: row.status,
      shift_start: row.shift_start,
      shift_end: row.shift_end,
      expected_work_minutes: row.expected_work_minutes,
      break_minutes: row.break_minutes || 0,
      grace_minutes: row.grace_minutes || 0,
      enable_overtime: !!row.enable_overtime,
      enable_deduction: !!row.enable_deduction,
      weekends: normalizeWeekends(weekendsObj),
      attendance_methods: attendanceMethods,
      is_auto: !!row.is_auto,
      is_active: !!row.is_active,
      is_deleted: !!row.is_deleted,
      last_login: row.last_login,
      profile_picture: buildFileUrl(row.profile_picture),
    };

    return sendSuccess(res, 200, "Employee details fetched", data);
  } catch (error) {
    console.error("EMPLOYEE_DETAILS_ERROR:", error);
    return sendError(res, 500, "Unable to fetch employee details");
  } finally {
    if (conn) conn.release();
  }
});


// Face enrollment routes 
const handleFaceEnrollCheck = async (req, res) => {
  let conn;
  try {
    const companyId = safeNumber(req.company?.id, 0);
    const employeeId = safeNumber(
      req.body?.employee_id ?? req.query?.employee_id,
      0
    );
    const embedding = req.body?.embedding ?? req.query?.embedding;

    if (!companyId || companyId <= 0) {
      return sendError(res, 401, "Unauthorized company");
    }
    if (!parseFaceEmbedding(embedding)) {
      return sendError(res, 400, "Valid face embedding required");
    }

    conn = await db.getConnection();
    const result = await runFaceCheck(conn, { companyId, embedding, employeeId });
    if (result.success) {
      return sendSuccess(res, 200, result.message, result.responseData);
    }
    return sendError(res, result.statusCode, result.message, result.responseData);
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

router.post("/face-enroll/set", auth([PERMISSIONS.EMPLOYEES, PERMISSIONS.ATTENDANCE]), async (req, res) => {
  let conn;
  try {
    const companyId = safeNumber(req.company?.id, 0);
    const employeeId = safeNumber(req.body?.employee_id, 0);
    const embedding = parseFaceEmbedding(req.body?.embedding);

    if (!companyId || companyId <= 0) return sendError(res, 401, "Unauthorized company");
    if (!employeeId || employeeId <= 0) return sendError(res, 400, "Valid employee_id required");
    if (!embedding) return sendError(res, 400, "Valid face embedding required");
    conn = await db.getConnection();
    const [[employee]] = await conn.query(
      `SELECT e.user_id, u.name FROM employees e INNER JOIN users u ON u.id = e.user_id
       WHERE e.user_id = ? AND e.company_id = ? AND e.is_deleted = 0 AND u.is_deleted = 0 LIMIT 1`,
      [employeeId, companyId]
    );
    if (!employee) return sendError(res, 404, "Employee not found");
    await conn.query(
      `UPDATE employees SET face_enrolled = 1, face_data = ?, updated_by = ?, updated_at = NOW()
       WHERE user_id = ? AND company_id = ? AND is_deleted = 0`,
      [JSON.stringify(embedding), req.user?.id || null, employeeId, companyId]
    );
    return sendSuccess(res, 200, "Face enrolled successfully", {
      employee_id: employeeId, employee_name: employee.name || null, company_id: companyId, face_enrolled: true,
    });
  } catch (error) {
    console.error("POST /employees/face-enroll/set ERROR:", error);
    const message = error?.response?.data?.message || error?.message || "Failed to enroll face";
    const status = error?.response ? 400 : 500;
    return sendError(res, status, message);
  } finally {
    if (conn) conn.release();
  }
});

router.get("/face-enroll/check", auth(), handleFaceEnrollCheck);
router.post("/face-enroll/check", auth(), handleFaceEnrollCheck);

router.put("/face-enroll/delete", auth([PERMISSIONS.EMPLOYEES, PERMISSIONS.ATTENDANCE]), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const companyId = safeNumber(req.company?.id, 0);
    const employeeId = safeNumber(req.body?.employee_id, 0);

    if (!companyId || companyId <= 0) return sendError(res, 401, "Unauthorized company");
    if (!employeeId || employeeId <= 0) return sendError(res, 400, "Valid employee_id required");

    const [[employee]] = await conn.query(
      `SELECT id, face_enrolled, face_data FROM employees WHERE user_id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1`,
      [employeeId, companyId]
    );
    if (!employee) return sendError(res, 404, "Employee not found");

    const isFaceEnrolled = !!employee.face_enrolled || Boolean(employee.face_data);
    if (!isFaceEnrolled) return sendError(res, 400, "Face enrollment is not set for this employee");

    await conn.query(
      `UPDATE employees SET face_enrolled = 0, face_data = NULL, updated_by = ?, updated_at = NOW() WHERE user_id = ? AND company_id = ?`,
      [req.user?.id || null, employeeId, companyId]
    );

    return sendSuccess(res, 200, "Face enrollment deleted successfully", {
      employee_id: employeeId,
      face_enrolled: false,
    });
  } catch (error) {
    console.error("PUT /employees/face-enroll/delete ERROR:", error);
    return sendError(res, 500, "Failed to delete face enrollment");
  } finally {
    if (conn) conn.release();
  }
});

router.get("/face-enroll/list", auth(), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const companyId = safeNumber(req.company?.id, 0);
    const { page, limit, offset } = getPagination(req.query, 20, 100);
    const search = sanitizeText(req.query?.search) || "";

    if (!companyId || companyId <= 0) return sendError(res, 401, "Unauthorized company");

    let whereClause = `WHERE e.company_id = ? AND e.is_deleted = 0 AND u.is_deleted = 0`;
    const queryParams = [companyId];
    if (search) {
      whereClause += ` AND (e.employee_code LIKE ? OR e.designation LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)`;
      const keyword = `%${search}%`;
      queryParams.push(keyword, keyword, keyword, keyword, keyword);
    }

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM employees e INNER JOIN users u ON u.id = e.user_id ${whereClause}`,
      queryParams
    );

    const [rows] = await conn.query(
      `SELECT e.user_id AS employee_id, e.employee_code, e.face_enrolled,
              u.name, u.email, u.phone, u.profile_picture
       FROM employees e
       INNER JOIN users u ON u.id = e.user_id
       ${whereClause}
       ORDER BY u.name ASC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    const data = rows.map((row) => ({
      employee_id: row.employee_id,
      employee_code: row.employee_code,
      name: row.name,
      email: row.email,
      phone: row.phone,
      profile_picture: buildFileUrl(row.profile_picture),
      face_enrolled: !!row.face_enrolled,
    }));

    return sendSuccess(res, 200, "Face enrolled employee list fetched", data, buildMeta(page, limit, total, data.length));
  } catch (error) {
    console.error("GET /employees/face-enroll/list ERROR:", error);
    return sendError(res, 500, "Failed to fetch face enrolled employee list");
  } finally {
    if (conn) conn.release();
  }
});

export default router;
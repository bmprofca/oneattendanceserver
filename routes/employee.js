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
import { EMP, PROFILE } from "../constants/permissions.js";
import getClientMeta from "../utils/ipHelper.js";
import {
  generateOTP, hashPassword, comparePassword, verifyOtpHash, generateSessionToken,
  generateRandomPassword, generateRandomToken,
} from "../utils/auth.js";
import { queueSignupOTPEmail, sendQueuedWelcomeEmail } from "../email/services/email.processor.js";
import axios from "axios";
import { runFaceCheck } from "../utils/faceCheckUtil.js";
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
import { FRONTEND_URL, FACE_SERVICE_URL as configFaceServiceUrl, EMAIL_USER } from "../config/config.js";
import { normalizeIndianMobile } from "../utils/mobile.js";


const FACE_SERVICE_URL = (configFaceServiceUrl || "http://localhost:8000").replace(/\/$/, "");

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

const formatBankAccount = (row) => {
  const base = {
    id: row.id,
    account_type: row.account_type,
    is_primary: !!row.is_primary,
    status: row.status,
  };
  if (row.account_type === "upi") {
    return { ...base, upi_id: row.upi_id, account_holder_name: row.account_holder_name };
  }
  if (row.account_type === "cash") {
    return { ...base, account_holder_name: row.account_holder_name };
  }
  return {
    ...base,
    bank_name: row.bank_name,
    account_holder_name: row.account_holder_name,
    account_number: row.account_number,
    ifsc_code: row.ifsc_code,
    branch_name: row.branch_name,
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

const buildDateFilter = (query, column) => {
  if (query.month && query.year) {
    const mm = String(query.month).padStart(2, "0");
    const first = `${query.year}-${mm}-01`;
    return { clause: `${column} BETWEEN ? AND LAST_DAY(?)`, params: [first, first] };
  }
  if (query.year) {
    return { clause: `${column} BETWEEN ? AND ?`, params: [`${query.year}-01-01`, `${query.year}-12-31`] };
  }
  if (query.from_date && query.to_date) {
    return { clause: `${column} BETWEEN ? AND ?`, params: [query.from_date, query.to_date] };
  }
  return { clause: null, params: [] };
};

const buildDayStatusPayload = (dayStatus, value1, value2) => {
  const normalized = String(dayStatus || "").trim().toLowerCase();
  if (normalized === "half_day") return { half_day_session: value1 || null };
  if (normalized === "leave") {
    const leaveType = value1 || null;
    const payload = { leave_type: leaveType };
    if (String(leaveType || "").trim().toLowerCase() === "paid") {
      payload.leave_sub_type = value2 || null;
    }
    return payload;
  }
  return {};
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
  SELECT JSON_ARRAYAGG(JSON_OBJECT('permission_id', p.id, 'code', p.code, 'name', p.name, 'action', p.action))
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

router.post("/request-create-otp", auth(EMP.MNG), async (req, res) => {
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

    const rateLimitColumn = signupType === "phone" ? "phone" : "email";
    const rateLimitValue = signupType === "phone" ? normalizedPhone : normalizedEmail;
    const clientMeta = getClientMeta(req);
    const ip = clientMeta?.ip_v4 || clientMeta?.ip_v6 || "unknown";

    const existingUserSql = signupType === "email" ? "email = ?" : "phone = ?";
    const existingUserParams = signupType === "email" ? [normalizedEmail] : [normalizedPhone];
    const [existingUser] = await conn.query(
      `SELECT id FROM users WHERE ${existingUserSql} AND is_deleted = 0 LIMIT 1`,
      existingUserParams
    );
    if (existingUser.length) {
      return sendError(res, 409, signupType === "email" ? "Email already registered" : "Phone already registered");
    }

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
    }

    return sendSuccess(res, 200, signupType === "email" ? "OTP sent to email" : "OTP sent to phone");
  } catch (err) {
    console.error("EMPLOYEE CREATE OTP ERROR:", err);
    return sendError(res, 500, "Something went wrong");
  } finally {
    if (conn) conn.release();
  }
});

router.post("/create", auth(EMP.MNG), async (req, res) => {
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
    if (!normalizedName || normalizedName.length < 3) {
      return sendError(res, 400, "Invalid employee name (min 3 characters)");
    }

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

    const isOtpValid = await verifyOtpHash(otp, otpRecord.otp_hash);
    if (!isOtpValid) {
      await conn.rollback();
      transactionStarted = false;
      return sendError(res, 400, "Invalid OTP");
    }

    const existingUserSql = signupType === "email" ? "email = ?" : "phone = ?";
    const existingUserParams = signupType === "email" ? [normalizedEmail] : [normalizedPhone];
    const [existingUsers] = await conn.query(
      `SELECT id FROM users WHERE ${existingUserSql} AND is_deleted = 0 LIMIT 1`,
      existingUserParams
    );
    if (existingUsers.length) {
      await conn.rollback();
      transactionStarted = false;
      return sendError(res, 409, signupType === "email" ? "Email already registered" : "Phone already registered");
    }

    const generatedPassword = generateRandomPassword();
    const hashedPassword = await hashPassword(generatedPassword);

    let userResult;
    try {
      [userResult] = await conn.query(
        `INSERT INTO users (email, phone, password, name, created_by) VALUES (?, ?, ?, ?, ?)`,
        [normalizedEmail, normalizedPhone, hashedPassword, normalizedName, createdBy]
      );
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        await conn.rollback();
        transactionStarted = false;
        return sendError(res, 409, "Email or phone already registered");
      }
      throw err;
    }
    const userId = userResult.insertId;

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
          userName: normalizedName,
          password: generatedPassword,
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

router.get("/list", auth(EMP.MNG), async (req, res) => {
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

router.put("/update", auth(EMP.MNG), async (req, res) => {
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
      `SELECT id, company_id FROM employees WHERE id = ? AND company_id = ? AND is_deleted = 0 AND is_active = 1 LIMIT 1`,
      [employee_id, companyId]
    );
    if (!empRows.length) {
      await conn.rollback();
      return sendError(res, 404, "Employee not found");
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

router.delete("/delete", auth(EMP.MNG), async (req, res) => {
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
      `SELECT id, company_id, is_deleted FROM employees WHERE id = ? AND company_id = ? LIMIT 1 FOR UPDATE`,
      [id, companyId]
    );
    if (!rows.length) {
      await conn.rollback();
      return sendError(res, 404, "Employee not found");
    }
    const employee = rows[0];
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

router.get("/all-list", auth(EMP.MNG), async (req, res) => {
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
      `SELECT e.id, e.employee_code, e.designation, e.status, e.salary_type, e.joining_date, e.employment_type,
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


const ALLOWED_INCLUDES = new Set([
  "basic", "permissions", "attendance", "salary", "payroll", "leaves", "shifts", "banks"
]);

router.get("/:id(\\d+)", auth(PROFILE.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const employeeId = parseInt(req.params.id, 10);
    const companyId = req.company?.id;
    if (!employeeId || !companyId) {
      return sendError(res, 400, "Invalid request");
    }

    const rawIncludes = (req.query.include || "").split(",").map(i => i.trim()).filter(Boolean);
    if (rawIncludes.length > 1) {
      return sendError(res, 400, "Only one include allowed per request");
    }
    const include = rawIncludes[0] || "basic";
    if (!ALLOWED_INCLUDES.has(include)) {
      return sendError(res, 400, `Invalid include. Allowed: ${[...ALLOWED_INCLUDES].join(", ")}`);
    }

    const result = await EmployeeSectionService.getSection(conn, employeeId, companyId, include, req.query);
    if (result.error) {
      return sendError(res, result.error.status, result.error.message);
    }
    return sendSuccess(res, 200, "Employee details retrieved", result.data, result.meta);
  } catch (err) {
    console.error("[GET /employees/:id]", err);
    return sendError(res, 500, "Something went wrong");
  } finally {
    conn?.release();
  }
});

class EmployeeSectionService {
  static async getSection(conn, employeeId, companyId, include, query) {
    const [[exists]] = await conn.query(
      `SELECT id FROM employees WHERE id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1`,
      [employeeId, companyId]
    );
    if (!exists) {
      return { error: { status: 404, message: "Employee not found" } };
    }

    const handlers = {
      basic: EmployeeSectionService._basic,
      permissions: EmployeeSectionService._permissions,
      attendance: EmployeeSectionService._attendance,
      salary: EmployeeSectionService._salary,
      payroll: EmployeeSectionService._payroll,
      leaves: EmployeeSectionService._leaves,
      shifts: EmployeeSectionService._shifts,
      banks: EmployeeSectionService._banks,
    };
    return handlers[include](conn, employeeId, companyId, query);
  }

  // -- basic ---------------------------------------------------------
  static async _basic(conn, employeeId, companyId) {
    const [rows] = await conn.query(
      `SELECT ${FULL_EMPLOYEE_SELECT}
       FROM employees e
       ${USER_LEFT_JOIN}
       ${PACKAGE_LEFT_JOIN}
       WHERE e.id = ? AND e.company_id = ? AND e.is_deleted = 0`,
      [employeeId, companyId]
    );
    const data = rows[0] ? formatEmployee(rows[0]) : null;
    return { data: { basic: data }, meta: { basic: { total: data ? 1 : 0 } } };
  }

  // -- permissions --------------------------------------------------
  static async _permissions(conn, employeeId, companyId, query) {
    const { page, limit, offset } = getPagination(query, 50, 200);
    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM employees e
       JOIN permission_package_items ppi ON ppi.package_id = e.permission_package_id AND ppi.is_deleted = 0 AND ppi.is_active = 1
       WHERE e.id = ? AND e.company_id = ? AND e.is_deleted = 0`,
      [employeeId, companyId]
    );
    const [rows] = await conn.query(
      `SELECT ppi.permission_id AS id, p.code, p.name, p.action
       FROM employees e
       JOIN permission_package_items ppi ON ppi.package_id = e.permission_package_id AND ppi.is_deleted = 0 AND ppi.is_active = 1
       JOIN permissions p ON p.id = ppi.permission_id
       WHERE e.id = ? AND e.company_id = ? AND e.is_deleted = 0
       ORDER BY p.code ASC
       LIMIT ? OFFSET ?`,
      [employeeId, companyId, limit, offset]
    );
    return {
      data: { permissions: rows },
      meta: { permissions: buildMeta(page, limit, total, rows.length) }
    };
  }

  // -- attendance ---------------------------------------------------
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
      `SELECT COUNT(*) AS total FROM attendance a WHERE ${where}`, params
    );

    const [rows] = await conn.query(
      `SELECT a.id, a.attendance_date, a.start_time, a.end_time, a.is_overtime,
              a.day_status, a.value1, a.value2, a.value3, a.is_deductible, a.is_verified, a.remark,
              lin.method AS punch_in_method, lin.ip_address AS punch_in_ip, lin.latitude AS punch_in_lat, lin.longitude AS punch_in_lon,
              lout.method AS punch_out_method, lout.ip_address AS punch_out_ip, lout.latitude AS punch_out_lat, lout.longitude AS punch_out_lon,
              b.id AS break_id, b.start_time AS break_start, b.end_time AS break_end, b.is_deductible AS break_is_deductible, b.remark AS break_remark,
              blin.method AS break_start_method, blout.method AS break_end_method
       FROM attendance a
       LEFT JOIN attendance_logs lin ON lin.attendance_id = a.id AND lin.log_type = 'start' AND lin.status = 1
            AND lin.id = (SELECT MIN(id) FROM attendance_logs WHERE attendance_id = a.id AND log_type = 'start' AND status = 1)
       LEFT JOIN attendance_logs lout ON lout.attendance_id = a.id AND lout.log_type = 'end' AND lout.status = 1
            AND lout.id = (SELECT MIN(id) FROM attendance_logs WHERE attendance_id = a.id AND log_type = 'end' AND status = 1)
       LEFT JOIN attendance b ON b.employee_id = a.employee_id AND b.company_id = a.company_id
            AND b.attendance_date = a.attendance_date AND b.type = 'break'
       LEFT JOIN attendance_logs blin ON blin.attendance_id = b.id AND blin.log_type = 'start' AND blin.status = 1
            AND blin.id = (SELECT MIN(id) FROM attendance_logs WHERE attendance_id = b.id AND log_type = 'start' AND status = 1)
       LEFT JOIN attendance_logs blout ON blout.attendance_id = b.id AND blout.log_type = 'end' AND blout.status = 1
            AND blout.id = (SELECT MIN(id) FROM attendance_logs WHERE attendance_id = b.id AND log_type = 'end' AND status = 1)
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
            overtime: { enabled: !!r.is_overtime, minutes: r.value3 ? Number(r.value3) : 0 },
            deductible: { enabled: !!r.is_deductible },
            half_day: { enabled: r.day_status === 'half_day' }
          },
          is_verified: !!r.is_verified,
          remark: r.remark,
          punch_in_method: r.punch_in_method,
          punch_in_ip: r.punch_in_ip,
          punch_in_latitude: r.punch_in_lat,
          punch_in_longitude: r.punch_in_lon,
          punch_out_method: r.punch_out_method,
          punch_out_ip: r.punch_out_ip,
          punch_out_latitude: r.punch_out_lat,
          punch_out_longitude: r.punch_out_lon,
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
      meta: { attendance: buildMeta(page, limit, total, data.length) }
    };
  }

  // -- salary -------------------------------------------------------
  static async _salary(conn, employeeId, companyId, query) {
    const { page, limit, offset } = getPagination(query, 10, 50);
    const dateFilter = buildDateFilter(query, "ss.effective_from");
    let where = "ss.employee_id = ? AND ss.company_id = ? AND ss.is_deleted = 0";
    const params = [employeeId, companyId];
    if (dateFilter.clause) { where += ` AND ${dateFilter.clause}`; params.push(...dateFilter.params); }

    const [[{ total }]] = await conn.query(`SELECT COUNT(*) AS total FROM salary_structures ss WHERE ${where}`, params);
    const [rows] = await conn.query(
      `SELECT ss.id AS salary_id, ss.base_amount, ss.effective_from, ss.effective_to, ss.is_active,
              esc.id AS component_id, sc.name AS component_name, sc.code AS component_code, sc.type, esc.calc_type, esc.calc_value
       FROM salary_structures ss
       LEFT JOIN employee_salary_component esc ON esc.salary_id = ss.id AND esc.is_deleted = 0 AND esc.is_active = 1
       LEFT JOIN salary_components sc ON sc.id = esc.component_id AND sc.is_deleted = 0
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
    const data = Object.values(grouped).map(s => {
      const base = s.base_amount;
      let gross = base, deductions = 0, employer = 0;
      s.components.forEach(c => {
        const amount = c.calc_type === "percentage"
          ? Number(((base * Number(c.calc_value)) / 100).toFixed(2))
          : Number(c.calc_value);
        c.amount = amount;
        if (c.type === "earning") gross += amount;
        else if (c.type === "deduction") deductions += amount;
        else if (c.type === "employer_contribution") employer += amount;
      });
      const net = Math.max(0, gross - deductions);
      return {
        salary_id: s.salary_id,
        base_amount: base,
        effective_from: s.effective_from,
        effective_to: s.effective_to,
        ctc: Number((gross + employer).toFixed(2)),
        gross_salary: Number(gross.toFixed(2)),
        employer_contributions: Number(employer.toFixed(2)),
        total_deductions: Number(deductions.toFixed(2)),
        net_salary: Number(net.toFixed(2)),
        components: s.components,
      };
    });

    return {
      data: { salary: data },
      meta: { salary: buildMeta(page, limit, total, data.length) }
    };
  }

  // -- payroll ------------------------------------------------------
  static async _payroll(conn, employeeId, companyId, query) {
    const { page, limit, offset } = getPagination(query, 12, 24);
    const dateFilter = buildDateFilter(query, "pe.payroll_period");
    let where = "pe.employee_id = ? AND pe.company_id = ? AND pe.is_deleted = 0";
    const params = [employeeId, companyId];
    if (dateFilter.clause) { where += ` AND ${dateFilter.clause}`; params.push(...dateFilter.params); }

    const [[{ total }]] = await conn.query(`SELECT COUNT(*) AS total FROM payroll_entries pe WHERE ${where}`, params);
    const [rows] = await conn.query(
      `SELECT pe.id, pe.payroll_period, pe.net_salary, pe.total_earnings, pe.total_deductions,
              pe.working_days, pe.present_days, pe.absent_days, pe.paid_leave_days, pe.unpaid_leave_days,
              pe.overtime_minutes, pe.worked_minutes, pe.deduction_minutes,
              pe.snapshot_designation, pe.snapshot_employment_type, pe.snapshot_salary_type, pe.snapshot_base_amount,
              pec.component_code, pec.component_name, pec.component_type, pec.amount
       FROM payroll_entries pe
       LEFT JOIN payroll_entry_components pec ON pec.entry_id = pe.id AND pec.is_active = 1
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
            unpaid_leave_days: r.unpaid_leave_days,
          },
          work: {
            worked_minutes: r.worked_minutes || 0,
            overtime_minutes: r.overtime_minutes || 0,
            deduction_minutes: r.deduction_minutes || 0,
          },
          components_breakdown: { earnings: [], deductions: [] },
          adjustments: [],
          snapshot: {
            designation: r.snapshot_designation,
            employment_type: r.snapshot_employment_type,
            salary_type: r.snapshot_salary_type,
            base_amount: r.snapshot_base_amount,
          },
        };
      }
      if (r.component_code) {
        const comp = { name: r.component_name, amount: r.amount };
        if (r.component_type === "earning") {
          grouped[r.id].components_breakdown.earnings.push(comp);
        } else if (r.component_type === "deduction") {
          grouped[r.id].components_breakdown.deductions.push(comp);
        }
      }
    }
    const data = Object.values(grouped);
    return {
      data: { payroll: data },
      meta: { payroll: buildMeta(page, limit, total, data.length) }
    };
  }

  // -- leaves -------------------------------------------------------
  static async _leaves(conn, employeeId, companyId, query) {
    const { page, limit, offset } = getPagination(query, 20, 100);
    const year = parseInt(query.year, 10) || new Date().getFullYear();
    const dateFilter = buildDateFilter(query, "el.start_date");
    let where = "el.employee_id = ? AND el.company_id = ? AND el.is_deleted = 0";
    const params = [employeeId, companyId];
    if (dateFilter.clause) { where += ` AND ${dateFilter.clause}`; params.push(...dateFilter.params); }
    if (query.status) { where += " AND el.status = ?"; params.push(query.status); }
    if (query.leave_code) { where += " AND lc.code = ?"; params.push(query.leave_code); }

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM employee_leaves el
       JOIN leave_configs lc ON lc.id = el.leave_config_id AND lc.is_deleted = 0
       WHERE ${where}`, params
    );
    const [rows] = await conn.query(
      `SELECT el.id, el.start_date, el.end_date, el.total_days, el.status, el.reason,
              el.is_half_day, el.half_day_type, el.applied_at, el.approved_at, el.approval_remarks,
              lc.name AS leave_type, lc.code AS leave_code, lc.is_paid,
              ela.file_url, ela.file_type
       FROM employee_leaves el
       JOIN leave_configs lc ON lc.id = el.leave_config_id AND lc.is_deleted = 0
       LEFT JOIN employee_leave_attachments ela ON ela.leave_id = el.id AND ela.is_deleted = 0
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
      `SELECT elb.leave_config_id, lc.code, lc.name, lc.is_paid, elb.year,
              elb.total_allocated, elb.used, elb.remaining
       FROM employee_leave_balances elb
       JOIN leave_configs lc ON lc.id = elb.leave_config_id
         AND lc.company_id = elb.company_id AND lc.is_deleted = 0
       WHERE elb.employee_id = ? AND elb.company_id = ? AND elb.year = ? AND elb.is_deleted = 0 AND elb.is_active = 1
       ORDER BY lc.name ASC`,
      [employeeId, companyId, year]
    );

    return {
      data: { leaves: Object.values(grouped), leave_balances: balRows },
      meta: {
        leaves: {
          ...buildMeta(page, limit, total, Object.keys(grouped).length),
          year
        }
      }
    };
  }

  // -- shifts -------------------------------------------------------
  static async _shifts(conn, employeeId, companyId, query) {
    const { page, limit, offset } = getPagination(query, 30, 100);
    const dateFilter = buildDateFilter(query, "shift_date");
    let where = "employee_id = ? AND company_id = ? AND is_deleted = 0";
    const params = [employeeId, companyId];
    if (dateFilter.clause) { where += ` AND ${dateFilter.clause}`; params.push(...dateFilter.params); }

    const [[{ total }]] = await conn.query(`SELECT COUNT(*) AS total FROM shifts WHERE ${where}`, params);
    const [rows] = await conn.query(
      `SELECT id, shift_date, start_time, end_time, expected_work_minutes, worked_minutes,
              allowed_break_minutes, extra_break_minutes, early_leave_minutes, late_minutes,
              overtime_minutes, deductible_minutes, day_status, value1, value2, is_deductible, is_overtime
       FROM shifts
       WHERE ${where}
       ORDER BY shift_date DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map(r => {
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
      if (r.day_status === "half_day") item.half_day_type = r.value1 || null;
      if (r.day_status === "leave") {
        item.leave_type = r.value1 || null;
        item.leave_type_value = r.value2 || null;
      }
      return item;
    });

    return {
      data: { shifts: data },
      meta: { shifts: buildMeta(page, limit, total, data.length) }
    };
  }

  // -- banks --------------------------------------------------------
  static async _banks(conn, employeeId, companyId, query) {
    const { page, limit, offset } = getPagination(query, 20, 100);
    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM bank_accounts WHERE employee_id = ? AND company_id = ? AND is_deleted = 0`,
      [employeeId, companyId]
    );
    const [rows] = await conn.query(
      `SELECT id, account_type, bank_name, account_holder_name, account_number,
              ifsc_code, branch_name, upi_id, is_primary, status
       FROM bank_accounts
       WHERE employee_id = ? AND company_id = ? AND is_deleted = 0
       ORDER BY is_primary DESC, created_at ASC
       LIMIT ? OFFSET ?`,
      [employeeId, companyId, limit, offset]
    );
    const data = rows.map(formatBankAccount);
    return {
      data: { banks: data },
      meta: { banks: buildMeta(page, limit, total, data.length) }
    };
  }
}


// Face enrollment routes 
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
    const result = await runFaceCheck(conn, { companyId, imageUrl, employeeId });
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

router.post("/face-enroll/set", auth(EMP.MNG), async (req, res) => {
  try {
    const companyId = safeNumber(req.company?.id, 0);
    const employeeId = safeNumber(req.body?.employee_id, 0);
    const imageUrl = String(req.body?.image || "").trim();

    if (!companyId || companyId <= 0) return sendError(res, 401, "Unauthorized company");
    if (!employeeId || employeeId <= 0) return sendError(res, 400, "Valid employee_id required");
    if (!imageUrl) return sendError(res, 400, "Valid image URL required");

    const payload = { employee_id: employeeId, company_id: companyId, image: imageUrl };
    const { data } = await axios.post(`${FACE_SERVICE_URL}/set`, payload);
    console.log("[FACE_SET_RESPONSE]", { payload, response: data });

    if (data?.success) {
      return sendSuccess(res, 200, data.message || "Face enrolled successfully", {
        employee_id: data.employee_id ?? employeeId,
        employee_name: data.employee_name ?? null,
        company_id: data.company_id ?? companyId,
        face_enrolled: true,
      });
    }
    const status = String(data?.message || "").toLowerCase().includes("not found") ? 404 : 400;
    return sendError(res, status, data?.message || "Failed to enroll face");
  } catch (error) {
    console.error("POST /employees/face-enroll/set ERROR:", error);
    const message = error?.response?.data?.message || error?.message || "Failed to enroll face";
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

router.get("/face-enroll/list", auth(EMP.MNG), async (req, res) => {
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
import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import checkPermission from "../middleware/permissionValidationMiddleware.js";
import {
  validateFields,
  employmentValidation,
  salaryValidation,
  designationValidation,
  attendanceMethodValidation,
  inviteStatusValidation,
} from "../utils/constantsValidator.js";
import { generateRandomToken } from "../utils/auth.js";
import { sendSuccess, sendError, parseJSONSafe, buildMeta } from "../utils/sendResponse.js";
import { buildFileUrl } from "../utils/fileService.js";
import { queueCompanyInvitationEmail } from "../email/services/email.processor.js";
import { getEnumObject } from "../utils/constantsValidator.js";
import { DESIGNATIONS, SALARY_TYPES, EMPLOYMENT_TYPES } from "../constants/constants_values.js";
import { INV, INV_PKG } from "../constants/permissions.js";

const router = express.Router();

// ----------------------------------------------------------------------
// SQL query constants (unchanged)
// ----------------------------------------------------------------------

const SELECT_COMPANY = `
  SELECT attendance_methods
  FROM companies
  WHERE id = ? AND is_deleted = 0
  LIMIT 1
`;

const SELECT_EXISTING_PACKAGE_BY_CODE = `
  SELECT id
  FROM invite_packages
  WHERE company_id = ? AND code = ? AND is_deleted = 0
  LIMIT 1
  FOR UPDATE
`;

const SELECT_PERMISSION_PACKAGE = `
  SELECT id
  FROM permission_packages
  WHERE id = ? AND company_id = ? AND is_deleted = 0 AND is_active = 1
  LIMIT 1
`;

const SELECT_SALARY_COMPONENT_PACKAGE = `
  SELECT id
  FROM salary_component_packages
  WHERE id = ? AND company_id = ? AND is_deleted = 0 AND is_active = 1
  LIMIT 1
`;

const INSERT_INVITE_PACKAGE = `
  INSERT INTO invite_packages (
    company_id, code, name, designation, salary_type, employment_type,
    shift_start, shift_end, break_minutes, grace_minutes,
    permission_package_id, component_package, remarks,
    weekends, attendance_methods, auto_approve, enable_overtime,
    enable_deduction, is_active, created_by, updated_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const UPDATE_INVITE_PACKAGE = `
  UPDATE invite_packages SET __SET__ WHERE id = ? AND company_id = ? AND is_deleted = 0
`;

const COUNT_INVITE_PACKAGES = `
  SELECT COUNT(*) as total FROM invite_packages ip
`;

const LIST_INVITE_PACKAGES = `
  SELECT ip.*, pp.package_name AS permission_package_name
  FROM invite_packages ip
  LEFT JOIN permission_packages pp ON pp.id = ip.permission_package_id
  WHERE 1=1
  ORDER BY ip.id DESC
  LIMIT ? OFFSET ?
`;

const SELECT_PACKAGE_IDS = `SELECT id FROM invite_packages ip WHERE 1=1`;

const SELECT_PERMISSIONS_FOR_PACKAGES = `
  SELECT ppi.package_id, p.id, p.action, p.code, p.name
  FROM permission_package_items ppi
  JOIN permissions p ON p.id = ppi.permission_id
  WHERE ppi.package_id IN (?) AND ppi.is_deleted = 0 AND ppi.is_active = 1
`;

const SELECT_SALARY_COMPONENTS_FOR_PACKAGES = `
  SELECT scpi.id, scpi.package_id AS component_package_id,
         scpi.component_id, scpi.is_active,
         sc.name AS component_name, sc.code AS component_code,
         sc.type AS component_type, sc.calc_type, sc.calc_value
  FROM salary_component_package_items scpi
  JOIN salary_components sc ON sc.id = scpi.component_id
  WHERE scpi.package_id IN (?)
    AND scpi.is_deleted = 0 AND scpi.is_active = 1
    AND sc.is_deleted = 0 AND sc.is_active = 1
`;

const SOFT_DELETE_INVITE_PACKAGE = `
  UPDATE invite_packages
  SET is_deleted = 1, deleted_at = NOW(), deleted_by = ?
  WHERE id = ?
`;

const COUNT_EMPLOYEES_USING_PACKAGE = `
  SELECT COUNT(*) as total
  FROM employees
  WHERE permission_package_id = ? AND company_id = ? AND is_deleted = 0
`;

// ------------------- Invite queries -------------------

const SELECT_USER_BY_ID = `
  SELECT id, name, email, is_active
  FROM users
  WHERE id = ? AND is_deleted = 0
`;

const SELECT_COMPANY_BY_ID = `
  SELECT id, name, attendance_methods
  FROM companies
  WHERE id = ? AND is_deleted = 0 AND is_active = 1
`;

const SELECT_EMPLOYEE_EXISTS = `
  SELECT id FROM employees
  WHERE company_id = ? AND user_id = ? AND is_deleted = 0
`;

const SELECT_EXISTING_PENDING_INVITE = `
  SELECT id FROM company_invites
  WHERE company_id = ? AND user_id = ? AND status = 'pending'
    AND is_active = 1 AND is_deleted = 0 AND expires_at > NOW()
  LIMIT 1
`;

const CHECK_INVITE_TOKEN_DUPLICATE = `
  SELECT id FROM company_invites WHERE invite_token = ?
`;

const INSERT_INVITE = `
  INSERT INTO company_invites (
    company_id, user_id, invited_by, invite_token,
    permission_package_id, employment_type, designation, salary_type,
    shift_start, shift_end, break_minutes, grace_minutes,
    weekends, attendance_methods, auto_approve, enable_overtime,
    enable_deduction, joining_date, base_amount, effective_from, effective_to,
    status, is_active, expires_at, created_by, updated_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?, ?)
`;

const INSERT_INVITE_SALARY_COMPONENTS = `
  INSERT INTO invite_salary_components (invite_id, component_id, calc_type, calc_value, remark, is_active)
  VALUES ?
`;

const RESEND_SELECT_INVITE = `
  SELECT * FROM company_invites
  WHERE id = ? AND company_id = ? AND is_deleted = 0
  LIMIT 1
`;

const ACCEPT_SELECT_INVITE = `
  SELECT * FROM company_invites
  WHERE invite_token = ? AND user_id = ? AND status = 'pending'
    AND is_active = 1 AND is_deleted = 0 AND (expires_at IS NULL OR expires_at > NOW())
  FOR UPDATE
`;

const ACCEPT_INVITE_OPEN = `
  SELECT * FROM company_invites ci
  INNER JOIN users u ON u.id = ci.user_id AND u.is_deleted = 0
  WHERE ci.invite_token = ? AND ci.status = 'pending'
    AND ci.is_active = 1 AND ci.is_deleted = 0
    AND (ci.expires_at IS NULL OR ci.expires_at > NOW())
  LIMIT 1
  FOR UPDATE
`;

const SELECT_EXISTING_EMPLOYEE_FOR_INVITE = `
  SELECT id, employee_code FROM employees
  WHERE company_id = ? AND user_id = ? AND is_deleted = 0
  LIMIT 1
  FOR UPDATE
`;

const INSERT_EMPLOYEE = `
  INSERT INTO employees (
    company_id, user_id, permission_package_id, employee_code,
    designation, salary_type, employment_type, weekends,
    shift_start, shift_end, expected_work_minutes,
    break_minutes, grace_minutes, enable_overtime,
    enable_deduction, status, joining_date, created_by, updated_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
`;

const UPDATE_EMPLOYEE = `
  UPDATE employees SET
    designation=?, salary_type=?, employment_type=?, permission_package_id=?,
    weekends=?, shift_start=?, shift_end=?, break_minutes=?, grace_minutes=?,
    expected_work_minutes=?, enable_overtime=?, enable_deduction=?,
    joining_date=?, status='active', is_active=1, is_deleted=0,
    updated_by=?, updated_at=NOW()
  WHERE id=?
`;

const INSERT_SALARY_STRUCTURE = `
  INSERT INTO salary_structures (company_id, employee_id, base_amount, effective_from, effective_to, is_active, created_by, updated_by)
  VALUES (?, ?, ?, ?, ?, 1, ?, ?)
`;

const SELECT_INVITE_COMPONENTS = `
  SELECT component_id, calc_type, calc_value, remark
  FROM invite_salary_components
  WHERE invite_id = ? AND is_active = 1
`;

const INSERT_EMPLOYEE_SALARY_COMPONENT = `
  INSERT INTO employee_salary_component (
    company_id, employee_id, salary_id, component_id, calc_type, calc_value, remark, is_active, created_by, updated_by, is_deleted
  ) VALUES ?
`;

const RESTORE_ATTENDANCE_METHODS = `
  UPDATE employee_attendance_methods
  SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL
  WHERE employee_id = ? AND is_deleted = 1
`;

const INSERT_EMPLOYEE_ATTENDANCE_METHODS = `
  INSERT INTO employee_attendance_methods (employee_id, method, is_auto, is_active, created_by, updated_by, is_deleted)
  VALUES ?
`;

const COMPLETE_INVITE = `
  UPDATE company_invites SET status='accepted', is_active=0, updated_by=?, updated_at=NOW() WHERE id=?
`;

const LIST_INVITES_COUNT = `
  SELECT COUNT(DISTINCT ci.id) AS total
  FROM company_invites ci
  LEFT JOIN users u ON u.id = ci.user_id AND u.is_deleted = 0
`;

const LIST_INVITES_IDS = `
  SELECT DISTINCT ci.id, ci.created_at
  FROM company_invites ci
  LEFT JOIN users u ON u.id = ci.user_id AND u.is_deleted = 0
`;

const LIST_INVITES_DATA = `
  SELECT
    ci.id, ci.invite_token, ci.company_id, ci.user_id, ci.invited_by,
    ci.permission_package_id, ci.employment_type, ci.designation, ci.salary_type,
    ci.shift_start, ci.shift_end, ci.break_minutes, ci.grace_minutes,
    ci.weekends, ci.status, ci.is_active, ci.is_deleted,
    ci.deleted_at, ci.deleted_by, ci.expires_at, ci.created_at,
    ci.attendance_methods, ci.auto_approve, ci.enable_overtime, ci.enable_deduction,
    ci.joining_date, ci.base_amount, ci.effective_from, ci.effective_to,
    u.name AS user_name, u.email AS user_email, u.profile_picture,
    ib.name AS inviter_name,
    pp.package_name,
    p.id AS permission_id, p.name AS permission_name, p.code AS permission_code
  FROM company_invites ci
  LEFT JOIN users u ON u.id = ci.user_id AND u.is_deleted = 0
  LEFT JOIN users ib ON ib.id = ci.invited_by AND ib.is_deleted = 0
  LEFT JOIN permission_packages pp ON pp.id = ci.permission_package_id
    AND pp.company_id = ci.company_id AND pp.is_active = 1 AND pp.is_deleted = 0
  LEFT JOIN permission_package_items ppi ON ppi.package_id = pp.id
    AND ppi.is_active = 1 AND ppi.is_deleted = 0
  LEFT JOIN permissions p ON p.id = ppi.permission_id
  WHERE ci.id IN (?)
  ORDER BY ci.created_at DESC, ci.id DESC
`;

const LIST_INVITES_SALARY = `
  SELECT isc.id, isc.invite_id, isc.component_id, isc.calc_type, isc.calc_value, isc.remark, isc.is_active,
         sc.name AS component_name, sc.code AS component_code
  FROM invite_salary_components isc
  JOIN salary_components sc ON sc.id = isc.component_id
  WHERE isc.invite_id IN (?) AND isc.is_active = 1
`;

const MY_INVITES_COUNT = `
  SELECT COUNT(DISTINCT ci.id) AS total
  FROM company_invites ci
  INNER JOIN companies c ON c.id = ci.company_id
`;

const MY_INVITES_IDS = `
  SELECT DISTINCT ci.id, ci.created_at
  FROM company_invites ci
  INNER JOIN companies c ON c.id = ci.company_id
`;

const MY_INVITES_DATA = `
  SELECT
    ci.id, ci.invite_token, ci.company_id, ci.permission_package_id,
    ci.employment_type, ci.designation, ci.salary_type,
    ci.shift_start, ci.shift_end, ci.break_minutes, ci.grace_minutes,
    ci.weekends, ci.status, ci.is_active, ci.is_deleted,
    ci.deleted_at, ci.deleted_by, ci.expires_at, ci.created_at,
    ci.attendance_methods, ci.auto_approve, ci.enable_overtime, ci.enable_deduction,
    ci.joining_date, ci.base_amount, ci.effective_from, ci.effective_to,
    c.name AS company_name, c.city, c.state, c.country,
    c.address_line1, c.address_line2, c.logo_url,
    ib.id AS invited_by_id, ib.name AS invited_by_name,
    ib.email AS invited_by_email, ib.profile_picture AS invited_by_profile_picture,
    pp.id AS package_id, pp.package_name,
    p.id AS permission_id, p.name AS permission_name, p.code AS permission_code
  FROM company_invites ci
  INNER JOIN companies c ON c.id = ci.company_id
  LEFT JOIN users ib ON ib.id = ci.invited_by AND ib.is_deleted = 0
  LEFT JOIN permission_packages pp ON pp.id = ci.permission_package_id
    AND pp.company_id = ci.company_id AND pp.is_deleted = 0 AND pp.is_active = 1
  LEFT JOIN permission_package_items ppi ON ppi.package_id = pp.id
    AND ppi.is_deleted = 0 AND ppi.is_active = 1
  LEFT JOIN permissions p ON p.id = ppi.permission_id
  WHERE ci.id IN (?)
  ORDER BY ci.created_at DESC, ci.id DESC
`;

const MY_INVITES_SALARY = `
  SELECT isc.id, isc.invite_id, isc.component_id, isc.calc_type, isc.calc_value, isc.remark, isc.is_active,
         sc.name AS component_name, sc.code AS component_code
  FROM invite_salary_components isc
  JOIN salary_components sc ON sc.id = isc.component_id
  WHERE isc.invite_id IN (?) AND isc.is_active = 1
`;

const UPDATE_INVITE = `
  UPDATE company_invites SET __SET__, updated_at=NOW(), updated_by=? WHERE id=?
`;

const SELECT_VALID_SALARY_COMPONENTS = `
  SELECT id FROM salary_components
  WHERE id IN (?) AND company_id = ? AND is_active = 1 AND is_deleted = 0
`;

const DELETE_INVITE_COMPONENTS = `DELETE FROM invite_salary_components WHERE invite_id = ?`;

const CANCEL_INVITE = `
  UPDATE company_invites
  SET status='cancelled', is_active=0, updated_at=NOW(), updated_by=?
  WHERE id=?
`;

const REJECT_INVITE = `
  UPDATE company_invites
  SET status='rejected', is_active=0, updated_at=NOW(), updated_by=?
  WHERE id=?
`;

const CHECK_SINGLE_PERMISSION_PACKAGE = `
  SELECT id FROM permission_packages
  WHERE id = ? AND company_id = ? AND is_active = 1 AND is_deleted = 0
`;

// ----------------------------------------------------------------------
// Local formatters (unchanged)
// ----------------------------------------------------------------------

const formatInvitePackage = (pkg, { permissions = [], salaryComponents = [] } = {}) => ({
  id: pkg.id,
  code: pkg.code,
  name: pkg.name,
  designation: getEnumObject(DESIGNATIONS, pkg.designation),
  salary_type: getEnumObject(SALARY_TYPES, pkg.salary_type),
  employment_type: getEnumObject(EMPLOYMENT_TYPES, pkg.employment_type),
  shift_start: pkg.shift_start,
  shift_end: pkg.shift_end,
  break_minutes: pkg.break_minutes,
  grace_minutes: pkg.grace_minutes,
  permission_package_id: pkg.permission_package_id,
  permission_package_name: pkg.permission_package_name,
  auto_approve: !!pkg.auto_approve,
  enable_overtime: !!pkg.enable_overtime,
  enable_deduction: !!pkg.enable_deduction,
  is_active: !!pkg.is_active,
  weekends: parseJSONSafe(pkg.weekends, []),
  attendance_methods: parseJSONSafe(pkg.attendance_methods, []),
  permissions,
  component_package: pkg.component_package,
  remarks: pkg.remarks,
  salary_components: salaryComponents,
});

const formatInvite = (invite, { permissions = [], salaryComponents = [] } = {}) => ({
  invite_id: invite.id,
  token: invite.invite_token,
  company_id: invite.company_id,
  employment_type: getEnumObject(EMPLOYMENT_TYPES, invite.employment_type),
  designation: getEnumObject(DESIGNATIONS, invite.designation),
  salary_type: getEnumObject(SALARY_TYPES, invite.salary_type),
  shift_start: invite.shift_start,
  shift_end: invite.shift_end,
  break_minutes: invite.break_minutes,
  grace_minutes: invite.grace_minutes,
  weekends: normalizeWeekends(invite.weekends || []),
  permission_package: {
    id: invite.permission_package_id,
    name: invite.package_name,
  },
  status: invite.status,
  is_active: !!invite.is_active,
  auto_approve: !!invite.auto_approve,
  enable_overtime: !!invite.enable_overtime,
  enable_deduction: !!invite.enable_deduction,
  joining_date: invite.joining_date ? toISTString(invite.joining_date).split(' ')[0] : null,
  is_deleted: !!invite.is_deleted,
  deleted_at: invite.deleted_at ? toISTString(invite.deleted_at) : null,
  deleted_by: invite.deleted_by,
  expires_at: invite.expires_at ? toISTString(invite.expires_at) : null,
  created_at: invite.created_at ? toISTString(invite.created_at) : null,
  base_amount: invite.base_amount != null ? parseFloat(invite.base_amount) : null,
  effective_from: invite.effective_from ? toISTString(invite.effective_from).split(' ')[0] : null,
  effective_to: invite.effective_to ? toISTString(invite.effective_to).split(' ')[0] : null,
  user: invite.user_id
    ? {
        id: invite.user_id,
        name: invite.user_name,
        email: invite.user_email,
        profile_picture: buildFileUrl(invite.profile_picture),
      }
    : null,
  invited_by: {
    id: invite.invited_by,
    name: invite.inviter_name,
  },
  permissions,
  attendance_methods: parseJSONSafe(invite.attendance_methods, []).map(m => (typeof m === 'string' ? m : m?.method || '')).filter(Boolean),
  salary_components: salaryComponents,
});

const formatUserInvite = (invite, { permissions = [], salaryComponents = [] } = {}) => ({
  invite_id: invite.id,
  invite_token: invite.invite_token,
  company_id: invite.company_id,
  employment_type: getEnumObject(EMPLOYMENT_TYPES, invite.employment_type),
  designation: getEnumObject(DESIGNATIONS, invite.designation),
  salary_type: getEnumObject(SALARY_TYPES, invite.salary_type),
  shift_start: invite.shift_start,
  shift_end: invite.shift_end,
  break_minutes: invite.break_minutes,
  grace_minutes: invite.grace_minutes,
  weekends: normalizeWeekends(invite.weekends || []),
  status: invite.status,
  is_active: !!invite.is_active,
  auto_approve: !!invite.auto_approve,
  enable_overtime: !!invite.enable_overtime,
  enable_deduction: !!invite.enable_deduction,
  joining_date: invite.joining_date ? toISTString(invite.joining_date).split(' ')[0] : null,
  is_deleted: !!invite.is_deleted,
  deleted_at: invite.deleted_at ? toISTString(invite.deleted_at) : null,
  deleted_by: invite.deleted_by,
  expires_at: invite.expires_at ? toISTString(invite.expires_at) : null,
  created_at: invite.created_at ? toISTString(invite.created_at) : null,
  base_amount: invite.base_amount != null ? parseFloat(invite.base_amount) : null,
  effective_from: invite.effective_from ? toISTString(invite.effective_from).split(' ')[0] : null,
  effective_to: invite.effective_to ? toISTString(invite.effective_to).split(' ')[0] : null,
  company: {
    id: invite.company_id,
    name: invite.company_name,
    city: invite.city,
    state: invite.state,
    country: invite.country,
    address_line1: invite.address_line1,
    address_line2: invite.address_line2,
    logo_url: invite.logo_url,
  },
  invited_by: invite.invited_by_id
    ? {
        id: invite.invited_by_id,
        name: invite.invited_by_name,
        email: invite.invited_by_email,
        profile_picture: buildFileUrl(invite.invited_by_profile_picture),
      }
    : null,
  permission_package: invite.package_id ? { id: invite.package_id, name: invite.package_name } : null,
  permissions,
  attendance_methods: parseJSONSafe(invite.attendance_methods, []).map(m => (typeof m === 'string' ? m : m?.method || '')).filter(Boolean),
  salary_components: salaryComponents,
});

// ----------------------------------------------------------------------
// Routes (refactored)
// ----------------------------------------------------------------------

router.post("/package-create", auth(INV_PKG.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = req.company?.id;
    const user_id = req.user?.id;

    let {
      code, name,
      designation, salary_type, employment_type,
      permission_package_id,
      shift_start, shift_end,
      break_minutes, grace_minutes,
      weekends, attendance_methods,
      auto_approve, is_active, enable_overtime, enable_deduction,
      remarks, component_package
    } = req.body;

    code = code?.trim()?.toUpperCase();
    name = name?.trim();
    designation = designation?.trim()?.toLowerCase() || null;
    salary_type = salary_type?.trim()?.toLowerCase() || null;
    employment_type = employment_type?.trim()?.toLowerCase() || null;
    remarks = remarks?.trim() || null;

    // Boolean fields – strict true/false expected
    auto_approve = auto_approve === true ? 1 : 0;
    enable_overtime = enable_overtime === true ? 1 : 0;
    enable_deduction = enable_deduction === undefined ? 1 : (enable_deduction === true ? 1 : 0);
    is_active = is_active === undefined ? 1 : (is_active === true ? 1 : 0);

    if (!code || !name) {
      return sendError(res, 400, "code and name are required");
    }

    const validations = [];
    if (designation) validations.push({ field: "designation", value: designation, validator: designationValidation });
    if (salary_type) validations.push({ field: "salary_type", value: salary_type, validator: salaryValidation });
    if (employment_type) validations.push({ field: "employment_type", value: employment_type, validator: employmentValidation });
    const errors = validateFields(validations);
    if (errors.length) return sendError(res, 422, errors[0].message);

    const isValidHHMM = (value) => /^([0-1]\d|2[0-3]):([0-5]\d)$/.test(value);
    const isValidHHMMSS = (value) => /^([0-1]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.test(value);
    const convertHHMMToMinutes = (value) => {
      const [hours, minutes] = value.split(":").map(Number);
      return hours * 60 + minutes;
    };

    if (shift_start && !isValidHHMMSS(shift_start)) throw { status: 400, message: "shift_start must be HH:mm:ss" };
    if (shift_end && !isValidHHMMSS(shift_end)) throw { status: 400, message: "shift_end must be HH:mm:ss" };
    if (shift_start && shift_end && shift_start === shift_end) throw { status: 400, message: "shift_start and shift_end cannot be same" };

    if (break_minutes !== undefined) {
      if (typeof break_minutes !== "string" || !isValidHHMM(break_minutes)) throw { status: 400, message: "break_minutes must be HH:mm" };
      break_minutes = convertHHMMToMinutes(break_minutes);
    } else {
      break_minutes = null;
    }

    if (grace_minutes !== undefined) {
      if (typeof grace_minutes !== "string" || !isValidHHMM(grace_minutes)) throw { status: 400, message: "grace_minutes must be HH:mm" };
      grace_minutes = convertHHMMToMinutes(grace_minutes);
    } else {
      grace_minutes = null;
    }

    const [[company]] = await conn.query(SELECT_COMPANY, [company_id]);
    if (!company) throw { status: 404, message: "Company not found" };

    const allowedAttendanceMethods = ["manual", "ip", "gps", "qr", "face"];
    const companyAttendanceMethods = company.attendance_methods ? JSON.parse(company.attendance_methods) : [];

    if (attendance_methods === undefined) {
      attendance_methods = companyAttendanceMethods;
    }
    if (!Array.isArray(attendance_methods)) throw { status: 400, message: "attendance_methods must be an array" };

    const cleanedMethods = [];
    const uniqueMethods = new Set();
    for (let i = 0; i < attendance_methods.length; i++) {
      const method = attendance_methods[i];
      if (!method || typeof method !== "string") throw { status: 400, message: `Invalid attendance method at index ${i}` };
      const normalizedMethod = method.trim().toLowerCase();
      if (!allowedAttendanceMethods.includes(normalizedMethod)) throw { status: 400, message: `Unsupported attendance method: ${normalizedMethod}` };
      if (!companyAttendanceMethods.includes(normalizedMethod)) throw { status: 400, message: `Attendance method not enabled in company: ${normalizedMethod}` };
      if (uniqueMethods.has(normalizedMethod)) continue;
      uniqueMethods.add(normalizedMethod);
      cleanedMethods.push(normalizedMethod);
    }
    attendance_methods = JSON.stringify(cleanedMethods);

    const [existingPackage] = await conn.query(SELECT_EXISTING_PACKAGE_BY_CODE, [company_id, code]);
    if (existingPackage.length) throw { status: 409, message: "Invite package code already exists" };

    if (permission_package_id) {
      const [[permissionPackage]] = await conn.query(SELECT_PERMISSION_PACKAGE, [permission_package_id, company_id]);
      if (!permissionPackage) throw { status: 400, message: "Invalid permission_package_id" };
    }

    if (component_package !== undefined && component_package !== null && component_package !== "") {
      const [[salaryPackage]] = await conn.query(SELECT_SALARY_COMPONENT_PACKAGE, [component_package, company_id]);
      if (!salaryPackage) throw { status: 400, message: "Invalid component_package ID" };
      component_package = salaryPackage.id;
    } else {
      component_package = null;
    }

    await conn.query(INSERT_INVITE_PACKAGE, [
      company_id, code, name,
      designation, salary_type, employment_type,
      shift_start || null, shift_end || null,
      break_minutes, grace_minutes,
      permission_package_id || null, component_package,
      remarks,
      JSON.stringify(normalizeWeekends(weekends || [])),
      attendance_methods,
      auto_approve, enable_overtime, enable_deduction, is_active,
      user_id || null, user_id || null
    ]);

    await conn.commit();
    return sendSuccess(res, 201, "Invite package created successfully");
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Create Invite Package Error:", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.put("/package-update", auth(INV_PKG.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = req.company?.id;
    const user_id = req.user?.id;
    if (!company_id) return sendError(res, 400, "Company missing");

    let {
      package_id, name,
      designation, salary_type, employment_type,
      permission_package_id,
      shift_start, shift_end,
      break_minutes, grace_minutes,
      weekends, attendance_methods,
      auto_approve, is_active, enable_overtime, enable_deduction,
      remarks, component_package
    } = req.body;

    if (!package_id) return sendError(res, 400, "package_id is required");

    const [[existingPackage]] = await conn.query(
      `SELECT id, code, company_id, is_active, is_deleted FROM invite_packages WHERE id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1 FOR UPDATE`,
      [package_id, company_id]
    );
    if (!existingPackage) throw { status: 404, message: "Invite package not found" };

    if (name !== undefined) {
      name = name?.trim();
      if (!name) throw { status: 400, message: "name cannot be empty" };
    }
    if (designation !== undefined) designation = designation?.trim()?.toLowerCase() || null;
    if (salary_type !== undefined) salary_type = salary_type?.trim()?.toLowerCase() || null;
    if (employment_type !== undefined) employment_type = employment_type?.trim()?.toLowerCase() || null;
    if (remarks !== undefined) remarks = remarks?.trim() || null;

    // Strict booleans
    if (auto_approve !== undefined) auto_approve = auto_approve === true ? 1 : 0;
    if (enable_overtime !== undefined) enable_overtime = enable_overtime === true ? 1 : 0;
    if (enable_deduction !== undefined) enable_deduction = enable_deduction === true ? 1 : 0;
    if (is_active !== undefined) is_active = is_active === true ? 1 : 0;

    const validations = [];
    if (designation !== undefined && designation !== null) validations.push({ field: "designation", value: designation, validator: designationValidation });
    if (salary_type !== undefined && salary_type !== null) validations.push({ field: "salary_type", value: salary_type, validator: salaryValidation });
    if (employment_type !== undefined && employment_type !== null) validations.push({ field: "employment_type", value: employment_type, validator: employmentValidation });
    const errors = validateFields(validations);
    if (errors.length) return sendError(res, 422, errors[0].message);

    // Time parsing (same as create)
    const isValidHHMM = (value) => /^([0-1]\d|2[0-3]):([0-5]\d)$/.test(value);
    const isValidHHMMSS = (value) => /^([0-1]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.test(value);
    const convertHHMMToMinutes = (value) => {
      const [hours, minutes] = value.split(":").map(Number);
      return hours * 60 + minutes;
    };

    let parsedBreakMinutes = null, parsedGraceMinutes = null;
    if (break_minutes !== undefined) {
      if (typeof break_minutes !== "string" || !isValidHHMM(break_minutes)) throw { status: 400, message: "break_minutes must be HH:mm" };
      parsedBreakMinutes = convertHHMMToMinutes(break_minutes);
    }
    if (grace_minutes !== undefined) {
      if (typeof grace_minutes !== "string" || !isValidHHMM(grace_minutes)) throw { status: 400, message: "grace_minutes must be HH:mm" };
      parsedGraceMinutes = convertHHMMToMinutes(grace_minutes);
    }

    if (shift_start !== undefined && !isValidHHMMSS(shift_start)) throw { status: 400, message: "shift_start must be HH:mm:ss" };
    if (shift_end !== undefined && !isValidHHMMSS(shift_end)) throw { status: 400, message: "shift_end must be HH:mm:ss" };
    if (shift_start && shift_end && shift_start === shift_end) throw { status: 400, message: "shift_start and shift_end cannot be same" };

    // Component package validation
    if (component_package !== undefined) {
      if (component_package !== null && component_package !== "") {
        const [[salaryPackage]] = await conn.query(SELECT_SALARY_COMPONENT_PACKAGE, [component_package, company_id]);
        if (!salaryPackage) throw { status: 400, message: "Invalid component_package ID" };
        component_package = salaryPackage.id;
      } else {
        component_package = null;
      }
    }

    // Attendance methods
    const allowedAttendanceMethods = ["manual", "ip", "gps", "qr", "face"];
    let attendance_methods_json;
    if (attendance_methods !== undefined) {
      const [[company]] = await conn.query(SELECT_COMPANY, [company_id]);
      if (!company) throw { status: 404, message: "Company not found" };
      const companyAttendanceMethods = company.attendance_methods ? JSON.parse(company.attendance_methods) : [];
      if (!Array.isArray(attendance_methods)) throw { status: 400, message: "attendance_methods must be an array" };
      const cleanedMethods = [];
      const uniqueMethods = new Set();
      for (let i = 0; i < attendance_methods.length; i++) {
        const method = attendance_methods[i];
        if (!method || typeof method !== "string") throw { status: 400, message: `Invalid attendance method at index ${i}` };
        const normalizedMethod = method.trim().toLowerCase();
        if (!allowedAttendanceMethods.includes(normalizedMethod)) throw { status: 400, message: `Unsupported attendance method: ${normalizedMethod}` };
        if (!companyAttendanceMethods.includes(normalizedMethod)) throw { status: 400, message: `Attendance method not enabled in company: ${normalizedMethod}` };
        if (uniqueMethods.has(normalizedMethod)) continue;
        uniqueMethods.add(normalizedMethod);
        cleanedMethods.push(normalizedMethod);
      }
      attendance_methods_json = JSON.stringify(cleanedMethods);
    }

    const fields = [];
    const values = [];
    const pushField = (field, value) => { fields.push(`${field} = ?`); values.push(value); };

    if (name !== undefined) pushField("name", name);
    if (designation !== undefined) pushField("designation", designation);
    if (salary_type !== undefined) pushField("salary_type", salary_type);
    if (employment_type !== undefined) pushField("employment_type", employment_type);
    if (shift_start !== undefined) pushField("shift_start", shift_start);
    if (shift_end !== undefined) pushField("shift_end", shift_end);
    if (break_minutes !== undefined) pushField("break_minutes", parsedBreakMinutes);
    if (grace_minutes !== undefined) pushField("grace_minutes", parsedGraceMinutes);
    if (permission_package_id !== undefined) pushField("permission_package_id", permission_package_id);
    if (weekends !== undefined) pushField("weekends", JSON.stringify(normalizeWeekends(weekends || [])));
    if (attendance_methods !== undefined) pushField("attendance_methods", attendance_methods_json);
    if (auto_approve !== undefined) pushField("auto_approve", auto_approve);
    if (enable_overtime !== undefined) pushField("enable_overtime", enable_overtime);
    if (enable_deduction !== undefined) pushField("enable_deduction", enable_deduction);
    if (is_active !== undefined) pushField("is_active", is_active);
    if (remarks !== undefined) pushField("remarks", remarks);
    if (component_package !== undefined) pushField("component_package", component_package);
    pushField("updated_by", user_id || null);

    if (fields.length <= 1) throw { status: 400, message: "No fields to update" };

    if (fields.length > 1) {
      await conn.query(UPDATE_INVITE_PACKAGE.replace("__SET__", fields.join(", ")), [...values, package_id, company_id]);
    }

    await conn.commit();
    return sendSuccess(res, 200, "Invite package updated successfully");
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Update Invite Package Error:", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.get("/package-list", auth(INV_PKG.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const company_id = req.company?.id;
    if (!company_id) return sendError(res, 400, "Company missing");

    let { page = 1, limit = 10, search = "", is_active } = req.query;
    page = Math.max(Number(page) || 1, 1);
    limit = Math.max(Number(limit) || 10, 1);
    const offset = (page - 1) * limit;

    let where = `WHERE ip.company_id = ? AND ip.is_deleted = 0`;
    const params = [company_id];
    if (search) {
      where += ` AND (ip.code LIKE ? OR ip.name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    if (is_active !== undefined) {
      where += ` AND ip.is_active = ?`;
      params.push(is_active === "true" || is_active == 1 ? 1 : 0);
    }

    const [[{ total }]] = await conn.query(`SELECT COUNT(*) as total FROM invite_packages ip ${where}`, params);
    const [packages] = await conn.query(
      `SELECT ip.*, pp.package_name AS permission_package_name
       FROM invite_packages ip
       LEFT JOIN permission_packages pp ON pp.id = ip.permission_package_id
       ${where}
       ORDER BY ip.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const packageIds = packages.map(p => p.id);
    const permissionPackageIds = packages.map(p => p.permission_package_id).filter(Boolean);

    const permissionsMap = new Map();
    if (permissionPackageIds.length > 0) {
      const [permRows] = await conn.query(SELECT_PERMISSIONS_FOR_PACKAGES, [permissionPackageIds]);
      for (const row of permRows) {
        if (!permissionsMap.has(row.package_id)) permissionsMap.set(row.package_id, []);
        permissionsMap.get(row.package_id).push({ id: row.id, action: row.action, code: row.code, name: row.name });
      }
    }

    const salaryComponentsMap = new Map();
    const componentPackageIds = packages.map(p => p.component_package).filter(Boolean);
    if (componentPackageIds.length > 0) {
      const [salaryRows] = await conn.query(SELECT_SALARY_COMPONENTS_FOR_PACKAGES, [componentPackageIds]);
      for (const sRow of salaryRows) {
        if (!salaryComponentsMap.has(sRow.component_package_id)) salaryComponentsMap.set(sRow.component_package_id, []);
        salaryComponentsMap.get(sRow.component_package_id).push({
          id: sRow.id,
          component_id: sRow.component_id,
          component_name: sRow.component_name,
          component_code: sRow.component_code,
          component_type: sRow.component_type,
          calc_type: sRow.calc_type,
          calc_value: parseFloat(sRow.calc_value),
          is_active: !!sRow.is_active,
        });
      }
    }

    const data = packages.map(pkg =>
      formatInvitePackage(pkg, {
        permissions: permissionsMap.get(pkg.permission_package_id) || [],
        salaryComponents: salaryComponentsMap.get(pkg.component_package) || [],
      })
    );

    return sendSuccess(res, 200, "Invite package list fetched successfully", data, buildMeta(page, limit, total, data.length));
  } catch (err) {
    console.error("Package List Error:", err);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.delete("/package-delete", auth(INV_PKG.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = req.company?.id;
    const user_id = req.user?.id;
    if (!company_id) return sendError(res, 400, "Company missing");

    const { package_id } = req.body;
    if (!package_id) return sendError(res, 400, "package_id is required");

    const [[pkg]] = await conn.query(
      `SELECT id, is_deleted FROM invite_packages WHERE id = ? AND company_id = ? LIMIT 1 FOR UPDATE`,
      [package_id, company_id]
    );
    if (!pkg) return sendError(res, 404, "Invite package not found");
    if (pkg.is_deleted) return sendError(res, 400, "Package already deleted");

    const [[{ total }]] = await conn.query(COUNT_EMPLOYEES_USING_PACKAGE, [package_id, company_id]);
    if (total > 0) return sendError(res, 400, "Cannot delete package: assigned to employees");

    await conn.query(SOFT_DELETE_INVITE_PACKAGE, [user_id || null, package_id]);
    await conn.commit();
    return sendSuccess(res, 200, "Invite package deleted successfully");
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Delete Invite Package Error:", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// ----- Invite routes (send, resend, accept, list, my, update, cancel, reject) -----

router.post("/send", auth(INV.MNG), async (req, res) => {
  let conn;
  const rollback = async () => { if (conn) await conn.rollback(); };

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    let {
      user_id, permission_package_id, employment_type, salary_type, designation,
      attendance_methods, auto_approve, enable_overtime, enable_deduction,
      joining_date, shift_start, shift_end, break_minutes, grace_minutes,
      weekends = [], base_amount, effective_from, effective_to, components
    } = req.body || {};

    const invitedBy = req.user?.id;
    const company_id = req.company?.id;
    const errors = {};

    user_id = Number(user_id);
    permission_package_id = Number(permission_package_id);

    if (!company_id) errors.company = "Company information is missing.";
    if (!user_id || !Number.isInteger(user_id)) errors.user = "Please select a valid employee.";
    if (!permission_package_id || !Number.isInteger(permission_package_id)) errors.permission_package = "Please select a valid permission package.";
    if (!Array.isArray(attendance_methods) || attendance_methods.length === 0) errors.attendance_methods = "Please select at least one attendance method.";

    if (shift_start && shift_end && shift_start >= shift_end) errors.shift = "Shift end time must be later than shift start time.";
    if (!Array.isArray(weekends)) errors.weekends = "Weekend days must be provided in array format.";

    if (base_amount !== undefined && base_amount !== null && base_amount !== "") {
      const parsedBase = parseFloat(base_amount);
      if (isNaN(parsedBase) || parsedBase < 0) errors.base_amount = "Base amount must be a valid non-negative number.";
      else base_amount = parsedBase;
    } else {
      base_amount = null;
    }

    if (effective_from && isNaN(Date.parse(effective_from))) errors.effective_from = "Invalid effective_from date format.";
    else effective_from = null;
    if (effective_to && isNaN(Date.parse(effective_to))) errors.effective_to = "Invalid effective_to date format.";
    else effective_to = null;

    if (components !== undefined && components !== null) {
      if (!Array.isArray(components)) errors.components = "Salary components must be provided in array format.";
      else {
        components.forEach((comp, idx) => {
          if (!comp.component_id || !Number.isInteger(Number(comp.component_id))) errors[`components_${idx}_component_id`] = "Component ID must be a valid integer.";
          if (!comp.calc_type || typeof comp.calc_type !== "string" || !comp.calc_type.trim()) errors[`components_${idx}_calc_type`] = "Calculation type is required.";
          if (comp.calc_value === undefined || isNaN(parseFloat(comp.calc_value))) errors[`components_${idx}_calc_value`] = "Calculation value must be a valid number.";
        });
      }
    }

    if (Object.keys(errors).length > 0) {
      await rollback();
      return sendError(res, 422, "Please check the submitted information.", errors);
    }

    // Parse minutes
    const parseMinutes = (val, field) => {
      if (!val) return null;
      if (typeof val !== "string") throw new Error(`${field} must be in HH:mm format`);
      const [h, m] = val.split(":");
      const hours = parseInt(h, 10), minutes = parseInt(m, 10);
      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) throw new Error(`Invalid ${field}`);
      return (hours * 60) + minutes;
    };

    let breakMinutes = null, graceMinutes = null;
    try {
      breakMinutes = parseMinutes(break_minutes, "break time");
      graceMinutes = parseMinutes(grace_minutes, "grace time");
    } catch (e) {
      return sendError(res, 422, "Invalid time format provided.", { time: e.message });
    }

    const isAuto = auto_approve === true ? 1 : 0;

    const [[company]] = await conn.query(SELECT_COMPANY_BY_ID, [company_id]);
    if (!company) {
      await rollback();
      return sendError(res, 422, "Unable to process invitation.", { company: "Company not found or currently unavailable." });
    }

    const companyMethods = parseJSONSafe(company.attendance_methods, []);
    const allowedMethods = new Set(companyMethods.map(m => (typeof m === "string" ? m : m?.method)).filter(Boolean));

    const cleanedAttendance = [];
    const methodSet = new Set();
    for (const m of attendance_methods) {
      const method = typeof m === "string" ? m : m?.method;
      if (!method || !allowedMethods.has(method)) {
        await rollback();
        return sendError(res, 422, "Invalid attendance method selected.", { attendance_methods: "One or more selected attendance methods are not allowed." });
      }
      if (!methodSet.has(method)) {
        methodSet.add(method);
        cleanedAttendance.push(method);
      }
    }

    const [[user]] = await conn.query(SELECT_USER_BY_ID, [user_id]);
    if (!user || !user.is_active) {
      await rollback();
      return sendError(res, 422, "Unable to send invitation.", { user: "Selected employee account is unavailable." });
    }

    const [[employee]] = await conn.query(SELECT_EMPLOYEE_EXISTS, [company_id, user_id]);
    if (employee) {
      await rollback();
      return sendError(res, 422, "Employee already exists.", { user: "This user is already working in your company." });
    }

    const [[existingInvite]] = await conn.query(SELECT_EXISTING_PENDING_INVITE, [company_id, user_id]);
    if (existingInvite) {
      await rollback();
      return sendError(res, 422, "Invitation already pending.", { invite: "An active invitation has already been sent to this user." });
    }

    const [[pkg]] = await conn.query(CHECK_SINGLE_PERMISSION_PACKAGE, [permission_package_id, company_id]);
    if (!pkg) {
      await rollback();
      return sendError(res, 422, "Invalid permission package selected.", { permission_package: "Selected permission package is unavailable." });
    }

    let inviteToken;
    let exists = true;
    while (exists) {
      inviteToken = generateRandomToken({ size: 32 });
      const [[row]] = await conn.query(CHECK_INVITE_TOKEN_DUPLICATE, [inviteToken]);
      if (!row) exists = false;
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const inviteEnableOvertime = enable_overtime === true ? 1 : 0;
    const inviteEnableDeduction = enable_deduction === undefined ? 1 : (enable_deduction === true ? 1 : 0);
    const inviteJoiningDate = joining_date && !Number.isNaN(Date.parse(joining_date)) ? joining_date : null;

    const [inviteResult] = await conn.query(INSERT_INVITE, [
      company_id, user_id, invitedBy, inviteToken,
      permission_package_id, employment_type, designation, salary_type,
      shift_start || null, shift_end || null, breakMinutes, graceMinutes,
      JSON.stringify(normalizeWeekends(weekends || [])),
      JSON.stringify(cleanedAttendance),
      isAuto, inviteEnableOvertime, inviteEnableDeduction,
      inviteJoiningDate, base_amount, effective_from, effective_to,
      expiresAt, invitedBy, invitedBy
    ]);

    const inviteId = inviteResult.insertId;

    if (components && components.length) {
      const compValues = components.map(comp => [
        inviteId, comp.component_id, comp.calc_type.trim(), parseFloat(comp.calc_value), comp.remark ? comp.remark.trim() : null, 1
      ]);
      await conn.query(INSERT_INVITE_SALARY_COMPONENTS, [compValues]);
    }

    await conn.commit();

    try {
      const appUrl = process.env.FRONTEND_URL || "https://oneattendanceclient.vercel.app";
      const acceptUrl = `${appUrl}/accept-invite?token=${inviteToken}`;
      await queueCompanyInvitationEmail({
        to: user.email,
        subject: `Invitation to join ${company.name}`,
        fromEmail: process.env.EMAIL_USER,
        fromName: company.name || "OneAttendance",
        replyTo: req.user?.email,
        appUrl, acceptUrl, inviteToken,
        invitedUser: { id: user.id, name: user.name, email: user.email },
        invitedBy: { id: req.user?.id, name: req.user?.name, email: req.user?.email },
        company: { id: company.id, name: company.name },
        invite: {
          employment_type: getEnumObject(EMPLOYMENT_TYPES, employment_type).label,
          designation: getEnumObject(DESIGNATIONS, designation).label,
          salary_type: getEnumObject(SALARY_TYPES, salary_type).label,
          shift_start, shift_end,
          break_minutes: breakMinutes,
          grace_minutes: graceMinutes,
          weekends: normalizeWeekends(weekends || []),
          expires_at: expiresAt
        },
        attendanceMethods: cleanedAttendance.map(m => ({ method: m, is_auto: isAuto })),
        maxAttempts: 3
      });
    } catch (emailError) {
      console.error("Invitation Email Queue Error:", emailError);
    }

    return sendSuccess(res, 201, "Invitation sent successfully.");
  } catch (err) {
    await rollback();
    console.error("Invite Error:", err);
    return sendError(res, 500, "Something went wrong while sending the invitation. Please try again later.");
  } finally {
    if (conn) conn.release();
  }
});

// Resend Invite
router.post("/resend", auth(INV.MNG), async (req, res) => {
  let conn;
  const rollback = async () => { if (conn) await conn.rollback(); };
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const { invite_id } = req.body || {};
    const company_id = req.company?.id;
    const requestedBy = req.user?.id;
    const parsedInviteId = Number(invite_id);

    if (!company_id || !requestedBy || !parsedInviteId) {
      await rollback();
      return sendError(res, 400, "invite_id is required");
    }
    if (!Number.isInteger(parsedInviteId)) {
      await rollback();
      return sendError(res, 400, "Invalid invite_id");
    }

    const [[invite]] = await conn.query(RESEND_SELECT_INVITE, [parsedInviteId, company_id]);
    if (!invite) {
      await rollback();
      return sendError(res, 404, "Invite not found");
    }

    if (invite.status !== "pending") {
      await rollback();
      return sendError(res, 400, `Cannot resend invite with status: ${invite.status}`);
    }
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      await rollback();
      return sendError(res, 400, "Invite already expired");
    }

    const [[user]] = await conn.query(SELECT_USER_BY_ID, [invite.user_id]);
    if (!user || !user.is_active) {
      await rollback();
      return sendError(res, 404, "User not found or inactive");
    }

    const [[company]] = await conn.query(SELECT_COMPANY_BY_ID, [company_id]);
    if (!company) {
      await rollback();
      return sendError(res, 404, "Company not found");
    }

    // Format attendance methods
    const methods = invite.attendance_methods ? JSON.parse(invite.attendance_methods) : [];
    const cleanedAttendance = methods
      .map(method => {
        const name = typeof method === "string" ? method : (method?.method || "");
        const isAuto = typeof method === "string" ? (invite.auto_approve || 0) : (method?.is_auto || invite.auto_approve || 0);
        return { method: name, is_auto: isAuto };
      })
      .filter(m => m.method);

    await conn.commit();

    try {
      const appUrl = process.env.FRONTEND_URL || "https://oneattendanceclient.vercel.app";
      const acceptUrl = `${appUrl}/accept-invite?token=${invite.invite_token}`;
      await queueCompanyInvitationEmail({
        to: user.email,
        subject: `Invitation reminder from ${company.name}`,
        fromEmail: process.env.EMAIL_USER,
        fromName: company.name || "OneAttendance",
        replyTo: req.user?.email,
        appUrl,
        acceptUrl,
        inviteToken: invite.invite_token,
        invitedUser: { id: user.id, name: user.name, email: user.email },
        invitedBy: { id: req.user?.id, name: req.user?.name, email: req.user?.email },
        company: { id: company.id, name: company.name },
        invite: {
          employment_type: getEnumObject(EMPLOYMENT_TYPES, invite.employment_type),
          designation: getEnumObject(DESIGNATIONS, invite.designation),
          salary_type: getEnumObject(SALARY_TYPES, invite.salary_type),
          shift_start: invite.shift_start,
          shift_end: invite.shift_end,
          break_minutes: invite.break_minutes,
          grace_minutes: invite.grace_minutes,
          weekends: parseJSONSafe(invite.weekends, []),
          expires_at: invite.expires_at,
        },
        attendanceMethods: cleanedAttendance,
        maxAttempts: 3,
      });
    } catch (emailError) {
      console.error("Resend Invitation Email Queue Error:", emailError);
    }

    return sendSuccess(res, 200, "Invitation resent successfully", {
      invite_id: invite.id,
      email: user.email,
      status: invite.status,
      expires_at: invite.expires_at,
    });
  } catch (err) {
    if (conn) await rollback();
    console.error("Resend Invite Error:", err);
    return sendError(res, 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// Accept Invite (authenticated)
router.post("/accept", auth(), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const { token } = req.body;
    const userId = req.user?.id;
    if (!token) return sendError(res, 400, "Invite token is required");

    await conn.beginTransaction();

    const [[invite]] = await conn.query(ACCEPT_SELECT_INVITE, [token, userId]);
    if (!invite) {
      await conn.rollback();
      return sendError(res, 400, "Invalid or expired invite");
    }

    const {
      id: inviteId, company_id: companyId, permission_package_id: packageId,
      designation, salary_type: salaryType, employment_type: employmentType,
      shift_start, shift_end, break_minutes, grace_minutes, weekends,
      enable_overtime, enable_deduction, joining_date
    } = invite;

    let expectedWorkMinutes = 0;
    if (shift_start && shift_end) {
      const start = new Date(`1970-01-01T${shift_start}`);
      const end = new Date(`1970-01-01T${shift_end}`);
      if (end <= start) end.setDate(end.getDate() + 1);
      expectedWorkMinutes = Math.floor((end - start) / 60000);
    }

    const breakMinutes = break_minutes;
    const graceMinutes = grace_minutes;
    const inviteAttendance = invite.attendance_methods ? JSON.parse(invite.attendance_methods) : [];

    const [[existingEmployee]] = await conn.query(SELECT_EXISTING_EMPLOYEE_FOR_INVITE, [companyId, userId]);
    let employeeId, employeeCode;

    const inviteEnableOvertimeValue = enable_overtime === true ? 1 : 0;
    const inviteEnableDeductionValue = enable_deduction === undefined ? 1 : (enable_deduction === true ? 1 : 0);
    const inviteJoiningDateValue = joining_date && !Number.isNaN(Date.parse(joining_date)) ? joining_date : null;

    if (existingEmployee) {
      employeeId = existingEmployee.id;
      employeeCode = existingEmployee.employee_code;

      await conn.query(UPDATE_EMPLOYEE, [
        designation, salaryType, employmentType, packageId,
        weekends || null, shift_start || null, shift_end || null,
        breakMinutes || null, graceMinutes || null,
        expectedWorkMinutes, inviteEnableOvertimeValue, inviteEnableDeductionValue,
        inviteJoiningDateValue, userId, employeeId
      ]);
    } else {
      const random = generateRandomToken({ size: 1, encoding: "hex", uppercase: true });
      employeeCode = `EMP-${companyId}${random}`;

      const [result] = await conn.query(INSERT_EMPLOYEE, [
        companyId, userId, packageId, employeeCode,
        designation, salaryType, employmentType,
        weekends || null, shift_start || null, shift_end || null,
        expectedWorkMinutes, breakMinutes || null, graceMinutes || null,
        inviteEnableOvertimeValue, inviteEnableDeductionValue,
        inviteJoiningDateValue || new Date().toISOString().split("T")[0],
        userId, userId
      ]);
      employeeId = result.insertId;
    }

    // Salary structure
    if (invite.base_amount != null) {
      const [salaryResult] = await conn.query(INSERT_SALARY_STRUCTURE, [
        companyId, employeeId, invite.base_amount,
        invite.effective_from || new Date().toISOString().split('T')[0],
        invite.effective_to, userId, userId
      ]);

      const salaryId = salaryResult.insertId;
      const [salaryComponents] = await conn.query(SELECT_INVITE_COMPONENTS, [inviteId]);
      if (salaryComponents.length) {
        const compValues = salaryComponents.map(comp => [
          companyId, employeeId, salaryId,
          comp.component_id, comp.calc_type, comp.calc_value, comp.remark,
          1, userId, userId, 0
        ]);
        await conn.query(INSERT_EMPLOYEE_SALARY_COMPONENT, [compValues]);
      }
    }

    // Attendance methods
    await conn.query(RESTORE_ATTENDANCE_METHODS, [employeeId]);

    if (inviteAttendance.length) {
      const attendanceValues = inviteAttendance.map(m => {
        const method = typeof m === "string" ? m : (m?.method || "");
        const isAuto = typeof m === "string" ? (invite.auto_approve || 0) : (m?.is_auto || invite.auto_approve || 0);
        return [employeeId, method, Number(isAuto || 0), 1, userId, userId, 0];
      }).filter(item => item[1]);

      await conn.query(INSERT_EMPLOYEE_ATTENDANCE_METHODS, [attendanceValues]);
    }

    await conn.query(COMPLETE_INVITE, [userId, inviteId]);
    await conn.commit();

    return sendSuccess(res, 200, "Invitation accepted successfully");
  } catch (error) {
    if (conn) await conn.rollback();
    console.error("Accept invite error:", error);
    return sendError(res, 500, error.message || "Failed to accept invite");
  } finally {
    if (conn) conn.release();
  }
});

// Accept Invite (open – no auth middleware)
router.post("/accept-invite", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const token = req.query.token?.trim() || req.body.token?.trim();
    if (!token) {
      return sendError(res, 400, "Invite token is required");
    }

    await conn.beginTransaction();

    const [[invite]] = await conn.query(ACCEPT_INVITE_OPEN, [token]);
    if (!invite) {
      await conn.rollback();
      return sendError(res, 400, "Invalid or expired invite");
    }

    const {
      id: inviteId,
      company_id: companyId,
      user_id: userId,
      permission_package_id: packageId,
      designation,
      salary_type: salaryType,
      employment_type: employmentType,
      shift_start,
      shift_end,
      break_minutes,
      grace_minutes,
      weekends,
      enable_overtime,
      enable_deduction,
      joining_date,
    } = invite;

    let expectedWorkMinutes = 0;
    if (shift_start && shift_end) {
      const start = new Date(`1970-01-01T${shift_start}`);
      const end = new Date(`1970-01-01T${shift_end}`);
      if (end <= start) end.setDate(end.getDate() + 1);
      expectedWorkMinutes = Math.floor((end - start) / 60000);
    }

    const breakMinutes = break_minutes;
    const graceMinutes = grace_minutes;
    const inviteAttendance = invite.attendance_methods ? JSON.parse(invite.attendance_methods) : [];

    const [[existingEmployee]] = await conn.query(SELECT_EXISTING_EMPLOYEE_FOR_INVITE, [companyId, userId]);
    let employeeId, employeeCode;

    const inviteEnableOvertimeValue = enable_overtime === true ? 1 : 0;
    const inviteEnableDeductionValue = enable_deduction === undefined ? 1 : (enable_deduction === true ? 1 : 0);
    const inviteJoiningDateValue = joining_date && !Number.isNaN(Date.parse(joining_date)) ? joining_date : null;

    if (existingEmployee) {
      employeeId = existingEmployee.id;
      employeeCode = existingEmployee.employee_code;

      await conn.query(UPDATE_EMPLOYEE, [
        designation,
        salaryType,
        employmentType,
        packageId,
        weekends || null,
        shift_start || null,
        shift_end || null,
        breakMinutes || null,
        graceMinutes || null,
        expectedWorkMinutes,
        inviteEnableOvertimeValue,
        inviteEnableDeductionValue,
        inviteJoiningDateValue,
        userId,
        employeeId,
      ]);
    } else {
      const random = generateRandomToken({ size: 1, encoding: "hex", uppercase: true });
      employeeCode = `EMP-${companyId}${random}`;

      const [employeeResult] = await conn.query(INSERT_EMPLOYEE, [
        companyId,
        userId,
        packageId,
        employeeCode,
        designation,
        salaryType,
        employmentType,
        weekends || null,
        shift_start || null,
        shift_end || null,
        expectedWorkMinutes,
        breakMinutes || null,
        graceMinutes || null,
        inviteEnableOvertimeValue,
        inviteEnableDeductionValue,
        inviteJoiningDateValue || new Date().toISOString().split("T")[0],
        userId,
        userId,
      ]);
      employeeId = employeeResult.insertId;
    }

    if (!employeeId) throw new Error("Failed to create employee");

    // Salary structure
    if (invite.base_amount != null) {
      const [salaryResult] = await conn.query(INSERT_SALARY_STRUCTURE, [
        companyId,
        employeeId,
        invite.base_amount,
        invite.effective_from || new Date().toISOString().split('T')[0],
        invite.effective_to,
        userId,
        userId,
      ]);

      const salaryId = salaryResult.insertId;
      const [salaryComponents] = await conn.query(SELECT_INVITE_COMPONENTS, [inviteId]);
      if (salaryComponents.length) {
        const compValues = salaryComponents.map(comp => [
          companyId,
          employeeId,
          salaryId,
          comp.component_id,
          comp.calc_type,
          comp.calc_value,
          comp.remark,
          1,
          userId,
          userId,
          0,
        ]);
        await conn.query(INSERT_EMPLOYEE_SALARY_COMPONENT, [compValues]);
      }
    }

    // Attendance methods
    await conn.query(RESTORE_ATTENDANCE_METHODS, [employeeId]);

    if (inviteAttendance.length > 0) {
      const attendanceValues = inviteAttendance.map(m => {
        const method = typeof m === "string" ? m : (m?.method || "");
        const isAuto = typeof m === "string" ? (invite.auto_approve || 0) : (m?.is_auto || invite.auto_approve || 0);
        return [employeeId, method, Number(isAuto || 0), 1, userId, userId, 0];
      }).filter(item => item[1]);

      await conn.query(INSERT_EMPLOYEE_ATTENDANCE_METHODS, [attendanceValues]);
    }

    await conn.query(COMPLETE_INVITE, [userId, inviteId]);
    await conn.commit();

    return sendSuccess(res, 200, "Invitation accepted successfully");
  } catch (error) {
    if (conn) await conn.rollback();
    console.error("Accept invite error:", error);
    return sendError(res, 500, error.message || "Failed to accept invitation");
  } finally {
    if (conn) conn.release();
  }
});

// List Invites (Company side)
router.get("/list", auth(INV.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const companyId = Number(req.company?.id);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return sendError(res, 400, "Invalid company ID");
    }

    let { page = 1, limit = 10, search = "", status, month, year, from_date, to_date } = req.query;
    page = Math.max(parseInt(page, 10) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const offset = (page - 1) * limit;

    let whereClause = `WHERE ci.company_id = ? AND ci.is_deleted = 0`;
    const params = [companyId];

    if (status && String(status).trim().toLowerCase() !== "all") {
      const allowedStatuses = ["pending", "accepted", "rejected", "cancelled"];
      const normalizedStatus = String(status).trim().toLowerCase();
      if (!allowedStatuses.includes(normalizedStatus)) {
        return sendError(res, 400, "Invalid status filter");
      }
      whereClause += ` AND LOWER(ci.status) = ?`;
      params.push(normalizedStatus);
    }

    search = String(search || "").trim();
    if (search.length >= 3) {
      const like = `%${search}%`;
      whereClause += ` AND (u.name LIKE ? OR u.email LIKE ? OR ci.designation LIKE ?)`;
      params.push(like, like, like);
    }

    if (month && year) {
      const monthNum = Number(month);
      const yearNum = Number(year);
      if (Number.isInteger(monthNum) && monthNum >= 1 && monthNum <= 12 && Number.isInteger(yearNum)) {
        whereClause += ` AND MONTH(ci.created_at) = ? AND YEAR(ci.created_at) = ?`;
        params.push(monthNum, yearNum);
      }
    } else if (year) {
      const yearNum = Number(year);
      if (Number.isInteger(yearNum)) {
        whereClause += ` AND YEAR(ci.created_at) = ?`;
        params.push(yearNum);
      }
    }

    if (from_date && to_date) {
      whereClause += ` AND DATE(ci.created_at) BETWEEN ? AND ?`;
      params.push(from_date, to_date);
    }

    const [[countResult]] = await conn.query(`${LIST_INVITES_COUNT} ${whereClause}`, params);
    const total = Number(countResult?.total || 0);

    const [inviteRows] = await conn.query(
      `${LIST_INVITES_IDS} ${whereClause} ORDER BY ci.created_at DESC, ci.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const inviteIds = inviteRows.map(row => row.id);

    if (!inviteIds.length) {
      return sendSuccess(res, 200, "No invites found", [], buildMeta(page, limit, total, 0));
    }

    const placeholders = inviteIds.map(() => "?").join(",");
    const [rows] = await conn.query(LIST_INVITES_DATA.replace("IN (?)", `IN (${placeholders})`), inviteIds);
    const [salaryRows] = await conn.query(LIST_INVITES_SALARY.replace("IN (?)", `IN (${placeholders})`), inviteIds);

    const salaryComponentsMap = new Map();
    for (const sRow of salaryRows) {
      if (!salaryComponentsMap.has(sRow.invite_id)) salaryComponentsMap.set(sRow.invite_id, []);
      salaryComponentsMap.get(sRow.invite_id).push({
        id: sRow.id,
        component_id: sRow.component_id,
        component_name: sRow.component_name,
        component_code: sRow.component_code,
        calc_type: sRow.calc_type,
        calc_value: parseFloat(sRow.calc_value),
        remark: sRow.remark,
        is_active: !!sRow.is_active,
      });
    }

    const inviteMap = new Map();
    for (const row of rows) {
      if (!inviteMap.has(row.id)) {
        inviteMap.set(row.id, {
          ...row,
          salary_components: salaryComponentsMap.get(row.id) || [],
          permissions: [],
        });
      }
      if (row.permission_id) {
        const inv = inviteMap.get(row.id);
        if (!inv.permissions.some(p => p.id === row.permission_id)) {
          inv.permissions.push({ id: row.permission_id, name: row.permission_name, code: row.permission_code });
        }
      }
    }

    const data = Array.from(inviteMap.values())
      .map(inv => formatInvite(inv, { permissions: inv.permissions, salaryComponents: inv.salary_components }))
      .sort((a, b) => inviteIds.indexOf(a.invite_id) - inviteIds.indexOf(b.invite_id));

    return sendSuccess(res, 200, "All company invites fetched successfully", data, buildMeta(page, limit, total, data.length));
  } catch (error) {
    console.error("Error fetching invites:", error);
    return sendError(res, 500, "Failed to fetch invites");
  } finally {
    if (conn) conn.release();
  }
});

// My Invites (User side)
router.get("/my", auth(), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const userId = Number(req.user?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return sendError(res, 401, "Invalid user ID");
    }

    let { page = 1, limit = 10, search = "", status, date, month, year, from_date, to_date } = req.query;
    page = Math.max(parseInt(page, 10) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const offset = (page - 1) * limit;

    let where = `WHERE ci.user_id = ? AND ci.is_deleted = 0 AND c.is_deleted = 0`;
    const params = [userId];

    if (status && String(status).trim().toLowerCase() !== "all") {
      const allowedStatuses = ["pending", "accepted", "rejected", "cancelled"];
      const normalizedStatus = String(status).trim().toLowerCase();
      if (!allowedStatuses.includes(normalizedStatus)) {
        return sendError(res, 400, "Invalid status filter");
      }
      where += ` AND LOWER(ci.status) = ?`;
      params.push(normalizedStatus);
    }

    search = String(search || "").trim();
    if (search.length >= 3) {
      const like = `%${search}%`;
      where += ` AND (c.name LIKE ? OR c.city LIKE ? OR c.state LIKE ? OR c.country LIKE ? OR ci.designation LIKE ?)`;
      params.push(like, like, like, like, like);
    }

    if (date) { where += ` AND DATE(ci.created_at) = ?`; params.push(date); }
    if (month && year) {
      const monthNum = Number(month), yearNum = Number(year);
      if (Number.isInteger(monthNum) && monthNum >= 1 && monthNum <= 12 && Number.isInteger(yearNum)) {
        where += ` AND MONTH(ci.created_at) = ? AND YEAR(ci.created_at) = ?`;
        params.push(monthNum, yearNum);
      }
    } else if (year) {
      const yearNum = Number(year);
      if (Number.isInteger(yearNum)) { where += ` AND YEAR(ci.created_at) = ?`; params.push(yearNum); }
    }
    if (from_date && to_date) {
      where += ` AND DATE(ci.created_at) BETWEEN ? AND ?`;
      params.push(from_date, to_date);
    }

    const [[countRow]] = await conn.query(`${MY_INVITES_COUNT} ${where}`, params);
    const total = Number(countRow?.total || 0);

    const [inviteRows] = await conn.query(
      `${MY_INVITES_IDS} ${where} ORDER BY ci.created_at DESC, ci.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const inviteIds = inviteRows.map(row => row.id);

    if (!inviteIds.length) {
      return sendSuccess(res, 200, "No invites found", [], buildMeta(page, limit, total, 0));
    }

    const placeholders = inviteIds.map(() => "?").join(",");
    const [rows] = await conn.query(MY_INVITES_DATA.replace("IN (?)", `IN (${placeholders})`), inviteIds);
    const [salaryRows] = await conn.query(MY_INVITES_SALARY.replace("IN (?)", `IN (${placeholders})`), inviteIds);

    const salaryComponentsMap = new Map();
    for (const sRow of salaryRows) {
      if (!salaryComponentsMap.has(sRow.invite_id)) salaryComponentsMap.set(sRow.invite_id, []);
      salaryComponentsMap.get(sRow.invite_id).push({
        id: sRow.id,
        component_id: sRow.component_id,
        component_name: sRow.component_name,
        component_code: sRow.component_code,
        calc_type: sRow.calc_type,
        calc_value: parseFloat(sRow.calc_value),
        remark: sRow.remark,
        is_active: !!sRow.is_active,
      });
    }

    const inviteMap = new Map();
    for (const row of rows) {
      if (!inviteMap.has(row.id)) {
        inviteMap.set(row.id, {
          ...row,
          salary_components: salaryComponentsMap.get(row.id) || [],
          permissions: [],
        });
      }
      if (row.permission_id) {
        const inv = inviteMap.get(row.id);
        if (!inv.permissions.some(p => p.id === row.permission_id)) {
          inv.permissions.push({ id: row.permission_id, name: row.permission_name, code: row.permission_code });
        }
      }
    }

    const data = Array.from(inviteMap.values())
      .map(inv => formatUserInvite(inv, { permissions: inv.permissions, salaryComponents: inv.salary_components }))
      .sort((a, b) => inviteIds.indexOf(a.invite_id) - inviteIds.indexOf(b.invite_id));

    return sendSuccess(res, 200, data.length ? "User invites fetched successfully" : "No invites found", data, buildMeta(page, limit, total, data.length));
  } catch (error) {
    console.error("Error fetching user invites:", error);
    return sendError(res, 500, "Failed to fetch user invites");
  } finally {
    if (conn) conn.release();
  }
});

// Update Invite
router.put("/update", auth(INV.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    let {
      invite_id,
      employment_type,
      designation,
      salary_type,
      status,
      permission_package_id,
      attendance_methods,
      auto_approve,
      enable_overtime,
      enable_deduction,
      joining_date,
      shift_start,
      shift_end,
      break_minutes,
      grace_minutes,
      weekends,
      base_amount,
      effective_from,
      effective_to,
      components,
    } = req.body;

    if (!invite_id && req.body["invite _id"]) {
      invite_id = req.body["invite _id"];
    }
    invite_id = Number(invite_id);

    const modifiedBy = req.user?.id;
    const company_id = req.company?.id;

    if (!company_id || !invite_id) {
      return sendError(res, 400, "company_id and invite_id are required");
    }

    if (shift_start && shift_end && shift_start >= shift_end) {
      return sendError(res, 422, "shift_start must be less than shift_end");
    }

    let breakMinutes = null;
    let graceMinutes = null;
    if (break_minutes) {
      if (typeof break_minutes !== "string") throw { status: 400, message: "break_minutes must be in HH:mm format" };
      const parts = break_minutes.split(":");
      if (parts.length !== 2) throw { status: 400, message: "Invalid break_minutes format. Use HH:mm" };
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      if (isNaN(hours) || isNaN(minutes)) throw { status: 400, message: "Invalid break_minutes values" };
      breakMinutes = (hours * 60) + minutes;
    }
    if (grace_minutes) {
      if (typeof grace_minutes !== "string") throw { status: 400, message: "grace_minutes must be in HH:mm format" };
      const parts = grace_minutes.split(":");
      if (parts.length !== 2) throw { status: 400, message: "Invalid grace_minutes format. Use HH:mm" };
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      if (isNaN(hours) || isNaN(minutes)) throw { status: 400, message: "Invalid grace_minutes values" };
      graceMinutes = (hours * 60) + minutes;
    }

    if (base_amount !== undefined && base_amount !== null && base_amount !== "") {
      const parsedBase = parseFloat(base_amount);
      if (isNaN(parsedBase) || parsedBase < 0) throw { status: 400, message: "base_amount must be a valid non-negative number" };
      base_amount = parsedBase;
    } else if (base_amount === "") {
      base_amount = null;
    }

    if (effective_from && isNaN(Date.parse(effective_from))) throw { status: 400, message: "Invalid effective_from date format" };
    if (effective_to && isNaN(Date.parse(effective_to))) throw { status: 400, message: "Invalid effective_to date format" };
    if (joining_date !== undefined && joining_date !== null && joining_date !== "" && isNaN(Date.parse(joining_date))) throw { status: 400, message: "Invalid joining_date format" };

    if (components !== undefined && components !== null) {
      if (!Array.isArray(components)) throw { status: 400, message: "components must be an array" };
      for (let idx = 0; idx < components.length; idx++) {
        const comp = components[idx];
        if (!comp.component_id || !Number.isInteger(Number(comp.component_id))) throw { status: 400, message: `Invalid component_id at index ${idx}` };
        if (!comp.calc_type || typeof comp.calc_type !== "string" || !comp.calc_type.trim()) throw { status: 400, message: `Calculation type is required at index ${idx}` };
        if (comp.calc_value === undefined || isNaN(parseFloat(comp.calc_value))) throw { status: 400, message: `Invalid calculation value at index ${idx}` };
      }
    }

    if (attendance_methods !== undefined) {
      if (!Array.isArray(attendance_methods)) throw { status: 400, message: "attendance_methods must be an array" };
      const methodSet = new Set();
      attendance_methods = attendance_methods.map(m => {
        const method = typeof m === "string" ? m : m?.method;
        if (!method) throw new Error("Invalid attendance method");
        if (methodSet.has(method)) return null;
        methodSet.add(method);
        return method;
      }).filter(Boolean);
    }

    await conn.beginTransaction();

    const [[company]] = await conn.query(SELECT_COMPANY_BY_ID, [company_id]);
    if (!company) {
      await conn.rollback();
      return sendError(res, 404, "Company not found");
    }

    const [[invite]] = await conn.query(
      `SELECT id, invite_token, permission_package_id, weekends, shift_start, shift_end
       FROM company_invites
       WHERE id=? AND company_id=? AND is_deleted=0
       FOR UPDATE`,
      [invite_id, company_id]
    );
    if (!invite) {
      await conn.rollback();
      return sendError(res, 404, "Invite not found");
    }

    if (permission_package_id !== undefined) {
      const [[pkg]] = await conn.query(CHECK_SINGLE_PERMISSION_PACKAGE, [permission_package_id, company_id]);
      if (!pkg) {
        await conn.rollback();
        return sendError(res, 400, "Invalid permission package");
      }
    }

    const fields = [];
    const values = [];
    const addField = (key, value) => { fields.push(`${key}=?`); values.push(value); };

    if (employment_type !== undefined) addField("employment_type", employment_type);
    if (designation !== undefined) addField("designation", designation);
    if (salary_type !== undefined) addField("salary_type", salary_type);
    if (status !== undefined) addField("status", status);
    if (permission_package_id !== undefined) addField("permission_package_id", permission_package_id);
    if (shift_start !== undefined) addField("shift_start", shift_start);
    if (shift_end !== undefined) addField("shift_end", shift_end);
    if (break_minutes !== undefined) addField("break_minutes", breakMinutes);
    if (grace_minutes !== undefined) addField("grace_minutes", graceMinutes);
    if (weekends !== undefined) addField("weekends", JSON.stringify(normalizeWeekends(weekends || [])));
    if (attendance_methods !== undefined) addField("attendance_methods", JSON.stringify(attendance_methods));
    if (auto_approve !== undefined) addField("auto_approve", auto_approve === true ? 1 : 0);
    if (enable_overtime !== undefined) addField("enable_overtime", enable_overtime === true ? 1 : 0);
    if (enable_deduction !== undefined) addField("enable_deduction", enable_deduction === true ? 1 : 0);
    if (joining_date !== undefined) addField("joining_date", joining_date);
    if (base_amount !== undefined) addField("base_amount", base_amount);
    if (effective_from !== undefined) addField("effective_from", effective_from);
    if (effective_to !== undefined) addField("effective_to", effective_to);

    if (fields.length) {
      await conn.query(UPDATE_INVITE.replace("__SET__", fields.join(", ")), [...values, modifiedBy, invite.id]);
    }

    if (components !== undefined && components !== null) {
      if (components.length > 0) {
        const componentIds = [...new Set(components.map(c => Number(c.component_id)))];
        const placeholders = componentIds.map(() => "?").join(", ");
        const [validComps] = await conn.query(SELECT_VALID_SALARY_COMPONENTS, [...componentIds, company_id]);
        const validIds = new Set(validComps.map(r => r.id));
        for (const id of componentIds) {
          if (!validIds.has(id)) {
            await conn.rollback();
            return sendError(res, 400, `Salary component with id ${id} not found or does not belong to this company`);
          }
        }
      }

      await conn.query(DELETE_INVITE_COMPONENTS, [invite.id]);

      if (components.length > 0) {
        const compValues = components.map(comp => [
          invite.id,
          Number(comp.component_id),
          comp.calc_type.trim(),
          parseFloat(comp.calc_value),
          comp.remark ? comp.remark.trim() : null,
          1,
        ]);
        await conn.query(INSERT_INVITE_SALARY_COMPONENTS, [compValues]);
      }
    } else if (components === null) {
      await conn.query(DELETE_INVITE_COMPONENTS, [invite.id]);
    }

    await conn.commit();
    return sendSuccess(res, 200, "Invite updated successfully");
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Invite update error:", err);
    const status = err?.status || 500;
    const message = err?.message || "Internal server error";
    return sendError(res, status, message);
  } finally {
    if (conn) conn.release();
  }
});

// Cancel Invite
router.delete("/cancel", auth(), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const { token } = req.body;
    const userId = req.user?.id;

    if (!token) {
      return sendError(res, 400, "Invite token is required");
    }

    await conn.beginTransaction();

    const [[invite]] = await conn.query(
      `SELECT id, company_id, user_id, invited_by, permission_package_id
       FROM company_invites
       WHERE invite_token = ? AND status = 'pending' AND is_active = 1 AND is_deleted = 0
         AND (expires_at IS NULL OR expires_at > NOW())
       FOR UPDATE`,
      [token]
    );

    if (!invite) {
      await conn.rollback();
      return sendError(res, 404, "Invalid, expired, or already processed invite");
    }

    if (invite.user_id !== userId) {
      await conn.rollback();
      return sendError(res, 403, "You are not the recipient of this invite");
    }

    await conn.query(CANCEL_INVITE, [userId, invite.id]);
    await conn.commit();

    return sendSuccess(res, 200, "Invitation cancelled successfully");
  } catch (error) {
    if (conn) await conn.rollback();
    console.error("Cancel invite error:", error);
    return sendError(res, 500, "Failed to cancel invite");
  } finally {
    if (conn) conn.release();
  }
});

// Reject Invite
router.put("/reject", auth(INV.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const { token } = req.body;
    const userId = req.user?.id;

    if (!token) {
      return sendError(res, 400, "Invite token is required");
    }

    await conn.beginTransaction();

    const [[invite]] = await conn.query(
      `SELECT id, invite_token, user_id
       FROM company_invites
       WHERE invite_token = ? AND user_id = ? AND status = 'pending' AND is_active = 1 AND is_deleted = 0
         AND (expires_at IS NULL OR expires_at > NOW())
       FOR UPDATE`,
      [token, userId]
    );

    if (!invite) {
      await conn.rollback();
      return sendError(res, 404, "Invite not found, expired, or already processed");
    }

    await conn.query(REJECT_INVITE, [userId, invite.id]);
    await conn.commit();

    return sendSuccess(res, 200, "Invite rejected successfully", { invite_token: invite.invite_token, status: "rejected" });
  } catch (error) {
    if (conn) await conn.rollback();
    console.error("Reject invite error:", error);
    return sendError(res, 500, "Failed to reject invite");
  } finally {
    if (conn) conn.release();
  }
});

export default router;
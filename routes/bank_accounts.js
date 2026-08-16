import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import checkPermission from "../middleware/permissionValidationMiddleware.js";
import axios from "axios";
import { checkCompanyPermissions } from "../utils/checkPermissions.js";
import { buildFileUrl } from "../utils/fileService.js";
import { getEnumObject } from "../utils/constantsValidator.js";
import { DESIGNATIONS, EMPLOYMENT_TYPES } from "../constants/constants_values.js";
import { CMP_BANK, EMP_BANK } from "../constants/permissions.js";
import { formatUTCToIST } from "../utils/time.js";
import { sendSuccess, sendError, buildMeta, safeNumber, sanitizeText } from "../utils/sendResponse.js";

const router = express.Router();

const BANK = {
  ALL: [...EMP_BANK.MNG, ...CMP_BANK.MNG],
};

const BANK_ACCOUNT_BASE_FIELDS = `
  ba.id,
  ba.company_id,
  ba.employee_id,
  ba.account_type,
  ba.bank_name,
  ba.account_holder_name,
  ba.account_number,
  ba.ifsc_code,
  ba.branch_name,
  ba.upi_id,
  ba.is_primary,
  ba.status,
  ba.is_active,
  ba.created_at,
  ba.updated_at,
  ba.created_by,
  ba.updated_by
`;

const USER_EXISTS_QUERY = `SELECT id, is_active, is_deleted FROM users WHERE id = ? LIMIT 1`;
const COMPANY_EXISTS_QUERY = `SELECT id, owner_user_id, is_active, is_deleted FROM companies WHERE id = ? LIMIT 1`;
const EMPLOYEE_EXISTS_QUERY = `SELECT id, company_id, is_active, is_deleted FROM employees WHERE id = ? AND company_id = ? LIMIT 1`;

const BANK_SELECT_BY_ID = `SELECT ${BANK_ACCOUNT_BASE_FIELDS} FROM bank_accounts ba WHERE ba.id = ? LIMIT 1`;

const CASH_EXISTS_QUERY = `SELECT id FROM bank_accounts WHERE company_id = ? AND employee_id IS NULL AND account_type = 'cash' AND is_deleted = 0 LIMIT 1`;

const DUPLICATE_BANK_QUERY = {
  employee: `SELECT id FROM bank_accounts WHERE company_id = ? AND employee_id = ? AND account_number = ? AND ifsc_code = ? AND is_deleted = 0 `,
  company: `SELECT id FROM bank_accounts WHERE company_id = ? AND employee_id IS NULL AND account_number = ? AND ifsc_code = ? AND is_deleted = 0 `,
};

const DUPLICATE_UPI_QUERY = {
  employee: `SELECT id FROM bank_accounts WHERE company_id = ? AND employee_id = ? AND upi_id = ? AND is_deleted = 0`,
  company: `SELECT id FROM bank_accounts WHERE company_id = ? AND employee_id IS NULL AND upi_id = ? AND is_deleted = 0`,
};

const PRIMARY_EXISTS_QUERY = `SELECT id FROM bank_accounts WHERE company_id = ? AND ((? = 'employee' AND employee_id = ?) OR (? = 'company' AND employee_id IS NULL)) AND is_primary = 1 AND is_deleted = 0 LIMIT 1`;

const UPDATE_PRIMARY_TO_ZERO_QUERY = {
  employee: `UPDATE bank_accounts SET is_primary = 0, updated_by = ? WHERE employee_id = ? AND is_deleted = 0`,
  company: `UPDATE bank_accounts SET is_primary = 0, updated_by = ? WHERE company_id = ? AND employee_id IS NULL AND is_deleted = 0`,
};

const INSERT_BANK_QUERY = `INSERT INTO bank_accounts (company_id, employee_id, account_type, bank_name, account_holder_name, account_number, ifsc_code, branch_name, upi_id, is_primary, created_by, updated_by)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;


const ALLOWED_STATUSES = ["active", "inactive"];
const ALLOWED_ACCOUNT_TYPES = ["cash", "current", "savings", "loan", "upi"];
const COMPANY_ACCOUNT_TYPES = ["cash", "current", "savings", "loan", "upi"];
const EMPLOYEE_ACCOUNT_TYPES = ["current", "savings", "upi"];
const BANK_OWNER_TYPES = ["company", "employee"];
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const ALLOWED_SORT_BY = {
  created_at: "ba.created_at",
  updated_at: "ba.updated_at",
  bank_name: "ba.bank_name",
  account_holder_name: "ba.account_holder_name",
  account_type: "ba.account_type",
};
const ALLOWED_SORT_ORDER = ["ASC", "DESC"];


const maskAccountNumber = (value) => {
  if (!value) return null;
  const clean = String(value).trim();
  if (clean.length <= 4) return clean;
  return `${"*".repeat(clean.length - 4)}${clean.slice(-4)}`;
};

const maskUpiId = (value) => {
  if (!value) return null;
  const clean = String(value).trim();
  const parts = clean.split("@");
  if (parts.length !== 2) return clean;
  const username = parts[0];
  const handle = parts[1];
  if (username.length <= 2) return `**@${handle}`;
  return `${username.slice(0, 2)}${"*".repeat(username.length - 2)}@${handle}`;
};

const formatBankAccount = (account, options = {}) => {
  const {
    idKey = "id",
    includeMasked = false,
    includeEmployee = false,
    ownerType = null,
    includeCreatedBy = false,
    overrideBankNameForCash = false,
  } = options;

  const base = {
    [idKey]: account.id,
    company_id: account.company_id,
    employee_id: account.employee_id,
    account_type: account.account_type,
    bank_name:
      account.account_type === "cash" && overrideBankNameForCash
        ? "Cash Account"
        : account.bank_name,
    account_holder_name: account.account_holder_name,
    account_number: account.account_number,
    ifsc_code: account.ifsc_code,
    branch_name: account.branch_name,
    upi_id: account.upi_id,
    is_primary: account.is_primary == 1,
    status: account.status,
    is_active: account.is_active == 1,
    created_at: formatUTCToIST(account.created_at),
    updated_at: formatUTCToIST(account.updated_at),
  };

  if (includeMasked) {
    base.masked_account_number = maskAccountNumber(account.account_number);
    base.masked_upi_id = maskUpiId(account.upi_id);
  }

  if (includeCreatedBy) {
    base.created_by = account.created_by;
    base.updated_by = account.updated_by;
  }

  if (ownerType) {
    base.owner_type = ownerType;
  }

  if (includeEmployee) {
    const employee = {};
    if (account.emp_id !== undefined) employee.id = account.emp_id;
    if (account.employee_code !== undefined)
      employee.employee_code = account.employee_code;
    if (account.designation !== undefined)
      employee.designation = getEnumObject(DESIGNATIONS, account.designation);
    if (account.employment_type !== undefined)
      employee.employment_type = getEnumObject(
        EMPLOYMENT_TYPES,
        account.employment_type
      );
    if (account.employee_status !== undefined)
      employee.status = account.employee_status;
    if (account.joining_date !== undefined)
      employee.joining_date = account.joining_date;

    if (account.linked_user_id !== undefined) {
      employee.user = {
        id: account.linked_user_id,
        name: account.linked_user_name,
        email: account.linked_user_email,
        phone: account.linked_user_phone,
        profile_picture: buildFileUrl(account.profile_picture),
      };
    }

    if (Object.keys(employee).length > 0) {
      base.employee = employee;
    }
  }

  return base;
};

const sanitizeString = (value, { lower = false, upper = false } = {}) => {
  if (typeof value !== "string") return null;
  let sanitized = value.trim();
  if (!sanitized) return null;
  if (lower) sanitized = sanitized.toLowerCase();
  if (upper) sanitized = sanitized.toUpperCase();
  return sanitized;
};

async function validateUserActive(conn, userId) {
  const [[user]] = await conn.query(USER_EXISTS_QUERY, [userId]);
  if (!user || user.is_deleted) {
    return { error: { status: 404, message: "User not found" } };
  }
  if (!user.is_active) {
    return { error: { status: 403, message: "User inactive" } };
  }
  return { user };
}

async function validateCompanyActive(conn, companyId) {
  const [[company]] = await conn.query(COMPANY_EXISTS_QUERY, [companyId]);
  if (!company || company.is_deleted) {
    return { error: { status: 404, message: "Company not found" } };
  }
  if (!company.is_active) {
    return { error: { status: 403, message: "Company inactive" } };
  }
  return { company };
}

async function validateEmployeeActive(conn, employeeId, companyId) {
  const [[employee]] = await conn.query(EMPLOYEE_EXISTS_QUERY, [employeeId, companyId]);
  if (!employee || employee.is_deleted) {
    return { error: { status: 404, message: "Employee not found" } };
  }
  if (!employee.is_active) {
    return { error: { status: 403, message: "Employee inactive" } };
  }
  return { employee };
}

function parseListQuery(query, { allowedSortBy, allowedAccountTypes, allowedStatuses }) {
  const errors = [];

  const page = Math.max(1, safeNumber(query.page, 1));
  const limit = Math.min(100, Math.max(1, safeNumber(query.limit, 10)));
  const offset = (page - 1) * limit;

  let search = sanitizeText(query.search) || "";
  const status = query.status ? String(query.status).toLowerCase() : null;
  const account_type = query.account_type ? String(query.account_type).toLowerCase() : null;

  let is_primary = null;
  if (query.is_primary !== undefined && query.is_primary !== null && query.is_primary !== "") {
    const normalized = String(query.is_primary).trim().toLowerCase();
    if (!["true", "false"].includes(normalized)) {
      errors.push("is_primary must be true or false");
    } else {
      is_primary = normalized === "true" ? 1 : 0;
    }
  }

  let sort_by = query.sort_by;
  if (!allowedSortBy[sort_by]) sort_by = "created_at";
  let sort_order = String(query.sort_order || "DESC").toUpperCase();
  if (!ALLOWED_SORT_ORDER.includes(sort_order)) sort_order = "DESC";

  if (status && !allowedStatuses.includes(status)) errors.push("Invalid status filter");
  if (account_type && !allowedAccountTypes.includes(account_type)) errors.push("Invalid account type filter");

  if (errors.length) {
    return { error: { status: 400, message: errors[0] } };
  }

  return { page, limit, offset, search, status, account_type, is_primary, sort_by, sort_order };
}

function applyBankFilters(filters, conditions, params, searchFields = []) {
  if (filters.status) {
    conditions.push("ba.status = ?");
    params.push(filters.status);
  }
  if (filters.account_type) {
    conditions.push("ba.account_type = ?");
    params.push(filters.account_type);
  }
  if (filters.is_primary !== null) {
    conditions.push("ba.is_primary = ?");
    params.push(filters.is_primary);
  }
  if (filters.search && searchFields.length) {
    const sv = `%${filters.search}%`;
    const likeClauses = searchFields.map(field => `${field} LIKE ?`);
    conditions.push(`(${likeClauses.join(" OR ")})`);
    params.push(...Array(searchFields.length).fill(sv));
  }
}


router.get("/ifsc/:ifsc_code", auth(), async (req, res) => {
  try {
    let { ifsc_code } = req.params;
    if (!ifsc_code) return sendError(res, 400, "IFSC code is required");

    ifsc_code = ifsc_code.trim().toUpperCase();
    if (!IFSC_REGEX.test(ifsc_code))
      return sendError(res, 400, "Invalid IFSC format (e.g. SBIN0001234)");

    const response = await axios.get(`https://ifsc.razorpay.com/${ifsc_code}`, {
      timeout: 5000,
    });
    const bankData = response.data;
    if (!bankData) return sendError(res, 404, "Bank details not found");

    const result = {
      ifsc: bankData.IFSC,
      bank_name: bankData.BANK,
      branch: bankData.BRANCH,
      address: bankData.ADDRESS,
      city: bankData.CITY,
      district: bankData.DISTRICT,
      state: bankData.STATE,
      micr: bankData.MICR,
      contact: bankData.CONTACT,
      upi: bankData.UPI,
    };
    return sendSuccess(res, 200, "IFSC details fetched successfully", result);
  } catch (err) {
    console.error("IFSC fetch error:", err.message);
    if (err.response?.status === 404) {
      return sendError(res, 404, "Invalid IFSC or bank not found");
    }
    return sendError(res, 500, "Failed to fetch bank details");
  }
});

router.post("/create", auth(BANK.ALL), async (req, res) => {
  let conn;
  let transactionStarted = false;
  let responseSent = false;
  const ENABLE_ACCOUNT_MASKING = false;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionStarted = true;

    const user_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);

    let {
      bank_owner_type,
      employee_id = null,
      account_type,
      bank_name = null,
      account_holder_name = null,
      account_number = null,
      ifsc_code = null,
      branch_name = null,
      upi_id = null,
      is_primary = false,
    } = req.body;

    bank_owner_type = sanitizeString(bank_owner_type, { lower: true });
    employee_id = employee_id !== null && employee_id !== undefined ? safeNumber(employee_id) : null;
    if (employee_id !== null && (!Number.isInteger(employee_id) || employee_id <= 0)) {
      await conn.rollback();
      responseSent = true;
      return sendError(res, 400, "Invalid employee_id");
    }

    account_type = sanitizeString(account_type, { lower: true });
    bank_name = sanitizeString(bank_name);
    account_holder_name = sanitizeString(account_holder_name);
    account_number = sanitizeString(account_number);
    ifsc_code = sanitizeString(ifsc_code, { upper: true });
    branch_name = sanitizeString(branch_name);
    upi_id = sanitizeString(upi_id, { lower: true });
    if (typeof is_primary !== "boolean") {
      await conn.rollback();
      responseSent = true;
      return sendError(
        res,
        400,
        "is_primary must be a boolean (true or false)"
      );
    }

    if (!BANK_OWNER_TYPES.includes(bank_owner_type)) {
      await conn.rollback();
      responseSent = true;
      return sendError(res, 400, `bank_owner_type must be one of: ${BANK_OWNER_TYPES.join(", ")}`);
    }

    const userCheck = await validateUserActive(conn, user_id);
    if (userCheck.error) {
      await conn.rollback();
      responseSent = true;
      return sendError(res, userCheck.error.status, userCheck.error.message);
    }
    const companyCheck = await validateCompanyActive(conn, company_id);
    if (companyCheck.error) {
      await conn.rollback();
      responseSent = true;
      return sendError(res, companyCheck.error.status, companyCheck.error.message);
    }

    const permissionResult = await checkCompanyPermissions({
      conn,
      user_id,
      company_id,
      permissions: ["emp_bnk_create"],
    });
    const isOwner = permissionResult.role === "owner";

    if (bank_owner_type === "employee") {
      if (!employee_id) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 400, "employee_id is required when bank_owner_type is employee");
      }
      if (!EMPLOYEE_ACCOUNT_TYPES.includes(account_type)) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 400, `Employee account_type must be one of: ${EMPLOYEE_ACCOUNT_TYPES.join(", ")}`);
      }
      const employeeCheck = await validateEmployeeActive(conn, employee_id, company_id);
      if (employeeCheck.error) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, employeeCheck.error.status, employeeCheck.error.message);
      }
    } else {
      if (!isOwner) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 403, "Only company owner can create company bank accounts");
      }
      if (employee_id) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 400, "employee_id is not allowed for company bank accounts");
      }
      if (!COMPANY_ACCOUNT_TYPES.includes(account_type)) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 400, `Company account_type must be one of: ${COMPANY_ACCOUNT_TYPES.join(", ")}`);
      }
    }

    if (account_type === "cash") {
      const [[existingCash]] = await conn.query(CASH_EXISTS_QUERY, [company_id]);
      if (existingCash) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 409, "Cash account already exists");
      }
    }

    if (["current", "savings", "loan"].includes(account_type)) {
      if (!bank_name || !account_holder_name || !account_number || !ifsc_code) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 400, "bank_name, account_holder_name, account_number and ifsc_code are required");
      }
      if (account_number.length < 6 || account_number.length > 50) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 400, "Invalid account number");
      }
      if (!IFSC_REGEX.test(ifsc_code)) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 400, "Invalid IFSC code");
      }

      const storedAccountNumber = ENABLE_ACCOUNT_MASKING ? maskAccountNumber(account_number) : account_number;

      const duplicateQuery = DUPLICATE_BANK_QUERY[bank_owner_type];
      const duplicateParams = bank_owner_type === "employee"
        ? [company_id, employee_id, storedAccountNumber, ifsc_code]
        : [company_id, storedAccountNumber, ifsc_code];
      const [[duplicate]] = await conn.query(duplicateQuery, duplicateParams);
      if (duplicate) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 409, "Bank account already exists");
      }

      account_number = storedAccountNumber;
    }

    if (account_type === "upi") {
      if (!upi_id) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 400, "upi_id is required");
      }
      if (!UPI_REGEX.test(upi_id)) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 400, "Invalid UPI ID");
      }

      const upiQuery = DUPLICATE_UPI_QUERY[bank_owner_type] + " LIMIT 1";
      const upiParams = bank_owner_type === "employee"
        ? [company_id, employee_id, upi_id]
        : [company_id, upi_id];
      const [[existingUpi]] = await conn.query(upiQuery, upiParams);
      if (existingUpi) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 409, "UPI already exists");
      }
    }

    const [[existingPrimary]] = await conn.query(PRIMARY_EXISTS_QUERY, [company_id, bank_owner_type, employee_id, bank_owner_type]);
    if (!existingPrimary) is_primary = true;

    if (is_primary) {
      const updateQuery = UPDATE_PRIMARY_TO_ZERO_QUERY[bank_owner_type];
      const updateParams = bank_owner_type === "employee"
        ? [user_id, employee_id]
        : [user_id, company_id];
      await conn.query(updateQuery, updateParams);
    }

    const [insertResult] = await conn.query(INSERT_BANK_QUERY, [
      company_id, employee_id, account_type, bank_name, account_holder_name, account_number, ifsc_code, branch_name, upi_id, is_primary ? 1 : 0, user_id, user_id,
    ]);

    const [[createdAccount]] = await conn.query(BANK_SELECT_BY_ID, [insertResult.insertId]);

    await conn.commit();
    responseSent = true;

    const formatted = formatBankAccount(createdAccount, { idKey: "id" });
    return sendSuccess(res, 201, "Bank account created successfully", formatted);
  } catch (error) {
    if (!responseSent) {
      if (conn && transactionStarted) await conn.rollback();
      console.error("Create bank account error:", error);
      return sendError(res, 500, "Internal server error");
    }
  } finally {
    if (conn) conn.release();
  }
});

router.put("/update", auth(BANK.ALL), async (req, res) => {
  let conn;
  let transactionStarted = false;
  let responseSent = false;
  const ENABLE_ACCOUNT_MASKING = false;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionStarted = true;

    const user_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);
    if (!user_id || !company_id) {
      await conn.rollback();
      responseSent = true;
      return sendError(res, 401, "Unauthorized");
    }

    const bank_id = safeNumber(req.body.bank_id);
    if (!bank_id) {
      await conn.rollback();
      responseSent = true;
      return sendError(res, 400, "bank_id is required");
    }

    const userCheck = await validateUserActive(conn, user_id);
    if (userCheck.error) {
      await conn.rollback();
      responseSent = true;
      return sendError(res, userCheck.error.status, userCheck.error.message);
    }
    const companyCheck = await validateCompanyActive(conn, company_id);
    if (companyCheck.error) {
      await conn.rollback();
      responseSent = true;
      return sendError(res, companyCheck.error.status, companyCheck.error.message);
    }

    const [[existingAccount]] = await conn.query(
      `SELECT * FROM bank_accounts WHERE id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1 FOR UPDATE`,
      [bank_id, company_id]
    );
    if (!existingAccount) {
      await conn.rollback();
      responseSent = true;
      return sendError(res, 404, "Bank account not found");
    }

    const permissionResult = await checkCompanyPermissions({
      conn,
      user_id,
      company_id,
      permissions: ["emp_bnk_update"],
    });
    const isOwner = permissionResult.role === "owner";
    const userPermissions = permissionResult.permissions || [];

    const bank_owner_type = existingAccount.employee_id ? "employee" : "company";

    if (bank_owner_type === "employee") {
      const [[targetEmployee]] = await conn.query(
        `SELECT id, user_id, company_id, is_active, is_deleted FROM employees WHERE id = ? AND company_id = ? LIMIT 1`,
        [existingAccount.employee_id, company_id]
      );
      if (!targetEmployee || targetEmployee.is_deleted) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 404, "Employee not found");
      }
      if (!targetEmployee.is_active) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 403, "Employee inactive");
      }

      if (!isOwner) {
        const [[currentEmployee]] = await conn.query(
          `SELECT id, user_id, is_active, is_deleted FROM employees WHERE user_id = ? AND company_id = ? LIMIT 1`,
          [user_id, company_id]
        );
        if (!currentEmployee || currentEmployee.is_deleted) {
          await conn.rollback();
          responseSent = true;
          return sendError(res, 403, "Employee not found");
        }
        if (!currentEmployee.is_active) {
          await conn.rollback();
          responseSent = true;
          return sendError(res, 403, "Employee inactive");
        }

        const isSelfAccount = currentEmployee.id === targetEmployee.id;
        const canManageOthers = userPermissions.includes("emp_bnk_manage_others");
        if (!isSelfAccount && !canManageOthers) {
          await conn.rollback();
          responseSent = true;
          return sendError(res, 403, "You do not have permission to update other employee bank accounts");
        }
      }
    } else {
      if (!isOwner) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 403, "Only company owner can update company bank accounts");
      }
    }

    const patchField = (fieldName, existingValue, transform = (v) => v) => {
      if (!(fieldName in req.body)) { return existingValue; }
      const raw = req.body[fieldName];
      if (raw === null) { return null; }
      if (typeof raw === "string") {
        const sanitized = sanitizeString(raw);
        return sanitized !== null ? transform(sanitized) : null;
      }
      return transform(raw);
    };

    const final = {
      account_type: patchField("account_type", existingAccount.account_type, (v) => v.toLowerCase()),
      bank_name: patchField("bank_name", existingAccount.bank_name),
      account_holder_name: patchField("account_holder_name", existingAccount.account_holder_name),
      account_number: patchField("account_number", existingAccount.account_number),
      ifsc_code: patchField("ifsc_code", existingAccount.ifsc_code, (v) => v.toUpperCase()),
      branch_name: patchField("branch_name", existingAccount.branch_name),
      upi_id: patchField("upi_id", existingAccount.upi_id, (v) => v.toLowerCase()),
      is_primary: existingAccount.is_primary,
      status: patchField("status", existingAccount.status, (v) => v.toLowerCase()),
    };

    if ("is_primary" in req.body) {
      if (typeof req.body.is_primary !== "boolean") {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 400, "is_primary must be a boolean (true or false)");
      }
      final.is_primary = req.body.is_primary ? 1 : 0;
    }

    if ("status" in req.body && final.status && !ALLOWED_STATUSES.includes(final.status)) {
      await conn.rollback();
      responseSent = true;
      return sendError(res, 400, `status must be one of: ${ALLOWED_STATUSES.join(", ")}`);
    }
    if (bank_owner_type === "employee" && !EMPLOYEE_ACCOUNT_TYPES.includes(final.account_type)) {
      await conn.rollback();
      responseSent = true;
      return sendError(res, 400, `Employee account_type must be one of: ${EMPLOYEE_ACCOUNT_TYPES.join(", ")}`);
    }
    if (bank_owner_type === "company" && !COMPANY_ACCOUNT_TYPES.includes(final.account_type)) {
      await conn.rollback();
      responseSent = true;
      return sendError(res, 400, `Company account_type must be one of: ${COMPANY_ACCOUNT_TYPES.join(", ")}`);
    }
    if (final.is_primary === 1 && final.status === "inactive") {
      await conn.rollback();
      responseSent = true;
      return sendError(res, 400, "Primary account cannot be inactive");
    }
    if (existingAccount.is_primary === 1 && final.status === "inactive") {
      await conn.rollback();
      responseSent = true;
      return sendError(res, 400, "Cannot deactivate primary account");
    }

    if (final.account_type === "cash") {
      final.bank_name = null;
      final.account_holder_name = null;
      final.account_number = null;
      final.ifsc_code = null;
      final.branch_name = null;
      final.upi_id = null;
      const [[existingCash]] = await conn.query(CASH_EXISTS_QUERY + " AND id != ? LIMIT 1", [company_id, bank_id]);
      if (existingCash) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 409, "Cash account already exists");
      }
    }

    if (["current", "savings", "loan"].includes(final.account_type)) {
      if (!final.bank_name || !final.account_holder_name || !final.account_number || !final.ifsc_code) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 400, "bank_name, account_holder_name, account_number and ifsc_code are required");
      }
      final.upi_id = null;
      if (final.account_number.length < 6 || final.account_number.length > 50) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 400, "Invalid account number");
      }
      if (!IFSC_REGEX.test(final.ifsc_code)) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 400, "Invalid IFSC code");
      }

      final.account_number = ENABLE_ACCOUNT_MASKING ? maskAccountNumber(final.account_number) : final.account_number;

      const duplicateQuery = DUPLICATE_BANK_QUERY[bank_owner_type] + " AND id != ? LIMIT 1";
      const duplicateParams = bank_owner_type === "employee"
        ? [company_id, existingAccount.employee_id, final.account_number, final.ifsc_code, bank_id]
        : [company_id, final.account_number, final.ifsc_code, bank_id];
      const [[duplicate]] = await conn.query(duplicateQuery, duplicateParams);
      if (duplicate) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 409, "Bank account already exists");
      }
    }

    if (final.account_type === "upi") {
      if (!final.upi_id) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 400, "upi_id is required");
      }
      final.bank_name = null;
      final.account_number = null;
      final.ifsc_code = null;
      final.branch_name = null;
      if (!UPI_REGEX.test(final.upi_id)) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 400, "Invalid UPI ID");
      }

      const upiQuery = DUPLICATE_UPI_QUERY[bank_owner_type] + " AND id != ? LIMIT 1";
      const upiParams = bank_owner_type === "employee"
        ? [company_id, existingAccount.employee_id, final.upi_id, bank_id]
        : [company_id, final.upi_id, bank_id];
      const [[existingUpi]] = await conn.query(upiQuery, upiParams);
      if (existingUpi) {
        await conn.rollback();
        responseSent = true;
        return sendError(res, 409, "UPI already exists");
      }
    }

    if (final.is_primary === 1) {
      const updateQuery = UPDATE_PRIMARY_TO_ZERO_QUERY[bank_owner_type] + " AND id != ?";
      const updateParams = bank_owner_type === "employee"
        ? [user_id, existingAccount.employee_id, bank_id]
        : [user_id, company_id, bank_id];
      await conn.query(updateQuery, updateParams);
    }

    await conn.query(
      `UPDATE bank_accounts SET account_type = ?, bank_name = ?, account_holder_name = ?, account_number = ?, ifsc_code = ?, branch_name = ?, upi_id = ?, is_primary = ?, status = ?, is_active = ?, updated_by = ? WHERE id = ?`,
      [final.account_type, final.bank_name, final.account_holder_name, final.account_number, final.ifsc_code, final.branch_name, final.upi_id, final.is_primary, final.status, final.status === "active" ? 1 : 0, user_id, bank_id]
    );

    const [[updatedAccount]] = await conn.query(BANK_SELECT_BY_ID, [bank_id]);

    await conn.commit();
    responseSent = true;

    const formatted = formatBankAccount(updatedAccount, { idKey: "id" });
    return sendSuccess(res, 200, "Bank account updated successfully", formatted);
  } catch (error) {
    if (!responseSent) {
      if (conn && transactionStarted) { await conn.rollback(); }
      console.error("Update bank account error:", error);
      return sendError(res, 500, "Internal server error");
    }
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.delete("/delete", auth(BANK.ALL), async (req, res) => {
  let conn;
  let transactionStarted = false;
  let responseSent = false;

  try {
    conn = await db.getConnection();

    const userId = Number(req.user?.id);
    const companyId = Number(req.company?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      responseSent = true;
      return sendError(res, 401, "Unauthorized");
    }

    if (!Number.isInteger(companyId) || companyId <= 0) {
      responseSent = true;
      return sendError(res, 400, "Company context missing");
    }

    const { ids } = req.body;

    if (ids === undefined || ids === null) {
      responseSent = true;
      return sendError(res, 400, "Valid bank ids are required");
    }

    let bankIds = [];

    if (
      typeof ids === "number" ||
      (typeof ids === "string" && ids.trim() !== "" && ids !== "all")
    ) {
      const parsedId = Number(ids);

      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        responseSent = true;
        return sendError(res, 400, "Valid bank ids are required");
      }

      bankIds = [parsedId];
    }

    else if (ids === "all") {
      const [rows] = await conn.query(
        `
          SELECT id
          FROM bank_accounts
          WHERE company_id = ?
            AND is_deleted = 0
        `,
        [companyId]
      );

      bankIds = rows.map((row) => Number(row.id));
    }

    else if (Array.isArray(ids)) {
      bankIds = [
        ...new Set(
          ids
            .map((value) => {
              if (
                typeof value !== "number" &&
                typeof value !== "string"
              ) {
                return null;
              }

              const parsed = Number(value);

              return Number.isInteger(parsed) && parsed > 0
                ? parsed
                : null;
            })
            .filter((value) => value !== null)
        ),
      ];

      if (bankIds.length === 0) {
        responseSent = true;
        return sendError(res, 400, "Valid bank ids are required");
      }
    }else {
      responseSent = true;
      return sendError(
        res,
        400,
        "ids must be a number, array, or 'all'"
      );
    }

    if (bankIds.length === 0) {
      responseSent = true;
      return sendSuccess(
        res,
        200,
        "No bank accounts to delete",
        {
          deleted_count: 0,
          ids: [],
        }
      );
    }

    await conn.beginTransaction();
    transactionStarted = true;

    const [[company]] = await conn.query(
      `
        SELECT owner_user_id
        FROM companies
        WHERE id = ?
          AND is_deleted = 0
        FOR UPDATE
      `,
      [companyId]
    );

    if (!company) {
      await conn.rollback();
      transactionStarted = false;

      responseSent = true;
      return sendError(res, 404, "Company not found");
    }

    const isOwner =
      Number(company.owner_user_id) === userId;

    let employeeId = null;

    if (!isOwner) {
      const [[employee]] = await conn.query(
        `
          SELECT id, is_active
          FROM employees
          WHERE user_id = ?
            AND company_id = ?
            AND is_deleted = 0
          FOR UPDATE
        `,
        [userId, companyId]
      );

      if (!employee) {
        await conn.rollback();
        transactionStarted = false;

        responseSent = true;
        return sendError(res, 403, "Not authorized");
      }

      if (!employee.is_active) {
        await conn.rollback();
        transactionStarted = false;

        responseSent = true;
        return sendError(res, 403, "Employee inactive");
      }

      employeeId = Number(employee.id);
    }

    const placeholders = bankIds.map(() => "?").join(", ");

    const [existingAccounts] = await conn.query(
      `
        SELECT
          id,
          company_id,
          employee_id,
          is_primary,
          is_deleted
        FROM bank_accounts
        WHERE company_id = ?
          AND id IN (${placeholders})
          AND is_deleted = 0
        FOR UPDATE
      `,
      [companyId, ...bankIds]
    );

    const existingIds = new Set(
      existingAccounts.map((account) => Number(account.id))
    );

    const missingIds = bankIds.filter(
      (bankId) => !existingIds.has(bankId)
    );

    if (missingIds.length > 0) {
      await conn.rollback();
      transactionStarted = false;

      responseSent = true;

      return sendError(
        res,
        404,
        `One or more bank accounts not found or already deleted: ${missingIds.join(
          ", "
        )}`
      );
    }
    if (!isOwner) {
      const unauthorizedIds = existingAccounts
        .filter(
          (account) =>
            Number(account.employee_id) !== employeeId
        )
        .map((account) => account.id);

      if (unauthorizedIds.length > 0) {
        await conn.rollback();
        transactionStarted = false;

        responseSent = true;

        return sendError(
          res,
          403,
          `Cannot delete others' accounts: ${unauthorizedIds.join(
            ", "
          )}`
        );
      }
    }
    const companyAccountIdsToDelete = existingAccounts
      .filter((account) => account.employee_id === null)
      .map((account) => Number(account.id));

    if (companyAccountIdsToDelete.length > 0) {
      const [[companyAccountCount]] = await conn.query(
        `
          SELECT COUNT(*) AS totalCompanyAccounts
          FROM bank_accounts
          WHERE company_id = ?
            AND employee_id IS NULL
            AND is_deleted = 0
        `,
        [companyId]
      );

      const totalCompanyAccounts = Number(
        companyAccountCount.totalCompanyAccounts
      );

      const remainingCompanyAccounts =
        totalCompanyAccounts -
        companyAccountIdsToDelete.length;

      if (remainingCompanyAccounts < 1) {
        await conn.rollback();
        transactionStarted = false;

        responseSent = true;

        return sendError(
          res,
          400,
          "Cannot delete last company account"
        );
      }
    }
    for (const account of existingAccounts) {
      if (!account.is_primary) {
        continue;
      }

      let replacementId = null;
      if (account.employee_id !== null) {
        const [[replacement]] = await conn.query(
          `
            SELECT id
            FROM bank_accounts
            WHERE employee_id = ?
              AND id != ?
              AND is_deleted = 0
              AND id NOT IN (${placeholders})
            ORDER BY id ASC
            LIMIT 1
            FOR UPDATE
          `,
          [
            account.employee_id,
            account.id,
            ...bankIds,
          ]
        );

        replacementId = replacement?.id ?? null;
      } else {
        const [[replacement]] = await conn.query(
          `
            SELECT id
            FROM bank_accounts
            WHERE company_id = ?
              AND employee_id IS NULL
              AND id != ?
              AND is_deleted = 0
              AND id NOT IN (${placeholders})
            ORDER BY id ASC
            LIMIT 1
            FOR UPDATE
          `,
          [
            account.company_id,
            account.id,
            ...bankIds,
          ]
        );

        replacementId = replacement?.id ?? null;
      }

      if (replacementId) {
        await conn.query(
          `
            UPDATE bank_accounts
            SET is_primary = 1,
                updated_by = ?
            WHERE id = ?
          `,
          [userId, replacementId]
        );
      }
    }
    const [result] = await conn.query(
      `
        UPDATE bank_accounts
        SET
          is_deleted = 1,
          deleted_at = NOW(),
          deleted_by = ?,
          updated_by = ?
        WHERE company_id = ?
          AND id IN (${placeholders})
          AND is_deleted = 0
      `,
      [
        userId,
        userId,
        companyId,
        ...bankIds,
      ]
    );

    await conn.commit();
    transactionStarted = false;

    responseSent = true;

    return sendSuccess(
      res,
      200,
      bankIds.length === 1
        ? "Bank account deleted successfully"
        : "Bank accounts deleted successfully",
      {
        deleted_count: result.affectedRows,
        ids: bankIds,
      }
    );
  } catch (err) {
    if (transactionStarted && conn) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error(
          "Rollback error:",
          rollbackError
        );
      }
    }

    if (!responseSent) {
      console.error(
        "Delete bank account error:",
        err
      );

      responseSent = true;

      return sendError(
        res,
        500,
        "Internal server error"
      );
    }
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.get("/my", auth(BANK.ALL), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const user_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);
    if (!Number.isInteger(user_id) || user_id <= 0)
      return sendError(res, 401, "Invalid user authentication");
    if (!Number.isInteger(company_id) || company_id <= 0)
      return sendError(res, 401, "Invalid company authentication");

    const [[employee]] = await conn.query(
      `SELECT e.id, e.employee_code, e.designation, e.employment_type, e.status, e.is_active, e.is_deleted,
              u.is_active AS user_is_active, u.is_deleted AS user_is_deleted,
              c.is_active AS company_is_active, c.is_deleted AS company_is_deleted
       FROM employees e
       INNER JOIN users u ON u.id = e.user_id
       INNER JOIN companies c ON c.id = e.company_id
       WHERE e.user_id = ? AND e.company_id = ? LIMIT 1`,
      [user_id, company_id]
    );
    if (!employee) return sendError(res, 403, "Employee record not found");
    if (employee.user_is_deleted) return sendError(res, 403, "User account deleted");
    if (!employee.user_is_active) return sendError(res, 403, "User account inactive");
    if (employee.company_is_deleted) return sendError(res, 403, "Company deleted");
    if (!employee.company_is_active) return sendError(res, 403, "Company inactive");
    if (employee.is_deleted) return sendError(res, 403, "Employee deleted");
    if (!employee.is_active) return sendError(res, 403, "Employee inactive");
    if (employee.status !== "active") return sendError(res, 403, "Employee not active");

    const employee_id = Number(employee.id);

    const parsed = parseListQuery(req.query, {
      allowedSortBy: ALLOWED_SORT_BY,
      allowedAccountTypes: ALLOWED_ACCOUNT_TYPES,
      allowedStatuses: ALLOWED_STATUSES,
    });
    if (parsed.error) return sendError(res, parsed.error.status, parsed.error.message);

    const { page, limit, offset, search, status, account_type, is_primary, sort_by, sort_order } = parsed;

    const conditions = ["ba.company_id = ?", "ba.employee_id = ?", "ba.is_deleted = 0"];
    const params = [company_id, employee_id];
    applyBankFilters({ status, account_type, is_primary, search }, conditions, params, [
      "ba.bank_name", "ba.account_holder_name", "ba.account_number", "ba.ifsc_code", "ba.branch_name", "ba.upi_id"
    ]);
    const whereClause = conditions.join(" AND ");

    const [[{ total }]] = await conn.query(`SELECT COUNT(*) AS total FROM bank_accounts ba WHERE ${whereClause}`, params);

    const [rows] = await conn.query(
      `SELECT ${BANK_ACCOUNT_BASE_FIELDS}, e.employee_code, e.designation, e.employment_type
       FROM bank_accounts ba
       INNER JOIN employees e ON e.id = ba.employee_id AND e.is_deleted = 0
       WHERE ${whereClause}
       ORDER BY ba.is_primary DESC, ${ALLOWED_SORT_BY[sort_by]} ${sort_order}, ba.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map((row) =>
      formatBankAccount(row, {
        idKey: "bank_account_id",
        includeMasked: true,
        includeEmployee: true,
        includeCreatedBy: true,
      })
    );

    const baseMeta = buildMeta(page, limit, total, data.length);
    const meta = {
      page: baseMeta.page,
      limit: baseMeta.limit,
      total: baseMeta.total,
      total_pages: baseMeta.total_pages,
      current_page_count: data.length,
      has_next_page: baseMeta.has_next,
      has_previous_page: baseMeta.has_prev,
      is_last_page: baseMeta.is_last_page,
      filters: { search, status: status || null, account_type: account_type || null, is_primary: is_primary ?? null },
      sorting: { sort_by, sort_order },
    };

    return sendSuccess(res, 200, "Employee bank accounts fetched successfully", data, meta);
  } catch (error) {
    console.error("Get employee bank accounts error:", error);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.get("/management/employee", auth(CMP_BANK.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const user_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);
    if (!Number.isInteger(user_id) || user_id <= 0) return sendError(res, 401, "Invalid user authentication");
    if (!Number.isInteger(company_id) || company_id <= 0) return sendError(res, 401, "Invalid company authentication");

    const [[companyUser]] = await conn.query(
      `SELECT u.is_active AS user_is_active, u.is_deleted AS user_is_deleted,
              c.is_active AS company_is_active, c.is_deleted AS company_is_deleted
       FROM users u INNER JOIN companies c ON c.id = ?
       WHERE u.id = ? LIMIT 1`,
      [company_id, user_id]
    );
    if (!companyUser) return sendError(res, 404, "User or company not found");
    if (companyUser.user_is_deleted) return sendError(res, 403, "User account deleted");
    if (!companyUser.user_is_active) return sendError(res, 403, "User account inactive");
    if (companyUser.company_is_deleted) return sendError(res, 403, "Company deleted");
    if (!companyUser.company_is_active) return sendError(res, 403, "Company inactive");

    const parsed = parseListQuery(req.query, {
      allowedSortBy: ALLOWED_SORT_BY,
      allowedAccountTypes: ALLOWED_ACCOUNT_TYPES,
      allowedStatuses: ALLOWED_STATUSES,
    });
    if (parsed.error) return sendError(res, parsed.error.status, parsed.error.message);

    const { page, limit, offset, search, status, account_type, is_primary, sort_by, sort_order } = parsed;
    const employee_id = req.query.employee_id !== undefined ? safeNumber(req.query.employee_id) : null;
    if (employee_id !== null && (!Number.isInteger(employee_id) || employee_id <= 0))
      return sendError(res, 400, "Invalid employee_id filter");

    const conditions = ["ba.company_id = ?", "ba.employee_id IS NOT NULL", "ba.is_deleted = 0", "e.is_deleted = 0", "u.is_deleted = 0"];
    const params = [company_id];
    if (employee_id) { conditions.push("ba.employee_id = ?"); params.push(employee_id); }
    applyBankFilters({ status, account_type, is_primary, search }, conditions, params, [
      "ba.bank_name", "ba.account_holder_name", "ba.account_number", "ba.ifsc_code", "ba.branch_name", "ba.upi_id",
      "e.employee_code", "e.designation", "u.name", "u.email", "u.phone"
    ]);
    const whereClause = conditions.join(" AND ");

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM bank_accounts ba INNER JOIN employees e ON e.id = ba.employee_id INNER JOIN users u ON u.id = e.user_id WHERE ${whereClause}`,
      params
    );

    const [rows] = await conn.query(
      `SELECT ${BANK_ACCOUNT_BASE_FIELDS},
              e.id AS emp_id, e.employee_code, e.designation, e.employment_type, e.status AS employee_status, e.joining_date,
              u.id AS linked_user_id, u.name AS linked_user_name, u.email AS linked_user_email, u.phone AS linked_user_phone, u.profile_picture
       FROM bank_accounts ba
       INNER JOIN employees e ON e.id = ba.employee_id AND e.is_deleted = 0
       INNER JOIN users u ON u.id = e.user_id AND u.is_deleted = 0
       WHERE ${whereClause}
       ORDER BY ba.is_primary DESC, ${ALLOWED_SORT_BY[sort_by]} ${sort_order}, ba.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map((row) =>
      formatBankAccount(row, {
        idKey: "bank_account_id",
        includeMasked: true,
        includeEmployee: true,
        includeCreatedBy: true,
        ownerType: "employee",
      })
    );

    const baseMeta = buildMeta(page, limit, total, rows.length);
    const meta = {
      total: baseMeta.total,
      totalPages: baseMeta.total_pages,
      page: baseMeta.page,
      limit: baseMeta.limit,
      is_last_page: baseMeta.is_last_page,
      has_next_page: baseMeta.has_next,
      has_previous_page: baseMeta.has_prev,
      current_page_count: rows.length,
      filters: { search, employee_id: employee_id || null, status: status || null, account_type: account_type || null, is_primary: is_primary ?? null },
      sorting: { sort_by, sort_order },
    };

    return sendSuccess(res, 200, "Company employee bank accounts fetched successfully", data, meta);
  } catch (error) {
    console.error("Company employee bank account list error:", error);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

router.get("/management/company", auth(CMP_BANK.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const user_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);
    if (!user_id || !company_id) return sendError(res, 401, "Unauthorized");

    const userCheck = await validateUserActive(conn, user_id);
    if (userCheck.error) return sendError(res, userCheck.error.status, userCheck.error.message);
    const companyCheck = await validateCompanyActive(conn, company_id);
    if (companyCheck.error) return sendError(res, companyCheck.error.status, companyCheck.error.message);

    await checkCompanyPermissions({ conn, user_id, company_id, permissions: ["emp_bnk_view"] });

    const parsed = parseListQuery(req.query, {
      allowedSortBy: ALLOWED_SORT_BY,
      allowedAccountTypes: ALLOWED_ACCOUNT_TYPES,
      allowedStatuses: ALLOWED_STATUSES,
    });
    if (parsed.error) return sendError(res, parsed.error.status, parsed.error.message);

    const { page, limit, offset, search, status, account_type, is_primary, sort_by, sort_order } = parsed;

    const conditions = ["ba.company_id = ?", "ba.employee_id IS NULL", "ba.is_deleted = 0"];
    const params = [company_id];
    applyBankFilters({ status, account_type, is_primary, search }, conditions, params, [
      "ba.bank_name", "ba.account_holder_name", "ba.account_number", "ba.ifsc_code", "ba.branch_name", "ba.upi_id"
    ]);
    const whereClause = conditions.join(" AND ");

    const [[{ total }]] = await conn.query(`SELECT COUNT(*) AS total FROM bank_accounts ba WHERE ${whereClause}`, params);

    const [rows] = await conn.query(
      `SELECT ${BANK_ACCOUNT_BASE_FIELDS} FROM bank_accounts ba WHERE ${whereClause}
       ORDER BY ba.is_primary DESC, ${ALLOWED_SORT_BY[sort_by]} ${sort_order}, ba.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map((row) =>
      formatBankAccount(row, {
        idKey: "bank_id",
        includeMasked: true,
        includeCreatedBy: true,
        ownerType: "company",
        overrideBankNameForCash: true,
      })
    );

    const baseMeta = buildMeta(page, limit, total, rows.length);
    const meta = {
      total: baseMeta.total,
      totalPages: baseMeta.total_pages,
      page: baseMeta.page,
      limit: baseMeta.limit,
      is_last_page: baseMeta.is_last_page,
      has_next_page: baseMeta.has_next,
      has_previous_page: baseMeta.has_prev,
      current_page_count: rows.length,
      filters: { search, status: status || null, account_type: account_type || null, is_primary: is_primary ?? null },
      sorting: { sort_by, sort_order },
    };

    return sendSuccess(res, 200, "Company banks fetched successfully", data, meta);
  } catch (error) {
    console.error("Company banks error:", error);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

export default router;
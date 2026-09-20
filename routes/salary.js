import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import { validateFields, salaryValidation, currencyTypeValidation } from "../utils/constantsValidator.js";
import { SALARY_TYPES, CURRENCY_TYPES } from "../constants/constants_values.js";
import { buildFileUrl } from "../utils/fileService.js";
import { PERMISSIONS } from "../constants/permissions.js";
import {
  getCurrentDate,
  parseDate,
  getSalaryStatus,
  isDateAfter,
  isDateBefore,
  addDays,
  formatIST,
  formatUTCToIST
} from "../utils/time.js";
import { sendSuccess, sendError, buildMeta } from "../utils/sendResponse.js";

const router = express.Router();

// --------------- GLOBAL HELPERS ---------------
const isValidDate = (value) => !!parseDate(value);
const formatDate = (date) => formatIST(date, "YYYY-MM-DD");
const VALID_COMPONENT_TYPES = ["earning", "deduction", "employer_contribution"];
const VALID_CALC_TYPES = ["fixed", "percentage"];

// --------------- SQL FIELD & QUERY CONSTANTS ---------------
const SALARY_COMPONENT_FIELDS = `
  id, company_id, code, name, type, calc_type, calc_value,
  is_taxable, is_statutory, is_active, created_at, updated_at
`;

const SALARY_PACKAGE_FIELDS = `
  id, name, code, description, is_active, created_at
`;

const SALARY_STRUCTURE_FIELDS = `
  ss.id, ss.company_id, ss.employee_id, ss.base_amount,
  ss.effective_from, ss.effective_to, ss.is_active
`;

// Frequently used queries
const SELECT_COMPONENT_BY_ID = `SELECT ${SALARY_COMPONENT_FIELDS} FROM salary_components WHERE id = ? AND company_id = ?`;
const SELECT_PACKAGE_BY_ID = `SELECT ${SALARY_PACKAGE_FIELDS} FROM salary_component_packages WHERE id = ? AND company_id = ?`;
const SELECT_SS_BY_ID = `SELECT ${SALARY_STRUCTURE_FIELDS} FROM salary_structures ss WHERE ss.id = ? AND ss.company_id = ? AND ss.is_deleted = 0`;

const PACKAGE_EXISTS_BY_NAME = `SELECT id FROM salary_component_packages WHERE company_id = ? AND name = ? AND is_deleted = 0 LIMIT 1`;
const PACKAGE_EXISTS_BY_ID = `SELECT id FROM salary_component_packages WHERE id = ? AND company_id = ? AND is_deleted = 0`;
const PACKAGE_EXISTS_BY_CODE_EXCEPT = `SELECT id FROM salary_component_packages WHERE company_id = ? AND code = ? AND id != ? AND is_deleted = 0 LIMIT 1`;

const COMPONENT_EXISTS_BY_CODE = `SELECT id FROM salary_components WHERE company_id = ? AND code = ? AND is_deleted = 0 LIMIT 1`;
const COMPONENT_EXISTS_BY_ID = `SELECT id FROM salary_components WHERE id = ? AND company_id = ? AND is_deleted = 0`;
const COMPONENT_EXISTS_BY_CODE_EXCEPT = `SELECT id FROM salary_components WHERE company_id = ? AND code = ? AND id != ? AND is_deleted = 0 LIMIT 1`;

const CHECK_PAYROLL_USED = `SELECT id FROM payroll_entries WHERE salary_id = ? AND is_deleted = 0 LIMIT 1`;
const CHECK_EMPLOYEE_EXISTS = `SELECT id FROM employees WHERE id = ? AND company_id = ? AND is_deleted = 0`;

// --------------- FORMAT HELPERS ---------------
function formatSalaryComponent(row) {
  return {
    id: row.id,
    company_id: row.company_id,
    code: row.code,
    name: row.name,
    type: row.type,
    calc_type: row.calc_type,
    calc_value: row.calc_value,
    is_taxable: row.is_taxable == 1,
    is_statutory: row.is_statutory == 1,
    is_active: row.is_active == 1,
    created_at: formatUTCToIST(row.created_at),
    updated_at: formatUTCToIST(row.updated_at),
  };
}

function formatSalaryPackage(pkg, items = []) {
  return {
    id: pkg.id,
    name: pkg.name,
    code: pkg.code,
    description: pkg.description,
    is_active: pkg.is_active == 1,
    created_at: formatUTCToIST(pkg.created_at),
    items: items.map(item => ({
      component_id: item.component_id,
      name: item.name,
      code: item.code,
      type: item.type,
      calc_type: item.calc_type,
      calc_value: item.calc_value,
    })),
  };
}

// --------------- CONNECTION / TRANSACTION WRAPPERS ---------------
const withConnection = (handler) => async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    return await handler(conn, req, res);
  } catch (err) {
    console.error("Connection Error:", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
};

const withTransaction = (handler) => async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    const result = await handler(conn, req, res);
    await conn.commit();
    return result;
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Transaction Error:", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
};

// --------------- VALIDATION HELPERS ---------------
function parseComponentIds(components) {
  const idsSet = new Set();
  const ids = [];

  components.forEach((item, index) => {
    const compId = Number(item);

    if (!Number.isInteger(compId) || compId <= 0) {
      throw {
        status: 400,
        message: `Invalid component_id at index ${index}. Must be a positive integer.`,
      };
    }

    if (idsSet.has(compId)) {
      throw {
        status: 400,
        message: `Duplicate component_id: ${compId}`,
      };
    }

    idsSet.add(compId);
    ids.push(compId);
  });

  return ids;
}

async function validateComponentIdsInDB(conn, companyId, ids, requireActive = true) {
  if (!ids.length) return;
  const activeCondition = requireActive ? "AND is_active = 1" : "";
  const [validComponents] = await conn.query(
    `SELECT id FROM salary_components WHERE id IN (?) AND company_id = ? AND is_deleted = 0 ${activeCondition}`,
    [ids, companyId]
  );
  if (validComponents.length !== ids.length) {
    throw { status: 400, message: requireActive ? "Some components are invalid or inactive" : "Some components are invalid" };
  }
}

function validateEmployeeComponents(components) {
  if (!Array.isArray(components) || components.length === 0) {
    throw { status: 400, message: "components array is required" };
  }

  const dupCheck = new Set();
  const validated = components.map((c, idx) => {
    const compId = Number(c.component_id);
    if (!compId || isNaN(compId) || compId <= 0) throw { status: 400, message: `Invalid component_id at index ${idx}` };
    if (dupCheck.has(compId)) throw { status: 400, message: `Duplicate salary component: ${compId}` };
    dupCheck.add(compId);

    if (!VALID_CALC_TYPES.includes(c.calc_type)) throw { status: 400, message: `Invalid calc_type for component ${compId}` };

    const calcVal = Number(c.calc_value);
    if (!Number.isFinite(calcVal) || calcVal < 0) throw { status: 400, message: `Invalid calc_value for component ${compId}` };
    if (c.calc_type === "percentage" && calcVal > 100) throw { status: 400, message: `Percentage component ${compId} cannot exceed 100` };

    return {
      component_id: compId,
      calc_type: c.calc_type,
      calc_value: calcVal,
      remark: c.remark || null,
    };
  });

  return validated;
}

async function checkSalaryOverlap(conn, employeeId, companyId, effectiveFrom, effectiveTo, excludeId = null) {
  const excludeClause = excludeId ? "AND id != ?" : "";
  const params = [employeeId, companyId];
  if (excludeId) params.push(excludeId);
  const to = effectiveTo || "9999-12-31";
  const [overlap] = await conn.query(
    `SELECT id FROM salary_structures
     WHERE employee_id = ? AND company_id = ? AND is_deleted = 0 ${excludeClause}
       AND effective_from <= ? AND COALESCE(effective_to, '9999-12-31') >= ?
     LIMIT 1`,
    [...params, to, effectiveFrom]
  );
  if (overlap.length) throw { status: 400, message: "Salary period overlaps with an existing salary structure" };
}

// Helper to fetch package items for a single package (used in create & update)
async function getPackageItems(conn, package_id) {
  const [items] = await conn.query(
    `SELECT spi.component_id, sc.name, sc.code, sc.type, sc.calc_type, sc.calc_value
     FROM salary_component_package_items spi
     JOIN salary_components sc ON sc.id = spi.component_id
     WHERE spi.package_id = ? AND spi.is_deleted = 0 AND sc.is_deleted = 0
     ORDER BY spi.component_id ASC`,
    [package_id]
  );
  return items;
}

// --------------- Salary Component Routes ---------------

// 1. Create salary component
router.post("/components/create", auth([PERMISSIONS.FINANCIAL]), withTransaction(async (conn, req, res) => {
  let { code, name, type, calc_type, calc_value, is_taxable, is_statutory } = req.body;
  const company_id = req.company?.id;
  const user_id = req.user?.id;
  if (!company_id) throw { status: 400, message: "Company context missing" };
  if (!code || !name || !type) throw { status: 400, message: "code, name and type are required" };

  code = code.trim().toUpperCase();
  name = name.trim();
  type = type.trim().toLowerCase();
  calc_type = calc_type ? calc_type.trim().toLowerCase() : "fixed";

  if (is_taxable !== undefined && typeof is_taxable !== 'boolean') {
    throw { status: 400, message: "is_taxable must be true or false" };
  }
  if (is_statutory !== undefined && typeof is_statutory !== 'boolean') {
    throw { status: 400, message: "is_statutory must be true or false" };
  }

  is_taxable = is_taxable === true ? 1 : 0;
  is_statutory = is_statutory === true ? 1 : 0;

  if (!VALID_COMPONENT_TYPES.includes(type)) throw { status: 400, message: `Invalid type. Allowed: ${VALID_COMPONENT_TYPES.join(", ")}` };
  if (!VALID_CALC_TYPES.includes(calc_type)) throw { status: 400, message: `Invalid calc_type. Allowed: ${VALID_CALC_TYPES.join(", ")}` };

  calc_value = parseFloat(calc_value);
  if (isNaN(calc_value)) calc_value = 0;
  if (calc_type === "percentage" && (calc_value <= 0 || calc_value > 100)) throw { status: 400, message: "For percentage, calc_value must be between 0 and 100" };
  if (calc_type === "fixed" && calc_value < 0) throw { status: 400, message: "Fixed amount cannot be negative" };

  const [existing] = await conn.query(COMPONENT_EXISTS_BY_CODE, [company_id, code]);
  if (existing.length) throw { status: 409, message: "Salary component code already exists" };

  const [result] = await conn.query(
    `INSERT INTO salary_components (company_id, code, name, type, calc_type, calc_value, is_taxable, is_statutory, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [company_id, code, name, type, calc_type, calc_value, is_taxable, is_statutory, user_id || null]
  );

  const [[created]] = await conn.query(SELECT_COMPONENT_BY_ID, [result.insertId, company_id]);
  return sendSuccess(res, 201, "Salary component created successfully", formatSalaryComponent(created));
}));

// 2. List salary components
router.get("/components/list", auth(), withConnection(async (conn, req, res) => {
  const company_id = req.company?.id;
  if (!company_id) throw { status: 400, message: "Company context missing" };

  let { search = "", page = 1, limit = 10, type, is_active } = req.query;
  page = Math.max(1, parseInt(page) || 1);
  limit = Math.min(100, parseInt(limit) || 10);
  const offset = (page - 1) * limit;

  let whereClause = `WHERE company_id = ? AND is_deleted = 0`;
  let params = [company_id];

  if (search) {
    whereClause += ` AND (LOWER(code) LIKE ? OR LOWER(name) LIKE ?)`;
    const s = `%${search.toLowerCase()}%`;
    params.push(s, s);
  }

  if (type) {
    if (!VALID_COMPONENT_TYPES.includes(type)) throw { status: 400, message: "Invalid type filter" };
    whereClause += ` AND type = ?`;
    params.push(type);
  }

  if (is_active !== undefined) {
    if (is_active !== "true" && is_active !== "false") {
      throw { status: 400, message: "is_active must be true or false" };
    }

    const activeVal = is_active === "true" ? 1 : 0;

    whereClause += ` AND is_active = ?`;
    params.push(activeVal);
  }

  const [[{ total }]] = await conn.query(`SELECT COUNT(*) AS total FROM salary_components ${whereClause}`, params);

  const [rows] = await conn.query(
    `SELECT ${SALARY_COMPONENT_FIELDS} FROM salary_components ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const data = rows.map(formatSalaryComponent);
  return sendSuccess(res, 200, "Salary components fetched successfully", data, buildMeta(page, limit, total, data.length));
}));

// 3. Update salary component
router.put("/components/update", auth([PERMISSIONS.FINANCIAL]), withTransaction(async (conn, req, res) => {
  let { id, code, name, type, calc_type, calc_value, is_taxable, is_statutory, is_active } = req.body;
  const company_id = req.company?.id;
  const user_id = req.user?.id;

  if (!company_id || !id) throw { status: 400, message: "company_id and id are required" };

  if (code !== undefined) code = code.trim().toUpperCase();
  if (name !== undefined) name = name.trim();
  if (type !== undefined) type = type.trim().toLowerCase();
  if (calc_type !== undefined) calc_type = calc_type.trim().toLowerCase();

  if (type && !VALID_COMPONENT_TYPES.includes(type)) throw { status: 400, message: "Invalid type" };
  if (calc_type && !VALID_CALC_TYPES.includes(calc_type)) throw { status: 400, message: "Invalid calc_type" };

  if (is_taxable !== undefined && typeof is_taxable !== 'boolean') {
    throw { status: 400, message: "is_taxable must be true or false" };
  }
  if (is_statutory !== undefined && typeof is_statutory !== 'boolean') {
    throw { status: 400, message: "is_statutory must be true or false" };
  }
  if (is_active !== undefined && typeof is_active !== 'boolean') {
    throw { status: 400, message: "is_active must be true or false" };
  }

  const [[existing]] = await conn.query(COMPONENT_EXISTS_BY_ID, [id, company_id]);
  if (!existing) throw { status: 404, message: "Salary component not found" };

  if (code !== undefined) {
    const [dup] = await conn.query(COMPONENT_EXISTS_BY_CODE_EXCEPT, [company_id, code, id]);
    if (dup.length) throw { status: 409, message: "Salary component code already exists" };
  }

  let finalCalcType = calc_type !== undefined ? calc_type : existing.calc_type;
  let finalCalcValue;
  if (calc_value !== undefined) {
    finalCalcValue = parseFloat(calc_value);
    if (isNaN(finalCalcValue)) finalCalcValue = 0;
  } else {
    finalCalcValue = existing.calc_value;
  }

  if (finalCalcType === "percentage" && (finalCalcValue <= 0 || finalCalcValue > 100)) throw { status: 400, message: "For percentage, calc_value must be between 0 and 100" };
  if (finalCalcType === "fixed" && finalCalcValue < 0) throw { status: 400, message: "Fixed amount cannot be negative" };

  if (is_active === false) {
    const [inUseRows] = await conn.query(
      `SELECT 1 FROM salary_component_package_items WHERE component_id = ? AND is_deleted = 0 LIMIT 1`,
      [id]
    );
    if (inUseRows.length) {
      throw { status: 400, message: "Cannot deactivate component. It is used in salary package" };
    }
  }

  let updateFields = [], params = [];
  if (code !== undefined) { updateFields.push("code = ?"); params.push(code); }
  if (name !== undefined) { updateFields.push("name = ?"); params.push(name); }
  if (type !== undefined) { updateFields.push("type = ?"); params.push(type); }
  if (calc_type !== undefined) { updateFields.push("calc_type = ?"); params.push(calc_type); }
  if (calc_value !== undefined || calc_type !== undefined) { updateFields.push("calc_value = ?"); params.push(finalCalcValue); }  
  if (is_taxable !== undefined) { updateFields.push("is_taxable = ?"); params.push(is_taxable ? 1 : 0); }
  if (is_statutory !== undefined) { updateFields.push("is_statutory = ?"); params.push(is_statutory ? 1 : 0); }
  if (is_active !== undefined) { updateFields.push("is_active = ?"); params.push(is_active ? 1 : 0); }
  if (!updateFields.length) throw { status: 400, message: "No fields provided to update" };
  updateFields.push("updated_by = ?"); params.push(user_id || null);
  params.push(id, company_id);

  await conn.query(
    `UPDATE salary_components SET ${updateFields.join(", ")} WHERE id = ? AND company_id = ?`,
    params
  );

  const [[updated]] = await conn.query(SELECT_COMPONENT_BY_ID, [id, company_id]);
  return sendSuccess(res, 200, "Salary component updated successfully", formatSalaryComponent(updated));
}));

// 4. Delete salary component
router.delete("/components/delete", auth([PERMISSIONS.FINANCIAL]), withTransaction(async (conn, req, res) => {
  const company_id = req.company?.id;
  const user_id = req.user?.id;

  let { id, ids } = req.body;

  if (!company_id) {
    throw {
      status: 400,
      message: "Valid company_id is required",
    };
  }
  let componentIds = [];

  if (id !== undefined && ids === undefined) {
    const parsedId = parseInt(id);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      throw {
        status: 400,
        message: "Valid component id is required",
      };
    }

    componentIds = [parsedId];
  }

  else if (ids !== undefined) {
    if (ids === "all") {
      const [rows] = await conn.query(
        `
          SELECT id
          FROM salary_components
          WHERE company_id = ?
            AND is_deleted = 0
          `,
        [company_id]
      );

      componentIds = rows.map((row) => row.id);
    } else if (Array.isArray(ids)) {
      componentIds = [
        ...new Set(
          ids
            .map((value) => parseInt(value))
            .filter((value) => Number.isInteger(value) && value > 0)
        ),
      ];

      if (componentIds.length === 0) {
        throw {
          status: 400,
          message: "Valid component ids are required",
        };
      }
    } else {
      throw {
        status: 400,
        message: "ids must be an array or 'all'",
      };
    }
  } else {
    throw {
      status: 400,
      message: "id or ids is required",
    };
  }

  if (componentIds.length === 0) {
    return sendSuccess(res, 200, "No salary components to delete");
  }

  const placeholders = componentIds.map(() => "?").join(", ");
  const [existingRows] = await conn.query(
    `
      SELECT id
      FROM salary_components
      WHERE company_id = ?
        AND id IN (${placeholders})
        AND is_deleted = 0
      `,
    [company_id, ...componentIds]
  );

  const existingIds = new Set(existingRows.map((row) => row.id));

  const missingIds = componentIds.filter(
    (componentId) => !existingIds.has(componentId)
  );

  if (missingIds.length > 0) {
    throw {
      status: 404,
      message: "One or more salary components not found or already deleted",
      data: {
        ids: missingIds,
      },
    };
  }
  const [inUseRows] = await conn.query(
    `
      SELECT DISTINCT component_id
      FROM salary_component_package_items
      WHERE component_id IN (${placeholders})
        AND is_deleted = 0
      `,
    componentIds
  );

  if (inUseRows.length > 0) {
    const inUseIds = inUseRows.map((row) => row.component_id);

    throw {
      status: 400,
      message: "Cannot delete component. It is used in salary package",
      data: {
        ids: inUseIds,
      },
    };
  }

  const [result] = await conn.query(
    `
      UPDATE salary_components
      SET
        is_deleted = 1,
        deleted_at = NOW(),
        deleted_by = ?
      WHERE company_id = ?
        AND id IN (${placeholders})
        AND is_deleted = 0
      `,
    [user_id || null, company_id, ...componentIds]
  );

  return sendSuccess(
    res,
    200,
    componentIds.length === 1
      ? "Salary component deleted successfully"
      : "Salary components deleted successfully",
    {
      deleted_count: result.affectedRows,
      ids: componentIds,
    }
  );
})
);


// -------------==- Salary Package Routes -------------


// 5. Create salary package
router.post("/components/create-package", auth([PERMISSIONS.FINANCIAL]), withTransaction(async (conn, req, res) => {
  let { name, code, description, components } = req.body;
  const company_id = req.company?.id;
  const user_id = req.user?.id;

  name = name?.trim();
  code = code?.trim().toUpperCase();
  description = description?.trim() || null;

  if (!company_id) throw { status: 400, message: "Company missing" };
  if (!name) throw { status: 400, message: "name is required" };
  if (!Array.isArray(components) || components.length === 0) throw { status: 400, message: "components array is required" };

  const componentIds = parseComponentIds(components);

  const [existing] = await conn.query(PACKAGE_EXISTS_BY_NAME, [company_id, name]);
  if (existing.length) throw { status: 409, message: "Package name already exists" };

  await validateComponentIdsInDB(conn, company_id, componentIds, true);

  const [pkgResult] = await conn.query(
    `INSERT INTO salary_component_packages (company_id, name, code, description, created_by) VALUES (?, ?, ?, ?, ?)`,
    [company_id, name, code || null, description, user_id || null]
  );
  const package_id = pkgResult.insertId;

  const values = componentIds.map(compId => [
    package_id, compId, 1, user_id || null, user_id || null
  ]);
  await conn.query(
    `INSERT INTO salary_component_package_items (package_id, component_id, is_active, created_by, updated_by) VALUES ?`,
    [values]
  );

  const [[pkg]] = await conn.query(SELECT_PACKAGE_BY_ID, [package_id, company_id]);
  const items = await getPackageItems(conn, package_id);

  return sendSuccess(res, 201, "Salary package created successfully", formatSalaryPackage(pkg, items));
}));

// 6. List salary packages
router.get("/components/packages", auth(), withConnection(async (conn, req, res) => {
  const company_id = req.company?.id;
  if (!company_id) throw { status: 400, message: "Company not found" };

  let { page = 1, limit = 10, search = "", sort_by = "created_at", sort_order = "desc" } = req.query;
  page = parseInt(page) || 1;
  limit = Math.min(100, parseInt(limit) || 10);
  const offset = (page - 1) * limit;

  const validSortFields = ["name", "code", "created_at"];
  if (!validSortFields.includes(sort_by)) sort_by = "created_at";
  sort_order = sort_order.toLowerCase() === "asc" ? "ASC" : "DESC";

  const baseSearchCondition = `company_id = ? AND is_deleted = 0 AND (name LIKE ? OR code LIKE ?)`;
  const searchParams = [company_id, `%${search}%`, `%${search}%`];

  const [[{ total }]] = await conn.query(
    `SELECT COUNT(*) as total FROM salary_component_packages WHERE ${baseSearchCondition}`,
    searchParams
  );

  const [packages] = await conn.query(
    `SELECT ${SALARY_PACKAGE_FIELDS} FROM salary_component_packages WHERE ${baseSearchCondition} ORDER BY ${sort_by} ${sort_order} LIMIT ? OFFSET ?`,
    [...searchParams, limit, offset]
  );

  if (!packages.length) {
    return sendSuccess(res, 200, "No packages found", [], buildMeta(page, limit, total, 0));
  }

  const packageIds = packages.map(p => p.id);
  const [items] = await conn.query(
    `SELECT spi.package_id, spi.component_id, sc.name as component_name, sc.code as component_code, sc.type, sc.calc_type, sc.calc_value
     FROM salary_component_package_items spi
     JOIN salary_components sc ON sc.id = spi.component_id
     WHERE spi.package_id IN (?) AND spi.is_deleted = 0 AND sc.is_deleted = 0
     ORDER BY spi.package_id ASC`,
    [packageIds]
  );

  const packageMap = {};
  packages.forEach(pkg => { packageMap[pkg.id] = { ...pkg, items: [] }; });
  items.forEach(item => {
    if (packageMap[item.package_id]) {
      packageMap[item.package_id].items.push({
        component_id: item.component_id,
        name: item.component_name,
        code: item.component_code,
        type: item.type,
        calc_type: item.calc_type,
        calc_value: item.calc_value,
      });
    }
  });

  const data = Object.values(packageMap).map(pkg => formatSalaryPackage(pkg, pkg.items));
  return sendSuccess(res, 200, "Salary packages fetched successfully", data, buildMeta(page, limit, total, data.length));
}));

// 7. Update salary package
router.put("/components/update-package", auth([PERMISSIONS.FINANCIAL]), withTransaction(async (conn, req, res) => {
  const company_id = req.company?.id;
  const user_id = req.user?.id;
  let { package_id, name, code, description, components } = req.body;

  if (!company_id || !package_id) throw { status: 400, message: "company_id and package_id required" };
  if (!Array.isArray(components) || components.length === 0) throw { status: 400, message: "components array required" };

  if (name !== undefined) name = name.trim();
  if (code !== undefined) code = code.trim().toUpperCase();
  if (description !== undefined) description = description?.trim() || null;

  const newIds = parseComponentIds(components);

  const [[pkg]] = await conn.query(PACKAGE_EXISTS_BY_ID, [package_id, company_id]);
  if (!pkg) throw { status: 404, message: "Package not found" };

  if (code !== undefined) {
    const [dup] = await conn.query(PACKAGE_EXISTS_BY_CODE_EXCEPT, [company_id, code, package_id]);
    if (dup.length) throw { status: 409, message: "Package code already exists" };
  }

  await validateComponentIdsInDB(conn, company_id, newIds, true);

  let updateFields = [], params = [];
  if (name !== undefined) { updateFields.push("name = ?"); params.push(name); }
  if (code !== undefined) { updateFields.push("code = ?"); params.push(code); }
  if (description !== undefined) { updateFields.push("description = ?"); params.push(description); }
  if (updateFields.length) {
    updateFields.push("updated_by = ?"); params.push(user_id || null);
    params.push(package_id, company_id);
    await conn.query(
      `UPDATE salary_component_packages SET ${updateFields.join(", ")} WHERE id = ? AND company_id = ?`,
      params
    );
  }

  const [existingItems] = await conn.query(
    `SELECT component_id FROM salary_component_package_items WHERE package_id = ? AND is_deleted = 0`,
    [package_id]
  );
  const existingIds = existingItems.map(i => i.component_id);
  const toDelete = existingIds.filter(id => !newIds.includes(id));
  const toAdd = newIds.filter(id => !existingIds.includes(id));

  if (toDelete.length) {
    await conn.query(
      `UPDATE salary_component_package_items SET is_deleted = 1, deleted_at = NOW(), deleted_by = ? WHERE package_id = ? AND component_id IN (?) AND is_deleted = 0`,
      [user_id || null, package_id, toDelete]
    );
  }
  if (toAdd.length) {
    const addValues = toAdd.map(compId => [package_id, compId, 1, user_id || null, user_id || null]);
    await conn.query(`INSERT INTO salary_component_package_items (package_id, component_id, is_active, created_by, updated_by) VALUES ?`, [addValues]);
  }

  const [[updatedPkg]] = await conn.query(SELECT_PACKAGE_BY_ID, [package_id, company_id]);
  const items = await getPackageItems(conn, package_id);

  return sendSuccess(res, 200, "Salary package updated successfully", formatSalaryPackage(updatedPkg, items));
}));

// 8. Delete salary package (single or bulk)
router.delete("/components/delete-package", auth([PERMISSIONS.FINANCIAL]), withTransaction(async (conn, req, res) => {
  const company_id = req.company?.id;
  const user_id = req.user?.id;
  let { id, ids } = req.body;

  if (!company_id) {
    throw { status: 400, message: "Valid company_id is required" };
  }

  let packageIds = [];

  // Determine the list of package IDs from id or ids
  if (id !== undefined && ids === undefined) {
    const parsedId = parseInt(id);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      throw { status: 400, message: "Valid package id is required" };
    }
    packageIds = [parsedId];
  } else if (ids !== undefined) {
    if (ids === "all") {
      // Optionally support deleting all packages (use with caution)
      const [rows] = await conn.query(
        `SELECT id FROM salary_component_packages WHERE company_id = ? AND is_deleted = 0`,
        [company_id]
      );
      packageIds = rows.map((row) => row.id);
    } else if (Array.isArray(ids)) {
      packageIds = [
        ...new Set(
          ids
            .map((value) => parseInt(value))
            .filter((value) => Number.isInteger(value) && value > 0)
        ),
      ];

      if (packageIds.length === 0) {
        throw { status: 400, message: "Valid package ids are required" };
      }
    } else {
      throw { status: 400, message: "ids must be an array or 'all'" };
    }
  } else {
    throw { status: 400, message: "id or ids is required" };
  }

  if (packageIds.length === 0) {
    return sendSuccess(res, 200, "No salary packages to delete");
  }

  const placeholders = packageIds.map(() => "?").join(", ");

  // Check if all packages exist and are not deleted
  const [existingRows] = await conn.query(
    `SELECT id FROM salary_component_packages WHERE company_id = ? AND id IN (${placeholders}) AND is_deleted = 0`,
    [company_id, ...packageIds]
  );

  const existingIds = new Set(existingRows.map((row) => row.id));
  const missingIds = packageIds.filter((packageId) => !existingIds.has(packageId));

  if (missingIds.length > 0) {
    throw {
      status: 404,
      message: "One or more salary packages not found or already deleted",
      data: { ids: missingIds },
    };
  }

  // Check if any package is in use (referenced in invite_packages)
  const [inUseRows] = await conn.query(
    `SELECT DISTINCT component_package FROM invite_packages WHERE company_id = ? AND component_package IN (${placeholders}) AND is_deleted = 0`,
    [company_id, ...packageIds]
  );

  if (inUseRows.length > 0) {
    const inUseIds = inUseRows.map((row) => row.component_package);
    throw {
      status: 400,
      message: "Cannot delete package(s). They are used in invite templates",
      data: { ids: inUseIds },
    };
  }

  // Soft delete packages
  const [result] = await conn.query(
    `UPDATE salary_component_packages SET is_deleted = 1, deleted_at = NOW(), deleted_by = ? WHERE company_id = ? AND id IN (${placeholders}) AND is_deleted = 0`,
    [user_id || null, company_id, ...packageIds]
  );

  // Soft delete package items
  await conn.query(
    `UPDATE salary_component_package_items SET is_deleted = 1, deleted_at = NOW(), deleted_by = ? WHERE package_id IN (${placeholders}) AND is_deleted = 0`,
    [user_id || null, ...packageIds]
  );

  return sendSuccess(
    res,
    200,
    packageIds.length === 1
      ? "Salary package deleted successfully"
      : "Salary packages deleted successfully",
    {
      deleted_count: result.affectedRows,
      ids: packageIds,
    }
  );
}));


// -------------------- Employee Salary Management Routes --------------------


// 9. Assign salary to employee
router.post("/assign-salary", auth([PERMISSIONS.FINANCIAL]), withTransaction(async (conn, req, res) => {
  let { employee_id, base_amount, effective_from, effective_to, components = [] } = req.body;
  const company_id = req.company?.id;
  const user_id = req.user?.id;

  if (!company_id || !employee_id || !base_amount || !effective_from) throw { status: 400, message: "Required fields missing" };
  employee_id = Number(employee_id);
  base_amount = Number(base_amount);
  if (!employee_id || isNaN(base_amount) || base_amount <= 0) throw { status: 400, message: "Invalid numeric values" };

  if (!isValidDate(effective_from)) throw { status: 400, message: "Invalid effective_from" };
  if (effective_to && !isValidDate(effective_to)) throw { status: 400, message: "Invalid effective_to" };
  if (effective_to && isDateBefore(effective_to, effective_from)) throw { status: 400, message: "effective_to cannot be before effective_from" };

  const [[employee]] = await conn.query(
    `SELECT e.id, e.employee_code, u.name FROM employees e JOIN users u ON u.id = e.user_id WHERE e.id = ? AND e.company_id = ? AND e.is_deleted = 0 LIMIT 1`,
    [employee_id, company_id]
  );
  if (!employee) throw { status: 404, message: "Employee not found" };

  await checkSalaryOverlap(conn, employee_id, company_id, effective_from, effective_to);

  const validatedComponents = validateEmployeeComponents(components);
  const compIds = validatedComponents.map(c => c.component_id);
  await validateComponentIdsInDB(conn, company_id, compIds, false);

  const [salaryResult] = await conn.query(
    `INSERT INTO salary_structures (company_id, employee_id, base_amount, effective_from, effective_to, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [company_id, employee_id, base_amount, effective_from, effective_to || null, user_id || null]
  );
  const salary_id = salaryResult.insertId;

  if (validatedComponents.length) {
    const rows = validatedComponents.map(c => [company_id, employee_id, salary_id, c.component_id, c.calc_type, c.calc_value, c.remark, 1, user_id || null]);
    await conn.query(`INSERT INTO employee_salary_component (company_id, employee_id, salary_id, component_id, calc_type, calc_value, remark, is_active, created_by) VALUES ?`, [rows]);
  }

  return sendSuccess(res, 201, "Salary assigned successfully", {
    salary_id,
    employee: { id: employee.id, employee_code: employee.employee_code, name: employee.name },
    base_amount,
    effective_from,
    effective_to,
    components: validatedComponents,
  });
}));

// 10. Update salary
router.put("/update-salary", auth([PERMISSIONS.FINANCIAL]), withTransaction(async (conn, req, res) => {
  const company_id = req.company?.id;
  const user_id = req.user?.id;
  const { salary_id, base_amount, effective_from, effective_to = null, components = [] } = req.body;
  if (!company_id || !user_id) throw { status: 400, message: "Invalid company or user" };
  if (!salary_id) throw { status: 400, message: "salary_id is required" };

  const [[salary]] = await conn.query(SELECT_SS_BY_ID, [salary_id, company_id]);
  if (!salary) throw { status: 404, message: "Salary not found" };

  const salaryStatus = getSalaryStatus({ effective_from: salary.effective_from, effective_to: salary.effective_to });
  if (salaryStatus === "past") throw { status: 400, message: "Past salary cannot be edited" };

  const [[usedInPayroll]] = await conn.query(CHECK_PAYROLL_USED, [salary_id]);
  if (usedInPayroll) throw { status: 400, message: "Salary already used in payroll. Create a revision instead." };

  const employee_id = salary.employee_id;
  const [[employee]] = await conn.query(CHECK_EMPLOYEE_EXISTS, [employee_id, company_id]);
  if (!employee) throw { status: 404, message: "Employee not found" };

  const amount = Number(base_amount);
  if (!Number.isFinite(amount) || amount <= 0) throw { status: 400, message: "Invalid base_amount" };
  if (!effective_from || !isValidDate(effective_from)) throw { status: 400, message: "Invalid effective_from" };
  if (effective_to && !isValidDate(effective_to)) throw { status: 400, message: "Invalid effective_to" };
  if (effective_to && !isDateAfter(effective_to, effective_from)) throw { status: 400, message: "effective_to must be greater than effective_from" };

  const validatedComponents = validateEmployeeComponents(components);
  const compIds = validatedComponents.map(c => c.component_id);
  await validateComponentIdsInDB(conn, company_id, compIds, false);

  await checkSalaryOverlap(conn, employee_id, company_id, effective_from, effective_to, salary_id);

  await conn.query(`UPDATE salary_structures SET base_amount = ?, effective_from = ?, effective_to = ?, updated_by = ? WHERE id = ?`, [amount, effective_from, effective_to, user_id, salary_id]);
  await conn.query(`DELETE FROM employee_salary_component WHERE salary_id = ?`, [salary_id]);

  const compRows = validatedComponents.map(c => [company_id, employee_id, salary_id, c.component_id, c.calc_type, c.calc_value, c.remark, 1, user_id]);
  await conn.query(`INSERT INTO employee_salary_component (company_id, employee_id, salary_id, component_id, calc_type, calc_value, remark, is_active, created_by) VALUES ?`, [compRows]);

  return sendSuccess(res, 200, "Salary updated successfully", {
    salary_id,
    employee_id,
    base_amount: amount,
    effective_from,
    effective_to,
    components: validatedComponents,
  });
}));

// 11. Revise salary
router.post("/revise-salary", auth([PERMISSIONS.FINANCIAL]), withTransaction(async (conn, req, res) => {
  const company_id = req.company?.id;
  const user_id = req.user?.id;
  let { employee_id, base_amount, components = [], effective_from } = req.body;

  if (!company_id || !employee_id || !base_amount) throw { status: 400, message: "Required fields missing" };
  employee_id = Number(employee_id);
  base_amount = Number(base_amount);
  if (!employee_id || isNaN(base_amount) || base_amount <= 0) throw { status: 400, message: "Invalid values supplied" };

  let effectiveFrom = effective_from ? new Date(effective_from) : new Date();
  if (isNaN(effectiveFrom.getTime())) throw { status: 400, message: "Invalid effective_from" };
  if (effectiveFrom < new Date(new Date().toDateString())) {
    throw { status: 400, message: "effective_from cannot be in the past" };
  }
  effectiveFrom = formatDate(effectiveFrom);

  const [[employee]] = await conn.query(CHECK_EMPLOYEE_EXISTS, [employee_id, company_id]);
  if (!employee) throw { status: 404, message: "Employee not found" };

  // Find the current salary that is effective today (based on dates, not is_active)
  const [[currentSalary]] = await conn.query(
    `SELECT * FROM salary_structures 
     WHERE employee_id = ? AND company_id = ? AND is_deleted = 0
       AND effective_from <= CURDATE() AND (effective_to IS NULL OR effective_to >= CURDATE())
     ORDER BY effective_from DESC LIMIT 1`,
    [employee_id, company_id]
  );
  if (!currentSalary) throw { status: 400, message: "No active salary found for the current date. Please assign a salary first." };

  const validatedComponents = validateEmployeeComponents(components);
  const compIds = validatedComponents.map(c => c.component_id);
  await validateComponentIdsInDB(conn, company_id, compIds, false);

  await checkSalaryOverlap(conn, employee_id, company_id, effectiveFrom, null, currentSalary.id);

  const prevEndDate = formatDate(addDays(new Date(effectiveFrom), -1));
  // Update only effective_to of current salary; leave is_active untouched
  await conn.query(
    `UPDATE salary_structures 
     SET effective_to = ?, updated_by = ?
     WHERE id = ?`,
    [prevEndDate, user_id || null, currentSalary.id]
  );

  const [salaryInsert] = await conn.query(
    `INSERT INTO salary_structures (company_id, employee_id, base_amount, effective_from, effective_to, is_active, created_by)
     VALUES (?, ?, ?, ?, NULL, 1, ?)`,
    [company_id, employee_id, base_amount, effectiveFrom, user_id || null]
  );
  const newSalaryId = salaryInsert.insertId;

  const compRows = validatedComponents.map(c => [company_id, employee_id, newSalaryId, c.component_id, c.calc_type, c.calc_value, c.remark, 1, user_id || null]);
  await conn.query(`INSERT INTO employee_salary_component (company_id, employee_id, salary_id, component_id, calc_type, calc_value, remark, is_active, created_by) VALUES ?`, [compRows]);

  // Note: No deactivation of other salaries; date ranges handle selection.

  return sendSuccess(res, 201, "Salary revision scheduled successfully", {
    new_salary_id: newSalaryId,
    effective_from: effectiveFrom,
    previous_salary_id: currentSalary.id,
    previous_salary_end: prevEndDate
  });
}));

// 12. Delete salary
router.delete("/delete-salary", auth([PERMISSIONS.FINANCIAL]), withTransaction(async (conn, req, res) => {
  const company_id = req.company?.id;
  const user_id = req.user?.id;
  const { salary_id } = req.body;

  if (!company_id || !user_id) throw { status: 400, message: "Invalid company or user" };
  if (!salary_id) throw { status: 400, message: "salary_id is required" };

  const [[salary]] = await conn.query(`SELECT * FROM salary_structures WHERE id = ? AND company_id = ? AND is_deleted = 0 FOR UPDATE`, [salary_id, company_id]);
  if (!salary) throw { status: 404, message: "Salary record not found" };

  const [[payrollUsed]] = await conn.query(CHECK_PAYROLL_USED, [salary_id]);
  if (payrollUsed) throw { status: 400, message: "Salary already used in payroll. Cannot delete." };

  const employee_id = salary.employee_id;

  const [[prevSalary]] = await conn.query(
    `SELECT * FROM salary_structures WHERE employee_id = ? AND company_id = ? AND is_deleted = 0 AND id <> ? AND effective_from < ? ORDER BY effective_from DESC LIMIT 1 FOR UPDATE`,
    [employee_id, company_id, salary_id, salary.effective_from]
  );
  const [[nextSalary]] = await conn.query(
    `SELECT * FROM salary_structures WHERE employee_id = ? AND company_id = ? AND is_deleted = 0 AND id <> ? AND effective_from > ? ORDER BY effective_from ASC LIMIT 1 FOR UPDATE`,
    [employee_id, company_id, salary_id, salary.effective_from]
  );

  await conn.query(`UPDATE employee_salary_component SET is_deleted = 1, deleted_at = NOW(), deleted_by = ? WHERE salary_id = ? AND is_deleted = 0`, [user_id, salary_id]);
  // Soft delete the salary structure (is_active can be left as 1 but we set to 0 for consistency)
  await conn.query(`UPDATE salary_structures SET is_deleted = 1, deleted_at = NOW(), deleted_by = ?, is_active = 0 WHERE id = ?`, [user_id, salary_id]);

  if (prevSalary && nextSalary) {
    await conn.query(`UPDATE salary_structures SET effective_to = DATE_SUB(?, INTERVAL 1 DAY), updated_by = ? WHERE id = ?`, [nextSalary.effective_from, user_id, prevSalary.id]);
  } else if (prevSalary && !nextSalary) {
    await conn.query(`UPDATE salary_structures SET effective_to = NULL, updated_by = ? WHERE id = ?`, [user_id, prevSalary.id]);
  }

  // No reactivation of remaining salaries; their is_active flags are unchanged.

  return sendSuccess(res, 200, "Salary deleted successfully");
}));

// 13. List all employees salaries
router.get("/employees-salaries", auth(), withConnection(async (conn, req, res) => {
  const company_id = req.company?.id;
  if (!company_id) throw { status: 400, message: "Invalid company" };

  let { page = 1, limit = 10, search = "", date, month, year, from_date, to_date } = req.query;
  page = Math.max(1, parseInt(page) || 1);
  limit = Math.min(100, parseInt(limit) || 10);
  const offset = (page - 1) * limit;

  let dateCondition = "";
  let dateParams = [];

  if (date) {
    dateCondition = `AND ss.effective_from <= ? AND (ss.effective_to IS NULL OR ss.effective_to >= ?)`;
    dateParams.push(date, date);
  } else if (from_date && to_date) {
    dateCondition = `AND ss.effective_from <= ? AND (ss.effective_to IS NULL OR ss.effective_to >= ?)`;
    dateParams.push(to_date, from_date);
  } else if (month && year) {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(year, month, 0)).toISOString().split("T")[0];
    dateCondition = `AND ss.effective_from <= ? AND (ss.effective_to IS NULL OR ss.effective_to >= ?)`;
    dateParams.push(end, start);
  } else {
    // Default: salaries effective today (no is_active filter)
    dateCondition = `AND ss.effective_from <= CURDATE() AND (ss.effective_to IS NULL OR ss.effective_to >= CURDATE())`;
  }

  const searchCondition = search ? "AND (u.name LIKE ? OR u.email LIKE ? OR e.employee_code LIKE ?)" : "";
  const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

  const fromJoins = `FROM employees e JOIN users u ON u.id = e.user_id INNER JOIN salary_structures ss ON ss.employee_id = e.id AND ss.company_id = e.company_id AND ss.is_deleted = 0 ${dateCondition} LEFT JOIN (SELECT DISTINCT salary_id FROM payroll_entries WHERE is_deleted = 0) pe_used ON pe_used.salary_id = ss.id WHERE e.company_id = ? AND e.is_deleted = 0 AND e.is_active = 1 ${searchCondition}`;
  const baseParams = [...dateParams, company_id, ...searchParams];

  const countQuery = `SELECT COUNT(*) AS total ${fromJoins}`;
  const [[{ total }]] = await conn.query(countQuery, baseParams);

  const dataQuery = `SELECT e.id AS employee_id, e.employee_code, u.name, u.email, u.profile_picture, ss.id AS salary_id, ss.base_amount, ss.effective_from, ss.effective_to, CASE WHEN pe_used.salary_id IS NOT NULL THEN TRUE ELSE FALSE END AS payroll_used ${fromJoins} ORDER BY u.name ASC LIMIT ? OFFSET ?`;
  const [rows] = await conn.query(dataQuery, [...baseParams, limit, offset]);

  if (!rows.length) {
    return sendSuccess(res, 200, "No salaries found", [], buildMeta(page, limit, total, 0));
  }

  const salaryIds = rows.map(r => r.salary_id);
  const [componentRows] = await conn.query(
    `SELECT esc.salary_id, c.id, c.code, c.name, c.type, esc.calc_type, esc.calc_value
     FROM employee_salary_component esc
     JOIN salary_components c ON c.id = esc.component_id AND c.company_id = esc.company_id
     WHERE esc.salary_id IN (?) AND esc.company_id = ? AND esc.is_deleted = 0`,
    [salaryIds, company_id]
  );

  const compMap = {};
  componentRows.forEach(c => {
    if (!compMap[c.salary_id]) compMap[c.salary_id] = [];
    compMap[c.salary_id].push(c);
  });

  const results = rows.map(row => {
    const components = compMap[row.salary_id] || [];
    const base = Number(row.base_amount) || 0;
    let total_earnings = base, total_deductions = 0, employer_contributions = 0;

    components.forEach(c => {
      let amount = c.calc_type === "percentage" ? (base * Number(c.calc_value)) / 100 : Number(c.calc_value);
      amount = Number(amount.toFixed(2));
      c.amount = amount;
      if (c.type === "earning") total_earnings += amount;
      else if (c.type === "deduction") total_deductions += amount;
      else if (c.type === "employer_contribution") employer_contributions += amount;
    });

    const gross_salary = Number(total_earnings.toFixed(2));
    const net_salary = Math.max(0, Number((gross_salary - total_deductions).toFixed(2)));
    const ctc = Number((gross_salary + employer_contributions).toFixed(2));

    return {
      salary_id: row.salary_id,
      payroll_used: Boolean(row.payroll_used),
      employee: {
        id: row.employee_id,
        employee_code: row.employee_code,
        name: row.name,
        email: row.email,
        profile_picture: buildFileUrl(row.profile_picture),
      },
      base_amount: base,
      effective_from: row.effective_from,
      effective_to: row.effective_to,
      ctc,
      gross_salary,
      employer_contributions: Number(employer_contributions.toFixed(2)),
      total_deductions: Number(total_deductions.toFixed(2)),
      net_salary,
      components,
    };
  });

  return sendSuccess(res, 200, "Employee salaries fetched successfully", results, buildMeta(page, limit, total, results.length));
}));

// 14. Employee salary history (all salaries for a specific employee, with status)
router.get("/employee-salaries/:employeeId", auth(), withConnection(async (conn, req, res) => {
  const company_id = req.company?.id;
  const employee_id = Number(req.params.employeeId);

  if (!company_id || !employee_id) throw { status: 400, message: "Invalid company or employee" };

  // 1. Fetch employee details
  const [[employee]] = await conn.query(
    `SELECT e.id AS employee_id, e.employee_code, u.name, u.email, u.profile_picture
     FROM employees e
     JOIN users u ON u.id = e.user_id
     WHERE e.id = ? AND e.company_id = ? AND e.is_deleted = 0 AND e.is_active = 1
     LIMIT 1`,
    [employee_id, company_id]
  );

  if (!employee) throw { status: 404, message: "Employee not found" };

  // 2. Fetch ALL salary structures for this employee (past, current, future)
  const [salaryRows] = await conn.query(
    `SELECT ss.id AS salary_id, ss.base_amount, ss.effective_from, ss.effective_to,
            CASE WHEN pe_used.salary_id IS NOT NULL THEN TRUE ELSE FALSE END AS payroll_used
     FROM salary_structures ss
     LEFT JOIN (
       SELECT DISTINCT salary_id FROM payroll_entries WHERE is_deleted = 0
     ) pe_used ON pe_used.salary_id = ss.id
     WHERE ss.employee_id = ? AND ss.company_id = ? AND ss.is_deleted = 0
     ORDER BY ss.effective_from DESC`,
    [employee_id, company_id]
  );

  if (!salaryRows.length) return sendSuccess(res, 200, "No salary records found", []);

  // 3. Fetch all components for the salary IDs
  const salaryIds = salaryRows.map(r => r.salary_id);
  const [componentRows] = await conn.query(
    `SELECT esc.salary_id, c.id, c.code, c.name, c.type, esc.calc_type, esc.calc_value
     FROM employee_salary_component esc
     JOIN salary_components c ON c.id = esc.component_id AND c.company_id = esc.company_id
     WHERE esc.salary_id IN (?) AND esc.company_id = ? AND esc.is_deleted = 0`,
    [salaryIds, company_id]
  );

  // 4. Map components to salary_id
  const compMap = {};
  componentRows.forEach(c => {
    if (!compMap[c.salary_id]) compMap[c.salary_id] = [];
    compMap[c.salary_id].push(c);
  });

  // 5. Build result array with same structure as /employees-salaries + status
  const results = salaryRows.map(row => {
    const components = compMap[row.salary_id] || [];
    const base = Number(row.base_amount) || 0;
    let total_earnings = base, total_deductions = 0, employer_contributions = 0;

    // Calculate component amounts and totals
    components.forEach(c => {
      let amount = c.calc_type === "percentage" ? (base * Number(c.calc_value)) / 100 : Number(c.calc_value);
      amount = Number(amount.toFixed(2));
      c.amount = amount;
      if (c.type === "earning") total_earnings += amount;
      else if (c.type === "deduction") total_deductions += amount;
      else if (c.type === "employer_contribution") employer_contributions += amount;
    });

    const gross_salary = Number(total_earnings.toFixed(2));
    const net_salary = Math.max(0, Number((gross_salary - total_deductions).toFixed(2)));
    const ctc = Number((gross_salary + employer_contributions).toFixed(2));

    // Determine salary status: past / current / future
    const today = new Date().toISOString().slice(0, 10);
    let status;
    if (row.effective_to && row.effective_to < today) status = "past";
    else if (row.effective_from <= today && (!row.effective_to || row.effective_to >= today)) status = "current";
    else status = "future";

    return {
      salary_id: row.salary_id,
      payroll_used: Boolean(row.payroll_used),
      employee: {
        id: employee.employee_id,
        employee_code: employee.employee_code,
        name: employee.name,
        email: employee.email,
        profile_picture: buildFileUrl(employee.profile_picture),
      },
      base_amount: base,
      effective_from: row.effective_from,
      effective_to: row.effective_to,
      status,  // <-- added status
      ctc,
      gross_salary,
      employer_contributions: Number(employer_contributions.toFixed(2)),
      total_deductions: Number(total_deductions.toFixed(2)),
      net_salary,
      components,
    };
  });

  return sendSuccess(res, 200, "Employee salaries fetched successfully", results);
}));

// 15. My salary (employee view)
router.get("/my-salary", auth(), withConnection(async (conn, req, res) => {
  const company_id = req.company?.id;
  const user_id = req.user?.id;

  if (!company_id || !user_id) throw { status: 401, message: "Unauthorized access" };

  let month = new Date().getMonth() + 1;
  let year = new Date().getFullYear();

  if (req.query.month !== undefined) {
    const parsedMonth = Number(req.query.month);
    if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) throw { status: 400, message: "Invalid month. Must be between 1-12" };
    month = parsedMonth;
  }
  if (req.query.year !== undefined) {
    const parsedYear = Number(req.query.year);
    if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) throw { status: 400, message: "Invalid year. Must be between 2000-2100" };
    year = parsedYear;
  }

  const targetDate = `${year}-${String(month).padStart(2, "0")}-01`;

  const [[employee]] = await conn.query(
    `SELECT e.id AS employee_id FROM employees e WHERE e.user_id = ? AND e.company_id = ? AND e.is_deleted = 0 AND e.is_active = 1 LIMIT 1`,
    [user_id, company_id]
  );
  if (!employee) throw { status: 404, message: "Employee not found" };
  const employee_id = employee.employee_id;

  const [[salaryStructure]] = await conn.query(
    `SELECT ss.id, ss.base_amount, ss.effective_from, ss.effective_to, ss.created_at
     FROM salary_structures ss
     WHERE ss.company_id = ? AND ss.employee_id = ? AND ss.is_deleted = 0
       AND ss.effective_from <= LAST_DAY(?) AND (ss.effective_to IS NULL OR ss.effective_to >= ?)
     ORDER BY ss.effective_from DESC, ss.id DESC LIMIT 1`,
    [company_id, employee_id, targetDate, targetDate]
  );
  if (!salaryStructure) {
    return res.status(200).json({
      success: true,
      message: "No salary structure found for the selected period",
      data: null,
    });
  }

  const [components] = await conn.query(
    `SELECT esc.id, sc.id AS component_id, sc.code, sc.name, sc.type, sc.is_taxable, sc.is_statutory, esc.calc_type, esc.calc_value, esc.remark,
            CASE WHEN esc.calc_type = 'fixed' THEN esc.calc_value WHEN esc.calc_type = 'percentage' THEN ROUND((ss.base_amount * esc.calc_value) / 100, 2) ELSE 0 END AS amount
     FROM employee_salary_component esc
     INNER JOIN salary_components sc ON sc.id = esc.component_id AND sc.is_deleted = 0 AND sc.is_active = 1
     INNER JOIN salary_structures ss ON ss.id = esc.salary_id AND ss.is_deleted = 0
     WHERE esc.company_id = ? AND esc.employee_id = ? AND esc.salary_id = ? AND esc.is_deleted = 0 AND esc.is_active = 1
     ORDER BY sc.type ASC, sc.name ASC`,
    [company_id, employee_id, salaryStructure.id]
  );

  let totalEarnings = 0, totalDeductions = 0;
  const earnings = [], deductions = [];

  for (const item of components) {
    const component = {
      component_id: item.component_id,
      code: item.code,
      name: item.name,
      type: item.type,
      is_taxable: item.is_taxable == 1,
      is_statutory: item.is_statutory == 1,
      calc_type: item.calc_type,
      calc_value: Number(item.calc_value),
      amount: Number(item.amount),
      remark: item.remark,
    };
    if (item.type === "earning") { totalEarnings += Number(item.amount); earnings.push(component); }
    else if (item.type === "deduction") { totalDeductions += Number(item.amount); deductions.push(component); }
  }

  return sendSuccess(res, 200, "Salary structure fetched successfully", {
    salary_structure_id: salaryStructure.id,
    month, year,
    base_amount: Number(salaryStructure.base_amount),
    effective_from: salaryStructure.effective_from,
    effective_to: salaryStructure.effective_to,
    total_earnings: totalEarnings,
    total_deductions: totalDeductions,
    net_salary: Number(salaryStructure.base_amount) + totalEarnings - totalDeductions,
    earnings,
    deductions,
  });
}));

export default router;
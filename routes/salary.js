import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import { validateFields, salaryValidation, currencyTypeValidation } from "../utils/constantsValidator.js";
import { SALARY_TYPES, CURRENCY_TYPES } from "../constants/constants_values.js";
import { buildFileUrl } from "../utils/fileService.js";
import { SAL, SAL_COMP, SAL_PKG } from "../constants/permissions.js";
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

// local helpers for functions removed from time.js
const isValidDate = (value) => !!parseDate(value);
const formatDate = (date) => formatIST(date, "YYYY-MM-DD");

// --------------- SQL FIELD CONSTANTS ---------------
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

// --------------- ROUTES ---------------

// 1. Create salary component
router.post("/components/create", auth(SAL_COMP.MNG), async (req, res) => {
  let conn;
  try {
    let {
      code, name, type, calc_type, calc_value, is_taxable, is_statutory
    } = req.body;

    const company_id = req.company?.id;
    const user_id = req.user?.id;
    if (!company_id) return sendError(res, 400, "Company context missing");
    if (!code || !name || !type) return sendError(res, 400, "code, name and type are required");

    code = code.trim().toUpperCase();
    name = name.trim();
    type = type.trim().toLowerCase();
    calc_type = calc_type ? calc_type.trim().toLowerCase() : "fixed";

    const toBool = val => val === true || val === 1 || val === "1";
    is_taxable = toBool(is_taxable) ? 1 : 0;
    is_statutory = toBool(is_statutory) ? 1 : 0;

    const validTypes = ["earning", "deduction", "employer_contribution"];
    const validCalcTypes = ["fixed", "percentage"];
    if (!validTypes.includes(type)) return sendError(res, 400, "Invalid type. Allowed: earning, deduction, employer_contribution");
    if (!validCalcTypes.includes(calc_type)) return sendError(res, 400, "Invalid calc_type. Allowed: fixed, percentage");

    calc_value = parseFloat(calc_value);
    if (isNaN(calc_value)) calc_value = 0;
    if (calc_type === "percentage" && (calc_value <= 0 || calc_value > 100)) return sendError(res, 400, "For percentage, calc_value must be between 0 and 100");
    if (calc_type === "fixed" && calc_value < 0) return sendError(res, 400, "Fixed amount cannot be negative");

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [existing] = await conn.query(
      `SELECT id FROM salary_components WHERE company_id = ? AND code = ? AND is_deleted = 0 LIMIT 1`,
      [company_id, code]
    );
    if (existing.length) {
      await conn.rollback();
      return sendError(res, 409, "Salary component code already exists");
    }

    const [result] = await conn.query(
      `INSERT INTO salary_components (company_id, code, name, type, calc_type, calc_value, is_taxable, is_statutory, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [company_id, code, name, type, calc_type, calc_value, is_taxable, is_statutory, user_id || null]
    );

    const [[created]] = await conn.query(`SELECT ${SALARY_COMPONENT_FIELDS} FROM salary_components WHERE id = ?`, [result.insertId]);
    await conn.commit();

    return sendSuccess(res, 201, "Salary component created successfully", formatSalaryComponent(created));
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Create Salary Component Error:", err);
    if (err.code === "ER_DUP_ENTRY") return sendError(res, 409, "Salary component code already exists");
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// 2. List salary components
router.get("/components/list", auth(SAL_COMP.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const company_id = req.company?.id;
    if (!company_id) return sendError(res, 400, "Company context missing");

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
      const validTypes = ["earning", "deduction", "employer_contribution"];
      if (!validTypes.includes(type)) return sendError(res, 400, "Invalid type filter");
      whereClause += ` AND type = ?`;
      params.push(type);
    }

    if (is_active !== undefined) {
      const activeVal = (is_active === "1" || is_active === 1) ? 1 : 0;
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
  } catch (err) {
    console.error("List Salary Components Error:", err);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// 3. Update salary component
router.put("/components/update", auth(SAL_COMP.MNG), async (req, res) => {
  let conn;
  try {
    let { id, code, name, type, calc_type, calc_value, is_taxable, is_statutory, is_active } = req.body;
    const company_id = req.company?.id;
    const user_id = req.user?.id;

    if (!company_id || !id) return sendError(res, 400, "company_id and id are required");

    if (code !== undefined) code = code.trim().toUpperCase();
    if (name !== undefined) name = name.trim();
    if (type !== undefined) type = type.trim().toLowerCase();
    if (calc_type !== undefined) calc_type = calc_type.trim().toLowerCase();

    const toBool = val => val === true || val === 1 || val === "1";
    const validTypes = ["earning", "deduction", "employer_contribution"];
    const validCalcTypes = ["fixed", "percentage"];

    if (type && !validTypes.includes(type)) return sendError(res, 400, "Invalid type");
    if (calc_type && !validCalcTypes.includes(calc_type)) return sendError(res, 400, "Invalid calc_type");

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `SELECT calc_type, calc_value FROM salary_components WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, company_id]
    );
    if (!existing) {
      await conn.rollback();
      return sendError(res, 404, "Salary component not found");
    }

    if (code !== undefined) {
      const [dup] = await conn.query(
        `SELECT id FROM salary_components WHERE company_id = ? AND code = ? AND id != ? AND is_deleted = 0`,
        [company_id, code, id]
      );
      if (dup.length) {
        await conn.rollback();
        return sendError(res, 409, "Salary component code already exists");
      }
    }

    let finalCalcType = calc_type !== undefined ? calc_type : existing.calc_type;
    let finalCalcValue;
    if (calc_value !== undefined) {
      finalCalcValue = parseFloat(calc_value);
      if (isNaN(finalCalcValue)) finalCalcValue = 0;
    } else {
      finalCalcValue = existing.calc_value;
    }

    if (finalCalcType === "percentage" && (finalCalcValue <= 0 || finalCalcValue > 100)) {
      await conn.rollback();
      return sendError(res, 400, "For percentage, calc_value must be between 0 and 100");
    }
    if (finalCalcType === "fixed" && finalCalcValue < 0) {
      await conn.rollback();
      return sendError(res, 400, "Fixed amount cannot be negative");
    }

    let updateFields = [], params = [];
    if (code !== undefined) { updateFields.push("code = ?"); params.push(code); }
    if (name !== undefined) { updateFields.push("name = ?"); params.push(name); }
    if (type !== undefined) { updateFields.push("type = ?"); params.push(type); }
    if (calc_type !== undefined) { updateFields.push("calc_type = ?"); params.push(calc_type); }
    if (calc_value !== undefined || calc_type !== undefined) { updateFields.push("calc_value = ?"); params.push(finalCalcValue); }
    if (is_taxable !== undefined) { updateFields.push("is_taxable = ?"); params.push(toBool(is_taxable) ? 1 : 0); }
    if (is_statutory !== undefined) { updateFields.push("is_statutory = ?"); params.push(toBool(is_statutory) ? 1 : 0); }
    if (is_active !== undefined) { updateFields.push("is_active = ?"); params.push(toBool(is_active) ? 1 : 0); }
    if (!updateFields.length) {
      await conn.rollback();
      return sendError(res, 400, "No fields provided to update");
    }
    updateFields.push("updated_by = ?"); params.push(user_id || null);
    params.push(id, company_id);

    await conn.query(
      `UPDATE salary_components SET ${updateFields.join(", ")} WHERE id = ? AND company_id = ?`,
      params
    );

    const [[updated]] = await conn.query(`SELECT ${SALARY_COMPONENT_FIELDS} FROM salary_components WHERE id = ? AND company_id = ?`, [id, company_id]);
    await conn.commit();

    return sendSuccess(res, 200, "Salary component updated successfully", formatSalaryComponent(updated));
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Update Salary Component Error:", err);
    if (err.code === "ER_DUP_ENTRY") return sendError(res, 409, "Salary component code already exists");
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// 4. Delete salary component
router.delete("/components/delete", auth(SAL_COMP.MNG), async (req, res) => {
  let conn;
  try {
    const company_id = req.company?.id;
    const user_id = req.user?.id;
    let { id } = req.body;
    id = parseInt(id);

    if (!company_id || isNaN(id) || id <= 0) return sendError(res, 400, "Valid company_id and id are required");

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `SELECT id FROM salary_components WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, company_id]
    );
    if (!existing) {
      await conn.rollback();
      return sendError(res, 404, "Salary component not found or already deleted");
    }

    const [[inUse]] = await conn.query(
      `SELECT id FROM salary_component_package_items WHERE component_id = ? AND is_deleted = 0 LIMIT 1`,
      [id]
    );
    if (inUse) {
      await conn.rollback();
      return sendError(res, 400, "Cannot delete component. It is used in salary package");
    }

    await conn.query(
      `UPDATE salary_components SET is_deleted = 1, deleted_at = NOW(), deleted_by = ? WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [user_id || null, id, company_id]
    );
    await conn.commit();

    return sendSuccess(res, 200, "Salary component deleted successfully");
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Delete Salary Component Error:", err);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// 5. Create salary package
router.post("/components/create-package", auth(SAL_COMP.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    let { name, code, description, components } = req.body;
    const company_id = req.company?.id;
    const user_id = req.user?.id;

    name = name?.trim();
    code = code?.trim().toUpperCase();
    description = description?.trim() || null;

    if (!company_id) return sendError(res, 400, "Company missing");
    if (!name) return sendError(res, 400, "name is required");
    if (!Array.isArray(components) || components.length === 0) return sendError(res, 400, "components array is required");

    const componentIdsSet = new Set();
    components.forEach((item, index) => {
      if (!item.component_id) return sendError(res, 400, `component_id required at index ${index}`);
      const compId = parseInt(item.component_id);
      if (isNaN(compId) || compId <= 0) return sendError(res, 400, `Invalid component_id at index ${index}`);
      if (componentIdsSet.has(compId)) return sendError(res, 400, `Duplicate component_id: ${compId}`);
      componentIdsSet.add(compId);
    });

    const componentIds = [...componentIdsSet];
    await conn.beginTransaction();

    const [existing] = await conn.query(
      `SELECT id FROM salary_component_packages WHERE company_id = ? AND name = ? AND is_deleted = 0 LIMIT 1`,
      [company_id, name]
    );
    if (existing.length) {
      await conn.rollback();
      return sendError(res, 409, "Package name already exists");
    }

    const [validComponents] = await conn.query(
      `SELECT id FROM salary_components WHERE id IN (?) AND company_id = ? AND is_deleted = 0 AND is_active = 1`,
      [componentIds, company_id]
    );
    if (validComponents.length !== componentIds.length) {
      await conn.rollback();
      return sendError(res, 400, "Some components are invalid or inactive");
    }

    const [pkgResult] = await conn.query(
      `INSERT INTO salary_component_packages (company_id, name, code, description, created_by) VALUES (?, ?, ?, ?, ?)`,
      [company_id, name, code || null, description, user_id || null]
    );
    const package_id = pkgResult.insertId;

    const values = components.map(item => [
      package_id, parseInt(item.component_id), 1, user_id || null, user_id || null
    ]);
    await conn.query(
      `INSERT INTO salary_component_package_items (package_id, component_id, is_active, created_by, updated_by) VALUES ?`,
      [values]
    );

    const [[pkg]] = await conn.query(`SELECT ${SALARY_PACKAGE_FIELDS} FROM salary_component_packages WHERE id = ? AND company_id = ?`, [package_id, company_id]);
    const [items] = await conn.query(
      `SELECT spi.component_id, sc.name, sc.code, sc.type, sc.calc_type, sc.calc_value
       FROM salary_component_package_items spi
       JOIN salary_components sc ON sc.id = spi.component_id
       WHERE spi.package_id = ? AND spi.is_deleted = 0 AND sc.is_deleted = 0
       ORDER BY spi.component_id ASC`,
      [package_id]
    );

    await conn.commit();

    return sendSuccess(res, 201, "Salary package created successfully", formatSalaryPackage(pkg, items));
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Create Salary Package Error:", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// 6. List salary packages
router.get("/components/packages", auth(SAL_COMP.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const company_id = req.company?.id;
    if (!company_id) return sendError(res, 400, "Company not found");

    let { page = 1, limit = 10, search = "", sort_by = "created_at", sort_order = "desc" } = req.query;
    page = parseInt(page) || 1;
    limit = Math.min(100, parseInt(limit) || 10);
    const offset = (page - 1) * limit;

    const validSortFields = ["name", "code", "created_at"];
    if (!validSortFields.includes(sort_by)) sort_by = "created_at";
    sort_order = sort_order.toLowerCase() === "asc" ? "ASC" : "DESC";

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) as total FROM salary_component_packages WHERE company_id = ? AND is_deleted = 0 AND (name LIKE ? OR code LIKE ?)`,
      [company_id, `%${search}%`, `%${search}%`]
    );

    const [packages] = await conn.query(
      `SELECT ${SALARY_PACKAGE_FIELDS} FROM salary_component_packages WHERE company_id = ? AND is_deleted = 0 AND (name LIKE ? OR code LIKE ?) ORDER BY ${sort_by} ${sort_order} LIMIT ? OFFSET ?`,
      [company_id, `%${search}%`, `%${search}%`, limit, offset]
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
  } catch (err) {
    console.error("Fetch Packages Error:", err);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// 7. Update salary package
router.put("/components/update-package", auth(SAL_COMP.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const company_id = req.company?.id;
    const user_id = req.user?.id;
    let { package_id, name, code, description, components } = req.body;

    if (!company_id || !package_id) return sendError(res, 400, "company_id and package_id required");
    if (!Array.isArray(components) || components.length === 0) return sendError(res, 400, "components array required");

    if (name !== undefined) name = name.trim();
    if (code !== undefined) code = code.trim().toUpperCase();
    if (description !== undefined) description = description?.trim() || null;

    const componentIdsSet = new Set();
    components.forEach((item, index) => {
      if (!item.component_id) return sendError(res, 400, `component_id required at index ${index}`);
      const compId = parseInt(item.component_id);
      if (isNaN(compId) || compId <= 0) return sendError(res, 400, `Invalid component_id at index ${index}`);
      if (componentIdsSet.has(compId)) return sendError(res, 400, `Duplicate component_id: ${compId}`);
      componentIdsSet.add(compId);
    });
    const newIds = [...componentIdsSet];

    await conn.beginTransaction();

    const [[pkg]] = await conn.query(
      `SELECT id FROM salary_component_packages WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [package_id, company_id]
    );
    if (!pkg) {
      await conn.rollback();
      return sendError(res, 404, "Package not found");
    }

    if (code !== undefined) {
      const [dup] = await conn.query(
        `SELECT id FROM salary_component_packages WHERE company_id = ? AND code = ? AND id != ? AND is_deleted = 0`,
        [company_id, code, package_id]
      );
      if (dup.length) {
        await conn.rollback();
        return sendError(res, 409, "Package code already exists");
      }
    }

    const [validComponents] = await conn.query(
      `SELECT id FROM salary_components WHERE id IN (?) AND company_id = ? AND is_deleted = 0 AND is_active = 1`,
      [newIds, company_id]
    );
    if (validComponents.length !== newIds.length) {
      await conn.rollback();
      return sendError(res, 400, "Invalid or inactive components");
    }

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
      const addValues = components
        .filter(item => toAdd.includes(parseInt(item.component_id)))
        .map(item => [package_id, parseInt(item.component_id), 1, user_id || null, user_id || null]);
      await conn.query(`INSERT INTO salary_component_package_items (package_id, component_id, is_active, created_by, updated_by) VALUES ?`, [addValues]);
    }

    const [[updatedPkg]] = await conn.query(`SELECT ${SALARY_PACKAGE_FIELDS} FROM salary_component_packages WHERE id = ? AND company_id = ?`, [package_id, company_id]);
    const [items] = await conn.query(
      `SELECT spi.component_id, sc.name, sc.code, sc.type, sc.calc_type, sc.calc_value
       FROM salary_component_package_items spi JOIN salary_components sc ON sc.id = spi.component_id
       WHERE spi.package_id = ? AND spi.is_deleted = 0 AND sc.is_deleted = 0
       ORDER BY spi.component_id ASC`,
      [package_id]
    );

    await conn.commit();

    return sendSuccess(res, 200, "Salary package updated successfully", formatSalaryPackage(updatedPkg, items));
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Update Package Error:", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// 8. Delete salary package
router.delete("/components/delete-package", auth(SAL_COMP.MNG), async (req, res) => {
  let conn;
  try {
    let { package_id } = req.body;
    const company_id = req.company?.id;
    const user_id = req.user?.id;
    package_id = parseInt(package_id);

    if (!company_id || isNaN(package_id) || package_id <= 0) return sendError(res, 400, "Valid company_id and package_id are required");

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[pkg]] = await conn.query(`SELECT id FROM salary_component_packages WHERE id = ? AND company_id = ? AND is_deleted = 0`, [package_id, company_id]);
    if (!pkg) {
      await conn.rollback();
      return sendError(res, 404, "Package not found or already deleted");
    }

    await conn.query(`UPDATE salary_component_packages SET is_deleted = 1, deleted_at = NOW(), deleted_by = ? WHERE id = ? AND company_id = ? AND is_deleted = 0`, [user_id || null, package_id, company_id]);
    await conn.query(`UPDATE salary_component_package_items SET is_deleted = 1, deleted_at = NOW(), deleted_by = ? WHERE package_id = ? AND is_deleted = 0`, [user_id || null, package_id]);
    await conn.commit();

    return sendSuccess(res, 200, "Salary package deleted successfully");
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Delete Package Error:", err);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// 9. Assign salary to employee
router.post("/assign-salary", auth(SAL.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    let { employee_id, base_amount, effective_from, effective_to, components = [] } = req.body;
    const company_id = req.company?.id;
    const user_id = req.user?.id;

    if (!company_id || !employee_id || !base_amount || !effective_from) return sendError(res, 400, "Required fields missing");
    employee_id = Number(employee_id);
    base_amount = Number(base_amount);
    if (!employee_id || isNaN(base_amount) || base_amount <= 0) return sendError(res, 400, "Invalid numeric values");
    if (!Array.isArray(components)) return sendError(res, 400, "components must be an array");

    const [[employee]] = await conn.query(
      `SELECT e.id, e.employee_code, u.name FROM employees e JOIN users u ON u.id = e.user_id WHERE e.id = ? AND e.company_id = ? AND e.is_deleted = 0 LIMIT 1`,
      [employee_id, company_id]
    );
    if (!employee) return sendError(res, 404, "Employee not found");

    if (!isValidDate(effective_from)) return sendError(res, 400, "Invalid effective_from");
    if (effective_to && !isValidDate(effective_to)) return sendError(res, 400, "Invalid effective_to");
    if (effective_to && isDateBefore(effective_to, effective_from)) return sendError(res, 400, "effective_to cannot be before effective_from");

    const fromMonth = parseDate(effective_from).format("YYYY-MM");
    const toMonth = effective_to ? parseDate(effective_to).format("YYYY-MM") : fromMonth;

    const [[overlapSalary]] = await conn.query(
      `SELECT id FROM salary_structures WHERE employee_id = ? AND company_id = ? AND is_deleted = 0
         AND DATE_FORMAT(effective_from, '%Y-%m') <= ? AND DATE_FORMAT(COALESCE(effective_to, effective_from), '%Y-%m') >= ? LIMIT 1`,
      [employee_id, company_id, toMonth, fromMonth]
    );
    if (overlapSalary) return sendError(res, 400, "Salary structure already exists in the selected period");

    // Component validation
    const componentIds = components.map(c => Number(c.component_id));
    if (componentIds.some(id => !id || isNaN(id))) return sendError(res, 400, "Invalid component_id found");
    if (new Set(componentIds).size !== componentIds.length) return sendError(res, 400, "Duplicate salary components are not allowed");

    if (components.length > 0) {
      const [validComponents] = await conn.query(`SELECT id, name, type FROM salary_components WHERE id IN (?) AND company_id = ? AND is_deleted = 0`, [componentIds, company_id]);
      if (validComponents.length !== components.length) return sendError(res, 400, "Some salary components are invalid or unavailable");

      const validCompIds = new Set(validComponents.map(c => Number(c.id)));
      for (const c of components) {
        const compId = Number(c.component_id);
        if (!validCompIds.has(compId)) return sendError(res, 400, `Invalid component_id: ${compId}`);
        if (!["fixed", "percentage"].includes(c.calc_type)) return sendError(res, 400, `Invalid calc_type for component ${compId}`);
        const calcVal = Number(c.calc_value);
        if (isNaN(calcVal) || calcVal < 0) return sendError(res, 400, `Invalid calc_value for component ${compId}`);
      }
    }

    const [salaryResult] = await conn.query(
      `INSERT INTO salary_structures (company_id, employee_id, base_amount, effective_from, effective_to, is_active, created_by) VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [company_id, employee_id, base_amount, effective_from, effective_to || null, user_id || null]
    );
    const salary_id = salaryResult.insertId;

    if (components.length) {
      const rows = components.map(c => [company_id, employee_id, salary_id, Number(c.component_id), c.calc_type, Number(c.calc_value), c.reason || null, 1, user_id || null]);
      await conn.query(`INSERT INTO employee_salary_component (company_id, employee_id, salary_id, component_id, calc_type, calc_value, remark, is_active, created_by) VALUES ?`, [rows]);
    }

    await conn.commit();

    return sendSuccess(res, 201, "Salary assigned successfully", {
      salary_id,
      employee: { id: employee.id, employee_code: employee.employee_code, name: employee.name },
      base_amount,
      effective_from,
      effective_to,
      components,
    });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Assign Salary Error:", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// 10. Update salary
router.put("/update-salary", auth(SAL.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = req.company?.id;
    const user_id = req.user?.id;
    const { salary_id, base_amount, effective_from, effective_to = null, components = [] } = req.body;
    if (!company_id || !user_id) return sendError(res, 400, "Invalid company or user");
    if (!salary_id) return sendError(res, 400, "salary_id is required");
    if (!Array.isArray(components) || components.length === 0) return sendError(res, 400, "Components are required");

    const [[salary]] = await conn.query(`SELECT * FROM salary_structures WHERE id = ? AND company_id = ? AND is_deleted = 0`, [salary_id, company_id]);
    if (!salary) return sendError(res, 404, "Salary not found");

    const salaryStatus = getSalaryStatus({ effective_from: salary.effective_from, effective_to: salary.effective_to });
    if (salaryStatus === "past") return sendError(res, 400, "Past salary cannot be edited");

    const [[usedInPayroll]] = await conn.query(`SELECT id FROM payroll_entries WHERE salary_id = ? AND is_deleted = 0 LIMIT 1`, [salary_id]);
    if (usedInPayroll) return sendError(res, 400, "Salary already used in payroll. Create a revision instead.");

    const employee_id = salary.employee_id;
    const [[employee]] = await conn.query(`SELECT id FROM employees WHERE id = ? AND company_id = ? AND is_active = 1 AND is_deleted = 0`, [employee_id, company_id]);
    if (!employee) return sendError(res, 404, "Employee not found");

    const amount = Number(base_amount);
    if (!Number.isFinite(amount) || amount <= 0) return sendError(res, 400, "Invalid base_amount");
    if (!effective_from || !isValidDate(effective_from)) return sendError(res, 400, "Invalid effective_from");
    if (effective_to && !isValidDate(effective_to)) return sendError(res, 400, "Invalid effective_to");
    if (effective_to && !isDateAfter(effective_to, effective_from)) return sendError(res, 400, "effective_to must be greater than effective_from");

    // component validation
    const dupCheck = new Set();
    for (const c of components) {
      const compId = Number(c.component_id);
      if (!compId || dupCheck.has(compId)) return sendError(res, 400, "Duplicate salary components are not allowed");
      dupCheck.add(compId);
      if (!["fixed", "percentage"].includes(c.calc_type)) return sendError(res, 400, `Invalid calc_type for component ${compId}`);
      const val = Number(c.calc_value);
      if (!Number.isFinite(val) || val < 0) return sendError(res, 400, `Invalid calc_value for component ${compId}`);
      if (c.calc_type === "percentage" && val > 100) return sendError(res, 400, "Percentage component cannot exceed 100");
    }

    const compIds = components.map(c => Number(c.component_id));
    const [validComponents] = await conn.query(`SELECT id FROM salary_components WHERE company_id = ? AND is_deleted = 0 AND id IN (?)`, [company_id, compIds]);
    if (validComponents.length !== compIds.length) return sendError(res, 400, "Invalid salary components");

    const [[overlap]] = await conn.query(
      `SELECT id FROM salary_structures WHERE employee_id = ? AND company_id = ? AND id <> ? AND is_deleted = 0 AND effective_from <= COALESCE(?, '9999-12-31') AND COALESCE(effective_to, '9999-12-31') >= ? LIMIT 1`,
      [employee_id, company_id, salary_id, effective_to, effective_from]
    );
    if (overlap) return sendError(res, 400, "Salary period overlaps with another salary structure");

    await conn.query(`UPDATE salary_structures SET base_amount = ?, effective_from = ?, effective_to = ?, updated_by = ? WHERE id = ?`, [amount, effective_from, effective_to, user_id, salary_id]);
    await conn.query(`DELETE FROM employee_salary_component WHERE salary_id = ?`, [salary_id]);

    const compRows = components.map(c => [company_id, employee_id, salary_id, c.component_id, c.calc_type, c.calc_value, c.remark || null, 1, user_id]);
    await conn.query(`INSERT INTO employee_salary_component (company_id, employee_id, salary_id, component_id, calc_type, calc_value, remark, is_active, created_by) VALUES ?`, [compRows]);

    await conn.commit();

    return sendSuccess(res, 200, "Salary updated successfully", {
      salary_id,
      employee_id,
      base_amount: Number(amount),
      effective_from,
      effective_to,
      components,
    });
  } catch (error) {
    if (conn) await conn.rollback();
    console.error("Update Salary Error:", error);
    return sendError(res, error.status || 500, error.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// 11. Revise salary
router.post("/revise-salary", auth(SAL.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = req.company?.id;
    const user_id = req.user?.id;
    let { employee_id, base_amount, components = [] } = req.body;

    if (!company_id || !employee_id || !base_amount) return sendError(res, 400, "Required fields missing");
    employee_id = Number(employee_id);
    base_amount = Number(base_amount);
    if (!employee_id || isNaN(base_amount) || base_amount <= 0) return sendError(res, 400, "Invalid values supplied");
    if (!Array.isArray(components) || components.length === 0) return sendError(res, 400, "Salary components are required");

    const [[employee]] = await conn.query(`SELECT id FROM employees WHERE id = ? AND company_id = ? AND is_deleted = 0`, [employee_id, company_id]);
    if (!employee) return sendError(res, 404, "Employee not found");

    const [[currentSalary]] = await conn.query(
      `SELECT * FROM salary_structures WHERE employee_id = ? AND company_id = ? AND is_deleted = 0 AND is_active = 1
         AND EXTRACT(YEAR_MONTH FROM effective_from) <= EXTRACT(YEAR_MONTH FROM CURDATE())
         AND (effective_to IS NULL OR EXTRACT(YEAR_MONTH FROM effective_to) >= EXTRACT(YEAR_MONTH FROM CURDATE()))
       ORDER BY effective_from DESC LIMIT 1`,
      [employee_id, company_id]
    );
    if (!currentSalary) return sendError(res, 400, "No salary assigned for the current month. Please assign salary first.");

    const compIds = [...new Set(components.map(c => Number(c.component_id)))];
    const [validComponents] = await conn.query(`SELECT id FROM salary_components WHERE company_id = ? AND is_deleted = 0 AND is_active = 1 AND id IN (?)`, [company_id, compIds]);
    if (validComponents.length !== compIds.length) return sendError(res, 400, "Invalid salary components supplied");

    const today = new Date();
    const effectiveFrom = formatDate(today);
    const prevEndDate = formatDate(addDays(today, -1));

    await conn.query(`UPDATE salary_structures SET effective_to = ?, is_active = 0, updated_by = ? WHERE id = ?`, [prevEndDate, user_id || null, currentSalary.id]);

    const [salaryInsert] = await conn.query(
      `INSERT INTO salary_structures (company_id, employee_id, base_amount, effective_from, effective_to, is_active, created_by) VALUES (?, ?, ?, ?, NULL, 1, ?)`,
      [company_id, employee_id, base_amount, effectiveFrom, user_id || null]
    );
    const newSalaryId = salaryInsert.insertId;

    const compRows = components.map(c => [company_id, employee_id, newSalaryId, Number(c.component_id), c.calc_type, Number(c.calc_value || 0), c.reason || null, 1, user_id || null]);
    await conn.query(`INSERT INTO employee_salary_component (company_id, employee_id, salary_id, component_id, calc_type, calc_value, remark, is_active, created_by) VALUES ?`, [compRows]);

    await conn.commit();

    return sendSuccess(res, 201, "Salary revised successfully");
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Salary Revision Error:", err);
    return sendError(res, err.status || 500, err.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// 12. Delete salary
router.delete("/delete-salary", auth(SAL.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = req.company?.id;
    const user_id = req.user?.id;
    const { salary_id } = req.body;

    if (!company_id || !user_id) return sendError(res, 400, "Invalid company or user");
    if (!salary_id) return sendError(res, 400, "salary_id is required");

    const [[salary]] = await conn.query(`SELECT * FROM salary_structures WHERE id = ? AND company_id = ? AND is_deleted = 0 FOR UPDATE`, [salary_id, company_id]);
    if (!salary) return sendError(res, 404, "Salary record not found");

    const [[payrollUsed]] = await conn.query(`SELECT id FROM payroll_entries WHERE salary_id = ? AND is_deleted = 0 LIMIT 1`, [salary_id]);
    if (payrollUsed) return sendError(res, 400, "Salary already used in payroll. Cannot delete.");

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
    await conn.query(`UPDATE salary_structures SET is_deleted = 1, deleted_at = NOW(), deleted_by = ?, is_active = 0 WHERE id = ?`, [user_id, salary_id]);

    if (prevSalary && nextSalary) {
      await conn.query(`UPDATE salary_structures SET effective_to = DATE_SUB(?, INTERVAL 1 DAY), updated_by = ? WHERE id = ?`, [nextSalary.effective_from, user_id, prevSalary.id]);
    } else if (prevSalary && !nextSalary) {
      await conn.query(`UPDATE salary_structures SET effective_to = NULL, updated_by = ? WHERE id = ?`, [user_id, prevSalary.id]);
    }

    // Re-activate the correct current salary
    await conn.query(`UPDATE salary_structures SET is_active = 0 WHERE employee_id = ? AND company_id = ? AND is_deleted = 0`, [employee_id, company_id]);
    const [[currentSalary]] = await conn.query(
      `SELECT id FROM salary_structures WHERE employee_id = ? AND company_id = ? AND is_deleted = 0 AND CURDATE() >= effective_from AND (effective_to IS NULL OR CURDATE() <= effective_to) ORDER BY effective_from DESC LIMIT 1`,
      [employee_id, company_id]
    );
    if (currentSalary) {
      await conn.query(`UPDATE salary_structures SET is_active = 1, updated_by = ? WHERE id = ?`, [user_id, currentSalary.id]);
    }

    await conn.commit();
    return sendSuccess(res, 200, "Salary deleted successfully");
  } catch (error) {
    if (conn) await conn.rollback();
    console.error("Delete Salary Error:", error);
    return sendError(res, error.status || 500, error.message || "Something went wrong while deleting salary");
  } finally {
    if (conn) conn.release();
  }
});

// 13. List all employees salaries
router.get("/employees-salaries", auth(SAL.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const company_id = req.company?.id;
    if (!company_id) return sendError(res, 400, "Invalid company");

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
    }

    const activeCondition = dateCondition ? "" : "AND ss.is_active = 1";

    let query = `
      SELECT e.id AS employee_id, e.employee_code, u.name, u.email, u.profile_picture,
             ss.id AS salary_id, ss.base_amount, ss.effective_from, ss.effective_to,
             CASE WHEN pe_used.salary_id IS NOT NULL THEN TRUE ELSE FALSE END AS payroll_used
      FROM employees e
      JOIN users u ON u.id = e.user_id
      INNER JOIN salary_structures ss ON ss.employee_id = e.id AND ss.company_id = e.company_id AND ss.is_deleted = 0 ${activeCondition} ${dateCondition}
      LEFT JOIN (SELECT DISTINCT salary_id FROM payroll_entries WHERE is_deleted = 0) pe_used ON pe_used.salary_id = ss.id
      WHERE e.company_id = ? AND e.is_deleted = 0 AND e.is_active = 1
    `;
    const params = [...dateParams, company_id];

    if (search) {
      query += ` AND (u.name LIKE ? OR u.email LIKE ? OR e.employee_code LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    query += ` ORDER BY u.name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await conn.query(query, params);
    if (!rows.length) return sendSuccess(res, 200, "No salaries found", [], buildMeta(page, limit, 0, 0));

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

    let countQuery = `
      SELECT COUNT(*) AS total
      FROM employees e
      JOIN users u ON u.id = e.user_id
      INNER JOIN salary_structures ss ON ss.employee_id = e.id AND ss.company_id = e.company_id AND ss.is_deleted = 0 ${activeCondition} ${dateCondition}
      WHERE e.company_id = ? AND e.is_deleted = 0 AND e.is_active = 1
    `;
    const countParams = [...dateParams, company_id];
    if (search) {
      countQuery += ` AND (u.name LIKE ? OR u.email LIKE ? OR e.employee_code LIKE ?)`;
      const s = `%${search}%`;
      countParams.push(s, s, s);
    }

    const [[{ total }]] = await conn.query(countQuery, countParams);

    return sendSuccess(res, 200, "Employee salaries fetched successfully", results, buildMeta(page, limit, total, results.length));
  } catch (error) {
    console.error("Employees Salary Error:", error);
    return sendError(res, 500, "Something went wrong while fetching employee salaries");
  } finally {
    if (conn) conn.release();
  }
});

// 14. Employee salary history
router.get("/employee-salary-history", auth(SAL.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const company_id = req.company?.id;
    const employee_id = Number(req.query.employee_id);

    if (!company_id || !employee_id) return sendError(res, 400, "Invalid company or employee");

    const [rows] = await conn.query(
      `SELECT ss.id AS salary_id, ss.base_amount, ss.effective_from, ss.effective_to, 'past' AS status
       FROM salary_structures ss
       WHERE ss.employee_id = ? AND ss.company_id = ? AND ss.is_deleted = 0 AND (ss.effective_to IS NOT NULL AND ss.effective_to < CURDATE())
       ORDER BY ss.effective_from DESC`,
      [employee_id, company_id]
    );

    if (!rows.length) return sendSuccess(res, 200, "No salary history found", []);

    const salaryIds = rows.map(r => r.salary_id);
    const [components] = await conn.query(
      `SELECT esc.salary_id, c.name, c.code, c.type, esc.calc_type, esc.calc_value
       FROM employee_salary_component esc
       JOIN salary_components c ON c.id = esc.component_id
       WHERE esc.salary_id IN (?) AND esc.company_id = ? AND esc.is_deleted = 0`,
      [salaryIds, company_id]
    );

    const compMap = {};
    components.forEach(c => {
      if (!compMap[c.salary_id]) compMap[c.salary_id] = [];
      compMap[c.salary_id].push(c);
    });

    const result = rows.map(r => ({
      salary_id: r.salary_id,
      base_amount: Number(r.base_amount),
      effective_from: r.effective_from,
      effective_to: r.effective_to,
      status: r.status,
      components: compMap[r.salary_id] || [],
    }));

    return sendSuccess(res, 200, "Salary history fetched successfully", result);
  } catch (err) {
    console.error("Salary History Error:", err);
    return sendError(res, 500, "Something went wrong");
  } finally {
    if (conn) conn.release();
  }
});

// 15. My salary (employee view)
router.get("/my-salary", auth(SAL.EMP), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const company_id = req.company?.id;
    const user_id = req.user?.id;

    if (!company_id || !user_id) return sendError(res, 401, "Unauthorized access");

    let month = new Date().getMonth() + 1;
    let year = new Date().getFullYear();

    if (req.query.month !== undefined) {
      const parsedMonth = Number(req.query.month);
      if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) return sendError(res, 400, "Invalid month. Must be between 1-12");
      month = parsedMonth;
    }
    if (req.query.year !== undefined) {
      const parsedYear = Number(req.query.year);
      if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) return sendError(res, 400, "Invalid year. Must be between 2000-2100");
      year = parsedYear;
    }

    const targetDate = `${year}-${String(month).padStart(2, "0")}-01`;

    const [[employee]] = await conn.query(
      `SELECT e.id AS employee_id FROM employees e WHERE e.user_id = ? AND e.company_id = ? AND e.is_deleted = 0 AND e.is_active = 1 LIMIT 1`,
      [user_id, company_id]
    );
    if (!employee) return sendError(res, 404, "Employee not found");
    const employee_id = employee.employee_id;

    const [[salaryStructure]] = await conn.query(
      `SELECT ss.id, ss.base_amount, ss.effective_from, ss.effective_to, ss.created_at
       FROM salary_structures ss
       WHERE ss.company_id = ? AND ss.employee_id = ? AND ss.is_deleted = 0 AND ss.is_active = 1
         AND ss.effective_from <= LAST_DAY(?) AND (ss.effective_to IS NULL OR ss.effective_to >= ?)
       ORDER BY ss.effective_from DESC, ss.id DESC LIMIT 1`,
      [company_id, employee_id, targetDate, targetDate]
    );
    if (!salaryStructure) return sendError(res, 404, "Salary structure not found");

    const [components] = await conn.query(
      `SELECT esc.id, sc.id AS component_id, sc.code, sc.name, sc.type, sc.is_taxable, sc.is_statutory, esc.calc_type, esc.calc_value, esc.remark,
              CASE WHEN esc.calc_type = 'fixed' THEN esc.calc_value WHEN esc.calc_type = 'percentage' THEN ROUND((ss.base_amount * esc.calc_value) / 100, 2) ELSE 0 END AS amount
       FROM employee_salary_component esc
       INNER JOIN salary_components sc ON sc.id = esc.component_id AND sc.is_deleted = 0 AND sc.is_active = 1
       INNER JOIN salary_structures ss ON ss.id = esc.salary_id AND ss.is_deleted = 0 AND ss.is_active = 1
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
  } catch (error) {
    console.error("❌ Salary Structure API Error:", error);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

export default router;
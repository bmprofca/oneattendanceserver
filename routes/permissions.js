import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import { buildFileUrl } from "../utils/fileService.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { NODE_ENV } from "../config/config.js";
import {
    sendSuccess, sendError, safeNumber, buildMeta,
    parseJSONSafe, sanitizeText
} from "../utils/sendResponse.js";
import { generateRandomToken } from "../utils/auth.js";

const formatPermission = (row) => ({
    id: row.id,
    code: row.code,
    description: row.description || "",
    action: row.action,
    category: row.category,
});

const formatPackage = (pkg, permissions = [], usedBy = []) => ({
    id: pkg.id,
    company_id: pkg.company_id,
    package_name: pkg.package_name,
    group_code: pkg.group_code,
    description: pkg.description,
    is_active: !!pkg.is_active,
    created_at: pkg.created_at,
    created_by: pkg.created_by,
    updated_at: pkg.updated_at,
    updated_by: pkg.updated_by,
    permissions,
    total_used: usedBy.length,
    used_by: usedBy,
});

export const PERMISSION_QUERIES = {
    LIST_ALL: `
    SELECT id, code, description, action, category
    FROM permissions
    ORDER BY id ASC
  `,

    CHECK_EXISTING_BY_NAME: `
    SELECT id
    FROM permission_packages
    WHERE package_name = ? AND company_id = ? AND is_deleted = 0
    LIMIT 1
  `,

    CHECK_GROUP_CODE_UNIQUE: `
    SELECT id FROM permission_packages
    WHERE group_code = ? AND company_id = ? AND is_deleted = 0
    LIMIT 1
  `,

    VALIDATE_PERMISSIONS: `
    SELECT id FROM permissions WHERE id IN (?)
  `,

    INSERT_PACKAGE: `
    INSERT INTO permission_packages
    (company_id, package_name, group_code, description, created_at, created_by, is_active)
    VALUES (?, ?, ?, ?, NOW(), ?, 1)
  `,

    INSERT_PACKAGE_ITEMS: `
    INSERT INTO permission_package_items
    (package_id, permission_id, is_active, created_at, created_by, updated_at, updated_by)
    VALUES ?
  `,

    COUNT_PACKAGES: `
    SELECT COUNT(*) AS total
    FROM permission_packages
    WHERE company_id = ?
      AND is_active = 1
      AND is_deleted = 0
      AND (? = '' OR package_name LIKE ? OR group_code LIKE ?)
  `,

    SELECT_PACKAGES: `
    SELECT 
      id, company_id, package_name, group_code, description,
      is_active, created_at, created_by, updated_at, updated_by
    FROM permission_packages
    WHERE company_id = ?
      AND is_active = 1
      AND is_deleted = 0
      AND (? = '' OR package_name LIKE ? OR group_code LIKE ?)
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `,

    SELECT_PACKAGE_BY_ID: `
    SELECT id FROM permission_packages
    WHERE id = ? AND company_id = ? AND is_deleted = 0
    LIMIT 1
  `,

    SELECT_PERMISSION_ITEMS_BY_PACKAGE_IDS: packageIds => `
    SELECT 
      ppi.package_id,
      p.id   AS permission_id,
      p.description AS permission_description,
      p.code AS permission_code,
      p.action AS permission_action,
      p.category AS permission_category
    FROM permission_package_items ppi
    JOIN permissions p ON p.id = ppi.permission_id
    WHERE ppi.package_id IN (${packageIds.map(() => '?').join(',')})
      AND ppi.is_deleted = 0
      AND ppi.is_active = 1
  `,

    SELECT_EMPLOYEES_BY_PACKAGE_IDS: packageIds => `
    SELECT
      e.permission_package_id AS package_id,
      e.id                    AS employee_id,
      u.name                  AS employee_name,
      u.email                 AS employee_email,
      u.profile_picture       AS employee_profile_picture,
      e.employee_code,
      e.designation
    FROM employees e
    JOIN users u ON u.id = e.user_id
    WHERE e.permission_package_id IN (${packageIds.map(() => '?').join(',')})
      AND e.company_id  = ?
      AND e.is_deleted  = 0
      AND e.is_active   = 1
      AND u.is_deleted  = 0
      AND u.is_active   = 1
    ORDER BY u.name ASC
  `,

    CHECK_DUPLICATE_NAME_EXCLUDING_ID: `
    SELECT id FROM permission_packages
    WHERE package_name = ? AND company_id = ? AND id != ? AND is_deleted = 0
    LIMIT 1
  `,

    UPDATE_PACKAGE: `
    UPDATE permission_packages
    SET package_name = ?, group_code = ?, description = ?, updated_at = NOW(), updated_by = ?
    WHERE id = ? AND company_id = ?
  `,

    SELECT_PACKAGE_DETAILS_BY_ID: `
    SELECT 
      id, company_id, package_name, group_code, description,
      is_active, created_at, created_by, updated_at, updated_by
    FROM permission_packages
    WHERE id = ? AND is_deleted = 0
  `,

    SELECT_ACTIVE_PERMISSION_MAPPINGS: `
    SELECT 
      ppi.id AS mapping_id,
      p.id AS permission_id,
      p.description AS permission_description,
      p.code AS permission_code,
      p.action AS permission_action
    FROM permission_package_items ppi
    JOIN permissions p ON p.id = ppi.permission_id
    WHERE ppi.package_id = ?
      AND ppi.is_deleted = 0
      AND ppi.is_active = 1
  `,

    SELECT_EXISTING_ITEMS: `
    SELECT id, permission_id, is_active
    FROM permission_package_items
    WHERE package_id = ? AND is_deleted = 0
  `,

    INSERT_OR_UPDATE_ITEMS: `
    INSERT INTO permission_package_items
    (package_id, permission_id, is_active, created_at, created_by, updated_at, updated_by)
    VALUES ?
  `,

    REACTIVATE_ITEMS: `
    UPDATE permission_package_items
    SET is_active = 1, updated_at = NOW(), updated_by = ?
    WHERE id IN (?)
  `,

    DEACTIVATE_ITEMS: `
    UPDATE permission_package_items
    SET is_active = 0, updated_at = NOW(), updated_by = ?
    WHERE id IN (?)
  `,

    SOFT_DELETE_PACKAGE: `
    UPDATE permission_packages
    SET is_deleted = 1, is_active = 0, deleted_at = NOW(), deleted_by = ?
    WHERE id = ? AND company_id = ?
  `,

    SOFT_DELETE_PACKAGE_ITEMS: `
    UPDATE permission_package_items
    SET is_deleted = 1, is_active = 0, deleted_at = NOW(), deleted_by = ?
    WHERE package_id = ?
  `,

    CHECK_EMPLOYEE_USAGE: `
    SELECT COUNT(*) AS count
    FROM employees
    WHERE permission_package_id = ? AND company_id = ? AND is_deleted = 0
  `,

    SELECT_EMPLOYEES_FOR_UPDATE: employeeIds => `
    SELECT id, permission_package_id
    FROM employees
    WHERE company_id = ?
      AND is_deleted = 0
      AND is_active = 1
      AND id IN (${employeeIds.map(() => '?').join(',')})
    FOR UPDATE
  `,

    VALIDATE_PACKAGES: packageIds => `
    SELECT id, package_name
    FROM permission_packages
    WHERE company_id = ?
      AND is_deleted = 0
      AND is_active = 1
      AND id IN (${packageIds.map(() => '?').join(',')})
  `,

    UPDATE_EMPLOYEE_PACKAGE: employeeIds => `
    UPDATE employees
    SET permission_package_id = ?, updated_at = NOW(), updated_by = ?
    WHERE company_id = ?
      AND id IN (${employeeIds.map(() => '?').join(',')})
  `,

    SELECT_UPDATED_EMPLOYEES: employeeIds => `
    SELECT
      e.id AS employee_id,
      e.employee_code,
      e.designation,
      e.permission_package_id,
      pp.package_name,
      u.name,
      u.email,
      e.updated_at
    FROM employees e
    INNER JOIN users u ON u.id = e.user_id
    INNER JOIN permission_packages pp ON pp.id = e.permission_package_id
    WHERE e.id IN (${employeeIds.map(() => '?').join(',')})
  `
};

const router = express.Router();

router.get("/list", auth(), async (req, res) => {
    let conn;
    try {
        conn = await db.getConnection();
        const [rows] = await conn.query(PERMISSION_QUERIES.LIST_ALL);

        const permissions = rows.map(formatPermission);

        return sendSuccess(res, 200, "Permissions fetched successfully", permissions);
    } catch (error) {
        console.error("Permission list error:", { message: error.message, stack: error.stack });
        return sendError(res, 500, "Failed to fetch permissions",
            NODE_ENV === "development" ? error.message : undefined);
    } finally {
        if (conn) conn.release();
    }
});

router.post("/create-package", auth([PERMISSIONS.PERMISSIONS]), async (req, res) => {
    let conn;
    try {
        conn = await db.getConnection();
        let { package_name, permissions, group_code, description } = req.body;
        const companyId = req.company?.id;
        const createdBy = req.user?.id;

        package_name = package_name?.trim();
        description = description?.trim() || null;

        if (!companyId) return sendError(res, 400, "Company not found");
        if (!createdBy) return sendError(res, 400, "User not authenticated");
        if (!package_name) return sendError(res, 400, "Valid package_name is required");
        if (!Array.isArray(permissions) || permissions.length === 0)
            return sendError(res, 400, "permissions array is required");

        const uniquePermissions = [...new Set(permissions.map(Number))];
        await conn.beginTransaction();

        const [existing] = await conn.query(PERMISSION_QUERIES.CHECK_EXISTING_BY_NAME, [package_name, companyId]);
        if (existing.length) {
            await conn.rollback();
            return sendError(res, 400, "Package name already exists");
        }

        if (group_code) {
            group_code = group_code.trim();
            const [dupGroup] = await conn.query(PERMISSION_QUERIES.CHECK_GROUP_CODE_UNIQUE, [group_code, companyId]);
            if (dupGroup.length) {
                await conn.rollback();
                return sendError(res, 400, "Group code already exists");
            }
        } else {
            let unique = false;
            let attempts = 0;
            while (!unique && attempts < 10) {
                const candidate = generateRandomToken({ size: 3, encoding: "hex", uppercase: true });
                const [dup] = await conn.query(PERMISSION_QUERIES.CHECK_GROUP_CODE_UNIQUE, [candidate, companyId]);
                if (dup.length === 0) {
                    group_code = candidate;
                    unique = true;
                }
                attempts++;
            }
            if (!unique) {
                await conn.rollback();
                return sendError(res, 400, "Unable to generate unique group code after 10 attempts. Please try again or provide one manually.");
            }
        }

        const [validPermissions] = await conn.query(PERMISSION_QUERIES.VALIDATE_PERMISSIONS, [uniquePermissions]);
        if (validPermissions.length !== uniquePermissions.length) {
            await conn.rollback();
            return sendError(res, 400, "Some permissions are invalid");
        }

        const [packageResult] = await conn.query(PERMISSION_QUERIES.INSERT_PACKAGE,
            [companyId, package_name, group_code, description, createdBy]);
        const packageId = packageResult.insertId;

        const values = uniquePermissions.map(permId => [
            packageId, permId, 1, new Date(), createdBy, new Date(), createdBy
        ]);
        await conn.query(PERMISSION_QUERIES.INSERT_PACKAGE_ITEMS, [values]);

        await conn.commit();
        return sendSuccess(res, 201, "Permission package created successfully", { package_id: packageId });

    } catch (error) {
        if (conn) try { await conn.rollback(); } catch { }
        console.error("Error creating package:", { message: error.message, stack: error.stack });
        return sendError(res, 500, "Failed to create package",
            NODE_ENV === "development" ? error.message : undefined);
    } finally {
        if (conn) conn.release();
    }
});

router.get("/permission-packages", auth(), async (req, res) => {
    let conn;
    try {
        conn = await db.getConnection();
        let { search = "", page = 1, limit = 10 } = req.query;
        const companyId = req.company?.id;
        if (!companyId) return sendError(res, 400, "Company ID is missing in request");

        page = Number(page); limit = Number(limit);
        if (isNaN(page) || page < 1) page = 1;
        if (isNaN(limit) || limit < 1) limit = 10;
        if (limit > 100) limit = 100;

        const offset = (page - 1) * limit;
        search = search.trim();
        const searchQuery = `%${search}%`;

        const [countResult] = await conn.query(PERMISSION_QUERIES.COUNT_PACKAGES,
            [companyId, search, searchQuery, searchQuery]);
        const total = countResult?.[0]?.total || 0;

        const [packages] = await conn.query(PERMISSION_QUERIES.SELECT_PACKAGES,
            [companyId, search, searchQuery, searchQuery, limit, offset]);

        if (!packages.length) {
            const meta = buildMeta(page, limit, total, 0);
            return sendSuccess(res, 200, "No permission packages found", { packages: [], meta });
        }

        const packageIds = packages.map(p => p.id);
        const [permissionRows] = await conn.query(
            PERMISSION_QUERIES.SELECT_PERMISSION_ITEMS_BY_PACKAGE_IDS(packageIds), packageIds);
        const [employeeRows] = await conn.query(
            PERMISSION_QUERIES.SELECT_EMPLOYEES_BY_PACKAGE_IDS(packageIds), [...packageIds, companyId]);

        const permissionsMap = permissionRows.reduce((acc, item) => {
            if (!acc[item.package_id]) acc[item.package_id] = [];
            acc[item.package_id].push({
                id: item.permission_id,
                name: item.permission_name,
                code: item.permission_code,
                action: item.permission_action,
                category: item.permission_category
            });
            return acc;
        }, {});

        const employeesMap = employeeRows.reduce((acc, item) => {
            if (!acc[item.package_id]) acc[item.package_id] = [];
            acc[item.package_id].push({
                employee_id: item.employee_id,
                name: item.employee_name,
                email: item.employee_email,
                profile_picture: buildFileUrl(item.employee_profile_picture),
                employee_code: item.employee_code,
                designation: item.designation
            });
            return acc;
        }, {});

        const formattedPackages = packages.map(pkg =>
            formatPackage(pkg, permissionsMap[pkg.id] || [], employeesMap[pkg.id] || [])
        );

        const meta = buildMeta(page, limit, total, formattedPackages.length);
        return sendSuccess(res, 200, "Permission packages fetched successfully", {
            packages: formattedPackages,
            meta
        });

    } catch (error) {
        return sendError(res, 500, "Internal server error while fetching permission packages",
            NODE_ENV === "development" ? error.message : undefined);
    } finally {
        if (conn) conn.release();
    }
});

router.put("/update-package", auth([PERMISSIONS.PERMISSIONS]), async (req, res) => {
    let conn;
    try {
        conn = await db.getConnection();
        let { id: packageId, package_name, permissions, group_code, description } = req.body;
        const companyId = req.company?.id;
        const updatedBy = req.user?.id;

        if (!companyId) return sendError(res, 400, "Company not found");
        if (!updatedBy) return sendError(res, 400, "User not authenticated");
        if (!packageId || !package_name || !Array.isArray(permissions))
            return sendError(res, 400, "id, package_name, and permissions are required");

        package_name = package_name.trim();
        group_code = group_code?.trim() || null;
        description = description?.trim() || null;
        const uniquePermissions = [...new Set(permissions.map(Number))];

        await conn.beginTransaction();

        const [pkg] = await conn.query(PERMISSION_QUERIES.SELECT_PACKAGE_BY_ID, [packageId, companyId]);
        if (!pkg.length) {
            await conn.rollback();
            return sendError(res, 404, "Package not found or deleted");
        }

        const [duplicate] = await conn.query(PERMISSION_QUERIES.CHECK_DUPLICATE_NAME_EXCLUDING_ID,
            [package_name, companyId, packageId]);
        if (duplicate.length) {
            await conn.rollback();
            return sendError(res, 400, "Package name already exists");
        }

        const [validPermissions] = await conn.query(PERMISSION_QUERIES.VALIDATE_PERMISSIONS, [uniquePermissions]);
        if (validPermissions.length !== uniquePermissions.length) {
            await conn.rollback();
            return sendError(res, 400, "Some permissions are invalid");
        }

        await conn.query(PERMISSION_QUERIES.UPDATE_PACKAGE,
            [package_name, group_code, description, updatedBy, packageId, companyId]);

        const [existingItems] = await conn.query(PERMISSION_QUERIES.SELECT_EXISTING_ITEMS, [packageId]);
        const existingMap = {};
        existingItems.forEach(item => { existingMap[item.permission_id] = item; });

        const toInsert = [], toReactivate = [], toDeactivate = [];
        for (const permId of uniquePermissions) {
            if (existingMap[permId]) {
                if (existingMap[permId].is_active === 0) toReactivate.push(existingMap[permId].id);
            } else {
                toInsert.push([packageId, permId, 1, new Date(), updatedBy, new Date(), updatedBy]);
            }
        }
        existingItems.forEach(item => {
            if (!uniquePermissions.includes(item.permission_id) && item.is_active === 1)
                toDeactivate.push(item.id);
        });

        if (toInsert.length) await conn.query(PERMISSION_QUERIES.INSERT_OR_UPDATE_ITEMS, [toInsert]);
        if (toReactivate.length) await conn.query(PERMISSION_QUERIES.REACTIVATE_ITEMS, [updatedBy, toReactivate]);
        if (toDeactivate.length) await conn.query(PERMISSION_QUERIES.DEACTIVATE_ITEMS, [updatedBy, toDeactivate]);

        await conn.commit();

        const [packageDetails] = await conn.query(PERMISSION_QUERIES.SELECT_PACKAGE_DETAILS_BY_ID, [packageId]);
        const [packagePermissions] = await conn.query(PERMISSION_QUERIES.SELECT_ACTIVE_PERMISSION_MAPPINGS, [packageId]);

        return sendSuccess(res, 200, "Permission package updated successfully", {
            package: packageDetails[0],
            permissions: packagePermissions
        });

    } catch (error) {
        if (conn) try { await conn.rollback(); } catch { }
        console.error("Error updating package:", { message: error.message, stack: error.stack });
        return sendError(res, 500, "Failed to update package",
            NODE_ENV === "development" ? error.message : undefined);
    } finally {
        if (conn) conn.release();
    }
});

router.delete('/delete-package', auth([PERMISSIONS.PERMISSIONS]), async (req, res) => {
    let conn;
    try {
        const { packageId } = req.body;
        const userId = req.user?.id;
        const companyId = req.company?.id;

        if (!packageId) return sendError(res, 400, 'packageId is required');
        if (!userId || !companyId) return sendError(res, 400, 'User and company information are required');

        conn = await db.getConnection();
        await conn.beginTransaction();

        const [[pkg]] = await conn.query(PERMISSION_QUERIES.SELECT_PACKAGE_BY_ID, [packageId, companyId]);
        if (!pkg) {
            await conn.rollback();
            return sendError(res, 404, 'Permission package not found or already deleted');
        }

        const [[employeeUsage]] = await conn.query(PERMISSION_QUERIES.CHECK_EMPLOYEE_USAGE, [packageId, companyId]);
        if (employeeUsage.count > 0) {
            await conn.rollback();
            return sendError(res, 400, `Cannot delete package. It is assigned to ${employeeUsage.count} employee(s)`);
        }

        await conn.query(PERMISSION_QUERIES.SOFT_DELETE_PACKAGE, [userId, packageId, companyId]);
        await conn.query(PERMISSION_QUERIES.SOFT_DELETE_PACKAGE_ITEMS, [userId, packageId]);

        await conn.commit();
        return sendSuccess(res, 200, 'Permission package deleted successfully');

    } catch (error) {
        if (conn) try { await conn.rollback(); } catch { }
        console.error('Delete package error:', { message: error.message, stack: error.stack });
        return sendError(res, 500, 'Internal server error');
    } finally {
        if (conn) conn.release();
    }
});

router.put("/transfer-packages", auth([PERMISSIONS.PERMISSIONS]), async (req, res) => {
    let conn;
    try {
        const assignments = Array.isArray(req.body?.assignments) ? req.body.assignments : [];
        const user_id = Number(req.user?.id);
        const company_id = Number(req.company?.id);

        if (assignments.length === 0) return sendError(res, 400, "assignments must be a non-empty array");

        const validationErrors = [];
        const normalizedAssignments = [];
        for (let i = 0; i < assignments.length; i++) {
            const item = assignments[i];
            const employee_id = Number(item?.employee_id);
            const package_id = Number(item?.package_id);

            if (!Number.isInteger(employee_id) || employee_id <= 0) {
                validationErrors.push({
                    index: i, field: "employee_id", value: item?.employee_id,
                    message: "employee_id must be a positive integer"
                });
            }
            if (!Number.isInteger(package_id) || package_id <= 0) {
                validationErrors.push({
                    index: i, field: "package_id", value: item?.package_id,
                    message: "package_id must be a positive integer"
                });
            }
            normalizedAssignments.push({ employee_id, package_id });
        }

        if (validationErrors.length > 0) return sendError(res, 400, "Validation failed", validationErrors);

        const assignmentMap = new Map();
        normalizedAssignments.forEach(item => assignmentMap.set(item.employee_id, item.package_id));
        const uniqueAssignments = Array.from(assignmentMap.entries()).map(([employee_id, package_id]) => ({
            employee_id, package_id
        }));

        const employeeIds = uniqueAssignments.map(item => item.employee_id);
        const packageIds = [...new Set(uniqueAssignments.map(item => item.package_id))];

        conn = await db.getConnection();
        await conn.beginTransaction();

        const [employeeRows] = await conn.query(
            PERMISSION_QUERIES.SELECT_EMPLOYEES_FOR_UPDATE(employeeIds), [company_id, ...employeeIds]);
        if (employeeRows.length !== employeeIds.length) {
            const foundIds = employeeRows.map(item => item.id);
            const invalidEmployeeIds = employeeIds.filter(id => !foundIds.includes(id));
            await conn.rollback();
            return sendError(res, 400, "Some employees are invalid, inactive, or deleted", null,
                { invalid_employee_ids: invalidEmployeeIds });
        }

        const [packageRows] = await conn.query(
            PERMISSION_QUERIES.VALIDATE_PACKAGES(packageIds), [company_id, ...packageIds]);
        if (packageRows.length !== packageIds.length) {
            const validPackageIds = packageRows.map(item => item.id);
            const invalidPackageIds = packageIds.filter(id => !validPackageIds.includes(id));
            await conn.rollback();
            return sendError(res, 400, "Some permission packages are invalid or inactive", null,
                { invalid_package_ids: invalidPackageIds });
        }

        const currentPackageMap = new Map();
        employeeRows.forEach(emp => currentPackageMap.set(emp.id, emp.permission_package_id));

        const skippedEmployees = [], updateAssignments = [];
        for (const item of uniqueAssignments) {
            const currentPackageId = currentPackageMap.get(item.employee_id);
            if (currentPackageId === item.package_id) {
                skippedEmployees.push({
                    employee_id: item.employee_id, package_id: item.package_id,
                    reason: "Already assigned"
                });
            } else {
                updateAssignments.push(item);
            }
        }

        if (updateAssignments.length === 0) {
            await conn.rollback();
            return sendError(res, 400, "All employees are already assigned to requested packages", null,
                { skipped_employees: skippedEmployees });
        }

        const groupedAssignments = new Map();
        for (const item of updateAssignments) {
            if (!groupedAssignments.has(item.package_id)) groupedAssignments.set(item.package_id, []);
            groupedAssignments.get(item.package_id).push(item.employee_id);
        }

        for (const [package_id, empIds] of groupedAssignments) {
            await conn.query(PERMISSION_QUERIES.UPDATE_EMPLOYEE_PACKAGE(empIds),
                [package_id, user_id, company_id, ...empIds]);
        }

        const updatedEmployeeIds = updateAssignments.map(item => item.employee_id);
        const [updatedEmployees] = await conn.query(
            PERMISSION_QUERIES.SELECT_UPDATED_EMPLOYEES(updatedEmployeeIds), updatedEmployeeIds);

        await conn.commit();
        return sendSuccess(res, 200, "Permission packages assigned successfully", {
            total_requested: uniqueAssignments.length,
            updated_count: updateAssignments.length,
            skipped_count: skippedEmployees.length,
            skipped_employees: skippedEmployees,
            employees: updatedEmployees
        });

    } catch (error) {
        if (conn) try { await conn.rollback(); } catch { }
        console.error("Assign package error:", { message: error.message, stack: error.stack });
        if (error.code === "ER_LOCK_DEADLOCK") return sendError(res, 409, "Database deadlock occurred. Please retry.");
        if (error.code === "ER_LOCK_WAIT_TIMEOUT") return sendError(res, 409, "Database lock timeout occurred. Please retry.");
        return sendError(res, 500, "Internal server error",
            NODE_ENV === "development" ? error.message : undefined);
    } finally {
        if (conn) conn.release();
    }
});

router.get("/employee-package/:employeeId", auth(), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const companyId = safeNumber(req.company?.id, 0);
    const employeeId = safeNumber(req.params.employeeId, 0);

    if (!companyId || !employeeId) {
      return sendError(res, 400, "Invalid company context or employee ID");
    }

    // Directly get the permission_package_id for this employee
    const [empRows] = await conn.query(
      `SELECT permission_package_id
       FROM employees
       WHERE id = ? AND company_id = ? AND is_deleted = 0 AND is_active = 1
       LIMIT 1`,
      [employeeId, companyId]
    );

    if (!empRows.length) {
      return sendError(res, 404, "Employee not found or inactive");
    }

    const packageId = empRows[0].permission_package_id;

    // Rest of the code remains the same...
    const [pkgRows] = await conn.query(
      `SELECT id, package_name, group_code, description, is_active
       FROM permission_packages
       WHERE id = ? AND company_id = ? AND is_deleted = 0
       LIMIT 1`,
      [packageId, companyId]
    );

    if (!pkgRows.length) {
      return sendError(res, 404, "Permission package not found");
    }

    const pkg = pkgRows[0];

    const [permissionRows] = await conn.query(
      `SELECT p.id, p.code, p.description, p.action, p.category
       FROM permission_package_items ppi
       JOIN permissions p ON p.id = ppi.permission_id
       WHERE ppi.package_id = ? AND ppi.is_deleted = 0 AND ppi.is_active = 1
       ORDER BY p.id ASC`,
      [packageId]
    );

    const permissions = permissionRows.map(formatPermission);

    return sendSuccess(res, 200, "Employee permission package fetched successfully", {
      package: {
        id: pkg.id,
        package_name: pkg.package_name,
        group_code: pkg.group_code,
        description: pkg.description,
        is_active: !!pkg.is_active,
      },
      permissions,
    });
  } catch (error) {
    console.error("Employee package error:", { message: error.message, stack: error.stack });
    return sendError(
      res,
      500,
      "Failed to fetch employee package",
      NODE_ENV === "development" ? error.message : undefined
    );
  } finally {
    if (conn) conn.release();
  }
});


export default router;
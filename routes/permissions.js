import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import { buildFileUrl } from "../utils/fileService.js";
import { PERM_PKG } from "../constants/permissions.js";
import { NODE_ENV } from "../config/config.js";

const router = express.Router();


router.get("/list", auth(), async (req, res) => {
    let conn;

    try {
        conn = await db.getConnection();

        const [rows] = await conn.query(`
            SELECT 
                id,
                code,
                name,
                action,
                category
            FROM permissions
            ORDER BY id ASC
        `);

        return res.status(200).json({
            success: true,
            message: "Permissions fetched successfully",
            data: rows
        });

    } catch (error) {

        console.error("Permission list error:", {
            message: error.message,
            stack: error.stack
        });

        return res.status(500).json({
            success: false,
            message: "Failed to fetch permissions",
            error: NODE_ENV === "development" ? error.message : undefined
        });

    } finally {
        if (conn) conn.release();
    }
});

router.post("/create-package", auth(PERM_PKG.MNG), async (req, res) => {
    let conn;

    try {
        conn = await db.getConnection();

        let { package_name, permissions, group_code, description } = req.body;

        const companyId = req.company?.id;
        const createdBy = req.user?.id;


        package_name = package_name?.trim();
        group_code = group_code?.trim() || null;
        description = description?.trim() || null;


        if (!companyId) {
            return res.status(400).json({ success: false, message: "Company not found" });
        }

        if (!createdBy) {
            return res.status(400).json({ success: false, message: "User not authenticated" });
        }

        if (!package_name) {
            return res.status(400).json({ success: false, message: "Valid package_name is required" });
        }

        if (!Array.isArray(permissions) || permissions.length === 0) {
            return res.status(400).json({ success: false, message: "permissions array is required" });
        }

        const uniquePermissions = [...new Set(permissions.map(Number))];

        await conn.beginTransaction();


        const [existing] = await conn.query(
            `SELECT id 
             FROM permission_packages 
             WHERE package_name = ? 
             AND company_id = ?
             AND is_deleted = 0
             LIMIT 1`,
            [package_name, companyId]
        );

        if (existing.length) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: "Package name already exists"
            });
        }


        const [validPermissions] = await conn.query(
            `SELECT id FROM permissions WHERE id IN (?)`,
            [uniquePermissions]
        );

        if (validPermissions.length !== uniquePermissions.length) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: "Some permissions are invalid"
            });
        }


        const [packageResult] = await conn.query(
            `INSERT INTO permission_packages
            (company_id, package_name, group_code, description, created_at, created_by, is_active)
            VALUES (?, ?, ?, ?, NOW(), ?, 1)`,
            [companyId, package_name, group_code, description, createdBy]
        );

        const packageId = packageResult.insertId;


        const values = uniquePermissions.map((permId) => [
            packageId,
            permId,
            1,
            new Date(),
            createdBy,
            new Date(),
            createdBy
        ]);

        await conn.query(
            `INSERT INTO permission_package_items
            (package_id, permission_id, is_active, created_at, created_by, updated_at, updated_by)
            VALUES ?`,
            [values]
        );

        await conn.commit();

        return res.status(201).json({
            success: true,
            message: "Permission package created successfully",
            data: { package_id: packageId }
        });

    } catch (error) {

        if (conn) {
            try { await conn.rollback(); } catch { }
        }

        console.error("Error creating package:", {
            message: error.message,
            stack: error.stack
        });

        return res.status(500).json({
            success: false,
            message: "Failed to create package",
            error: NODE_ENV === "development" ? error.message : undefined
        });

    } finally {
        if (conn) conn.release();
    }
});

router.get("/permission-packages", auth(PERM_PKG.MNG), async (req, res) => {
    let conn;

    try {
        conn = await db.getConnection();

        let { search = "", page = 1, limit = 10 } = req.query;

        const companyId = req.company?.id;

        if (!companyId) {
            return res.status(400).json({
                success: false,
                message: "Company ID is missing in request"
            });
        }

        page = Number(page);
        limit = Number(limit);

        if (isNaN(page) || page < 1) page = 1;
        if (isNaN(limit) || limit < 1) limit = 10;
        if (limit > 100) limit = 100;

        const offset = (page - 1) * limit;
        search = search.trim();
        const searchQuery = `%${search}%`;




        const [countResult] = await conn.query(
            `SELECT COUNT(*) AS total
             FROM permission_packages
             WHERE company_id = ?
             AND is_active = 1
             AND is_deleted = 0
             AND (? = '' OR package_name LIKE ? OR group_code LIKE ?)`,
            [companyId, search, searchQuery, searchQuery]
        );

        const total = countResult?.[0]?.total || 0;
        const totalPages = total > 0 ? Math.ceil(total / limit) : 0;




        const [packages] = await conn.query(
            `SELECT 
                id,
                company_id,
                package_name,
                group_code,
                description,
                is_active,
                created_at,
                created_by,
                updated_at,
                updated_by
             FROM permission_packages
             WHERE company_id = ?
             AND is_active = 1
             AND is_deleted = 0
             AND (? = '' OR package_name LIKE ? OR group_code LIKE ?)
             ORDER BY id DESC
             LIMIT ? OFFSET ?`,
            [companyId, search, searchQuery, searchQuery, limit, offset]
        );

        if (!packages.length) {
            return res.status(200).json({
                success: true,
                message: "No permission packages found",
                data: {
                    packages: [],
                    meta: { total, totalPages, page, limit, is_last_page: true }
                }
            });
        }

        const packageIds = packages.map(p => p.id);




        const [permissionRows] = await conn.query(
            `SELECT 
                ppi.package_id,
                p.id   AS permission_id,
                p.name AS permission_name,
                p.code AS permission_code,
                p.action AS permission_action,
                p.category AS permission_category
             FROM permission_package_items ppi
             JOIN permissions p ON p.id = ppi.permission_id
             WHERE ppi.package_id IN (${packageIds.map(() => "?").join(",")})
             AND ppi.is_deleted = 0
             AND ppi.is_active = 1`,
            packageIds
        );




        const [employeeRows] = await conn.query(
            `SELECT
                e.permission_package_id AS package_id,
                e.id                    AS employee_id,
                u.name                  AS employee_name,
                u.email                 AS employee_email,
                u.profile_picture       AS employee_profile_picture,
                e.employee_code,
                e.designation
             FROM employees e
             JOIN users u ON u.id = e.user_id
             WHERE e.permission_package_id IN (${packageIds.map(() => "?").join(",")})
             AND e.company_id  = ?
             AND e.is_deleted  = 0
             AND e.is_active   = 1
             AND u.is_deleted  = 0
             AND u.is_active   = 1
             ORDER BY u.name ASC`,
            [...packageIds, companyId]
        );




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




        const packagesWithDetails = packages.map(pkg => {
            const usedBy = employeesMap[pkg.id] || [];
            return {
                ...pkg,
                permissions: permissionsMap[pkg.id] || [],
                total_used: usedBy.length,
                used_by: usedBy
            };
        });

        const is_last_page = (page * limit) >= total;

        return res.status(200).json({
            success: true,
            message: "Permission packages fetched successfully",
            data: {
                packages: packagesWithDetails,
                meta: { total, totalPages, page, limit, is_last_page }
            }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error while fetching permission packages",
            error: NODE_ENV === "development" ? error.message : undefined
        });

    } finally {
        if (conn) conn.release();
    }
});

router.put("/update-package", auth(PERM_PKG.MNG), async (req, res) => {
    let conn;

    try {
        conn = await db.getConnection();

        let {
            id: packageId,
            package_name,
            permissions,
            group_code,
            description
        } = req.body;

        const companyId = req.company?.id;
        const updatedBy = req.user?.id;




        if (!companyId) {
            return res.status(400).json({
                success: false,
                message: "Company not found"
            });
        }

        if (!updatedBy) {
            return res.status(400).json({
                success: false,
                message: "User not authenticated"
            });
        }

        if (!packageId || !package_name || !Array.isArray(permissions)) {
            return res.status(400).json({
                success: false,
                message: "id, package_name, and permissions are required"
            });
        }




        package_name = package_name.trim();
        group_code = group_code?.trim() || null;
        description = description?.trim() || null;

        const uniquePermissions = [...new Set(permissions.map(Number))];

        await conn.beginTransaction();




        const [pkg] = await conn.query(
            `SELECT id FROM permission_packages 
             WHERE id = ? AND company_id = ? AND is_deleted = 0 
             LIMIT 1`,
            [packageId, companyId]
        );

        if (!pkg.length) {
            await conn.rollback();
            return res.status(404).json({
                success: false,
                message: "Package not found or deleted"
            });
        }




        const [duplicate] = await conn.query(
            `SELECT id FROM permission_packages 
             WHERE package_name = ? 
             AND company_id = ? 
             AND id != ? 
             AND is_deleted = 0
             LIMIT 1`,
            [package_name, companyId, packageId]
        );

        if (duplicate.length) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: "Package name already exists"
            });
        }




        const [validPermissions] = await conn.query(
            `SELECT id FROM permissions WHERE id IN (?)`,
            [uniquePermissions]
        );

        if (validPermissions.length !== uniquePermissions.length) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: "Some permissions are invalid"
            });
        }




        await conn.query(
            `UPDATE permission_packages
             SET package_name = ?, group_code = ?, description = ?, updated_at = NOW(), updated_by = ?
             WHERE id = ? AND company_id = ?`,
            [package_name, group_code, description, updatedBy, packageId, companyId]
        );




        const [existingItems] = await conn.query(
            `SELECT id, permission_id, is_active
             FROM permission_package_items
             WHERE package_id = ? AND is_deleted = 0`,
            [packageId]
        );

        const existingMap = {};
        existingItems.forEach(item => {
            existingMap[item.permission_id] = item;
        });




        const toInsert = [];
        const toReactivate = [];
        const toDeactivate = [];

        for (const permId of uniquePermissions) {
            if (existingMap[permId]) {
                if (existingMap[permId].is_active === 0) {
                    toReactivate.push(existingMap[permId].id);
                }
            } else {
                toInsert.push([
                    packageId,
                    permId,
                    1,
                    new Date(),
                    updatedBy,
                    new Date(),
                    updatedBy
                ]);
            }
        }

        existingItems.forEach(item => {
            if (!uniquePermissions.includes(item.permission_id) && item.is_active === 1) {
                toDeactivate.push(item.id);
            }
        });




        if (toInsert.length) {
            await conn.query(
                `INSERT INTO permission_package_items
                (package_id, permission_id, is_active, created_at, created_by, updated_at, updated_by)
                VALUES ?`,
                [toInsert]
            );
        }

        if (toReactivate.length) {
            await conn.query(
                `UPDATE permission_package_items
                 SET is_active = 1, updated_at = NOW(), updated_by = ?
                 WHERE id IN (?)`,
                [updatedBy, toReactivate]
            );
        }

        if (toDeactivate.length) {
            await conn.query(
                `UPDATE permission_package_items
                 SET is_active = 0, updated_at = NOW(), updated_by = ?
                 WHERE id IN (?)`,
                [updatedBy, toDeactivate]
            );
        }

        await conn.commit();




        const [packageDetails] = await conn.query(
            `SELECT 
                id, company_id, package_name, group_code, description,
                is_active, created_at, created_by, updated_at, updated_by
             FROM permission_packages
             WHERE id = ? AND is_deleted = 0`,
            [packageId]
        );

        const [packagePermissions] = await conn.query(
            `SELECT 
                ppi.id AS mapping_id,
                p.id AS permission_id,
                p.name AS permission_name,
                p.code AS permission_code,
                p.action AS permission_action
             FROM permission_package_items ppi
             JOIN permissions p ON p.id = ppi.permission_id
             WHERE ppi.package_id = ?
             AND ppi.is_deleted = 0
             AND ppi.is_active = 1`,
            [packageId]
        );

        return res.status(200).json({
            success: true,
            message: "Permission package updated successfully",
            data: {
                package: packageDetails[0],
                permissions: packagePermissions
            }
        });

    } catch (error) {

        if (conn) {
            try { await conn.rollback(); } catch { }
        }

        console.error("Error updating package:", {
            message: error.message,
            stack: error.stack
        });

        return res.status(500).json({
            success: false,
            message: "Failed to update package",
            error: NODE_ENV === "development" ? error.message : undefined
        });

    } finally {
        if (conn) conn.release();
    }
});

router.delete('/delete-package', auth(PERM_PKG.MNG), async (req, res) => {
    let conn;

    try {
        const { packageId } = req.body;
        const userId = req.user?.id;
        const companyId = req.company?.id;




        if (!packageId) {
            return res.status(400).json({
                success: false,
                message: 'packageId is required'
            });
        }

        if (!userId || !companyId) {
            return res.status(400).json({
                success: false,
                message: 'User and company information are required'
            });
        }

        conn = await db.getConnection();
        await conn.beginTransaction();




        const [[pkg]] = await conn.query(
            `SELECT id 
             FROM permission_packages 
             WHERE id = ? AND company_id = ? AND is_deleted = 0`,
            [packageId, companyId]
        );

        if (!pkg) {
            await conn.rollback();
            return res.status(404).json({
                success: false,
                message: 'Permission package not found or already deleted'
            });
        }




        const [[employeeUsage]] = await conn.query(
            `SELECT COUNT(*) AS count
             FROM employees
             WHERE permission_package_id = ?
               AND company_id = ?
               AND is_deleted = 0`,
            [packageId, companyId]
        );

        if (employeeUsage.count > 0) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: `Cannot delete package. It is assigned to ${employeeUsage.count} employee(s)`
            });
        }




        await conn.query(
            `UPDATE permission_packages 
             SET is_deleted = 1, is_active = 0, deleted_at = NOW(), deleted_by = ? 
             WHERE id = ? AND company_id = ?`,
            [userId, packageId, companyId]
        );




        await conn.query(
            `UPDATE permission_package_items 
             SET is_deleted = 1, is_active = 0, deleted_at = NOW(), deleted_by = ? 
             WHERE package_id = ?`,
            [userId, packageId]
        );

        await conn.commit();

        return res.status(200).json({
            success: true,
            message: 'Permission package deleted successfully'
        });

    } catch (error) {

        if (conn) {
            try { await conn.rollback(); } catch { }
        }

        console.error('Delete package error:', {
            message: error.message,
            stack: error.stack
        });

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });

    } finally {
        if (conn) conn.release();
    }
});

router.put("/transfer-packages", auth(PERM_PKG.MNG), async (req, res) => {

    let conn;

    try {




        const assignments = Array.isArray(req.body?.assignments)
            ? req.body.assignments
            : [];

        const user_id = Number(req.user?.id);
        const company_id = Number(req.company?.id);




        if (assignments.length === 0) {
            return res.status(400).json({
                success: false,
                message:
                    "assignments must be a non-empty array"
            });
        }




        const validationErrors = [];
        const normalizedAssignments = [];

        for (let i = 0; i < assignments.length; i++) {

            const item = assignments[i];

            const employee_id = Number(
                item?.employee_id
            );

            const package_id = Number(
                item?.package_id
            );

            if (
                !Number.isInteger(employee_id) ||
                employee_id <= 0
            ) {
                validationErrors.push({
                    index: i,
                    field: "employee_id",
                    value: item?.employee_id,
                    message:
                        "employee_id must be a positive integer"
                });
            }

            if (
                !Number.isInteger(package_id) ||
                package_id <= 0
            ) {
                validationErrors.push({
                    index: i,
                    field: "package_id",
                    value: item?.package_id,
                    message:
                        "package_id must be a positive integer"
                });
            }

            normalizedAssignments.push({
                employee_id,
                package_id
            });
        }

        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: validationErrors
            });
        }





        const assignmentMap = new Map();

        for (const item of normalizedAssignments) {
            assignmentMap.set(
                item.employee_id,
                item.package_id
            );
        }

        const uniqueAssignments = Array.from(
            assignmentMap.entries()
        ).map(([employee_id, package_id]) => ({
            employee_id,
            package_id
        }));

        const employeeIds = uniqueAssignments.map(
            item => item.employee_id
        );

        const packageIds = [
            ...new Set(
                uniqueAssignments.map(
                    item => item.package_id
                )
            )
        ];




        conn = await db.getConnection();




        await conn.beginTransaction();





        const [employeeRows] = await conn.query(
            `
            SELECT
                id,
                permission_package_id
            FROM employees
            WHERE company_id = ?
              AND is_deleted = 0
              AND is_active = 1
              AND id IN (${employeeIds.map(() => "?").join(",")})
            FOR UPDATE
            `,
            [
                company_id,
                ...employeeIds
            ]
        );




        if (
            employeeRows.length !== employeeIds.length
        ) {

            const foundIds = employeeRows.map(
                item => item.id
            );

            const invalidEmployeeIds =
                employeeIds.filter(
                    id => !foundIds.includes(id)
                );

            await conn.rollback();

            return res.status(400).json({
                success: false,
                message:
                    "Some employees are invalid, inactive, or deleted",
                invalid_employee_ids:
                    invalidEmployeeIds
            });
        }




        const [packageRows] = await conn.query(
            `
            SELECT
                id,
                package_name
            FROM permission_packages
            WHERE company_id = ?
              AND is_deleted = 0
              AND is_active = 1
              AND id IN (${packageIds.map(() => "?").join(",")})
            `,
            [
                company_id,
                ...packageIds
            ]
        );

        if (
            packageRows.length !== packageIds.length
        ) {

            const validPackageIds =
                packageRows.map(
                    item => item.id
                );

            const invalidPackageIds =
                packageIds.filter(
                    id => !validPackageIds.includes(id)
                );

            await conn.rollback();

            return res.status(400).json({
                success: false,
                message:
                    "Some permission packages are invalid or inactive",
                invalid_package_ids:
                    invalidPackageIds
            });
        }




        const currentPackageMap = new Map();

        for (const employee of employeeRows) {
            currentPackageMap.set(
                employee.id,
                employee.permission_package_id
            );
        }




        const skippedEmployees = [];
        const updateAssignments = [];

        for (const item of uniqueAssignments) {

            const currentPackageId =
                currentPackageMap.get(
                    item.employee_id
                );

            if (
                currentPackageId === item.package_id
            ) {

                skippedEmployees.push({
                    employee_id:
                        item.employee_id,
                    package_id:
                        item.package_id,
                    reason:
                        "Already assigned"
                });

                continue;
            }

            updateAssignments.push(item);
        }




        if (updateAssignments.length === 0) {

            await conn.rollback();

            return res.status(400).json({
                success: false,
                message:
                    "All employees are already assigned to requested packages",
                skipped_employees:
                    skippedEmployees
            });
        }





        const groupedAssignments = new Map();

        for (const item of updateAssignments) {

            if (
                !groupedAssignments.has(
                    item.package_id
                )
            ) {
                groupedAssignments.set(
                    item.package_id,
                    []
                );
            }

            groupedAssignments
                .get(item.package_id)
                .push(item.employee_id);
        }




        for (
            const [package_id, empIds]
            of groupedAssignments
        ) {

            await conn.query(
                `
                UPDATE employees
                SET
                    permission_package_id = ?,
                    updated_at = NOW(),
                    updated_by = ?
                WHERE company_id = ?
                  AND id IN (${empIds.map(() => "?").join(",")})
                `,
                [
                    package_id,
                    user_id,
                    company_id,
                    ...empIds
                ]
            );
        }




        const updatedEmployeeIds =
            updateAssignments.map(
                item => item.employee_id
            );

        const [updatedEmployees] = await conn.query(
            `
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
            INNER JOIN users u
                ON u.id = e.user_id
            INNER JOIN permission_packages pp
                ON pp.id = e.permission_package_id
            WHERE e.id IN (${updatedEmployeeIds.map(() => "?").join(",")})
            `,
            updatedEmployeeIds
        );




        await conn.commit();




        return res.status(200).json({
            success: true,
            message:
                "Permission packages assigned successfully",
            data: {
                total_requested:
                    uniqueAssignments.length,

                updated_count:
                    updateAssignments.length,

                skipped_count:
                    skippedEmployees.length,

                skipped_employees:
                    skippedEmployees,

                employees:
                    updatedEmployees
            }
        });

    } catch (error) {




        if (conn) {
            try {
                await conn.rollback();
            } catch (_) { }
        }




        console.error(
            "Assign package error:",
            {
                message: error.message,
                stack: error.stack
            }
        );




        if (
            error.code === "ER_LOCK_DEADLOCK"
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "Database deadlock occurred. Please retry."
            });
        }




        if (
            error.code ===
            "ER_LOCK_WAIT_TIMEOUT"
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "Database lock timeout occurred. Please retry."
            });
        }




        return res.status(500).json({
            success: false,
            message:
                "Internal server error",
            error:
                NODE_ENV ===
                    "development"
                    ? error.message
                    : undefined
        });

    } finally {




        if (conn) {
            conn.release();
        }

    }

});


export default router;
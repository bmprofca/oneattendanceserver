import "dotenv/config";
import db from "../config/db.js";
import { PERMISSION_DEFINITIONS } from "../constants/permissions.js";

async function seedPermissions() {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    console.log("Seeding new 5-permission model...");

    const permissionMap = new Map();

    for (const def of PERMISSION_DEFINITIONS) {
      const [existing] = await conn.query(
        "SELECT id FROM permissions WHERE code = ? LIMIT 1",
        [def.code]
      );

      let permId;
      const permDescription = def.description;
      if (existing.length > 0) {
        permId = existing[0].id;
        await conn.query(
          "UPDATE permissions SET description = ?, category = ?, action = ? WHERE id = ?",
          [permDescription, def.category, def.action, permId]
        );
      } else {
        const [result] = await conn.query(
          "INSERT INTO permissions (code, description, category, action) VALUES (?, ?, ?, ?)",
          [def.code, permDescription, def.category, def.action]
        );
        permId = result.insertId;
      }
      permissionMap.set(def.code, permId);
      console.log(`Permission ready: ${def.code} -> ID ${permId}`);
    }

    const newPermIds = [...permissionMap.values()];

    // Clean up package items that reference obsolete permissions
    if (newPermIds.length > 0) {
      await conn.query(
        `DELETE FROM permission_package_items WHERE permission_id NOT IN (?)`,
        [newPermIds]
      );
      // Delete old permissions
      await conn.query(
        `DELETE FROM permissions WHERE id NOT IN (?)`,
        [newPermIds]
      );
    }

    // Now update standard permission packages for all companies
    const [packages] = await conn.query(
      "SELECT id, group_code, package_name FROM permission_packages WHERE is_deleted = 0"
    );

    const packagePermissionsMap = {
      SUPER_ADMIN: ["employees", "attendance", "leave", "financial", "permissions"],
      HR_ADMIN: ["employees", "attendance", "leave"],
      PAYROLL_ADMIN: ["financial"],
      MANAGER: ["attendance", "leave"],
      EMPLOYEE: []
    };

    for (const pkg of packages) {
      const groupCode = (pkg.group_code || "").toUpperCase();
      const pkgName = (pkg.package_name || "").toUpperCase();
      let permCodes = null;

      if (groupCode === "SUPER_ADMIN" || pkgName.includes("SUPER ADMIN")) {
        permCodes = packagePermissionsMap.SUPER_ADMIN;
      } else if (groupCode === "HR_ADMIN" || pkgName.includes("HR ADMIN")) {
        permCodes = packagePermissionsMap.HR_ADMIN;
      } else if (groupCode === "PAYROLL_ADMIN" || pkgName.includes("PAYROLL")) {
        permCodes = packagePermissionsMap.PAYROLL_ADMIN;
      } else if (groupCode === "MANAGER" || pkgName.includes("MANAGER")) {
        permCodes = packagePermissionsMap.MANAGER;
      } else if (groupCode === "EMPLOYEE" || pkgName.includes("EMPLOYEE")) {
        permCodes = packagePermissionsMap.EMPLOYEE;
      }

      if (permCodes) {
        // Clear existing items for this package
        await conn.query(
          "DELETE FROM permission_package_items WHERE package_id = ?",
          [pkg.id]
        );

        if (permCodes.length > 0) {
          const values = permCodes
            .map(code => permissionMap.get(code))
            .filter(Boolean)
            .map(permId => [pkg.id, permId, 1, new Date(), new Date(), 1, 1]);

          if (values.length > 0) {
            await conn.query(
              `INSERT INTO permission_package_items 
               (package_id, permission_id, is_active, created_at, updated_at, created_by, updated_by) 
               VALUES ?`,
              [values]
            );
          }
        }
        console.log(`Updated package: ${pkg.package_name} (${pkg.group_code}) -> [${permCodes.join(", ")}]`);
      }
    }

    await conn.commit();
    console.log("Permissions seeded and existing packages updated successfully!");
    process.exit(0);
  } catch (error) {
    if (conn) await conn.rollback();
    console.error("Failed to seed permissions:", error);
    process.exit(1);
  } finally {
    if (conn) conn.release();
  }
}

seedPermissions();

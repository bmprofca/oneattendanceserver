import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import { validateFields, salaryValidation, currencyTypeValidation } from "../utils/constantsValidator.js";
import { SALARY_TYPES, CURRENCY_TYPES } from "../constants/constants_values.js";
import { toBooleanFields } from "../utils/toBooleanFields.js";
import { buildFileUrl } from "../utils/fileService.js";
import { SAL, SAL_COMP, SAL_PKG } from "../constants/permissions.js";
import { getCurrentDate, isValidDate, getSalaryStatus, isDateAfter, isDateBefore, parseDate, formatDate, addDays } from "../utils/time.js";
import { sendSuccess, sendError } from "../utils/sendResponse.js";


const router = express.Router();


router.post("/components/create", auth(SAL_COMP.MNG), async (req, res) => {
  let conn;

  try {
    let {
      code,
      name,
      type,
      calc_type,
      calc_value,
      is_taxable,
      is_statutory
    } = req.body;

    const company_id = req.company?.id;
    const user_id = req.user?.id;

    if (!company_id) {
      return res.status(400).json({
        success: false,
        message: "Company context missing"
      });
    }

    if (!code || !name || !type) {
      return res.status(400).json({
        success: false,
        message: "code, name and type are required"
      });
    }

    code = code.trim().toUpperCase();
    name = name.trim();
    type = type.trim().toLowerCase();
    calc_type = calc_type ? calc_type.trim().toLowerCase() : "fixed";

    const toBool = (val) =>
      val === true || val === 1 || val === "1";

    is_taxable = toBool(is_taxable) ? 1 : 0;
    is_statutory = toBool(is_statutory) ? 1 : 0;

    const validTypes = ["earning", "deduction", "employer_contribution"];
    const validCalcTypes = ["fixed", "percentage"];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Allowed: earning, deduction, employer_contribution"
      });
    }

    if (!validCalcTypes.includes(calc_type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid calc_type. Allowed: fixed, percentage"
      });
    }

    calc_value = parseFloat(calc_value);

    if (isNaN(calc_value)) {
      calc_value = 0;
    }

    if (calc_type === "percentage") {
      if (calc_value <= 0 || calc_value > 100) {
        return res.status(400).json({
          success: false,
          message: "For percentage, calc_value must be between 0 and 100"
        });
      }
    }

    if (calc_type === "fixed") {
      if (calc_value < 0) {
        return res.status(400).json({
          success: false,
          message: "Fixed amount cannot be negative"
        });
      }
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [existing] = await conn.query(
      `SELECT id FROM salary_components
       WHERE company_id = ? AND code = ? AND is_deleted = 0
       LIMIT 1`,
      [company_id, code]
    );

    if (existing.length) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: "Salary component code already exists"
      });
    }

    const [result] = await conn.query(
      `INSERT INTO salary_components
      (company_id, code, name, type, calc_type, calc_value,
       is_taxable, is_statutory, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id,
        code,
        name,
        type,
        calc_type,
        calc_value,
        is_taxable,
        is_statutory,
        user_id || null
      ]
    );

    const [[created]] = await conn.query(
      `SELECT * FROM salary_components WHERE id = ?`,
      [result.insertId]
    );

    await conn.commit();

    const responseData = toBooleanFields(created, [
      "is_taxable",
      "is_statutory",
      "is_active",
      "is_deleted"
    ]);

    return res.status(201).json({
      success: true,
      message: "Salary component created successfully",
      data: responseData
    });

  } catch (err) {
    if (conn) await conn.rollback();

    console.error("Create Salary Component Error:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Salary component code already exists"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  } finally {
    if (conn) conn.release();
  }
});

router.get("/components/list", auth(SAL_COMP.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    let {
      search = "",
      page = 1,
      limit = 10,
      type,
      is_active
    } = req.query;

    const company_id = req.company?.id;

    if (!company_id) {
      return res.status(400).json({
        success: false,
        message: "Company context missing"
      });
    }

    page = parseInt(page);
    limit = parseInt(limit);

    page = isNaN(page) || page < 1 ? 1 : page;
    limit = isNaN(limit) || limit < 1 ? 10 : Math.min(limit, 50);

    const offset = (page - 1) * limit;

    search = search ? search.trim() : "";
    type = type ? type.trim().toLowerCase() : null;

    let isActiveFilter = null;
    if (is_active !== undefined) {
      if (is_active === "1" || is_active === 1) isActiveFilter = 1;
      else if (is_active === "0" || is_active === 0) isActiveFilter = 0;
    }

    let whereClause = `WHERE company_id = ? AND is_deleted = 0`;
    let params = [company_id];

    if (search) {
      whereClause += ` AND (LOWER(code) LIKE ? OR LOWER(name) LIKE ?)`;
      params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
    }

    if (type) {
      const validTypes = ["earning", "deduction", "employer_contribution"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid type filter"
        });
      }

      whereClause += ` AND type = ?`;
      params.push(type);
    }

    if (isActiveFilter !== null) {
      whereClause += ` AND is_active = ?`;
      params.push(isActiveFilter);
    }

    const [[countResult]] = await conn.query(
      `SELECT COUNT(*) AS total FROM salary_components ${whereClause}`,
      params
    );

    const total = countResult.total;

    const [rows] = await conn.query(
      `SELECT
        id,
        company_id,
        code,
        name,
        type,
        calc_type,
        calc_value, 
        is_taxable,
        is_statutory,
        is_active,
        created_at,
        created_by,
        updated_at,
        updated_by
      FROM salary_components
      ${whereClause}
      ORDER BY id DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map(row =>
      toBooleanFields(row, [
        "is_taxable",
        "is_statutory",
        "is_active"
      ])
    );

    return res.status(200).json({
      success: true,
      message: "Salary components fetched successfully",
      data,
      meta: {
        total,
        page,
        limit,
        total_pages: total === 0 ? 0 : Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error("List Salary Components Error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  } finally {
    if (conn) conn.release();
  }
});

router.put("/components/update", auth(SAL_COMP.MNG), async (req, res) => {
  let conn;

  try {
    let {
      id,
      code,
      name,
      type,
      calc_type,
      calc_value,
      is_taxable,
      is_statutory,
      is_active
    } = req.body;

    const company_id = req.company?.id;
    const user_id = req.user?.id;

    if (!company_id || !id) {
      return res.status(400).json({
        success: false,
        message: "company_id and id are required"
      });
    }

    if (code !== undefined) code = code.trim().toUpperCase();
    if (name !== undefined) name = name.trim();
    if (type !== undefined) type = type.trim().toLowerCase();
    if (calc_type !== undefined) calc_type = calc_type.trim().toLowerCase();

    const toBool = (val) =>
      val === true || val === 1 || val === "1";

    const validTypes = ["earning", "deduction", "employer_contribution"];
    const validCalcTypes = ["fixed", "percentage"];

    if (type && !validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type"
      });
    }

    if (calc_type && !validCalcTypes.includes(calc_type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid calc_type"
      });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `SELECT calc_type, calc_value
       FROM salary_components
       WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, company_id]
    );

    if (!existing) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "Salary component not found"
      });
    }

    if (code !== undefined) {
      const [dup] = await conn.query(
        `SELECT id FROM salary_components
         WHERE company_id = ? AND code = ? AND id != ? AND is_deleted = 0`,
        [company_id, code, id]
      );

      if (dup.length) {
        await conn.rollback();
        return res.status(409).json({
          success: false,
          message: "Salary component code already exists"
        });
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

    if (finalCalcType === "percentage") {
      if (finalCalcValue <= 0 || finalCalcValue > 100) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "For percentage, calc_value must be between 0 and 100"
        });
      }
    }

    if (finalCalcType === "fixed") {
      if (finalCalcValue < 0) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Fixed amount cannot be negative"
        });
      }
    }

    let updateFields = [];
    let params = [];

    if (code !== undefined) {
      updateFields.push("code = ?");
      params.push(code);
    }

    if (name !== undefined) {
      updateFields.push("name = ?");
      params.push(name);
    }

    if (type !== undefined) {
      updateFields.push("type = ?");
      params.push(type);
    }

    if (calc_type !== undefined) {
      updateFields.push("calc_type = ?");
      params.push(calc_type);
    }

    if (calc_value !== undefined || calc_type !== undefined) {
      updateFields.push("calc_value = ?");
      params.push(finalCalcValue);
    }

    if (is_taxable !== undefined) {
      updateFields.push("is_taxable = ?");
      params.push(toBool(is_taxable) ? 1 : 0);
    }

    if (is_statutory !== undefined) {
      updateFields.push("is_statutory = ?");
      params.push(toBool(is_statutory) ? 1 : 0);
    }

    if (is_active !== undefined) {
      updateFields.push("is_active = ?");
      params.push(toBool(is_active) ? 1 : 0);
    }

    if (!updateFields.length) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "No fields provided to update"
      });
    }

    updateFields.push("updated_by = ?");
    params.push(user_id || null);

    params.push(id, company_id);

    await conn.query(
      `UPDATE salary_components 
       SET ${updateFields.join(", ")} 
       WHERE id = ? AND company_id = ?`,
      params
    );

    const [[updated]] = await conn.query(
      `SELECT *
       FROM salary_components
       WHERE id = ? AND company_id = ?`,
      [id, company_id]
    );

    await conn.commit();

    const responseData = toBooleanFields(updated, [
      "is_taxable",
      "is_statutory",
      "is_active",
      "is_deleted"
    ]);

    return res.status(200).json({
      success: true,
      message: "Salary component updated successfully",
      data: responseData
    });

  } catch (err) {
    if (conn) await conn.rollback();

    console.error("Update Salary Component Error:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Salary component code already exists"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  } finally {
    if (conn) conn.release();
  }
});

router.delete("/components/delete", auth(SAL_COMP.MNG), async (req, res) => {
  let conn;

  try {
    let { id } = req.body;

    const company_id = req.company?.id;
    const user_id = req.user?.id;

    id = parseInt(id);

    if (!company_id || isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid company_id and id are required"
      });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `SELECT id 
       FROM salary_components
       WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, company_id]
    );

    if (!existing) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "Salary component not found or already deleted"
      });
    }

    const [[inUse]] = await conn.query(
      `SELECT id 
       FROM salary_component_package_items
       WHERE component_id = ?
       AND is_deleted = 0
       LIMIT 1`,
      [id]
    );

    if (inUse) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot delete component. It is used in salary package"
      });
    }

    const [result] = await conn.query(
      `UPDATE salary_components
       SET is_deleted = 1,
           deleted_at = NOW(),
           deleted_by = ?
       WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [user_id || null, id, company_id]
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: "Component already deleted or not found"
      });
    }

    await conn.commit();

    return res.status(200).json({
      success: true,
      message: "Salary component deleted successfully"
    });

  } catch (err) {
    if (conn) await conn.rollback();

    console.error("Delete Salary Component Error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  } finally {
    if (conn) conn.release();
  }
});

router.post("/components/create-package", auth(SAL_COMP.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    let {
      name,
      code,
      description,
      components
    } = req.body;

    const company_id = req.company?.id;
    const user_id = req.user?.id;


    name = name?.trim();
    code = code?.trim().toUpperCase();
    description = description?.trim() || null;


    if (!company_id) {
      return res.status(400).json({
        success: false,
        message: "Company missing"
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "name is required"
      });
    }

    if (!Array.isArray(components) || components.length === 0) {
      return res.status(400).json({
        success: false,
        message: "components array is required"
      });
    }


    const componentIdsSet = new Set();

    components.forEach((item, index) => {
      if (!item.component_id) {
        throw { status: 400, message: `component_id required at index ${index}` };
      }

      const compId = parseInt(item.component_id);

      if (isNaN(compId) || compId <= 0) {
        throw { status: 400, message: `Invalid component_id at index ${index}` };
      }

      if (componentIdsSet.has(compId)) {
        throw { status: 400, message: `Duplicate component_id: ${compId}` };
      }

      componentIdsSet.add(compId);
    });

    const componentIds = [...componentIdsSet];

    await conn.beginTransaction();


    const [existing] = await conn.query(
      `SELECT id FROM salary_component_packages
       WHERE company_id = ? AND name = ? AND is_deleted = 0
       LIMIT 1`,
      [company_id, name]
    );

    if (existing.length) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: "Package name already exists"
      });
    }


    const [validComponents] = await conn.query(
      `SELECT id FROM salary_components
       WHERE id IN (?) 
       AND company_id = ? 
       AND is_deleted = 0 
       AND is_active = 1`,
      [componentIds, company_id]
    );

    if (validComponents.length !== componentIds.length) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Some components are invalid or inactive"
      });
    }


    const [pkgResult] = await conn.query(
      `INSERT INTO salary_component_packages
      (company_id, name, code, description, created_by)
      VALUES (?, ?, ?, ?, ?)`,
      [company_id, name, code || null, description, user_id || null]
    );

    const package_id = pkgResult.insertId;


    const values = components.map((item, index) => [
      package_id,
      parseInt(item.component_id),
      1,
      user_id || null,
      user_id || null
    ]);

    await conn.query(
      `INSERT INTO salary_component_package_items
      (package_id, component_id,
       is_active, created_by, updated_by)
      VALUES ?`,
      [values]
    );


    const [[pkg]] = await conn.query(
      `SELECT id, name, code, description, is_active, created_at
       FROM salary_component_packages
       WHERE id = ? AND company_id = ?`,
      [package_id, company_id]
    );

    const [items] = await conn.query(
      `SELECT 
         spi.component_id,
         sc.name,
         sc.code,
         sc.type,
         sc.calc_type,
         sc.calc_value
       FROM salary_component_package_items spi
       JOIN salary_components sc 
         ON sc.id = spi.component_id
       WHERE spi.package_id = ?
         AND spi.is_deleted = 0
         AND sc.is_deleted = 0
       ORDER BY spi.component_id ASC`,
      [package_id]
    );

    await conn.commit();

    return res.status(201).json({
      success: true,
      message: "Salary package created successfully",
      data: {
        ...pkg,
        items: items.map(i => ({
          component_id: i.component_id,
          name: i.name,
          code: i.code,
          type: i.type,
          calc_type: i.calc_type,
          calc_value: i.calc_value
        }))
      }
    });

  } catch (err) {
    if (conn) await conn.rollback();

    console.error("Create Salary Package Error:", err);

    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Internal server error"
    });

  } finally {
    if (conn) conn.release();
  }
});


router.get("/components/packages", auth(SAL_COMP.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();


    let {
      page = 1,
      limit = 10,
      search = "",
      sort_by = "created_at",
      sort_order = "desc"
    } = req.query;

    const company_id = req.company?.id;

    if (!company_id) {
      return res.status(400).json({
        success: false,
        message: "Company not found"
      });
    }

    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;


    const validSortFields = ["name", "code", "created_at"];
    if (!validSortFields.includes(sort_by)) {
      sort_by = "created_at";
    }

    sort_order = sort_order.toLowerCase() === "asc" ? "ASC" : "DESC";


    const [[countResult]] = await conn.query(
      `SELECT COUNT(*) as total
       FROM salary_component_packages
       WHERE company_id = ?
         AND is_deleted = 0
         AND (
           name LIKE ? OR
           code LIKE ?
         )`,
      [company_id, `%${search}%`, `%${search}%`]
    );

    const total = countResult.total;


    const [packages] = await conn.query(
      `SELECT id, name, code, description, is_active, created_at
       FROM salary_component_packages
       WHERE company_id = ?
         AND is_deleted = 0
         AND (
           name LIKE ? OR
           code LIKE ?
         )
       ORDER BY ${sort_by} ${sort_order}
       LIMIT ? OFFSET ?`,
      [company_id, `%${search}%`, `%${search}%`, limit, offset]
    );

    if (packages.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        meta: {
          total,
          page,
          limit,
          total_pages: Math.ceil(total / limit)
        }
      });
    }


    const packageIds = packages.map(p => p.id);

    const [items] = await conn.query(
      `SELECT 
         spi.package_id,
         spi.component_id,
         sc.name as component_name,
         sc.code as component_code,
         sc.type,
         sc.calc_type,
         sc.calc_value
       FROM salary_component_package_items spi
       JOIN salary_components sc 
         ON sc.id = spi.component_id
       WHERE spi.package_id IN (?)
         AND spi.is_deleted = 0
         AND sc.is_deleted = 0
       ORDER BY spi.package_id ASC`,
      [packageIds]
    );


    const packageMap = {};

    packages.forEach(pkg => {
      packageMap[pkg.id] = {
        ...pkg,
        items: []
      };
    });

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

    const finalData = Object.values(packageMap);


    return res.status(200).json({
      success: true,
      data: finalData,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error("Fetch Packages Error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  } finally {
    if (conn) conn.release();
  }
});

router.put("/components/update-package", auth(SAL_COMP.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    let {
      package_id,
      name,
      code,
      description,
      components
    } = req.body;

    const company_id = req.company?.id;
    const user_id = req.user?.id;


    if (!company_id || !package_id) {
      return res.status(400).json({
        success: false,
        message: "company_id and package_id required"
      });
    }

    if (!Array.isArray(components) || components.length === 0) {
      return res.status(400).json({
        success: false,
        message: "components array required"
      });
    }


    if (name !== undefined) name = name.trim();
    if (code !== undefined) code = code.trim().toUpperCase();
    if (description !== undefined) description = description?.trim() || null;


    const componentIdsSet = new Set();

    components.forEach((item, index) => {
      if (!item.component_id) {
        throw { status: 400, message: `component_id required at index ${index}` };
      }

      const compId = parseInt(item.component_id);

      if (isNaN(compId) || compId <= 0) {
        throw { status: 400, message: `Invalid component_id at index ${index}` };
      }

      if (componentIdsSet.has(compId)) {
        throw { status: 400, message: `Duplicate component_id: ${compId}` };
      }

      componentIdsSet.add(compId);
    });

    const newIds = [...componentIdsSet];

    await conn.beginTransaction();


    const [[pkg]] = await conn.query(
      `SELECT id FROM salary_component_packages
       WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [package_id, company_id]
    );

    if (!pkg) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "Package not found"
      });
    }


    if (code !== undefined) {
      const [dup] = await conn.query(
        `SELECT id FROM salary_component_packages
         WHERE company_id = ? AND code = ? AND id != ? AND is_deleted = 0`,
        [company_id, code, package_id]
      );

      if (dup.length) {
        await conn.rollback();
        return res.status(409).json({
          success: false,
          message: "Package code already exists"
        });
      }
    }


    const [validComponents] = await conn.query(
      `SELECT id FROM salary_components
       WHERE id IN (?) 
         AND company_id = ?
         AND is_deleted = 0
         AND is_active = 1`,
      [newIds, company_id]
    );

    if (validComponents.length !== newIds.length) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid or inactive components"
      });
    }


    let updateFields = [];
    let params = [];

    if (name !== undefined) {
      updateFields.push("name = ?");
      params.push(name);
    }

    if (code !== undefined) {
      updateFields.push("code = ?");
      params.push(code);
    }

    if (description !== undefined) {
      updateFields.push("description = ?");
      params.push(description);
    }

    if (updateFields.length) {
      updateFields.push("updated_by = ?");
      params.push(user_id || null);

      params.push(package_id, company_id);

      await conn.query(
        `UPDATE salary_component_packages
         SET ${updateFields.join(", ")}
         WHERE id = ? AND company_id = ?`,
        params
      );
    }


    const [existingItems] = await conn.query(
      `SELECT component_id
       FROM salary_component_package_items
       WHERE package_id = ? AND is_deleted = 0`,
      [package_id]
    );

    const existingIds = existingItems.map(i => i.component_id);


    const toDelete = existingIds.filter(id => !newIds.includes(id));
    const toAdd = newIds.filter(id => !existingIds.includes(id));
    const toKeep = newIds.filter(id => existingIds.includes(id));


    if (toDelete.length > 0) {
      await conn.query(
        `UPDATE salary_component_package_items
         SET is_deleted = 1,
             deleted_at = NOW(),
             deleted_by = ?
         WHERE package_id = ?
           AND component_id IN (?)
           AND is_deleted = 0`,
        [user_id || null, package_id, toDelete]
      );
    }


    if (toAdd.length > 0) {
      const values = components
        .filter(item => toAdd.includes(parseInt(item.component_id)))
        .map((item, index) => [
          package_id,
          parseInt(item.component_id),
          1,
          user_id || null,
          user_id || null
        ]);

      await conn.query(
        `INSERT INTO salary_component_package_items
        (package_id, component_id,
         is_active, created_by, updated_by)
        VALUES ?`,
        [values]
      );
    }


    for (let item of components) {
      if (toKeep.includes(parseInt(item.component_id))) {
        await conn.query(
          `UPDATE salary_component_package_items
           SET updated_by = ?
           WHERE package_id = ? AND component_id = ? AND is_deleted = 0`,
          [
            user_id || null,
            package_id,
            parseInt(item.component_id)
          ]
        );
      }
    }


    const [[updatedPkg]] = await conn.query(
      `SELECT id, name, code, description, is_active, created_at
       FROM salary_component_packages
       WHERE id = ? AND company_id = ?`,
      [package_id, company_id]
    );

    const [items] = await conn.query(
      `SELECT 
         spi.component_id,
         sc.name,
         sc.code,
         sc.type,
         sc.calc_type,
         sc.calc_value
       FROM salary_component_package_items spi
       JOIN salary_components sc 
         ON sc.id = spi.component_id
       WHERE spi.package_id = ?
         AND spi.is_deleted = 0
         AND sc.is_deleted = 0
       ORDER BY spi.component_id ASC`,
      [package_id]
    );

    await conn.commit();

    return res.status(200).json({
      success: true,
      message: "Salary package updated successfully",
      data: {
        ...updatedPkg,
        items: items.map(i => ({
          component_id: i.component_id,
          name: i.name,
          code: i.code,
          type: i.type,
          calc_type: i.calc_type,
          calc_value: i.calc_value
        }))
      }
    });

  } catch (err) {
    if (conn) await conn.rollback();

    console.error("Update Package Error:", err);

    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Internal server error"
    });

  } finally {
    if (conn) conn.release();
  }
});

router.delete("/components/delete-package", auth(SAL_COMP.MNG), async (req, res) => {
  let conn;

  try {
    let { package_id } = req.body;

    const company_id = req.company?.id;
    const user_id = req.user?.id;


    package_id = parseInt(package_id);

    if (!company_id || isNaN(package_id) || package_id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid company_id and package_id are required"
      });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();


    const [[pkg]] = await conn.query(
      `SELECT id 
       FROM salary_component_packages
       WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [package_id, company_id]
    );

    if (!pkg) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "Package not found or already deleted"
      });
    }


    const [items] = await conn.query(
      `SELECT id
       FROM salary_component_package_items
       WHERE package_id = ? AND is_deleted = 0`,
      [package_id]
    );

    if (items.length === 0) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Package has no active items to delete"
      });
    }


    const [pkgResult] = await conn.query(
      `UPDATE salary_component_packages
       SET is_deleted = 1,
           deleted_at = NOW(),
           deleted_by = ?
       WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [user_id || null, package_id, company_id]
    );

    if (pkgResult.affectedRows === 0) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: "Package already deleted"
      });
    }


    await conn.query(
      `UPDATE salary_component_package_items
       SET is_deleted = 1,
           deleted_at = NOW(),
           deleted_by = ?
       WHERE package_id = ? AND is_deleted = 0`,
      [user_id || null, package_id]
    );


    await conn.commit();

    return res.status(200).json({
      success: true,
      message: "Salary package deleted successfully"
    });

  } catch (err) {
    if (conn) await conn.rollback();

    console.error("Delete Package Error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  } finally {
    if (conn) conn.release();
  }
});

// Assign salary to an employee from company end
router.post("/assign-salary", auth(SAL.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    let {
      employee_id,
      base_amount,
      effective_from,
      effective_to,
      components = []
    } = req.body;

    const company_id = req.company?.id;
    const user_id = req.user?.id;

    if (
      !company_id ||
      !employee_id ||
      !base_amount ||
      !effective_from
    ) {
      throw {
        status: 400,
        message: "Required fields missing"
      };
    }

    employee_id = Number(employee_id);
    base_amount = Number(base_amount);

    if (
      !employee_id ||
      Number.isNaN(base_amount) ||
      base_amount <= 0
    ) {
      throw {
        status: 400,
        message: "Invalid numeric values"
      };
    }

    if (!Array.isArray(components)) {
      throw {
        status: 400,
        message: "components must be an array"
      };
    }

    const [[employee]] = await conn.query(
      `
      SELECT
        e.id,
        e.employee_code,
        u.name
      FROM employees e
      JOIN users u
        ON u.id = e.user_id
      WHERE
        e.id = ?
        AND e.company_id = ?
        AND e.is_deleted = 0
      LIMIT 1
      `,
      [employee_id, company_id]
    );

    if (!employee) {
      throw {
        status: 404,
        message: "Employee not found"
      };
    }

    if (!isValidDate(effective_from)) {
      throw {
        status: 400,
        message: "Invalid effective_from"
      };
    }

    if (effective_to && !isValidDate(effective_to)) {
      throw {
        status: 400,
        message: "Invalid effective_to"
      };
    }

    if (effective_to && isDateBefore(effective_to, effective_from)) {
      throw {
        status: 400,
        message:
          "effective_to cannot be before effective_from"
      };
    }

    const fromMonth = parseDate(effective_from).format("YYYY-MM");

    const toMonth =
      effective_to
        ? parseDate(effective_to)
          .format("YYYY-MM")
        : fromMonth;

    const [[overlapSalary]] = await conn.query(
      `
      SELECT
        id,
        effective_from,
        effective_to
      FROM salary_structures
      WHERE
        employee_id = ?
        AND company_id = ?
        AND is_deleted = 0

        AND DATE_FORMAT(
          effective_from,
          '%Y-%m'
        ) <= ?

        AND DATE_FORMAT(
          COALESCE(
            effective_to,
            effective_from
          ),
          '%Y-%m'
        ) >= ?

      LIMIT 1
      `,
      [
        employee_id,
        company_id,
        toMonth,
        fromMonth
      ]
    );

    if (overlapSalary) {
      throw {
        status: 400,
        message:
          "Salary structure already exists in the selected period"
      };
    }

    const componentIds = components.map(c =>
      Number(c.component_id)
    );

    if (
      componentIds.some(
        id => !id || Number.isNaN(id)
      )
    ) {
      throw {
        status: 400,
        message: "Invalid component_id found"
      };
    }

    const uniqueIds =
      new Set(componentIds);

    if (
      uniqueIds.size !==
      componentIds.length
    ) {
      throw {
        status: 400,
        message:
          "Duplicate salary components are not allowed"
      };
    }

    if (components.length > 0) {

      const [validComponents] =
        await conn.query(
          `
          SELECT
            id,
            name,
            type
          FROM salary_components
          WHERE
            id IN (?)
            AND company_id = ?
            AND is_deleted = 0
          `,
          [
            componentIds,
            company_id
          ]
        );

      if (
        validComponents.length !==
        components.length
      ) {
        throw {
          status: 400,
          message:
            "Some salary components are invalid or unavailable"
        };
      }

      const validComponentIds =
        new Set(
          validComponents.map(
            c => Number(c.id)
          )
        );

      for (const c of components) {

        const comp_id =
          Number(
            c.component_id
          );

        if (
          !validComponentIds.has(
            comp_id
          )
        ) {
          throw {
            status: 400,
            message:
              `Invalid component_id: ${comp_id}`
          };
        }

        if (
          ![
            "fixed",
            "percentage"
          ].includes(
            c.calc_type
          )
        ) {
          throw {
            status: 400,
            message:
              `Invalid calc_type for component ${comp_id}`
          };
        }

        const calc_value =
          Number(
            c.calc_value
          );

        if (
          Number.isNaN(
            calc_value
          ) ||
          calc_value < 0
        ) {
          throw {
            status: 400,
            message:
              `Invalid calc_value for component ${comp_id}`
          };
        }
      }
    }

    const [salaryResult] =
      await conn.query(
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
        VALUES
        (
          ?, ?, ?, ?, ?, 1, ?
        )
        `,
        [
          company_id,
          employee_id,
          base_amount,
          effective_from,
          effective_to || null,
          user_id || null
        ]
      );

    const salary_id =
      salaryResult.insertId;

    if (components.length > 0) {

      const rows =
        components.map(c => [
          company_id,
          employee_id,
          salary_id,
          Number(c.component_id),
          c.calc_type,
          Number(c.calc_value),
          c.reason || null,
          1,
          user_id || null
        ]);

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
        [rows]
      );
    }

    await conn.commit();

    return sendSuccess(
      res,
      201,
      "Salary assigned successfully",
      {
        salary_id,
        employee,
        base_amount,
        effective_from,
        effective_to,
        components
      }
    );

  } catch (err) {

    if (conn) {
      await conn.rollback();
    }

    console.error(
      "Assign Salary Error:",
      err
    );

    return sendError(
      res,
      err.status || 500,
      err.message ||
      "Internal server error"
    );

  } finally {

    if (conn) {
      conn.release();
    }
  }
});

router.put("/update-salary", auth(SAL.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = req.company?.id;
    const user_id = req.user?.id;

    const {
      salary_id,
      base_amount,
      effective_from,
      effective_to = null,
      components = []
    } = req.body;

    if (!company_id || !user_id) {
      throw {
        status: 400,
        message: "Invalid company or user"
      };
    }

    if (!salary_id) {
      throw {
        status: 400,
        message: "salary_id is required"
      };
    }

    if (
      !Array.isArray(components) ||
      components.length === 0
    ) {
      throw {
        status: 400,
        message: "Components are required"
      };
    }

    const [[salary]] = await conn.query(
      `SELECT *
       FROM salary_structures
       WHERE id = ?
       AND company_id = ?
       AND is_deleted = 0`,
      [salary_id, company_id]
    );

    if (!salary) {
      throw {
        status: 404,
        message: "Salary not found"
      };
    }

    const salaryStatus =
      getSalaryStatus({
        effective_from:
          salary.effective_from,
        effective_to:
          salary.effective_to
      });

    if (salaryStatus === "past") {
      throw {
        status: 400,
        message:
          "Past salary cannot be edited"
      };
    }

    const [[usedInPayroll]] =
      await conn.query(
        `SELECT id
        FROM payroll_entries
        WHERE salary_id = ?
        AND is_deleted = 0
        LIMIT 1`,
        [salary_id]
      );

    if (usedInPayroll) {
      throw {
        status: 400,
        message:
          "Salary already used in payroll. Create a revision instead."
      };
    }

    const employee_id =
      salary.employee_id;

    const [[employee]] =
      await conn.query(
        `SELECT id
         FROM employees
         WHERE id = ?
         AND company_id = ?
         AND is_active = 1
         AND is_deleted = 0`,
        [
          employee_id,
          company_id
        ]
      );

    if (!employee) {
      throw {
        status: 404,
        message:
          "Employee not found"
      };
    }

    const amount = Number(base_amount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw {
        status: 400,
        message:
          "Invalid base_amount"
      };
    }

    if (
      !effective_from ||
      !isValidDate(
        effective_from
      )
    ) {
      throw {
        status: 400,
        message:
          "Invalid effective_from"
      };
    }

    if (
      effective_to &&
      !isValidDate(
        effective_to
      )
    ) {
      throw {
        status: 400,
        message:
          "Invalid effective_to"
      };
    }

    if (
      effective_to &&
      !isDateAfter(
        effective_to,
        effective_from
      )
    ) {
      throw {
        status: 400,
        message:
          "effective_to must be greater than effective_from"
      };
    }

    const duplicateCheck =
      new Set();

    for (const component of components) {
      const componentId =
        Number(
          component.component_id
        );

      if (
        !componentId ||
        duplicateCheck.has(
          componentId
        )
      ) {
        throw {
          status: 400,
          message:
            "Duplicate salary components are not allowed"
        };
      }

      duplicateCheck.add(
        componentId
      );

      if (
        ![
          "fixed",
          "percentage"
        ].includes(
          component.calc_type
        )
      ) {
        throw {
          status: 400,
          message: `Invalid calc_type for component ${componentId}`
        };
      }

      const value = Number(
        component.calc_value
      );

      if (
        !Number.isFinite(value) ||
        value < 0
      ) {
        throw {
          status: 400,
          message: `Invalid calc_value for component ${componentId}`
        };
      }

      if (
        component.calc_type ===
        "percentage" &&
        value > 100
      ) {
        throw {
          status: 400,
          message:
            "Percentage component cannot exceed 100"
        };
      }
    }

    const componentIds =
      components.map((c) =>
        Number(c.component_id)
      );

    const [validComponents] =
      await conn.query(
        `SELECT id
         FROM salary_components
         WHERE company_id = ?
         AND is_deleted = 0
         AND id IN (?)`,
        [
          company_id,
          componentIds
        ]
      );

    if (
      validComponents.length !==
      componentIds.length
    ) {
      throw {
        status: 400,
        message:
          "Invalid salary components"
      };
    }

    const [[overlap]] =
      await conn.query(
        `SELECT id
         FROM salary_structures
         WHERE employee_id = ?
         AND company_id = ?
         AND id <> ?
         AND is_deleted = 0
         AND (
           effective_from <= COALESCE(?, '9999-12-31')
           AND COALESCE(
             effective_to,
             '9999-12-31'
           ) >= ?
         )
         LIMIT 1`,
        [
          employee_id,
          company_id,
          salary_id,
          effective_to,
          effective_from
        ]
      );

    if (overlap) {
      throw {
        status: 400,
        message:
          "Salary period overlaps with another salary structure"
      };
    }

    await conn.query(
      `UPDATE salary_structures
       SET
         base_amount = ?,
         effective_from = ?,
         effective_to = ?,
         updated_by = ?
       WHERE id = ?`,
      [
        amount,
        effective_from,
        effective_to,
        user_id,
        salary_id
      ]
    );

    await conn.query(
      `DELETE
       FROM employee_salary_component
       WHERE salary_id = ?`,
      [salary_id]
    );

    const componentRows =
      components.map(
        (component) => [
          company_id,
          employee_id,
          salary_id,
          component.component_id,
          component.calc_type,
          component.calc_value,
          component.remark || null,
          1,
          user_id
        ]
      );

    await conn.query(
      `INSERT INTO employee_salary_component
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
      VALUES ?`,
      [componentRows]
    );

    await conn.commit();

    return sendSuccess(
      res,
      200,
      "Salary updated successfully",
      {
        salary_id,
        employee_id,
        base_amount:
          Number(amount),
        effective_from,
        effective_to,
        components
      }
    );

  } catch (error) {

    if (conn) {
      await conn.rollback();
    }

    console.error(
      "Update Salary Error:",
      error
    );

    return sendError(
      res,
      error.status || 500,
      error.message ||
      "Internal server error"
    );

  } finally {

    if (conn) {
      conn.release();
    }
  }
});

router.post("/revise-salary", auth(SAL.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = req.company?.id;
    const user_id = req.user?.id;

    let {
      employee_id,
      base_amount,
      components = []
    } = req.body;

    if (
      !company_id ||
      !employee_id ||
      !base_amount
    ) {
      throw {
        status: 400,
        message: "Required fields missing"
      };
    }

    employee_id = Number(employee_id);
    base_amount = Number(base_amount);

    if (
      !employee_id ||
      Number.isNaN(base_amount) ||
      base_amount <= 0
    ) {
      throw {
        status: 400,
        message: "Invalid values supplied"
      };
    }

    if (
      !Array.isArray(components) ||
      components.length === 0
    ) {
      throw {
        status: 400,
        message: "Salary components are required"
      };
    }

    const [[employee]] = await conn.query(
      `
      SELECT id
      FROM employees
      WHERE id = ?
      AND company_id = ?
      AND is_deleted = 0
      `,
      [employee_id, company_id]
    );

    if (!employee) {
      throw {
        status: 404,
        message: "Employee not found"
      };
    }

    const [[currentSalary]] = await conn.query(
      `
      SELECT *
      FROM salary_structures
      WHERE employee_id = ?
      AND company_id = ?
      AND is_deleted = 0
      AND is_active = 1
      AND EXTRACT(YEAR_MONTH FROM effective_from)
          <= EXTRACT(YEAR_MONTH FROM CURDATE())
      AND (
          effective_to IS NULL
          OR EXTRACT(YEAR_MONTH FROM effective_to)
            >= EXTRACT(YEAR_MONTH FROM CURDATE())
      )
      ORDER BY effective_from DESC
      LIMIT 1
      `,
      [employee_id, company_id]
    );

    if (!currentSalary) {
      throw {
        status: 400,
        message:
          "No salary assigned for the current month. Please assign salary first."
      };
    }

    const componentIds = [
      ...new Set(
        components.map(item =>
          Number(item.component_id)
        )
      )
    ];

    const [validComponents] = await conn.query(
      `
      SELECT id
      FROM salary_components
      WHERE company_id = ?
      AND is_deleted = 0
      AND is_active = 1
      AND id IN (?)
      `,
      [company_id, componentIds]
    );

    if (validComponents.length !== componentIds.length) {
      throw {
        status: 400,
        message: "Invalid salary components supplied"
      };
    }

    const today = new Date();

    const effectiveFrom = formatDate(today);

    const previousSalaryEndDate = formatDate(
      addDays(today, -1)
    );

    await conn.query(
      `
      UPDATE salary_structures
      SET
        effective_to = ?,
        is_active = 0,
        updated_by = ?
      WHERE id = ?
      `,
      [
        previousSalaryEndDate,
        user_id || null,
        currentSalary.id
      ]
    );

    const [salaryInsert] = await conn.query(
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
      VALUES
      (
        ?, ?, ?, ?, NULL, 1, ?
      )
      `,
      [
        company_id,
        employee_id,
        base_amount,
        effectiveFrom,
        user_id || null
      ]
    );

    const newSalaryId = salaryInsert.insertId;

    const componentRows = components.map(component => [
      company_id,
      employee_id,
      newSalaryId,
      Number(component.component_id),
      component.calc_type,
      Number(component.calc_value || 0),
      component.reason || null,
      1,
      user_id || null
    ]);

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

    await conn.commit();

    return res.status(201).json({
      success: true,
      message: "Salary revised successfully"
    });

  } catch (err) {
    if (conn) {
      await conn.rollback();
    }

    console.error("Salary Revision Error:", err);

    return res.status(err.status || 500).json({
      success: false,
      message:
        err.message || "Internal server error"
    });

  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.delete("/delete-salary", auth(SAL.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = req.company?.id;
    const user_id = req.user?.id;

    const { salary_id } = req.body;

    if (!company_id || !user_id) {
      throw {
        status: 400,
        message: "Invalid company or user"
      };
    }

    if (!salary_id) {
      throw {
        status: 400,
        message: "salary_id is required"
      };
    }

    const [[salary]] = await conn.query(
      `SELECT *
       FROM salary_structures
       WHERE id = ?
         AND company_id = ?
         AND is_deleted = 0
       FOR UPDATE`,
      [salary_id, company_id]
    );

    if (!salary) {
      throw {
        status: 404,
        message: "Salary record not found"
      };
    }

    const [[payrollUsed]] = await conn.query(
      `SELECT id
       FROM payroll_entries
       WHERE salary_id = ?
         AND is_deleted = 0
       LIMIT 1`,
      [salary_id]
    );

    if (payrollUsed) {
      throw {
        status: 400,
        message:
          "Salary already used in payroll. Cannot delete."
      };
    }

    const employee_id = salary.employee_id;

    const [[prevSalary]] = await conn.query(
      `SELECT *
       FROM salary_structures
       WHERE employee_id = ?
         AND company_id = ?
         AND is_deleted = 0
         AND id <> ?
         AND effective_from < ?
       ORDER BY effective_from DESC
       LIMIT 1
       FOR UPDATE`,
      [
        employee_id,
        company_id,
        salary_id,
        salary.effective_from
      ]
    );

    const [[nextSalary]] = await conn.query(
      `SELECT *
       FROM salary_structures
       WHERE employee_id = ?
         AND company_id = ?
         AND is_deleted = 0
         AND id <> ?
         AND effective_from > ?
       ORDER BY effective_from ASC
       LIMIT 1
       FOR UPDATE`,
      [
        employee_id,
        company_id,
        salary_id,
        salary.effective_from
      ]
    );

    await conn.query(
      `UPDATE employee_salary_component
       SET is_deleted = 1,
           deleted_at = NOW(),
           deleted_by = ?
       WHERE salary_id = ?
         AND is_deleted = 0`,
      [user_id, salary_id]
    );

    await conn.query(
      `UPDATE salary_structures
       SET is_deleted = 1,
           deleted_at = NOW(),
           deleted_by = ?,
           is_active = 0
       WHERE id = ?`,
      [user_id, salary_id]
    );

    /*
      Timeline Repair Cases

      Prev + Next  -> Bridge gap
      Prev only    -> Open ended
      Next only    -> Nothing required
      None         -> Nothing required
    */

    if (prevSalary && nextSalary) {
      await conn.query(
        `UPDATE salary_structures
         SET effective_to = DATE_SUB(?, INTERVAL 1 DAY),
             updated_by = ?
         WHERE id = ?`,
        [
          nextSalary.effective_from,
          user_id,
          prevSalary.id
        ]
      );
    } else if (prevSalary && !nextSalary) {
      await conn.query(
        `UPDATE salary_structures
         SET effective_to = NULL,
             updated_by = ?
         WHERE id = ?`,
        [
          user_id,
          prevSalary.id
        ]
      );
    }

    await conn.query(
      `UPDATE salary_structures
       SET is_active = 0
       WHERE employee_id = ?
         AND company_id = ?
         AND is_deleted = 0`,
      [employee_id, company_id]
    );

    const [[currentSalary]] = await conn.query(
      `SELECT id
       FROM salary_structures
       WHERE employee_id = ?
         AND company_id = ?
         AND is_deleted = 0
         AND CURDATE() >= effective_from
         AND (
              effective_to IS NULL
              OR CURDATE() <= effective_to
         )
       ORDER BY effective_from DESC
       LIMIT 1`,
      [employee_id, company_id]
    );

    if (currentSalary) {
      await conn.query(
        `UPDATE salary_structures
         SET is_active = 1,
             updated_by = ?
         WHERE id = ?`,
        [user_id, currentSalary.id]
      );
    }

    await conn.commit();

    return res.status(200).json({
      success: true,
      message: "Salary deleted successfully"
    });

  } catch (error) {

    if (conn) {
      await conn.rollback();
    }

    console.error("Delete Salary Error:", error);

    return res.status(error.status || 500).json({
      success: false,
      message:
        error.message ||
        "Something went wrong while deleting salary"
    });

  } finally {

    if (conn) {
      conn.release();
    }

  }
});

// Company end view assigned salaries to employees
router.get("/employees-salaries", auth(SAL.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const company_id = req.company?.id;

    let {
      page = 1,
      limit = 10,
      search = "",
      date,
      month,
      year,
      from_date,
      to_date
    } = req.query;

    if (!company_id) {
      return res.status(400).json({
        success: false,
        message: "Invalid company"
      });
    }


    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(100, parseInt(limit) || 10);
    const offset = (page - 1) * limit;


    let dateCondition = "";
    let dateParams = [];

    if (date) {
      dateCondition = `
        AND ss.effective_from <= ?
        AND (ss.effective_to IS NULL OR ss.effective_to >= ?)
      `;
      dateParams.push(date, date);

    } else if (from_date && to_date) {
      dateCondition = `
        AND ss.effective_from <= ?
        AND (ss.effective_to IS NULL OR ss.effective_to >= ?)
      `;
      dateParams.push(to_date, from_date);

    } else if (month && year) {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;

      const end = new Date(Date.UTC(year, month, 0))
        .toISOString()
        .split("T")[0];

      dateCondition = `
        AND ss.effective_from <= ?
        AND (ss.effective_to IS NULL OR ss.effective_to >= ?)
      `;
      dateParams.push(end, start);
    }


    const activeCondition = dateCondition
      ? ""
      : "AND ss.is_active = 1";


    let query = `
      SELECT
        e.id AS employee_id,
        e.employee_code,
        u.name,
        u.email,
        u.profile_picture,

        ss.id AS salary_id,
        ss.base_amount,
        ss.effective_from,
        ss.effective_to,

        CASE
          WHEN pe_used.salary_id IS NOT NULL THEN TRUE
          ELSE FALSE
        END AS payroll_used

      FROM employees e

      JOIN users u
        ON u.id = e.user_id

      INNER JOIN salary_structures ss
        ON ss.employee_id = e.id
        AND ss.company_id = e.company_id
        AND ss.is_deleted = 0
        ${activeCondition}
        ${dateCondition}

      LEFT JOIN (
        SELECT DISTINCT salary_id
        FROM payroll_entries
        WHERE is_deleted = 0
      ) pe_used
        ON pe_used.salary_id = ss.id

      WHERE e.company_id = ?
        AND e.is_deleted = 0
        AND e.is_active = 1
    `;

    const params = [...dateParams, company_id];

    if (search) {
      query += `
        AND (
          u.name LIKE ?
          OR u.email LIKE ?
          OR e.employee_code LIKE ?
        )
      `;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY u.name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await conn.query(query, params);

    if (rows.length === 0) {
      return res.json({
        success: true,
        message: "No salaries found",
        data: [],
        meta: { page, limit, total: 0, total_pages: 0, is_last_page: true }
      });
    }


    const salaryIds = rows.map(r => r.salary_id);

    const [componentRows] = await conn.query(
      `
      SELECT 
        esc.salary_id,
        c.id,
        c.code,
        c.name,
        c.type,
        esc.calc_type,
        esc.calc_value
      FROM employee_salary_component esc
      JOIN salary_components c 
        ON c.id = esc.component_id
        AND c.company_id = esc.company_id
      WHERE esc.salary_id IN (?)
        AND esc.company_id = ?
        AND esc.is_deleted = 0
      `,
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

      let total_earnings = base;
      let total_deductions = 0;
      let employer_contributions = 0;

      components.forEach(c => {
        let amount =
          c.calc_type === "percentage"
            ? (base * Number(c.calc_value)) / 100
            : Number(c.calc_value);

        amount = Number(amount.toFixed(2));
        c.amount = amount;

        if (c.type === "earning") total_earnings += amount;
        else if (c.type === "deduction") total_deductions += amount;
        else if (c.type === "employer_contribution") employer_contributions += amount;
      });

      const gross_salary = Number(total_earnings.toFixed(2));
      const total_deductions_clean = Number(total_deductions.toFixed(2));
      const employer_contributions_clean = Number(employer_contributions.toFixed(2));


      const net_salary = Math.max(
        0,
        Number((gross_salary - total_deductions_clean).toFixed(2))
      );

      const ctc = Number(
        (gross_salary + employer_contributions_clean).toFixed(2)
      );

      return {
        salary_id: row.salary_id,
        payroll_used: Boolean(row.payroll_used),

        employee: {
          id: row.employee_id,
          employee_code: row.employee_code,
          name: row.name,
          email: row.email,
          profile_picture: buildFileUrl(row.profile_picture)
        },

        base_amount: base,
        effective_from: row.effective_from,
        effective_to: row.effective_to,

        ctc,
        gross_salary,
        employer_contributions: employer_contributions_clean,
        total_deductions: total_deductions_clean,
        net_salary,

        components
      };
    });


    let countQuery = `
      SELECT COUNT(*) AS total
      FROM employees e
      JOIN users u ON u.id = e.user_id
      INNER JOIN salary_structures ss 
        ON ss.employee_id = e.id
        AND ss.company_id = e.company_id
        AND ss.is_deleted = 0
        ${activeCondition}
        ${dateCondition}
      WHERE e.company_id = ?
        AND e.is_deleted = 0
        AND e.is_active = 1
    `;

    const countParams = [...dateParams, company_id];

    if (search) {
      countQuery += `
        AND (
          u.name LIKE ?
          OR u.email LIKE ?
          OR e.employee_code LIKE ?
        )
      `;
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [[countResult]] = await conn.query(countQuery, countParams);

    const total = countResult.total || 0;

    return res.status(200).json({
      success: true,
      message: "Employee salaries fetched successfully",
      data: results,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
        is_last_page: offset + results.length >= total
      }
    });

  } catch (error) {
    console.error("Employees Salary Error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching employee salaries"
    });

  } finally {
    if (conn) conn.release();
  }
});

// Company end to view salary payrole generated for an employee
router.get("/employee-salary-history", auth(SAL.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const company_id = req.company?.id;
    const employee_id = Number(req.query.employee_id);

    if (!company_id || !employee_id) {
      return res.status(400).json({
        success: false,
        message: "Invalid company or employee"
      });
    }

    const todayStr = new Date().toISOString().split("T")[0];

    const [rows] = await conn.query(
      `
      SELECT 
        ss.id AS salary_id,
        ss.base_amount,
        ss.effective_from,
        ss.effective_to,

        'past' AS status

      FROM salary_structures ss
      WHERE ss.employee_id = ?
        AND ss.company_id = ?
        AND ss.is_deleted = 0
        AND (
          ss.effective_to IS NOT NULL
          AND ss.effective_to < CURDATE()
        )

      ORDER BY ss.effective_from DESC
      `,
      [employee_id, company_id]
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        message: "No salary history found",
        data: []
      });
    }


    const salaryIds = rows.map(r => r.salary_id);

    const [components] = await conn.query(
      `
      SELECT 
        esc.salary_id,
        c.name,
        c.code,
        c.type,
        esc.calc_type,
        esc.calc_value
      FROM employee_salary_component esc
      JOIN salary_components c ON c.id = esc.component_id
      WHERE esc.salary_id IN (?)
        AND esc.company_id = ?
        AND esc.is_deleted = 0
      `,
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
      components: compMap[r.salary_id] || []
    }));

    return res.status(200).json({
      success: true,
      message: "Salary history fetched successfully",
      data: result
    });

  } catch (err) {
    console.error("Salary History Error:", err);

    return res.status(500).json({
      success: false,
      message: "Something went wrong"
    });

  } finally {
    if (conn) conn.release();
  }
});


// employee end to check salary
router.get("/my-salary", auth(SAL.EMP), async (req, res) => {
  let conn;

  try {

    conn = await db.getConnection();

    const company_id = req.company?.id;
    const user_id = req.user?.id;

    if (!company_id || !user_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access"
      });
    }

    let month = new Date().getMonth() + 1;
    let year = new Date().getFullYear();

    if (req.query.month !== undefined) {
      const parsedMonth = Number(req.query.month);

      if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
        return res.status(400).json({
          success: false,
          message: "Invalid month. Must be between 1-12"
        });
      }

      month = parsedMonth;
    }

    if (req.query.year !== undefined) {
      const parsedYear = Number(req.query.year);

      if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
        return res.status(400).json({
          success: false,
          message: "Invalid year. Must be between 2000-2100"
        });
      }

      year = parsedYear;
    }

    const targetDate = `${year}-${String(month).padStart(2, "0")}-01`;

    const [[employee]] = await conn.query(
      `
      SELECT e.id AS employee_id
      FROM employees e
      WHERE e.user_id = ?
        AND e.company_id = ?
        AND e.is_deleted = 0
        AND e.is_active = 1
      LIMIT 1
      `,
      [user_id, company_id]
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    const employee_id = employee.employee_id;

    const [[salaryStructure]] = await conn.query(
      `
      SELECT 
        ss.id,
        ss.base_amount,
        ss.effective_from,
        ss.effective_to,
        ss.created_at
      FROM salary_structures ss
      WHERE ss.company_id = ?
        AND ss.employee_id = ?
        AND ss.is_deleted = 0
        AND ss.is_active = 1
        AND ss.effective_from <= LAST_DAY(?)
        AND (
          ss.effective_to IS NULL
          OR ss.effective_to >= ?
        )
      ORDER BY ss.effective_from DESC, ss.id DESC
      LIMIT 1
      `,
      [
        company_id,
        employee_id,
        targetDate,
        targetDate
      ]
    );

    if (!salaryStructure) {
      return res.status(404).json({
        success: false,
        message: "Salary structure not found"
      });
    }

    const [components] = await conn.query(
      `
      SELECT
        esc.id,
        sc.id AS component_id,
        sc.code,
        sc.name,
        sc.type,
        sc.is_taxable,
        sc.is_statutory,
        esc.calc_type,
        esc.calc_value,
        esc.remark,

        CASE
          WHEN esc.calc_type = 'fixed'
            THEN esc.calc_value
          WHEN esc.calc_type = 'percentage'
            THEN ROUND((ss.base_amount * esc.calc_value) / 100, 2)
          ELSE 0
        END AS amount

      FROM employee_salary_component esc

      INNER JOIN salary_components sc
        ON sc.id = esc.component_id
        AND sc.is_deleted = 0
        AND sc.is_active = 1

      INNER JOIN salary_structures ss
        ON ss.id = esc.salary_id
        AND ss.is_deleted = 0
        AND ss.is_active = 1

      WHERE esc.company_id = ?
        AND esc.employee_id = ?
        AND esc.salary_id = ?
        AND esc.is_deleted = 0
        AND esc.is_active = 1

      ORDER BY sc.type ASC, sc.name ASC
      `,
      [
        company_id,
        employee_id,
        salaryStructure.id
      ]
    );

    let totalEarnings = 0;
    let totalDeductions = 0;

    const earnings = [];
    const deductions = [];

    for (const item of components) {

      const component = {
        component_id: item.component_id,
        code: item.code,
        name: item.name,
        type: item.type,
        is_taxable: !!item.is_taxable,
        is_statutory: !!item.is_statutory,
        calc_type: item.calc_type,
        calc_value: Number(item.calc_value),
        amount: Number(item.amount),
        remark: item.remark
      };

      if (item.type === "earning") {
        totalEarnings += Number(item.amount);
        earnings.push(component);
      } else if (item.type === "deduction") {
        totalDeductions += Number(item.amount);
        deductions.push(component);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Salary structure fetched successfully",
      data: {
        salary_structure_id: salaryStructure.id,
        month,
        year,
        base_amount: Number(salaryStructure.base_amount),
        effective_from: salaryStructure.effective_from,
        effective_to: salaryStructure.effective_to,
        total_earnings: totalEarnings,
        total_deductions: totalDeductions,
        net_salary: Number(salaryStructure.base_amount) + totalEarnings - totalDeductions,
        earnings,
        deductions
      }
    });

  } catch (error) {

    console.error("❌ Salary Structure API Error:", {
      message: error.message,
      stack: error.stack,
      query: req.query,
      user_id: req.user?.id,
      company_id: req.company?.id
    });

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  } finally {

    if (conn) conn.release();
  }
});


export default router;

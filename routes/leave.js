import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import { validateFields, leaveTypeValidation, leaveStatusValidation, halfDayTypeValidation } from "../utils/constantsValidator.js";
import { LEAVE_TYPES, LEAVE_STATUSES, DESIGNATIONS } from "../constants/constants_values.js";
import { toBooleanFields } from "../utils/toBooleanFields.js";
import { saveMediaFromUrl, buildFileUrl } from "../utils/fileService.js";
import { adjustEmployeeLeaveBalance } from "../utils/leaveBalanceUtils.js";
import {
  isWeekendDate, toISTDateTime, formatToDate, isBeforeJoining, isSameDate,
  getISTNow, convertToISTFields, parseDate, isDateAfter, eachDateBetween, getYearFromDate
} from "../utils/time.js";
import { checkCompanyPermissions } from "../utils/checkPermissions.js";
import { queueLeaveRequestEmail, queueLeaveAcceptanceEmail, queueLeaveRejectionEmail } from "../email/services/email.processor.js";
import { getEnumObject } from "../utils/constantsValidator.js";
import { LEAVE, LEAVE_BAL, LEAVE_CFG } from "../constants/permissions.js";
import { sendSuccess, sendError } from "../utils/sendResponse.js";



const router = express.Router();


// Leave config create
router.post("/create", auth(LEAVE_CFG.MNG), async (req, res) => {
  let conn;

  try {
    const {
      code,
      name,
      is_paid,
      allow_half_day,
      max_balance,
      carry_forward_limit,
      exclude_weekends,
    } = req.body;

    const company_id = req.company?.id;
    const user_id = req.user?.id;


    if (!company_id) {
      return res.status(400).json({
        success: false,
        message: "Company context missing"
      });
    }

    if (!code || !name) {
      return res.status(400).json({
        success: false,
        message: "Code and name are required"
      });
    }


    const normalizedCode = code.trim().toUpperCase();
    const normalizedName = name.trim();


    if (max_balance !== undefined && max_balance !== null && isNaN(max_balance)) {
      return res.status(400).json({
        success: false,
        message: "Invalid max_balance"
      });
    }


    conn = await db.getConnection();
    await conn.beginTransaction();


    const [existing] = await conn.query(
      `SELECT id FROM leave_configs 
       WHERE company_id = ? AND code = ? AND is_deleted = 0
       LIMIT 1`,
      [company_id, normalizedCode]
    );

    if (existing.length) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: "Leave code already exists"
      });
    }


    const [result] = await conn.query(
      `INSERT INTO leave_configs
      (company_id, code, name, is_paid, allow_half_day,
        max_balance, carry_forward_limit, exclude_weekends, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id,
        normalizedCode,
        normalizedName,
        is_paid ?? 1,
        allow_half_day ?? 1,
        max_balance ?? null,
        carry_forward_limit || 0,
        exclude_weekends ?? 1,
        user_id || null
      ]
    );

    await conn.commit();

    return res.status(201).json({
      success: true,
      message: "Leave config created",
    });

  } catch (err) {
    if (conn) await conn.rollback();

    console.error("Create Leave Config Error:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Duplicate leave code"
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


// Get all company leave configs
router.get("/company", auth(LEAVE_CFG.MNG), async (req, res) => {

  let conn;

  try {




    conn = await db.getConnection();




    const company_id = Number(req.company?.id);

    if (!company_id) {
      return res.status(400).json({
        success: false,
        message: "Company context missing"
      });
    }




    const page = Math.max(parseInt(req.query.page) || 1, 1);

    const limit = Math.min(
      Math.max(parseInt(req.query.limit) || 10, 1),
      100
    );

    const offset = (page - 1) * limit;

    const search = req.query.search?.trim();

    const is_active = req.query.is_active;
    const is_paid = req.query.is_paid;




    const normalizeBoolean = (value) => {

      if (
        value === true ||
        value === 1 ||
        value === "1" ||
        value === "true"
      ) {
        return 1;
      }

      if (
        value === false ||
        value === 0 ||
        value === "0" ||
        value === "false"
      ) {
        return 0;
      }

      return null;
    };




    let normalizedIsActive = undefined;
    let normalizedIsPaid = undefined;




    if (is_active !== undefined) {

      normalizedIsActive =
        normalizeBoolean(is_active);

      if (normalizedIsActive === null) {
        return res.status(400).json({
          success: false,
          message:
            "is_active must be 1, 0, true, or false"
        });
      }
    }




    if (is_paid !== undefined) {

      normalizedIsPaid =
        normalizeBoolean(is_paid);

      if (normalizedIsPaid === null) {
        return res.status(400).json({
          success: false,
          message:
            "is_paid must be 1, 0, true, or false"
        });
      }
    }




    let query = `
      SELECT
        id,
        code,
        name,
        is_paid,
        allow_half_day,
        max_balance,
        carry_forward_limit,
        exclude_weekends,
        is_active,
        created_at,
        updated_at
      FROM leave_configs
      WHERE
        company_id = ?
        AND is_deleted = 0
    `;

    const params = [company_id];




    if (search) {

      query += `
        AND (
          code LIKE ?
          OR name LIKE ?
        )
      `;

      const searchValue = `%${search}%`;

      params.push(
        searchValue,
        searchValue
      );
    }




    if (normalizedIsActive !== undefined) {

      query += `
        AND is_active = ?
      `;

      params.push(normalizedIsActive);
    }




    if (normalizedIsPaid !== undefined) {

      query += `
        AND is_paid = ?
      `;

      params.push(normalizedIsPaid);
    }




    query += `
      ORDER BY created_at DESC
      LIMIT ?
      OFFSET ?
    `;

    params.push(limit, offset);




    const [rows] = await conn.query(
      query,
      params
    );




    let countQuery = `
      SELECT COUNT(*) AS total
      FROM leave_configs
      WHERE
        company_id = ?
        AND is_deleted = 0
    `;

    const countParams = [company_id];




    if (search) {

      countQuery += `
        AND (
          code LIKE ?
          OR name LIKE ?
        )
      `;

      const searchValue = `%${search}%`;

      countParams.push(
        searchValue,
        searchValue
      );
    }




    if (normalizedIsActive !== undefined) {

      countQuery += `
        AND is_active = ?
      `;

      countParams.push(normalizedIsActive);
    }




    if (normalizedIsPaid !== undefined) {

      countQuery += `
        AND is_paid = ?
      `;

      countParams.push(normalizedIsPaid);
    }




    const [[{ total }]] = await conn.query(
      countQuery,
      countParams
    );




    const responseData = rows.map(item =>
      toBooleanFields(
        item,
        [
          "is_paid",
          "allow_half_day",
          "exclude_weekends",
          "is_active"
        ]
      )
    );




    return res.status(200).json({
      success: true,
      message:
        "Leave configs fetched successfully",

      data: responseData,

      meta: {
        page,
        limit,
        total,
        total_pages:
          Math.ceil(total / limit),

        has_next_page:
          page < Math.ceil(total / limit),

        has_previous_page:
          page > 1
      }
    });

  } catch (err) {




    console.error(
      "Get Leave Configs Error:",
      err
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  } finally {




    if (conn) {
      conn.release();
    }
  }
});

// update leave config
router.put("/update", auth(LEAVE_CFG.MNG), async (req, res) => {

  let conn;

  try {




    const company_id = Number(req.company?.id);

    const user_id =
      req.user?.id
        ? Number(req.user.id)
        : null;

    const id = Number(req.body?.id);




    if (!company_id) {
      return res.status(401).json({
        success: false,
        message: "Company context missing"
      });
    }

    if (!user_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user"
      });
    }

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid leave config id is required"
      });
    }




    let {
      code,
      name,
      is_paid,
      allow_half_day,
      max_balance,
      carry_forward_limit,
      exclude_weekends,
      is_active
    } = req.body;




    if (typeof code === "string") {
      code = code.trim().toUpperCase();
    }

    if (typeof name === "string") {
      name = name.trim();
    }




    const isBooleanLike = (value) => {
      return (
        value === true ||
        value === false ||
        value === 1 ||
        value === 0 ||
        value === "1" ||
        value === "0" ||
        value === "true" ||
        value === "false"
      );
    };

    const toBooleanNumber = (value) => {

      if (
        value === true ||
        value === 1 ||
        value === "1" ||
        value === "true"
      ) {
        return 1;
      }

      return 0;
    };

    const isValidDecimal = (value) => {
      return (
        value !== "" &&
        value !== null &&
        !isNaN(Number(value))
      );
    };




    const booleanFields = {
      is_paid,
      allow_half_day,
      exclude_weekends,
      is_active
    };

    for (const [field, value] of Object.entries(booleanFields)) {

      if (
        value !== undefined &&
        !isBooleanLike(value)
      ) {
        return res.status(400).json({
          success: false,
          message:
            `${field} must be true/false or 0/1`
        });
      }
    }




    if (code !== undefined) {

      if (
        typeof code !== "string" ||
        !code
      ) {
        return res.status(400).json({
          success: false,
          message:
            "code must be a valid string"
        });
      }

      if (code.length > 20) {
        return res.status(400).json({
          success: false,
          message:
            "code cannot exceed 20 characters"
        });
      }
    }

    if (name !== undefined) {

      if (
        typeof name !== "string" ||
        !name
      ) {
        return res.status(400).json({
          success: false,
          message:
            "name must be a valid string"
        });
      }

      if (name.length > 50) {
        return res.status(400).json({
          success: false,
          message:
            "name cannot exceed 50 characters"
        });
      }
    }






    if (
      max_balance !== undefined &&
      max_balance !== null &&
      !isValidDecimal(max_balance)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid max_balance"
      });
    }

    if (
      carry_forward_limit !== undefined &&
      carry_forward_limit !== null &&
      !isValidDecimal(carry_forward_limit)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid carry_forward_limit"
      });
    }




    const numericFields = [
      {
        key: "max_balance",
        value: max_balance
      },
      {
        key: "carry_forward_limit",
        value: carry_forward_limit
      }
    ];

    for (const item of numericFields) {

      if (
        item.value !== undefined &&
        item.value !== null &&
        Number(item.value) < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            `${item.key} cannot be negative`
        });
      }
    }




    conn = await db.getConnection();

    await conn.beginTransaction();




    const [[existingConfig]] =
      await conn.query(
        `
        SELECT
          id,
          code,          
          is_active
        FROM leave_configs
        WHERE id = ?
          AND company_id = ?
          AND is_deleted = 0
        LIMIT 1
        `,
        [id, company_id]
      );

    if (!existingConfig) {

      await conn.rollback();

      return res.status(404).json({
        success: false,
        message:
          "Leave config not found"
      });
    }






    if (code !== undefined) {

      const [[duplicateCode]] =
        await conn.query(
          `
          SELECT id
          FROM leave_configs
          WHERE company_id = ?
            AND code = ?
            AND id != ?
            AND is_deleted = 0
          LIMIT 1
          `,
          [
            company_id,
            code,
            id
          ]
        );

      if (duplicateCode) {

        await conn.rollback();

        return res.status(409).json({
          success: false,
          message:
            "Leave code already exists"
        });
      }
    }




    const fields = [];
    const values = [];

    if (code !== undefined) {
      fields.push("code = ?");
      values.push(code);
    }

    if (name !== undefined) {
      fields.push("name = ?");
      values.push(name);
    }

    if (is_paid !== undefined) {
      fields.push("is_paid = ?");
      values.push(
        toBooleanNumber(is_paid)
      );
    }

    if (allow_half_day !== undefined) {
      fields.push("allow_half_day = ?");
      values.push(
        toBooleanNumber(allow_half_day)
      );
    }

    if (max_balance !== undefined) {
      fields.push("max_balance = ?");
      values.push(
        max_balance === null
          ? null
          : Number(max_balance)
      );
    }

    if (
      carry_forward_limit !== undefined
    ) {
      fields.push(
        "carry_forward_limit = ?"
      );

      values.push(
        carry_forward_limit === null
          ? null
          : Number(carry_forward_limit)
      );
    }

    if (
      exclude_weekends !== undefined
    ) {
      fields.push(
        "exclude_weekends = ?"
      );

      values.push(
        toBooleanNumber(
          exclude_weekends
        )
      );
    }




    if (is_active !== undefined) {
      fields.push("is_active = ?");
      values.push(
        toBooleanNumber(is_active)
      );
    }




    if (!fields.length) {

      await conn.rollback();

      return res.status(400).json({
        success: false,
        message:
          "No fields provided for update"
      });
    }




    fields.push("updated_by = ?");
    values.push(user_id);




    const updateQuery = `
      UPDATE leave_configs
      SET ${fields.join(", ")}
      WHERE id = ?
        AND company_id = ?
        AND is_deleted = 0
    `;

    values.push(id);
    values.push(company_id);

    await conn.query(
      updateQuery,
      values
    );




    const [[updatedConfig]] =
      await conn.query(
        `
        SELECT
          lc.*,

          creator.name AS created_by_name,
          updater.name AS updated_by_name

        FROM leave_configs lc

        LEFT JOIN users creator
          ON creator.id = lc.created_by

        LEFT JOIN users updater
          ON updater.id = lc.updated_by

        WHERE lc.id = ?
          AND lc.company_id = ?
          AND lc.is_deleted = 0

        LIMIT 1
        `,
        [id, company_id]
      );




    await conn.commit();




    const booleanColumns = [
      "is_paid",
      "allow_half_day",
      "exclude_weekends",
      "is_active",
      "is_deleted"
    ];

    for (const field of booleanColumns) {

      if (
        updatedConfig[field] !== undefined
      ) {
        updatedConfig[field] =
          Boolean(
            updatedConfig[field]
          );
      }
    }




    let message =
      "Leave config updated successfully";

    if (is_active !== undefined) {

      message =
        updatedConfig.is_active
          ? "Leave config activated successfully"
          : "Leave config deactivated successfully";
    }




    return res.status(200).json({
      success: true,
      message,
      data: updatedConfig
    });

  } catch (err) {

    if (conn) {
      await conn.rollback();
    }

    console.error(
      "Update Leave Config Error:",
      err
    );

    return res.status(500).json({
      success: false,
      message:
        "Internal server error"
    });

  } finally {

    if (conn) {
      conn.release();
    }
  }
});

// Delete leave config
router.delete("/delete", auth(LEAVE_CFG.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const id = req.body.id;
    const company_id = req.company?.id;
    const user_id = req.user?.id;

    if (!company_id) {
      return res.status(400).json({
        success: false,
        message: "Company context missing"
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Leave config id is required"
      });
    }


    const [existing] = await conn.query(
      `SELECT id FROM leave_configs
       WHERE id = ? AND company_id = ? AND is_deleted = 0
       LIMIT 1`,
      [id, company_id]
    );

    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "Leave config not found"
      });
    }


    const [used] = await conn.query(
      `SELECT id FROM employee_leaves 
       WHERE leave_config_id = ? 
       LIMIT 1`,
      [id]
    );

    if (used.length) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot delete, already used in leaves"
      });
    }


    await conn.query(
      `UPDATE leave_configs
       SET is_deleted = 1,
           is_active = 0,
           deleted_at = NOW(),
           deleted_by = ?
       WHERE id = ? AND company_id = ?`,
      [user_id || null, id, company_id]
    );

    await conn.commit();

    return res.json({
      success: true,
      message: "Leave config deleted successfully"
    });

  } catch (err) {
    if (conn) await conn.rollback();

    console.error("Delete Leave Config Error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  } finally {
    if (conn) conn.release();
  }
});

// Get my leave balance (employee)
router.get("/my-balance", auth(LEAVE_BAL.EMP), async (req, res) => {
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

    let year = new Date().getFullYear();

    if (req.query.year !== undefined) {
      const parsedYear = Number(req.query.year);

      if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
        return res.status(400).json({
          success: false,
          message: "Invalid year. Must be between 2000–2100"
        });
      }

      year = parsedYear;
    }


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


    const [rows] = await conn.query(
      `
      SELECT 
        lc.id AS leave_config_id,
        lc.code,
        lc.name,
        lc.is_paid,
        lc.allow_half_day,
        lc.carry_forward_limit,        
        lc.exclude_weekends,

        COALESCE(elb.total_allocated, 0) AS total_allocated,

        COALESCE(SUM(
          CASE 
            WHEN el.status = 'approved' THEN el.total_days
            ELSE 0
          END
        ), 0) AS used

      FROM leave_configs lc

      LEFT JOIN employee_leave_balances elb
        ON elb.leave_config_id = lc.id
        AND elb.employee_id = ?
        AND elb.company_id = ?
        AND elb.year = ?
        AND elb.is_deleted = 0

      LEFT JOIN employee_leaves el
        ON el.employee_id = ?
        AND el.leave_config_id = lc.id
        AND YEAR(el.start_date) = ?
        AND el.is_deleted = 0

      WHERE lc.company_id = ?
        AND lc.is_active = 1
        AND lc.is_deleted = 0

      GROUP BY lc.id
      ORDER BY lc.name ASC
      `,
      [
        employee_id,
        company_id,
        year,
        employee_id,
        year,
        company_id
      ]
    );


    const leaveData = {};

    rows.forEach(row => {
      const total = Number(row.total_allocated);
      const used = Number(row.used);
      const remaining = total - used;


      const key = row.name
        ? row.name.toLowerCase().replace(/\s+/g, "_")
        : `leave_${row.leave_config_id}`;

      leaveData[key] = {
        leave_config_id: row.leave_config_id,
        code: row.code,

        is_paid: !!row.is_paid,
        allow_half_day: !!row.allow_half_day,
        carry_forward_limit: Number(row.carry_forward_limit),
        exclude_weekends: !!row.exclude_weekends,

        total,
        used,
        remaining
      };
    });


    return res.status(200).json({
      success: true,
      message: "Leave balance fetched successfully",
      data: leaveData
    });

  } catch (error) {
    console.error("❌ Leave Balance API Error:", {
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

// Assign leave balance to employee
router.post("/assign-balance", auth(LEAVE_BAL.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = req.company?.id;
    const user_id = req.user?.id;

    const { employee_id, leaves } = req.body;
    const year = new Date().getFullYear();


    if (!company_id || !user_id) {
      return sendError(400, "Invalid company or user");
    }

    if (!employee_id || !Array.isArray(leaves) || leaves.length === 0) {
      return sendError(400, "employee_id and leaves are required");
    }


    const seen = new Set();
    for (const l of leaves) {
      if (seen.has(l.leave_config_id)) {
        return sendError(
          400,
          `Duplicate leave_config_id: ${l.leave_config_id}`
        );
      }
      seen.add(l.leave_config_id);
    }


    const [emp] = await conn.query(
      `SELECT id FROM employees
       WHERE id = ?
         AND company_id = ?
         AND is_deleted = 0
         AND is_active = 1`,
      [employee_id, company_id]
    );

    if (emp.length === 0) {
      return sendError(404, "Employee not found");
    }

    const leaveConfigIds = leaves.map(l => l.leave_config_id);


    const [configs] = await conn.query(
      `SELECT id, max_balance
       FROM leave_configs
       WHERE id IN (?)
         AND company_id = ?
         AND is_deleted = 0
         AND is_active = 1`,
      [leaveConfigIds, company_id]
    );

    const configMap = Object.fromEntries(configs.map(c => [c.id, c]));

    const values = [];

    for (const leave of leaves) {
      const config = configMap[leave.leave_config_id];

      if (!config) {
        throw {
          status: 400,
          message: `Invalid leave_config_id: ${leave.leave_config_id}`
        };
      }

      let allocated = Number(leave.total_allocated);

      if (isNaN(allocated) || allocated < 0) {
        throw {
          status: 400,
          message: `Invalid total_allocated for ${leave.leave_config_id}`
        };
      }

      if (config.max_balance !== null && allocated > config.max_balance) {
        allocated = Number(config.max_balance);
      }

      allocated = parseFloat(allocated.toFixed(2));

      values.push([
        company_id,
        employee_id,
        leave.leave_config_id,
        year,
        allocated,
        0,
        allocated,
        user_id,
        user_id,
        0
      ]);
    }


    await conn.query(
      `
      INSERT INTO employee_leave_balances
      (company_id, employee_id, leave_config_id, year,
       total_allocated, used, remaining,
       created_by, updated_by, is_deleted)

      VALUES ?

      ON DUPLICATE KEY UPDATE
        total_allocated = VALUES(total_allocated),
        remaining = GREATEST(VALUES(total_allocated) - used, 0),
        is_deleted = 0,
        updated_by = VALUES(updated_by),
        updated_at = CURRENT_TIMESTAMP
      `,
      [values]
    );


    const [result] = await conn.query(
      `
      SELECT 
        elb.id,
        elb.company_id,
        elb.employee_id,
        elb.leave_config_id,
        elb.year,
        elb.total_allocated,
        elb.used,
        elb.remaining,
        elb.is_active,
        elb.created_at,
        elb.updated_at,

        lc.code,
        lc.name,
        lc.is_paid,
        lc.allow_half_day,
        lc.max_balance,
        lc.carry_forward_limit,
        lc.exclude_weekends

      FROM employee_leave_balances elb
      JOIN leave_configs lc 
        ON lc.id = elb.leave_config_id

      WHERE elb.company_id = ?
        AND elb.employee_id = ?
        AND elb.year = ?
        AND elb.leave_config_id IN (?)
        AND elb.is_deleted = 0
        AND lc.is_deleted = 0
        AND lc.is_active = 1

      ORDER BY lc.name ASC
      `,
      [company_id, employee_id, year, leaveConfigIds]
    );

    await conn.commit();


    const booleanFields = [
      "is_paid",
      "allow_half_day",
      "exclude_weekends",
      "is_active"
    ];

    const formatted = result.map(row => ({
      ...row,
      ...toBooleanFields({ ...row }, booleanFields)
    }));

    return res.status(200).json({
      success: true,
      message: "Leave balances assigned successfully",
      count: formatted.length,
      data: formatted
    });

  } catch (error) {
    if (conn) await conn.rollback();

    console.error("Assign Leave Error:", error);

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error"
    });

  } finally {
    if (conn) conn.release();
  }
});

// Update leave balance to employee
router.put("/update-balance", auth(LEAVE_BAL.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = req.company?.id;
    const user_id = req.user?.id;

    const { employee_id, leaves } = req.body;
    const year = new Date().getFullYear();


    if (!company_id || !user_id) {
      throw { status: 400, message: "Invalid company or user" };
    }

    if (!employee_id || !Array.isArray(leaves) || leaves.length === 0) {
      throw { status: 400, message: "employee_id and leaves are required" };
    }


    const seen = new Set();
    for (const l of leaves) {
      if (seen.has(l.leave_config_id)) {
        throw {
          status: 400,
          message: `Duplicate leave_config_id: ${l.leave_config_id}`
        };
      }
      seen.add(l.leave_config_id);
    }

    const leaveIds = leaves.map(l => l.leave_config_id);


    const [balances] = await conn.query(
      `
      SELECT leave_config_id, used, total_allocated
      FROM employee_leave_balances
      WHERE company_id = ?
        AND employee_id = ?
        AND year = ?
        AND leave_config_id IN (?)
        AND is_deleted = 0
      `,
      [company_id, employee_id, year, leaveIds]
    );

    if (balances.length !== leaves.length) {
      throw {
        status: 400,
        message: "Some leave balances are not assigned"
      };
    }

    const balanceMap = Object.fromEntries(
      balances.map(b => [b.leave_config_id, b])
    );


    const [configs] = await conn.query(
      `
      SELECT id, max_balance
      FROM leave_configs
      WHERE id IN (?)
        AND company_id = ?
        AND is_deleted = 0
        AND is_active = 1
      `,
      [leaveIds, company_id]
    );

    if (configs.length !== leaves.length) {
      throw {
        status: 400,
        message: "Some leave configs are invalid or inactive"
      };
    }

    const configMap = Object.fromEntries(
      configs.map(c => [c.id, c])
    );


    const casesAllocated = [];
    const casesRemaining = [];
    const ids = [];

    for (const leave of leaves) {
      const config = configMap[leave.leave_config_id];
      const balance = balanceMap[leave.leave_config_id];

      let newAllocated = Number(leave.total_allocated);

      if (isNaN(newAllocated) || newAllocated < 0) {
        throw {
          status: 400,
          message: `Invalid total_allocated for ${leave.leave_config_id}`
        };
      }

      if (newAllocated < balance.used) {
        throw {
          status: 400,
          message: `Allocated < used for leave_config_id: ${leave.leave_config_id}`
        };
      }

      if (config.max_balance !== null && newAllocated > config.max_balance) {
        newAllocated = Number(config.max_balance);
      }

      newAllocated = parseFloat(newAllocated.toFixed(2));

      const newRemaining = parseFloat(
        (newAllocated - balance.used).toFixed(2)
      );

      casesAllocated.push(
        `WHEN ${leave.leave_config_id} THEN ${newAllocated}`
      );

      casesRemaining.push(
        `WHEN ${leave.leave_config_id} THEN ${newRemaining}`
      );

      ids.push(leave.leave_config_id);
    }


    await conn.query(
      `
      UPDATE employee_leave_balances
      SET
        total_allocated = CASE leave_config_id
          ${casesAllocated.join(" ")}
        END,
        remaining = CASE leave_config_id
          ${casesRemaining.join(" ")}
        END,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE company_id = ?
        AND employee_id = ?
        AND year = ?
        AND leave_config_id IN (?)
        AND is_deleted = 0
      `,
      [user_id, company_id, employee_id, year, ids]
    );


    const [result] = await conn.query(
      `
      SELECT 
        elb.id,
        elb.company_id,
        elb.employee_id,
        elb.leave_config_id,
        elb.year,
        elb.total_allocated,
        elb.used,
        elb.remaining,
        elb.is_active,
        elb.created_at,
        elb.updated_at,

        lc.code,
        lc.name,
        lc.is_paid,
        lc.allow_half_day,
        lc.max_balance,
        lc.carry_forward_limit,
        lc.exclude_weekends

      FROM employee_leave_balances elb
      JOIN leave_configs lc 
        ON lc.id = elb.leave_config_id

      WHERE elb.company_id = ?
        AND elb.employee_id = ?
        AND elb.year = ?
        AND elb.leave_config_id IN (?)
        AND elb.is_deleted = 0
        AND lc.is_deleted = 0
        AND lc.is_active = 1

      ORDER BY lc.name ASC
      `,
      [company_id, employee_id, year, leaveIds]
    );

    await conn.commit();


    const booleanFields = [
      "is_paid",
      "allow_half_day",
      "exclude_weekends",
      "is_active"
    ];

    const formatted = result.map(row =>
      toBooleanFields({ ...row }, booleanFields)
    );

    return res.status(200).json({
      success: true,
      message: "Leave balance updated successfully",
      count: formatted.length,
      data: formatted
    });

  } catch (error) {
    if (conn) await conn.rollback();

    console.error("Update Leave Balance Error:", error);

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error"
    });

  } finally {
    if (conn) conn.release();
  }
});

// Delete leave balance to employee
router.delete("/delete-balance", auth(LEAVE_BAL.MNG), async (req, res) => {

  let conn;

  try {

    conn = await db.getConnection();

    await conn.beginTransaction();

    const company_id = req.company?.id;
    const user_id = req.user?.id;

    const { employee_id, leave_config_id } = req.body;

    const year = new Date().getFullYear();

    if (!company_id || !user_id) {

      if (conn) await conn.rollback();

      return sendError(
        res,
        400,
        "Invalid company or user"
      );
    }

    if (!employee_id || !leave_config_id) {

      if (conn) await conn.rollback();

      return sendError(
        res,
        400,
        "employee_id and leave_config_id are required"
      );
    }

    const [emp] = await conn.query(
      `
      SELECT id
      FROM employees
      WHERE id = ?
        AND company_id = ?
        AND is_deleted = 0
        AND is_active = 1
      `,
      [employee_id, company_id]
    );

    if (emp.length === 0) {

      if (conn) await conn.rollback();

      return sendError(
        res,
        404,
        "Employee not found"
      );
    }

    const [balanceRows] = await conn.query(
      `
      SELECT id, used
      FROM employee_leave_balances
      WHERE company_id = ?
        AND employee_id = ?
        AND leave_config_id = ?
        AND year = ?
        AND is_deleted = 0
      FOR UPDATE
      `,
      [company_id, employee_id, leave_config_id, year]
    );

    if (balanceRows.length === 0) {

      if (conn) await conn.rollback();

      return sendError(
        res,
        404,
        "Leave balance not found"
      );
    }

    const balance = balanceRows[0];

    if (balance.used > 0) {

      if (conn) await conn.rollback();

      return sendError(
        res,
        400,
        `This leave balance cannot be deleted because ${balance.used} leave days have already been used.`
      );
    }

    await conn.query(
      `
      UPDATE employee_leave_balances
      SET is_deleted = 1,
          deleted_at = CURRENT_TIMESTAMP,
          deleted_by = ?
      WHERE id = ?
      `,
      [user_id, balance.id]
    );

    await conn.commit();

    return sendSuccess(
      res,
      200,
      "Leave balance deleted successfully"
    );

  } catch (error) {

    if (conn) {
      await conn.rollback();
    }

    console.error(
      "Delete Leave Balance Error:",
      error
    );

    return sendError(
      res,
      error.status || 500,
      error.message || "Internal server error"
    );

  } finally {

    if (conn) {
      conn.release();
    }
  }
});

// Get all employee leave balances
router.get("/emp-balances", auth(LEAVE_BAL.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const company_id = req.company?.id;

    if (!company_id) {
      throw { status: 400, message: "Invalid company" };
    }


    const year = req.query.year
      ? Number(req.query.year)
      : new Date().getFullYear();

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const offset = (page - 1) * limit;

    const search = req.query.search?.trim();


    let query = `
      SELECT 
        e.id AS employee_id,
        u.name AS employee_name,
        u.email,
        u.phone AS mobile,
        u.profile_picture,
        e.employee_code,

        elb.leave_config_id,
        elb.total_allocated,

        lc.code,
        lc.name AS leave_name,
        lc.is_paid,
        lc.allow_half_day,
        lc.max_balance,
        lc.carry_forward_limit,
        lc.exclude_weekends,

        COALESCE(SUM(
          CASE 
            WHEN el.status = 'approved' THEN el.total_days 
            ELSE 0 
          END
        ), 0) AS used

      FROM employees e

      JOIN users u 
        ON u.id = e.user_id
        AND u.is_deleted = 0

      INNER JOIN employee_leave_balances elb
        ON elb.employee_id = e.id
        AND elb.year = ?
        AND elb.is_deleted = 0

      LEFT JOIN leave_configs lc
        ON lc.id = elb.leave_config_id
        AND lc.is_deleted = 0
        AND lc.is_active = 1

      LEFT JOIN employee_leaves el
        ON el.employee_id = e.id
        AND el.leave_config_id = elb.leave_config_id
        AND YEAR(el.start_date) = ?
        AND el.is_deleted = 0

      WHERE e.company_id = ?
        AND e.is_deleted = 0
        AND e.is_active = 1
    `;

    const params = [year, year, company_id];


    if (search) {
      query += `
        AND (
          u.name LIKE ?
          OR u.email LIKE ?
          OR e.employee_code LIKE ?
          OR lc.name LIKE ?
          OR lc.code LIKE ?
        )
      `;
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }


    query += `
      GROUP BY e.id, elb.leave_config_id
      ORDER BY u.name ASC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const [rows] = await conn.query(query, params);


    let countQuery = `
      SELECT COUNT(DISTINCT e.id) as total
      FROM employees e
      JOIN users u ON u.id = e.user_id AND u.is_deleted = 0
      INNER JOIN employee_leave_balances elb
        ON elb.employee_id = e.id
        AND elb.year = ?
        AND elb.is_deleted = 0
      WHERE e.company_id = ?
        AND e.is_deleted = 0
        AND e.is_active = 1
    `;

    const countParams = [year, company_id];

    if (search) {
      countQuery += `
        AND (
          u.name LIKE ?
          OR u.email LIKE ?
          OR e.employee_code LIKE ?
        )
      `;
      const s = `%${search}%`;
      countParams.push(s, s, s);
    }

    const [[{ total }]] = await conn.query(countQuery, countParams);


    const booleanFields = [
      "is_paid",
      "allow_half_day",
      "exclude_weekends",
    ];

    const normalized = rows.map(row =>
      toBooleanFields({ ...row }, booleanFields)
    );


    const groupedMap = {};

    for (const row of normalized) {
      const empId = row.employee_id;

      if (!groupedMap[empId]) {
        groupedMap[empId] = {
          employee_id: empId,
          employee_name: row.employee_name,
          email: row.email,
          mobile: row.mobile || null,
          profile_picture: buildFileUrl(row.profile_picture) || null,
          employee_code: row.employee_code,
          leaves: []
        };
      }

      const used = Number(row.used || 0);
      const allocated = Number(row.total_allocated || 0);

      groupedMap[empId].leaves.push({
        leave_config_id: row.leave_config_id,
        type: row.code,
        name: row.leave_name,

        total_allocated: allocated,
        used,
        remaining: allocated - used,

        is_paid: row.is_paid,
        allow_half_day: row.allow_half_day,
        max_balance: row.max_balance,
        carry_forward_limit: row.carry_forward_limit,
        exclude_weekends: row.exclude_weekends,
      });
    }

    const finalData = Object.values(groupedMap);

    return res.status(200).json({
      success: true,
      message: "Employees with leave balances fetched",
      data: finalData,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error("Leave Balance Error:", error);

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error"
    });

  } finally {
    if (conn) conn.release();
  }
});

// create leave directly for an employee
router.post("/management/create", auth(LEAVE.MNG), async (req, res) => {

  let conn;

  try {

    conn = await db.getConnection();

    await conn.beginTransaction();

    const company_id = Number(req.company?.id);
    const admin_user_id = Number(req.user?.id);

    if (!Number.isInteger(company_id) || company_id <= 0) {
      return sendError(res, 401, "Unauthorized company");
    }

    if (!Number.isInteger(admin_user_id) || admin_user_id <= 0) {
      return sendError(res, 401, "Unauthorized user");
    }

    let {
      employee_id,
      leave_config_id,
      start_date,
      end_date,
      is_half_day = 0,
      half_day_type = null,
      reason = null,
      remarks = null,
      attachments = []
    } = req.body;

    employee_id = Number(employee_id);

    leave_config_id = Number(leave_config_id);

    is_half_day = is_half_day === true || is_half_day === 1 || is_half_day === "1" || is_half_day === "true" ? 1 : 0;

    half_day_type = typeof half_day_type === "string" ? half_day_type.trim().toLowerCase() : null;

    reason = typeof reason === "string" ? reason.trim() : null;

    remarks = typeof remarks === "string" ? remarks.trim() : null;

    attachments = Array.isArray(attachments) ? attachments : [];

    if (!Number.isInteger(employee_id) || employee_id <= 0) {
      return sendError(res, 400, "Valid employee_id is required");
    }

    if (!Number.isInteger(leave_config_id) || leave_config_id <= 0) {
      return sendError(res, 400, "Valid leave_config_id is required");
    }

    if (!start_date || !end_date) {
      return sendError(res, 400, "start_date and end_date are required");
    }

    const parsedStart = parseDate(start_date);
    const parsedEnd = parseDate(end_date);

    if (!parsedStart || !parsedEnd) {
      return sendError(res, 400, "Invalid date format. Use YYYY-MM-DD");
    }

    if (isDateAfter(start_date, end_date)) {
      return sendError(res, 400, "start_date cannot be greater than end_date");
    }

    if (is_half_day && !["first_half", "second_half"].includes(half_day_type)) {
      return sendError(res, 400, "half_day_type must be first_half or second_half");
    }

    if (reason && reason.length > 2000) {
      return sendError(res, 400, "Reason cannot exceed 2000 characters");
    }

    if (remarks && remarks.length > 1000) {
      return sendError(res, 400, "Remarks cannot exceed 1000 characters");
    }

    if (!Array.isArray(attachments)) {
      return sendError(res, 400, "attachments must be an array");
    }

    if (attachments.length > 10) {
      return sendError(res, 400, "Maximum 10 attachments allowed");
    }

    for (const file_url of attachments) {

      if (typeof file_url !== "string" || !file_url.trim()) {
        return sendError(res, 400, "Each attachment must be a valid URL");
      }

      if (file_url.length > 2000) {
        return sendError(res, 400, "Attachment URL too long");
      }
    }

    const [[employee]] = await conn.query(
      `
      SELECT
        e.id,
        e.user_id,
        e.employee_code,
        e.designation,
        e.joining_date,
        e.weekends,
        e.status,
        e.is_active,
        u.name,
        u.email
      FROM employees e
      INNER JOIN users u
        ON u.id = e.user_id
        AND u.is_deleted = 0
        AND u.is_active = 1
      WHERE e.id = ?
        AND e.company_id = ?
        AND e.is_deleted = 0
      LIMIT 1
      `,
      [employee_id, company_id]
    );

    if (!employee) {
      return sendError(res, 404, "Employee not found");
    }

    if (employee.is_active !== 1 || employee.status !== "active") {
      return sendError(res, 400, "Employee is not active");
    }

    if (isBeforeJoining(start_date, employee.joining_date)) {
      return sendError(res, 400, "Leave cannot be applied before joining date");
    }

    const [[company]] = await conn.query(
      `
      SELECT
        id,
        name
      FROM companies
      WHERE id = ?
        AND is_active = 1
        AND is_deleted = 0
      LIMIT 1
      `,
      [company_id]
    );

    if (!company) {
      return sendError(res, 404, "Company not found");
    }

    const [[leaveConfig]] = await conn.query(
      `
      SELECT
        id,
        code,
        name,
        is_paid,
        allow_half_day,
        exclude_weekends
      FROM leave_configs
      WHERE id = ?
        AND company_id = ?
        AND is_active = 1
        AND is_deleted = 0
      LIMIT 1
      `,
      [leave_config_id, company_id]
    );

    if (!leaveConfig) {
      return sendError(res, 404, "Leave configuration not found");
    }

    if (is_half_day && Number(leaveConfig.allow_half_day) !== 1) {
      return sendError(res, 400, "Half day leave not allowed");
    }

    const [holidayRows] = await conn.query(
      `
      SELECT
        date
      FROM holidays
      WHERE company_id = ?
        AND is_optional = 0
        AND is_active = 1
        AND is_deleted = 0
        AND date BETWEEN ? AND ?
      `,
      [company_id, start_date, end_date]
    );

    const holidaySet = new Set(
      holidayRows.map(item => formatToDate(item.date))
    );

    const leaveRows = [];

    let total_days = 0;

    let currentRange = null;

    eachDateBetween(start_date, end_date, (dateStr) => {

      const isHoliday = holidaySet.has(dateStr);

      const weekendStatus = isWeekendDate(dateStr, employee.weekends);

      const shouldExcludeWeekend =
        Number(leaveConfig.exclude_weekends) === 1 &&
        weekendStatus?.isWeekend;

      if (isHoliday || shouldExcludeWeekend) {

        if (currentRange) {

          leaveRows.push(currentRange);

          currentRange = null;
        }

        return;
      }

      if (is_half_day) {

        leaveRows.push({
          start_date: dateStr,
          end_date: dateStr,
          total_days: 0.5,
          is_half_day: 1,
          half_day_type
        });

        total_days += 0.5;

        return;
      }

      total_days += 1;

      if (!currentRange) {

        currentRange = {
          start_date: dateStr,
          end_date: dateStr,
          total_days: 1,
          is_half_day: 0,
          half_day_type: null
        };

        return;
      }

      currentRange.end_date = dateStr;

      currentRange.total_days += 1;
    });

    if (currentRange) {
      leaveRows.push(currentRange);
    }

    if (!leaveRows.length) {
      return sendError(res, 400, "No valid leave days found");
    }

    for (const row of leaveRows) {

      const [existingLeaves] = await conn.query(
        `
        SELECT
          id,
          start_date,
          end_date,
          is_half_day,
          half_day_type
        FROM employee_leaves
        WHERE employee_id = ?
          AND company_id = ?
          AND is_deleted = 0
          AND LOWER(TRIM(status)) IN ('pending', 'approved')
          AND NOT (
            end_date < ?
            OR start_date > ?
          )
        `,
        [
          employee_id,
          company_id,
          row.start_date,
          row.end_date
        ]
      );

      for (const existing of existingLeaves) {

        if (!row.is_half_day) {
          return sendError(
            res,
            409,
            `This request overlaps with an existing leave period (${existing.start_date} to ${existing.end_date}).`
          );
        }

        if (Number(existing.is_half_day) === 0) {
          return sendError(
            res,
            409,
            `Half-day leave conflicts with existing full-day leave on ${row.start_date}`
          );
        }

        const existingStart = formatToDate(existing.start_date);

        if (existingStart !== row.start_date) {
          return sendError(
            res,
            409,
            `Half-day leave overlaps with existing half-day on ${existingStart}`
          );
        }

        if (existing.half_day_type === row.half_day_type) {
          return sendError(
            res,
            409,
            `Half-day leave of same type already exists on ${row.start_date}`
          );
        }
      }
    }

    const leaveYear = getYearFromDate(start_date);

    const [[balance]] = await conn.query(
      `
      SELECT
        id,
        total_allocated,
        used,
        remaining
      FROM employee_leave_balances
      WHERE company_id = ?
        AND employee_id = ?
        AND leave_config_id = ?
        AND year = ?
        AND is_deleted = 0
      LIMIT 1
      FOR UPDATE
      `,
      [
        company_id,
        employee_id,
        leave_config_id,
        leaveYear
      ]
    );


    const approvedAt = getISTNow().format("YYYY-MM-DD HH:mm:ss");

    const insertedLeaveIds = [];

    for (const row of leaveRows) {

      const [result] = await conn.query(
        `
        INSERT INTO employee_leaves (
          company_id,
          employee_id,
          leave_config_id,
          start_date,
          end_date,
          total_days,
          is_half_day,
          half_day_type,
          reason,
          status,
          approved_by,
          approved_at,
          approval_remarks,
          applied_at,
          created_by,
          updated_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          company_id,
          employee_id,
          leave_config_id,
          row.start_date,
          row.end_date,
          row.total_days,
          row.is_half_day,
          row.half_day_type,
          reason,
          "approved",
          admin_user_id,
          approvedAt,
          remarks,
          approvedAt,
          admin_user_id,
          admin_user_id
        ]
      );

      insertedLeaveIds.push(result.insertId);
    }

    const insertedAttachments = [];

    for (const leave_id of insertedLeaveIds) {

      for (const url of attachments) {

        try {

          const media = await saveMediaFromUrl({
            url,
            folder: "leave",
            optimizeImage: true
          });

          if (!media?.success) {
            continue;
          }

          const [attachmentResult] = await conn.query(
            `
            INSERT INTO employee_leave_attachments (
              leave_id,
              file_url,
              file_type,
              file_size,
              created_by,
              updated_by
            )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
              leave_id,
              media.file_url,
              media.mime_type,
              media.size_bytes,
              admin_user_id,
              admin_user_id
            ]
          );

          insertedAttachments.push({
            id: attachmentResult.insertId,
            leave_id,
            file_url: media.file_url,
            mime_type: media.mime_type,
            file_size: media.size_bytes
          });

        } catch (attachmentError) {

          console.error(
            "[MANAGEMENT_LEAVE_ATTACHMENT_ERROR]",
            attachmentError
          );
        }
      }
    }

    if (Number(leaveConfig.is_paid) === 1) {

      await adjustEmployeeLeaveBalance({
        conn,
        company_id,
        employee_id,
        leave_config_id,
        year: leaveYear,
        days: total_days,
        mode: "deduct",
        user_id: admin_user_id
      });
    }

    const [createdLeaves] = await conn.query(
      `
      SELECT
        el.id,
        el.company_id,
        el.employee_id,
        el.leave_config_id,
        el.start_date,
        el.end_date,
        el.total_days,
        el.is_half_day,
        el.half_day_type,
        el.reason,
        el.status,
        el.approved_at,
        el.created_at,
        lc.name AS leave_type_name,
        lc.code AS leave_type_code,
        e.employee_code,
        u.name AS employee_name,
        u.email AS employee_email
      FROM employee_leaves el
      INNER JOIN leave_configs lc
        ON lc.id = el.leave_config_id
      INNER JOIN employees e
        ON e.id = el.employee_id
      INNER JOIN users u
        ON u.id = e.user_id
      WHERE el.id IN (?)
      ORDER BY el.start_date ASC
      `,
      [insertedLeaveIds]
    );

    await conn.commit();

    return sendSuccess(
      res,
      201,
      "Leave created and approved successfully",
      {
        total_days,
        total_leave_rows: insertedLeaveIds.length,
        leave_ids: insertedLeaveIds,
        leaves: createdLeaves.map(item =>
          convertToISTFields(item, [
            "approved_at",
            "created_at"
          ])
        ),
        attachments: insertedAttachments
      }
    );

  } catch (error) {

    if (conn) {

      try {

        await conn.rollback();

      } catch (rollbackError) {

        console.error(
          "[MANAGEMENT_LEAVE_ROLLBACK_ERROR]",
          rollbackError
        );
      }
    }

    console.error("[POST /management/create]", error);

    return sendError(
      res,
      error.status || 500,
      error.message || "Internal server error"
    );

  } finally {

    if (conn) {
      conn.release();
    }
  }
});

// Apply leave for an employee
router.post("/apply", auth(LEAVE.EMP), async (req, res) => {

  let conn;

  try {

    conn = await db.getConnection();

    await conn.beginTransaction();

    const company_id = Number(req.company?.id);
    const user_id = Number(req.user?.id);

    if (!Number.isInteger(company_id) || company_id <= 0) return sendError(res, 401, "Unauthorized company");

    if (!Number.isInteger(user_id) || user_id <= 0) return sendError(res, 401, "Unauthorized user");

    let {
      leave_config_id,
      start_date,
      end_date,
      is_half_day = 0,
      half_day_type = null,
      reason = null,
      attachments = []
    } = req.body;



    leave_config_id = Number(leave_config_id);

    is_half_day = is_half_day === true || is_half_day === 1 || is_half_day === "1" || is_half_day === "true" ? 1 : 0;

    half_day_type = typeof half_day_type === "string" ? half_day_type.trim().toLowerCase() : null;

    reason = typeof reason === "string" ? reason.trim() : null;

    attachments = Array.isArray(attachments) ? attachments : [];

    if (!Number.isInteger(leave_config_id) || leave_config_id <= 0) return sendError(res, 400, "Valid leave_config_id required");

    if (!start_date || !end_date) return sendError(res, 400, "start_date and end_date are required");

    const parsedStart = parseDate(start_date);
    const parsedEnd = parseDate(end_date);

    if (!parsedStart || !parsedEnd) return sendError(res, 400, "Invalid date format. Use YYYY-MM-DD");

    if (isDateAfter(start_date, end_date)) return sendError(res, 400, "start_date cannot be greater than end_date");

    if (is_half_day && !["first_half", "second_half"].includes(half_day_type)) return sendError(res, 400, "half_day_type must be first_half or second_half");

    if (reason && reason.length > 2000) return sendError(res, 400, "Reason cannot exceed 2000 characters");

    if (!Array.isArray(attachments)) return sendError(res, 400, "attachments must be an array");

    if (attachments.length > 10) return sendError(res, 400, "Maximum 10 attachments allowed");

    for (const fileUrl of attachments) {

      if (typeof fileUrl !== "string" || !fileUrl.trim()) return sendError(res, 400, "Each attachment must be valid URL");

      if (fileUrl.length > 2000) return sendError(res, 400, "Attachment URL too long");
    }

    const [[employee]] = await conn.query(
      `
      SELECT
        e.id,
        e.user_id,
        e.employee_code,
        e.designation,
        e.joining_date,
        e.weekends,
        e.status,
        e.is_active,
        u.name,
        u.email
      FROM employees e
      INNER JOIN users u
        ON u.id = e.user_id
        AND u.is_deleted = 0
        AND u.is_active = 1
      WHERE e.user_id = ?
        AND e.company_id = ?
        AND e.is_deleted = 0
      LIMIT 1
      `,
      [user_id, company_id]
    );

    if (!employee) return sendError(res, 404, "Employee not found");

    if (employee.is_active !== 1 || employee.status !== "active") return sendError(res, 400, "Employee is not active");

    const employee_id = employee.id;

    if (isBeforeJoining(start_date, employee.joining_date)) return sendError(res, 400, "Leave cannot be applied before joining date");

    const [[company]] = await conn.query(
      `
      SELECT
        id,
        name,
        owner_user_id
      FROM companies
      WHERE id = ?
        AND is_active = 1
        AND is_deleted = 0
      LIMIT 1
      `,
      [company_id]
    );

    if (!company) return sendError(res, 404, "Company not found");

    const [[leaveConfig]] = await conn.query(
      `
      SELECT
        id,
        code,
        name,
        is_paid,
        allow_half_day,
        exclude_weekends
      FROM leave_configs
      WHERE id = ?
        AND company_id = ?
        AND is_active = 1
        AND is_deleted = 0
      LIMIT 1
      `,
      [leave_config_id, company_id]
    );

    if (!leaveConfig) return sendError(res, 404, "Leave configuration not found");

    if (is_half_day && leaveConfig.allow_half_day !== 1) return sendError(res, 400, "Half day leave not allowed");

    const [holidayRows] = await conn.query(
      `
      SELECT date
      FROM holidays
      WHERE company_id = ?
        AND is_optional = 0
        AND is_active = 1
        AND is_deleted = 0
        AND date BETWEEN ? AND ?
      `,
      [company_id, start_date, end_date]
    );

    const holidaySet = new Set(holidayRows.map(holiday => formatToDate(holiday.date)));

    const leaveRows = [];

    let total_days = 0;

    let currentRange = null;

    eachDateBetween(start_date, end_date, (dateStr) => {

      const isHoliday = holidaySet.has(dateStr);

      const weekendStatus = isWeekendDate(dateStr, employee.weekends);

      const shouldExcludeWeekend = leaveConfig.exclude_weekends === 1 && weekendStatus.isWeekend;

      if (isHoliday || shouldExcludeWeekend) {

        if (currentRange) {

          leaveRows.push(currentRange);

          currentRange = null;
        }

        return;
      }

      if (is_half_day) {

        leaveRows.push({
          start_date: dateStr,
          end_date: dateStr,
          total_days: 0.5,
          is_half_day: 1,
          half_day_type
        });

        total_days += 0.5;

        return;
      }

      total_days += 1;

      if (!currentRange) {

        currentRange = {
          start_date: dateStr,
          end_date: dateStr,
          total_days: 1,
          is_half_day: 0,
          half_day_type: null
        };

        return;
      }

      currentRange.end_date = dateStr;

      currentRange.total_days += 1;
    });

    if (currentRange) leaveRows.push(currentRange);

    if (!leaveRows.length) return sendError(res, 400, "No valid leave days found");

    for (const row of leaveRows) {

      const [existingLeaves] = await conn.query(
        `
        SELECT
          id,
          start_date,
          end_date,
          is_half_day,
          half_day_type,
          status
        FROM employee_leaves
        WHERE employee_id = ?
          AND company_id = ?
          AND is_deleted = 0
          AND LOWER(TRIM(status)) IN ('pending', 'approved')
          AND NOT (
            end_date < ?
            OR start_date > ?
          )
        `,
        [
          employee_id,
          company_id,
          row.start_date,
          row.end_date
        ]
      );

      if (!existingLeaves.length) continue;

      let hasConflict = false;

      for (const existing of existingLeaves) {

        const canAllowOppositeHalfDay =
          row.is_half_day === 1 &&
          existing.is_half_day === 1 &&
          existing.half_day_type !== row.half_day_type &&
          formatToDate(existing.start_date) === row.start_date;

        if (canAllowOppositeHalfDay) continue;

        hasConflict = true;

        break;
      }

      if (hasConflict) return sendError(res, 409, `Leave overlap detected between ${row.start_date} and ${row.end_date}`);
    }

    const leaveYear = getYearFromDate(start_date);

    const [[balance]] = await conn.query(
      `
      SELECT
        id,
        total_allocated,
        used,
        remaining
      FROM employee_leave_balances
      WHERE company_id = ?
        AND employee_id = ?
        AND leave_config_id = ?
        AND year = ?
        AND is_deleted = 0
      LIMIT 1
      FOR UPDATE
      `,
      [
        company_id,
        employee_id,
        leave_config_id,
        leaveYear
      ]
    );

    if (
      leaveConfig.is_paid === 1 &&
      balance &&
      Number(balance.remaining) < Number(total_days)
    ) {
      return sendError(res, 400, "Insufficient leave balance");
    }

    const insertedLeaveIds = [];

    const appliedAt = getISTNow().format("YYYY-MM-DD HH:mm:ss");

    for (const row of leaveRows) {

      const [result] = await conn.query(
        `
        INSERT INTO employee_leaves (
          company_id,
          employee_id,
          leave_config_id,
          start_date,
          end_date,
          total_days,
          is_half_day,
          half_day_type,
          reason,
          status,
          applied_at,
          created_by,
          updated_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          company_id,
          employee_id,
          leave_config_id,
          row.start_date,
          row.end_date,
          row.total_days,
          row.is_half_day,
          row.half_day_type,
          reason,
          "pending",
          appliedAt,
          user_id,
          user_id
        ]
      );

      insertedLeaveIds.push(result.insertId);
    }

    const insertedAttachments = [];

    for (const leave_id of insertedLeaveIds) {

      for (const url of attachments) {

        try {

          const media = await saveMediaFromUrl({
            url,
            folder: "leave",
            optimizeImage: true
          });

          if (!media?.success) continue;

          const [attachmentResult] = await conn.query(
            `
            INSERT INTO employee_leave_attachments (
              leave_id,
              file_url,
              file_type,
              file_size,
              created_by,
              updated_by
            )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
              leave_id,
              media.file_url,
              media.mime_type,
              media.size_bytes,
              user_id,
              user_id
            ]
          );

          insertedAttachments.push({
            id: attachmentResult.insertId,
            leave_id,
            file_url: media.file_url,
            mime_type: media.mime_type,
            file_size: media.size_bytes
          });

        } catch (attachmentError) {

          console.error("[LEAVE_ATTACHMENT_ERROR]", attachmentError);
        }
      }
    }

    let updatedBalance = balance ? {
      total_allocated: Number(balance.total_allocated || 0),
      used: Number(balance.used || 0),
      remaining: Number(balance.remaining || 0)
    } : null;

    if (leaveConfig.is_paid === 1 && total_days > 0) {

      const balanceResult =
        await adjustEmployeeLeaveBalance({
          conn,
          company_id,
          employee_id,
          leave_config_id,
          year: leaveYear,
          days: total_days,
          mode: "deduct",
          user_id
        });

      updatedBalance =
        balanceResult.balance;
    }

    const [reviewers] =
      await conn.query(
        `
        SELECT DISTINCT
          u.id AS user_id,
          u.name,
          LOWER(TRIM(u.email)) AS email

        FROM employees e

        INNER JOIN users u
          ON u.id = e.user_id
          AND u.is_active = 1
          AND u.is_deleted = 0

        INNER JOIN permission_packages pp
          ON pp.id = e.permission_package_id
          AND pp.company_id = e.company_id
          AND pp.is_active = 1
          AND pp.is_deleted = 0

        INNER JOIN permission_package_items ppi
          ON ppi.package_id = pp.id
          AND ppi.is_active = 1
          AND ppi.is_deleted = 0

        INNER JOIN permissions p
          ON p.id = ppi.permission_id

        WHERE e.company_id = ?
          AND e.is_active = 1
          AND e.is_deleted = 0

          AND p.code = 'leave_management'

          AND u.email IS NOT NULL
          AND TRIM(u.email) != ''

          AND u.id != ?
        `,
        [
          company_id,
          user_id
        ]
      );




    const [[companyOwner]] =
      await conn.query(
        `
        SELECT
          u.id,
          u.name,
          LOWER(TRIM(u.email)) AS email

        FROM companies c

        INNER JOIN users u
          ON u.id = c.owner_user_id
          AND u.is_active = 1
          AND u.is_deleted = 0

        WHERE c.id = ?
          AND c.is_active = 1
          AND c.is_deleted = 0

        LIMIT 1
        `,
        [company_id]
      );

    const [createdLeaves] = await conn.query(
      `
      SELECT
        el.id,
        el.company_id,
        el.employee_id,
        el.leave_config_id,
        el.start_date,
        el.end_date,
        el.total_days,
        el.is_half_day,
        el.half_day_type,
        el.reason,
        el.status,
        el.applied_at,
        el.created_at,
        lc.name AS leave_type_name,
        lc.code AS leave_type_code,
        e.employee_code,
        u.name AS employee_name,
        u.email AS employee_email
      FROM employee_leaves el
      INNER JOIN leave_configs lc
        ON lc.id = el.leave_config_id
      INNER JOIN employees e
        ON e.id = el.employee_id
      INNER JOIN users u
        ON u.id = e.user_id
      WHERE el.id IN (?)
      ORDER BY el.start_date ASC
      `,
      [insertedLeaveIds]
    );

    await conn.commit();
    const emailJobs = [];

    const emailPayload = {
      subject: `New Leave Request - ${employee.name}`,

      fromEmail: process.env.EMAIL_USER,

      fromName: company.name || "OneAttendance",

      requester: {
        id: employee.user_id,
        name: employee.name,
        email: employee.email
      },

      employee: {
        id: employee.id,
        employee_code:
          employee.employee_code,

        designation: getEnumObject(DESIGNATIONS, employee.designation),

        name: employee.name,
        email: employee.email
      },

      company: {
        id: company.id,
        name: company.name
      },

      leave: {
        start_date,
        end_date,
        total_days,
        is_half_day,
        half_day_type,
        reason
      },

      leaveConfig: {
        id: leaveConfig.id,
        code: leaveConfig.code,
        name: leaveConfig.name,
        is_paid:
          leaveConfig.is_paid
      },

      leaveBalance:
        updatedBalance || {},

      attachments:
        insertedAttachments
    };




    for (const reviewer of reviewers) {

      try {

        if (!reviewer?.email) {
          continue;
        }

        emailJobs.push(
          queueLeaveRequestEmail({
            ...emailPayload,

            to: reviewer.email,

            adminName:
              reviewer.name ||
              "Admin",

            replyTo:
              employee.email,

            maxAttempts: 3
          })
        );

      } catch (queueError) {

        console.error(
          "[QUEUE_REVIEWER_LEAVE_EMAIL_ERROR]",
          queueError
        );
      }
    }




    if (
      companyOwner?.email &&
      companyOwner.email !== employee.email
    ) {

      const alreadyExists =
        reviewers.some(
          reviewer =>
            reviewer.email ===
            companyOwner.email
        );

      if (!alreadyExists) {

        try {

          emailJobs.push(
            queueLeaveRequestEmail({
              ...emailPayload,

              to: companyOwner.email,

              adminName:
                companyOwner.name ||
                "Company Owner",

              replyTo:
                employee.email,

              maxAttempts: 3
            })
          );

        } catch (queueError) {

          console.error(
            "[QUEUE_OWNER_LEAVE_EMAIL_ERROR]",
            queueError
          );
        }
      }
    }




    if (emailJobs.length) {

      Promise.allSettled(emailJobs)
        .then((results) => {

          const failed = results.filter(
            result =>
              result.status === "rejected"
          );

          if (failed.length) {

            console.error(
              "[LEAVE_EMAIL_FAILED]",
              failed.map(
                failure => failure.reason
              )
            );
          }
        })
        .catch((emailError) => {

          console.error(
            "[QUEUE_LEAVE_EMAIL_ERROR]",
            emailError
          );
        });
    }

    return res.status(201).json({
      success: true,
      message: "Leave applied successfully",
      data: {
        total_days,
        total_leave_rows: insertedLeaveIds.length,
        leave_ids: insertedLeaveIds,
        leaves: createdLeaves.map(item => convertToISTFields(item, [
          "applied_at",
          "created_at"
        ])),
        attachments: insertedAttachments,
        leave_balance: updatedBalance
      }
    });

  } catch (error) {

    if (conn) {

      try {

        await conn.rollback();

      } catch (rollbackError) {

        console.error("[LEAVE_APPLY_ROLLBACK_ERROR]", rollbackError);
      }
    }

    console.error("[POST /leave/apply]", error);

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error"
    });

  } finally {

    if (conn) conn.release();
  }
});

// Edit dates/half-day and approve a pending leave for an employee
router.put("/management/approve-edit", auth(LEAVE.MNG), async (req, res) => {

  let conn;

  try {




    conn = await db.getConnection();

    await conn.beginTransaction();




    const approver_id = Number(req.user?.id);

    const company_id = Number(req.company?.id);

    if (
      !Number.isInteger(approver_id) ||
      approver_id <= 0
    ) {
      throw {
        status: 401,
        message: "Unauthorized approver"
      };
    }

    if (
      !Number.isInteger(company_id) ||
      company_id <= 0
    ) {
      throw {
        status: 401,
        message: "Unauthorized company"
      };
    }




    let {
      id,
      start_date = null,
      end_date = null,
      is_half_day = null,
      half_day_type = null
    } = req.body;

    id = Number(id);

    if (
      is_half_day !== null &&
      is_half_day !== undefined
    ) {

      is_half_day =
        is_half_day === true ||
          is_half_day === 1 ||
          is_half_day === "1" ||
          is_half_day === "true"
          ? 1
          : 0;
    }

    half_day_type =
      typeof half_day_type === "string"
        ? half_day_type
          .trim()
          .toLowerCase()
        : null;




    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      throw {
        status: 400,
        message: "Valid leave id required"
      };
    }

    const [[leave]] = await conn.query(
      `
      SELECT
        el.*,

        lc.name AS leave_type_name,
        lc.code AS leave_type_code,

        e.employee_code,
        e.designation,
        e.weekends,

        u.id AS employee_user_id,
        u.name AS employee_name,
        u.email AS employee_email

      FROM employee_leaves el

      INNER JOIN leave_configs lc
        ON lc.id = el.leave_config_id
        AND lc.is_deleted = 0

      INNER JOIN employees e
        ON e.id = el.employee_id
        AND e.is_deleted = 0

      INNER JOIN users u
        ON u.id = e.user_id
        AND u.is_deleted = 0

      WHERE el.id = ?
        AND el.company_id = ?
        AND el.is_deleted = 0

      LIMIT 1
      FOR UPDATE
      `,
      [
        id,
        company_id
      ]
    );

    if (!leave) {
      throw {
        status: 404,
        message: "Leave not found"
      };
    }




    const leaveStatus =
      String(leave.status)
        .trim()
        .toLowerCase();

    if (leaveStatus !== "pending") {
      throw {
        status: 400,
        message:
          leaveStatus === "approved"
            ? "Approved leave cannot be edited"
            : `Cannot approve leave in ${leave.status} state`
      };
    }




    start_date =
      start_date ||
      formatToDate(
        leave.start_date
      );

    end_date =
      end_date ||
      formatToDate(
        leave.end_date
      );

    if (
      is_half_day === null ||
      is_half_day === undefined
    ) {
      is_half_day =
        Number(leave.is_half_day) === 1
          ? 1
          : 0;
    }

    half_day_type =
      half_day_type ||
      leave.half_day_type;




    const parsedStart =
      parseDate(start_date);

    const parsedEnd =
      parseDate(end_date);

    if (
      !parsedStart ||
      !parsedEnd
    ) {
      throw {
        status: 400,
        message:
          "Invalid date format. Use YYYY-MM-DD"
      };
    }

    if (
      isDateAfter(
        start_date,
        end_date
      )
    ) {
      throw {
        status: 400,
        message:
          "start_date cannot exceed end_date"
      };
    }




    if (
      is_half_day &&
      ![
        "first_half",
        "second_half"
      ].includes(half_day_type)
    ) {
      throw {
        status: 400,
        message:
          "Invalid half_day_type"
      };
    }

    if (
      is_half_day &&
      start_date !== end_date
    ) {
      throw {
        status: 400,
        message:
          "Half day leave must be for same day"
      };
    }




    const [[company]] = await conn.query(
      `
      SELECT
        id,
        name

      FROM companies

      WHERE id = ?
        AND is_active = 1
        AND is_deleted = 0

      LIMIT 1
      `,
      [company_id]
    );

    if (!company) {
      throw {
        status: 404,
        message:
          "Company not found"
      };
    }




    const [[employee]] = await conn.query(
      `
      SELECT
        e.*,

        u.name,
        u.email

      FROM employees e

      INNER JOIN users u
        ON u.id = e.user_id
        AND u.is_active = 1
        AND u.is_deleted = 0

      WHERE e.id = ?
        AND e.company_id = ?
        AND e.is_active = 1
        AND e.is_deleted = 0

      LIMIT 1
      `,
      [
        leave.employee_id,
        company_id
      ]
    );

    if (!employee) {
      throw {
        status: 404,
        message: "Employee not found"
      };
    }




    const [[config]] = await conn.query(
      `
      SELECT *
      FROM leave_configs

      WHERE id = ?
        AND company_id = ?
        AND is_active = 1
        AND is_deleted = 0

      LIMIT 1
      `,
      [
        leave.leave_config_id,
        company_id
      ]
    );

    if (!config) {
      throw {
        status: 404,
        message:
          "Leave configuration not found"
      };
    }

    if (
      is_half_day &&
      Number(
        config.allow_half_day
      ) !== 1
    ) {
      throw {
        status: 400,
        message:
          "Half day leave not allowed"
      };
    }




    const [holidayRows] =
      await conn.query(
        `
        SELECT date

        FROM holidays

        WHERE company_id = ?
          AND is_optional = 0
          AND is_active = 1
          AND is_deleted = 0
          AND date BETWEEN ? AND ?
        `,
        [
          company_id,
          start_date,
          end_date
        ]
      );

    const holidaySet = new Set(
      holidayRows.map(h =>
        formatToDate(h.date)
      )
    );




    let total_days = 0;

    eachDateBetween(
      start_date,
      end_date,
      (dateStr) => {
        const isHoliday = holidaySet.has(dateStr);

        const weekendStatus = isWeekendDate(
          dateStr,
          employee.weekends
        );

        const shouldExcludeWeekend =
          Number(config.exclude_weekends) === 1 &&
          weekendStatus.isWeekend;

        if (isHoliday || shouldExcludeWeekend) {
          return;
        }

        total_days += is_half_day ? 0.5 : 1;
      }
    );

    total_days = Number(total_days.toFixed(2));

    if (!total_days) {
      throw {
        status: 400,
        message: "No valid leave days found"
      };
    }

    const [overlaps] = await conn.query(
      `
      SELECT
        id,
        start_date,
        end_date,
        is_half_day,
        half_day_type
      FROM employee_leaves
      WHERE employee_id = ?
        AND company_id = ?
        AND id != ?
        AND is_deleted = 0
        AND LOWER(TRIM(status)) IN ('pending', 'approved')
        AND NOT (end_date < ? OR start_date > ?)
      `,
      [
        leave.employee_id,
        company_id,
        id,
        start_date,
        end_date
      ]
    );

    if (overlaps.length) {
      let allowed = false;

      if (
        is_half_day &&
        overlaps.length === 1 &&
        Number(overlaps[0].is_half_day) === 1 &&
        overlaps[0].half_day_type !== half_day_type &&
        formatToDate(overlaps[0].start_date) === start_date
      ) {
        allowed = true;
      }

      if (!allowed) {
        throw {
          status: 409,
          message: `Leave overlap detected between ${start_date} and ${end_date}`
        };
      }
    }

    const approvedAt =
      getISTNow().format("YYYY-MM-DD HH:mm:ss");

    await conn.query(
      `
      UPDATE employee_leaves
      SET
        start_date = ?,
        end_date = ?,
        total_days = ?,
        is_half_day = ?,
        half_day_type = ?,
        status = 'approved',
        approved_by = ?,
        approved_at = ?,
        approval_remarks = NULL,
        updated_by = ?
      WHERE id = ?
      `,
      [
        start_date,
        end_date,
        total_days,
        is_half_day,
        is_half_day ? half_day_type : null,
        approver_id,
        approvedAt,
        approver_id,
        id
      ]
    );

    const newLeaveYear = getYearFromDate(start_date);

    if (Number(config.is_paid) === 1) {
      const oldDays = Number(leave.total_days);

      if (total_days > oldDays) {
        await adjustEmployeeLeaveBalance({
          conn,
          company_id,
          employee_id: leave.employee_id,
          leave_config_id: leave.leave_config_id,
          year: newLeaveYear,
          days: total_days - oldDays,
          mode: "deduct",
          user_id: approver_id
        });
      } else if (total_days < oldDays) {
        await adjustEmployeeLeaveBalance({
          conn,
          company_id,
          employee_id: leave.employee_id,
          leave_config_id: leave.leave_config_id,
          year: newLeaveYear,
          days: oldDays - total_days,
          mode: "restore",
          user_id: approver_id
        });
      }
    }




    const [[balance]] =
      await conn.query(
        `
        SELECT
          total_allocated,
          used,
          remaining

        FROM employee_leave_balances

        WHERE employee_id = ?
          AND company_id = ?
          AND leave_config_id = ?
          AND year = ?
          AND is_deleted = 0

        LIMIT 1
        `,
        [
          leave.employee_id,
          company_id,
          leave.leave_config_id,
          newLeaveYear
        ]
      );




    const [finalLeaves] =
      await conn.query(
        `
        SELECT
          el.*,

          lc.name AS leave_type_name,
          lc.code AS leave_type_code,

          e.employee_code,

          u.name AS employee_name,
          u.email AS employee_email

        FROM employee_leaves el

        INNER JOIN leave_configs lc
          ON lc.id = el.leave_config_id

        INNER JOIN employees e
          ON e.id = el.employee_id

        INNER JOIN users u
          ON u.id = e.user_id

        WHERE el.id = ?

        LIMIT 1
        `,
        [id]
      );




    const [[approver]] =
      await conn.query(
        `
        SELECT
          id,
          name,
          email

        FROM users

        WHERE id = ?
          AND is_active = 1
          AND is_deleted = 0

        LIMIT 1
        `,
        [approver_id]
      );




    await conn.commit();




    if (employee.email) {

      try {

        await queueLeaveAcceptanceEmail({

          to: employee.email,

          subject:
            `Leave Approved - ${config.name}`,

          fromEmail:
            process.env.EMAIL_USER,

          fromName:
            company.name || "OneAttendance",

          replyTo:
            approver?.email || null,

          requester: {
            id: employee.user_id,
            name: employee.name,
            email: employee.email
          },

          employee: {
            id: employee.id,

            employee_code: employee.employee_code,

            designation: getEnumObject(DESIGNATIONS, employee.designation),

            name: employee.name,
            email: employee.email
          },

          company: {
            id: company.id,
            name: company.name
          },

          leave: {
            start_date,
            end_date,
            total_days,
            is_half_day,
            half_day_type,

            reason:
              leave.reason,

            approval_remarks:
              null,

            approved_at:
              approvedAt
          },

          leaveConfig: {
            id: config.id,
            name: config.name,
            code: config.code
          },

          approver: {
            id:
              approver?.id,

            name:
              approver?.name ||
              "Approver",

            email:
              approver?.email
          },

          leaveBalance:
            balance
              ? {
                total_allocated:
                  Number(
                    balance.total_allocated || 0
                  ),

                used:
                  Number(
                    balance.used || 0
                  ),

                remaining:
                  Number(
                    balance.remaining || 0
                  )
              }
              : {},

          maxAttempts: 3
        });

      } catch (emailError) {

        console.error(
          "[LEAVE_APPROVAL_EMAIL_ERROR]",
          emailError
        );


      }
    }




    return res.status(200).json({
      success: true,

      message:
        "Leave approved successfully",

      data: {
        leave_ids: [id],

        total_days,

        leaves:
          finalLeaves.map(item =>
            convertToISTFields(item, [
              "approved_at",
              "applied_at",
              "created_at"
            ])
          ),

        balance:
          balance
            ? {
              total_allocated:
                Number(
                  balance.total_allocated || 0
                ),

              used:
                Number(
                  balance.used || 0
                ),

              remaining:
                Number(
                  balance.remaining || 0
                )
            }
            : null
      }
    });

  } catch (error) {




    if (conn) {

      try {

        await conn.rollback();

      } catch (rollbackError) {

        console.error(
          "[APPROVE_EDIT_ROLLBACK_ERROR]",
          rollbackError
        );
      }
    }

    console.error(
      "[PUT /management/approve-edit]",
      error
    );

    return res.status(
      error.status || 500
    ).json({
      success: false,

      message:
        error.message ||
        "Internal server error"
    });

  } finally {




    if (conn) {
      conn.release();
    }
  }
});

// Approve or reject multiple leaves for an employee
router.put("/management/bulk-approve-reject", auth(LEAVE.MNG), async (req, res) => {
  let conn;

  try {



    conn = await db.getConnection();
    await conn.beginTransaction();




    const approver_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);

    if (
      !Number.isInteger(approver_id) ||
      approver_id <= 0 ||
      !Number.isInteger(company_id) ||
      company_id <= 0
    ) {
      throw { status: 401, message: "Unauthorized access" };
    }




    let { ids, action, remarks = null } = req.body;




    let isAll = false;

    if (ids === "all") {

      isAll = true;
    } else {

      if (!Array.isArray(ids)) {
        throw { status: 400, message: "ids must be an array or the string 'all'" };
      }

      ids = [
        ...new Set(ids.map(v => Number(v)))
      ].filter(v => Number.isInteger(v) && v > 0);

      if (!ids.length) {
        throw { status: 400, message: "At least one valid leave id required" };
      }

      if (ids.length > 500) {
        throw { status: 400, message: "Maximum 500 leaves allowed per request" };
      }
    }




    action = typeof action === "string" ? action.trim().toLowerCase() : null;

    if (!["approve", "reject"].includes(action)) {
      throw { status: 400, message: "Invalid action. Allowed: approve, reject" };
    }




    remarks = typeof remarks === "string" ? remarks.trim() : null;

    if (remarks && remarks.length > 255) {
      throw { status: 400, message: "Remarks cannot exceed 255 characters" };
    }




    let leavesQuery;
    let queryParams;

    if (isAll) {

      leavesQuery = `
        SELECT
          el.*,
          e.user_id, e.employee_code, e.designation, e.weekends,
          e.is_active AS employee_active, e.is_deleted AS employee_deleted,
          lc.name AS leave_name, lc.code AS leave_code,
          lc.is_paid, lc.allow_half_day, lc.exclude_weekends,
          lc.is_active AS config_active, lc.is_deleted AS config_deleted,
          u.name AS employee_name, LOWER(TRIM(u.email)) AS employee_email,
          c.id AS company_id, c.name AS company_name,
          approverUser.name AS approver_name, approverUser.email AS approver_email
        FROM employee_leaves el
        INNER JOIN employees e
          ON e.id = el.employee_id AND e.company_id = el.company_id
        INNER JOIN users u
          ON u.id = e.user_id AND u.is_active = 1 AND u.is_deleted = 0
        INNER JOIN leave_configs lc
          ON lc.id = el.leave_config_id AND lc.company_id = el.company_id
        INNER JOIN companies c
          ON c.id = el.company_id AND c.is_active = 1 AND c.is_deleted = 0
        LEFT JOIN users approverUser
          ON approverUser.id = ?
        WHERE el.company_id = ?
          AND LOWER(TRIM(el.status)) = 'pending'
          AND el.is_deleted = 0
        ORDER BY el.id ASC
        LIMIT 500
        FOR UPDATE
      `;
      queryParams = [approver_id, company_id];
    } else {

      leavesQuery = `
        SELECT
          el.*,
          e.user_id, e.employee_code, e.designation, e.weekends,
          e.is_active AS employee_active, e.is_deleted AS employee_deleted,
          lc.name AS leave_name, lc.code AS leave_code,
          lc.is_paid, lc.allow_half_day, lc.exclude_weekends,
          lc.is_active AS config_active, lc.is_deleted AS config_deleted,
          u.name AS employee_name, LOWER(TRIM(u.email)) AS employee_email,
          c.id AS company_id, c.name AS company_name,
          approverUser.name AS approver_name, approverUser.email AS approver_email
        FROM employee_leaves el
        INNER JOIN employees e
          ON e.id = el.employee_id AND e.company_id = el.company_id
        INNER JOIN users u
          ON u.id = e.user_id AND u.is_active = 1 AND u.is_deleted = 0
        INNER JOIN leave_configs lc
          ON lc.id = el.leave_config_id AND lc.company_id = el.company_id
        INNER JOIN companies c
          ON c.id = el.company_id AND c.is_active = 1 AND c.is_deleted = 0
        LEFT JOIN users approverUser
          ON approverUser.id = ?
        WHERE el.company_id = ?
          AND el.id IN (?)
          AND el.is_deleted = 0
        FOR UPDATE
      `;
      queryParams = [approver_id, company_id, ids];
    }

    const [leaves] = await conn.query(leavesQuery, queryParams);




    if (!leaves.length) {
      throw {
        status: 404,
        message: isAll
          ? "No pending leaves found"
          : `Leaves not found: ${ids.join(", ")}`
      };
    }


    if (!isAll && leaves.length !== ids.length) {
      const foundIds = new Set(leaves.map(l => l.id));
      const missingIds = ids.filter(id => !foundIds.has(id));
      throw {
        status: 404,
        message: `Leaves not found: ${missingIds.join(", ")}`
      };
    }




    let holidaySet = new Set();

    if (action === "approve") {
      let minDate = null;
      let maxDate = null;

      for (const leave of leaves) {
        const start = formatToDate(leave.start_date);
        const end = formatToDate(leave.end_date);

        if (!minDate || start < minDate) minDate = start;
        if (!maxDate || end > maxDate) maxDate = end;
      }

      const [holidayRows] = await conn.query(
        `SELECT date FROM holidays
         WHERE company_id = ?
           AND is_optional = 0
           AND is_active = 1
           AND is_deleted = 0
           AND date BETWEEN ? AND ?`,
        [company_id, minDate, maxDate]
      );

      holidaySet = new Set(holidayRows.map(h => formatToDate(h.date)));
    }




    const calculateActualDays = ({ leave, weekends, exclude_weekends }) => {
      let total = 0;
      eachDateBetween(
        formatToDate(leave.start_date),
        formatToDate(leave.end_date),
        (dateStr) => {
          const isHoliday = holidaySet.has(dateStr);
          const weekendStatus = isWeekendDate(dateStr, weekends);
          const shouldExcludeWeekend =
            Number(exclude_weekends) === 1 && weekendStatus?.isWeekend;

          if (isHoliday || shouldExcludeWeekend) return;

          total += Number(leave.is_half_day) === 1 ? 0.5 : 1;
        }
      );
      return Number(total.toFixed(2));
    };




    const emailJobs = [];
    const processedIds = [];




    for (const leave of leaves) {
      const currentStatus = String(leave.status).trim().toLowerCase();

      if (currentStatus !== "pending") {
        throw {
          status: 400,
          message: `Leave ${leave.id} already ${currentStatus}`
        };
      }

      if (action === "reject") {

        if (Number(leave.is_paid) === 1) {

          const leaveYear =
            getYearFromDate(
              formatToDate(leave.start_date)
            );

          await adjustEmployeeLeaveBalance({
            conn,
            company_id,

            employee_id:
              leave.employee_id,

            leave_config_id:
              leave.leave_config_id,

            year:
              leaveYear,

            days:
              Number(leave.total_days),

            mode:
              "restore",

            user_id:
              approver_id
          });
        }

        await conn.query(
          `UPDATE employee_leaves
           SET status = 'rejected',
               approved_by = ?,
               approved_at = NOW(),
               approval_remarks = ?,
               updated_by = ?
           WHERE id = ?`,
          [approver_id, remarks, approver_id, leave.id]
        );

        processedIds.push(leave.id);

        if (leave.employee_email) {
          emailJobs.push(
            queueLeaveRejectionEmail({
              to: leave.employee_email,
              replyTo: leave.approver_email || null,
              requester: {
                id: leave.user_id,
                name: leave.employee_name,
                email: leave.employee_email
              },
              employee: {
                id: leave.employee_id,
                employee_code: leave.employee_code,
                designation: getEnumObject(DESIGNATIONS, leave.designation)
              },
              company: {
                id: leave.company_id,
                name: leave.company_name
              },
              leave: {
                id: leave.id,
                start_date: formatToDate(leave.start_date),
                end_date: formatToDate(leave.end_date),
                total_days: Number(leave.total_days),
                reason: leave.reason,
                approval_remarks: remarks
              },
              leaveConfig: {
                id: leave.leave_config_id,
                name: leave.leave_name,
                code: leave.leave_code
              },
              approver: {
                id: approver_id,
                name: leave.approver_name || "Approver",
                email: leave.approver_email
              }
            })
          );
        }
        continue;
      }




      if (Number(leave.employee_active) !== 1 || Number(leave.employee_deleted) === 1) {
        throw { status: 400, message: `Employee inactive for leave ${leave.id}` };
      }

      if (Number(leave.config_active) !== 1 || Number(leave.config_deleted) === 1) {
        throw { status: 400, message: `Leave config inactive for leave ${leave.id}` };
      }

      if (Number(leave.is_half_day) === 1) {
        if (Number(leave.allow_half_day) !== 1) {
          throw { status: 400, message: `Half day leave not allowed for leave ${leave.id}` };
        }
        if (!["first_half", "second_half"].includes(leave.half_day_type)) {
          throw { status: 400, message: `Invalid half_day_type for leave ${leave.id}` };
        }
      }

      const startDate = formatToDate(leave.start_date);
      const endDate = formatToDate(leave.end_date);

      if (isDateAfter(startDate, endDate)) {
        throw { status: 400, message: `Invalid leave range for leave ${leave.id}` };
      }

      const actualDays = calculateActualDays({
        leave,
        weekends: leave.weekends,
        exclude_weekends: leave.exclude_weekends
      });

      if (actualDays <= 0) {
        throw { status: 400, message: `No valid leave days for leave ${leave.id}` };
      }


      const [overlaps] = await conn.query(
        `SELECT id, start_date, end_date, is_half_day, half_day_type
         FROM employee_leaves
         WHERE employee_id = ?
           AND company_id = ?
           AND id != ?
           AND is_deleted = 0
           AND LOWER(TRIM(status)) IN ('pending', 'approved')
           AND NOT (end_date < ? OR start_date > ?)`,
        [leave.employee_id, company_id, leave.id, startDate, endDate]
      );

      if (overlaps.length) {
        let allowed = false;
        if (
          Number(leave.is_half_day) === 1 &&
          overlaps.length === 1 &&
          Number(overlaps[0].is_half_day) === 1 &&
          overlaps[0].half_day_type !== leave.half_day_type &&
          formatToDate(overlaps[0].start_date) === startDate
        ) {
          allowed = true;
        }
        if (!allowed) {
          throw { status: 409, message: `Leave overlap detected for leave ${leave.id}` };
        }
      }


      let latestBalance = null;

      if (Number(leave.is_paid) === 1) {

        const leaveYear =
          getYearFromDate(startDate);

        const [[balance]] =
          await conn.query(
            `
            SELECT
              total_allocated,
              used,
              remaining

            FROM employee_leave_balances

            WHERE company_id = ?
              AND employee_id = ?
              AND leave_config_id = ?
              AND year = ?
              AND is_deleted = 0

            LIMIT 1
            `,
            [
              company_id,
              leave.employee_id,
              leave.leave_config_id,
              leaveYear
            ]
          );

        latestBalance =
          balance
            ? {
              total_allocated:
                Number(balance.total_allocated || 0),

              used:
                Number(balance.used || 0),

              remaining:
                Number(balance.remaining || 0)
            }
            : null;
      }

      await conn.query(
        `UPDATE employee_leaves
         SET total_days = ?,
             status = 'approved',
             approved_by = ?,
             approved_at = NOW(),
             approval_remarks = ?,
             updated_by = ?
         WHERE id = ?`,
        [actualDays, approver_id, remarks, approver_id, leave.id]
      );

      processedIds.push(leave.id);


      if (leave.employee_email) {
        emailJobs.push(
          queueLeaveAcceptanceEmail({
            to: leave.employee_email,
            replyTo: leave.approver_email || null,
            requester: {
              id: leave.user_id,
              name: leave.employee_name,
              email: leave.employee_email
            },
            employee: {
              id: leave.employee_id,
              employee_code: leave.employee_code,
              designation: getEnumObject(DESIGNATIONS, leave.designation)
            },
            company: {
              id: leave.company_id,
              name: leave.company_name
            },
            leave: {
              id: leave.id,
              start_date: startDate,
              end_date: endDate,
              total_days: actualDays,
              reason: leave.reason,
              approval_remarks: remarks
            },
            leaveConfig: {
              id: leave.leave_config_id,
              name: leave.leave_name,
              code: leave.leave_code
            },
            approver: {
              id: approver_id,
              name: leave.approver_name || "Approver",
              email: leave.approver_email
            },
            leaveBalance: latestBalance
          })
        );
      }
    }




    const [finalLeaves] = await conn.query(
      `SELECT
         el.*,
         lc.name AS leave_name,
         lc.code AS leave_code,
         e.employee_code,
         u.name AS employee_name,
         u.email AS employee_email
       FROM employee_leaves el
       INNER JOIN leave_configs lc ON lc.id = el.leave_config_id
       INNER JOIN employees e ON e.id = el.employee_id
       INNER JOIN users u ON u.id = e.user_id
       WHERE el.id IN (?)
       ORDER BY el.start_date ASC`,
      [processedIds]
    );




    await conn.commit();




    if (emailJobs.length) {
      Promise.allSettled(emailJobs)
        .then(results => {
          const failed = results.filter(r => r.status === "rejected");
          if (failed.length) {
            console.error("[BULK_LEAVE_EMAIL_FAILED]", failed);
          }
        })
        .catch(emailError => {
          console.error("[BULK_LEAVE_EMAIL_QUEUE_ERROR]", emailError);
        });
    }




    return res.status(200).json({
      success: true,
      message: `${processedIds.length} leave(s) ${action}d successfully`,
      data: {
        action,
        processed_count: processedIds.length,
        leave_ids: processedIds,
        leaves: finalLeaves.map(item =>
          convertToISTFields(item, [
            "approved_at",
            "applied_at",
            "created_at",
            "updated_at"
          ])
        )
      }
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("[BULK_ACTION_ROLLBACK_ERROR]", rollbackError);
      }
    }

    console.error("[PUT /management/bulk-actions]", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error"
    });
  } finally {
    if (conn) conn.release();
  }
});

// Reject leave for an employee
router.put("/reject", auth(LEAVE.MNG), async (req, res) => {

  let conn;

  try {




    conn = await db.getConnection();

    await conn.beginTransaction();




    const approver_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);

    if (
      !Number.isInteger(approver_id) ||
      approver_id <= 0 ||
      !Number.isInteger(company_id) ||
      company_id <= 0
    ) {
      throw {
        status: 401,
        message: "Unauthorized access"
      };
    }




    let {
      id,
      remarks = null
    } = req.body || {};




    id = Number(id);

    remarks =
      typeof remarks === "string"
        ? remarks.trim()
        : null;




    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      throw {
        status: 400,
        message: "Valid leave id is required"
      };
    }

    if (
      remarks &&
      remarks.length > 1000
    ) {
      throw {
        status: 400,
        message:
          "Remarks cannot exceed 1000 characters"
      };
    }




    const [[leave]] = await conn.query(
      `
      SELECT
        el.*,

        lc.name AS leave_type_name,
        lc.code AS leave_type_code,
        lc.is_paid,

        e.id AS employee_id,
        e.user_id AS employee_user_id,
        e.employee_code,
        e.designation,

        u.name AS employee_name,
        u.email AS employee_email,

        c.id AS company_id,
        c.name AS company_name,

        approver.name AS approver_name,
        approver.email AS approver_email

      FROM employee_leaves el

      INNER JOIN leave_configs lc
        ON lc.id = el.leave_config_id
        AND lc.is_deleted = 0

      INNER JOIN employees e
        ON e.id = el.employee_id
        AND e.is_deleted = 0

      INNER JOIN users u
        ON u.id = e.user_id
        AND u.is_deleted = 0

      INNER JOIN companies c
        ON c.id = el.company_id
        AND c.is_deleted = 0

      LEFT JOIN users approver
        ON approver.id = ?

      WHERE el.id = ?
        AND el.company_id = ?
        AND el.is_deleted = 0

      LIMIT 1
      FOR UPDATE
      `,
      [
        approver_id,
        id,
        company_id
      ]
    );

    if (!leave) {
      throw {
        status: 404,
        message: "Leave not found"
      };
    }




    const leaveStatus =
      String(leave.status)
        .trim()
        .toLowerCase();

    if (leaveStatus === "rejected") {

      await conn.commit();

      return res.status(200).json({
        success: true,
        message: "Leave already rejected",
        data: {
          leave_id: leave.id,
          status: leave.status
        }
      });
    }

    if (leaveStatus !== "pending") {
      throw {
        status: 400,
        message:
          `Cannot reject leave in '${leave.status}' state`
      };
    }




    const approvedAt =
      getISTNow().format(
        "YYYY-MM-DD HH:mm:ss"
      );

    if (Number(leave.is_paid) === 1) {

      const leaveYear =
        getYearFromDate(
          formatToDate(
            leave.start_date
          )
        );

      await adjustEmployeeLeaveBalance({
        conn,
        company_id,

        employee_id:
          leave.employee_id,

        leave_config_id:
          leave.leave_config_id,

        year:
          leaveYear,

        days:
          Number(
            leave.total_days
          ),

        mode:
          "restore",

        user_id:
          approver_id
      });
    }


    await conn.query(
      `
      UPDATE employee_leaves
      SET
        status = 'rejected',
        approved_by = ?,
        approved_at = ?,
        approval_remarks = ?,
        updated_by = ?
      WHERE id = ?
      `,
      [
        approver_id,
        approvedAt,
        remarks,
        approver_id,
        id
      ]
    );




    const [attachments] = await conn.query(
      `
      SELECT
        id,
        file_url,
        file_type,
        file_size,
        created_at

      FROM employee_leave_attachments

      WHERE leave_id = ?
        AND is_deleted = 0

      ORDER BY id ASC
      `,
      [id]
    );




    const leaveRecord = {
      id: leave.id,

      company_id:
        leave.company_id,

      employee_id:
        leave.employee_id,

      employee_user_id:
        leave.employee_user_id,

      employee_name: leave.employee_name,

      employee_email: leave.employee_email,

      employee_code: leave.employee_code,

      designation: getEnumObject(DESIGNATIONS, leave.designation),

      leave_config_id: leave.leave_config_id,

      leave_type_name: leave.leave_type_name,

      leave_type_code: leave.leave_type_code,

      is_paid: Number(leave.is_paid),

      start_date:
        formatToDate(
          leave.start_date
        ),

      end_date:
        formatToDate(
          leave.end_date
        ),

      total_days:
        Number(
          leave.total_days
        ),

      is_half_day:
        Number(
          leave.is_half_day
        ),

      half_day_type:
        leave.half_day_type,

      reason:
        leave.reason,

      status: "rejected",

      applied_at:
        leave.applied_at,

      approved_at:
        approvedAt,

      approval_remarks:
        remarks,

      attachments:
        attachments.map(item => ({
          id: item.id,
          file_url:
            item.file_url,
          file_type:
            item.file_type,
          file_size:
            item.file_size,
          created_at:
            item.created_at
        }))
    };




    await conn.commit();




    if (leave.employee_email) {

      queueLeaveRejectionEmail({

        to:
          leave.employee_email,

        replyTo:
          leave.approver_email || null,

        requester: {
          id:
            leave.employee_user_id,

          name:
            leave.employee_name,

          email:
            leave.employee_email
        },

        employee: {
          id:
            leave.employee_id,

          employee_code:
            leave.employee_code,

          designation: getEnumObject(DESIGNATIONS, leave.designation)
        },

        company: {
          id:
            leave.company_id,

          name:
            leave.company_name
        },

        leave: {
          id:
            leave.id,

          start_date:
            formatToDate(
              leave.start_date
            ),

          end_date:
            formatToDate(
              leave.end_date
            ),

          total_days:
            Number(
              leave.total_days
            ),

          is_half_day:
            Number(
              leave.is_half_day
            ),

          half_day_type:
            leave.half_day_type,

          reason:
            leave.reason,

          approval_remarks:
            remarks,

          approved_at:
            approvedAt
        },

        leaveConfig: {
          id:
            leave.leave_config_id,

          name:
            leave.leave_type_name,

          code:
            leave.leave_type_code
        },

        approver: {
          id:
            approver_id,

          name:
            leave.approver_name ||
            "Approver",

          email:
            leave.approver_email
        },

        leaveBalance: null
      })
        .catch((emailError) => {

          console.error(
            "[LEAVE_REJECTION_EMAIL_ERROR]",
            {
              leave_id: leave.id,
              error:
                emailError?.message
            }
          );
        });
    }




    return res.status(200).json({
      success: true,

      message:
        "Leave rejected successfully",

      data: {
        leave:
          convertToISTFields(
            leaveRecord,
            [
              "applied_at",
              "approved_at"
            ]
          )
      }
    });

  } catch (error) {




    if (conn) {

      try {

        await conn.rollback();

      } catch (rollbackError) {

        console.error(
          "[LEAVE_REJECT_ROLLBACK_ERROR]",
          rollbackError
        );
      }
    }

    console.error(
      "[PUT /reject]",
      error
    );

    return res.status(
      error.status || 500
    ).json({
      success: false,

      message:
        error.message ||
        "Internal server error"
    });

  } finally {




    if (conn) {
      conn.release();
    }
  }
});

// Cancel leave for an employee (employee can cancel their own leave)
router.put("/cancel", auth(LEAVE.EMP), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const leaveId = req.body.id;
    const user_id = req.user?.id;
    const company_id = req.company?.id;

    if (!leaveId) {
      throw { status: 400, message: "Leave id is required" };
    }

    if (!user_id || !company_id) {
      throw { status: 400, message: "Invalid user/company context" };
    }

    const [[employee]] = await conn.query(
      `SELECT id
       FROM employees
       WHERE user_id = ? AND company_id = ?
         AND is_active = 1 AND is_deleted = 0
       LIMIT 1`,
      [user_id, company_id]
    );

    if (!employee) {
      throw { status: 403, message: "No active employee found" };
    }

    const employee_id = employee.id;

    const [[leave]] = await conn.query(
      `SELECT
        el.*,
        lc.is_paid
      FROM employee_leaves el
      INNER JOIN leave_configs lc
        ON lc.id = el.leave_config_id
        AND lc.is_deleted = 0
      WHERE el.id = ?
        AND el.company_id = ?
        AND el.is_deleted = 0
      FOR UPDATE`,
      [leaveId, company_id]
    );

    if (!leave) {
      throw { status: 404, message: "Leave not found" };
    }




    if (leave.employee_id !== employee_id) {
      throw {
        status: 403,
        message: "You can only cancel your own leave",
      };
    }

    const leaveStatus =
      String(leave.status)
        .trim()
        .toLowerCase();

    if (leaveStatus === "cancelled") {

      await conn.commit();

      return res.json({
        success: true,
        message: "Leave already cancelled",
      });
    }

    if (!["pending", "approved"].includes(leaveStatus)) {
      throw {
        status: 400,
        message: `Cannot cancel leave in '${leave.status}' state`,
      };
    }

    if (Number(leave.is_paid) === 1) {

      const leaveYear =
        getYearFromDate(
          formatToDate(
            leave.start_date
          )
        );

      await adjustEmployeeLeaveBalance({
        conn,
        company_id,

        employee_id:
          leave.employee_id,

        leave_config_id:
          leave.leave_config_id,

        year:
          leaveYear,

        days:
          Number(
            leave.total_days
          ),

        mode:
          "restore",

        user_id
      });
    }

    await conn.query(
      `UPDATE employee_leaves
        SET status = 'cancelled',
       cancelled_at = NOW(),
       is_active = 0,
       updated_by = ?
      WHERE id = ?`,
      [user_id, leaveId]
    );

    await conn.commit();

    return res.json({
      success: true,
      message: "Leave cancelled and removed successfully",
      data: {
        id: leaveId,
        status: "cancelled"
      }
    });

  } catch (err) {
    if (conn) await conn.rollback();

    const status = err.status || 500;
    if (status === 500) console.error("[PUT /cancel]", err);

    return res.status(status).json({
      success: false,
      message: err.message || "Internal server error",
    });

  } finally {
    if (conn) conn.release();
  }
});

// Update leave application for an employee (can update their own requests)
router.put("/application-update", auth(LEAVE.EMP), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const leave_id = req.body.id;
    const user_id = req.user?.id;
    const company_id = req.company?.id;

    const {
      leave_config_id,
      start_date,
      end_date,
      is_half_day = 0,
      half_day_type,
      reason,
      deleted_attachments = []
    } = req.body;

    if (!leave_id) {
      throw { status: 400, message: "Leave ID is required" };
    }




    const [[leave]] = await conn.query(
      `SELECT * FROM employee_leaves
         WHERE id = ? AND company_id = ? AND is_deleted = 0
         FOR UPDATE`,
      [leave_id, company_id]
    );

    if (!leave) {
      throw { status: 404, message: "Leave not found" };
    }


    if (leave.status !== "pending") {
      throw {
        status: 400,
        message: `Cannot update leave in '${leave.status}' state`,
      };
    }




    const start = new Date(start_date || leave.start_date);
    const end = new Date(end_date || leave.end_date);

    if (isNaN(start) || isNaN(end)) {
      throw { status: 400, message: "Invalid date format" };
    }

    if (start > end) {
      throw { status: 400, message: "Start date cannot be after end date" };
    }

    const halfDay = parseInt(is_half_day) === 1;

    if (halfDay) {
      if (start.toDateString() !== end.toDateString()) {
        throw { status: 400, message: "Half day must be single day" };
      }
      if (!["first_half", "second_half"].includes(half_day_type)) {
        throw { status: 400, message: "Invalid half_day_type" };
      }
    }




    const [[config]] = await conn.query(
      `SELECT * FROM leave_configs
         WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [leave_config_id || leave.leave_config_id, company_id]
    );

    if (!config) {
      throw { status: 404, message: "Leave config not found" };
    }




    const [holidayRows] = await conn.query(
      `SELECT date FROM holidays
         WHERE company_id = ? AND is_optional = 0
         AND is_deleted = 0 AND is_active = 1
         AND date BETWEEN ? AND ?`,
      [company_id, start, end]
    );

    const holidaySet = new Set(
      holidayRows.map(h => new Date(h.date).toDateString())
    );

    let new_total_days = 0;

    if (halfDay) {
      new_total_days = 0.5;
    } else {
      const cursor = new Date(start);
      while (cursor <= end) {
        const isWeekend = [0, 6].includes(cursor.getDay());
        const isHoliday = holidaySet.has(cursor.toDateString());

        if (!(config.exclude_weekends && isWeekend) && !isHoliday) {
          new_total_days += 1;
        }

        cursor.setDate(cursor.getDate() + 1);
      }
    }

    if (new_total_days <= 0) {
      throw { status: 400, message: "No valid working days" };
    }




    const diff = new_total_days - parseFloat(leave.total_days);

    if (diff !== 0) {
      const year = start.getFullYear();

      const [[balance]] = await conn.query(
        `SELECT * FROM employee_leave_balances
           WHERE employee_id = ? AND company_id = ?
           AND leave_config_id = ? AND year = ?
           AND is_deleted = 0
           FOR UPDATE`,
        [
          leave.employee_id,
          company_id,
          leave_config_id || leave.leave_config_id,
          year
        ]
      );



      if (balance) {
        await conn.query(
          `UPDATE employee_leave_balances
             SET used = used + ?,
                 remaining = remaining - ?,
                 updated_by = ?
             WHERE id = ?`,
          [diff, diff, user_id, balance.id]
        );
      }
    }




    await conn.query(
      `UPDATE employee_leaves
         SET leave_config_id = ?,
             start_date = ?,
             end_date = ?,
             total_days = ?,
             is_half_day = ?,
             half_day_type = ?,
             reason = ?,
             updated_by = ?
         WHERE id = ?`,
      [
        leave_config_id || leave.leave_config_id,
        start,
        end,
        new_total_days,
        halfDay ? 1 : 0,
        halfDay ? half_day_type : null,
        reason?.trim() || null,
        user_id,
        leave_id,
      ]
    );




    if (deleted_attachments.length) {
      await conn.query(
        `UPDATE employee_leave_attachments
           SET is_deleted = 1,
               deleted_at = NOW(),
               deleted_by = ?
           WHERE id IN (?) AND leave_id = ?`,
        [user_id, deleted_attachments, leave_id]
      );
    }




    const files = req.files || [];

    if (files.length) {
      const rows = files.map(f => [
        leave_id,
        f.path,
        f.mimetype,
        f.size,
        user_id,
        user_id,
      ]);

      await conn.query(
        `INSERT INTO employee_leave_attachments
           (leave_id, file_url, file_type, file_size, created_by, updated_by)
           VALUES ?`,
        [rows]
      );
    }




    const [[updatedLeave]] = await conn.query(
      `SELECT el.*, lc.name AS leave_name, lc.code
         FROM employee_leaves el
         JOIN leave_configs lc ON lc.id = el.leave_config_id
         WHERE el.id = ?`,
      [leave_id]
    );

    const [attachments] = await conn.query(
      `SELECT id, file_url, file_type, file_size
         FROM employee_leave_attachments
         WHERE leave_id = ? AND is_deleted = 0`,
      [leave_id]
    );

    await conn.commit();

    return res.json({
      success: true,
      message: "Leave updated successfully",
      data: {
        ...updatedLeave,
        attachments,
      },
    });

  } catch (err) {
    if (conn) await conn.rollback();

    const status = err.status || 500;
    if (status === 500) console.error("[PUT /update]", err);

    return res.status(status).json({
      success: false,
      message: err.message || "Internal server error",
    });

  } finally {
    if (conn) conn.release();
  }
}
);

// can view all my leave applications
router.get("/my-applications", auth(LEAVE.EMP), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();




    const user_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);

    if (!user_id || !company_id) {
      throw {
        status: 400,
        message: "Invalid user/company context",
      };
    }




    const [[employee]] = await conn.query(
      `
      SELECT id
      FROM employees
      WHERE user_id = ?
        AND company_id = ?
        AND is_active = 1
        AND is_deleted = 0
      LIMIT 1
      `,
      [user_id, company_id]
    );

    if (!employee) {
      throw {
        status: 404,
        message: "Employee not found",
      };
    }

    const employee_id = employee.id;




    const page = Math.max(parseInt(req.query.page) || 1, 1);

    const limit = Math.min(
      Math.max(parseInt(req.query.limit) || 10, 1),
      100
    );

    const offset = (page - 1) * limit;




    const search = req.query.search?.trim() || "";

    const status = req.query.status?.trim()?.toLowerCase() || null;

    const leave_type = req.query.leave_type?.trim() || null;

    const start_date = req.query.start_date || null;

    const end_date = req.query.end_date || null;

    const validStatuses = [
      "pending",
      "approved",
      "rejected",
      "cancelled",
    ];

    if (status && !validStatuses.includes(status)) {
      throw {
        status: 400,
        message:
          "Invalid status filter. Allowed: pending, approved, rejected, cancelled",
      };
    }




    let query = `
      SELECT
        el.id,
        el.start_date,
        el.end_date,
        el.total_days,
        el.is_half_day,
        el.half_day_type,
        el.reason,
        el.status,
        el.applied_at,
        el.approved_at,
        el.cancelled_at,
        el.approval_remarks,

        lc.id AS leave_type_id,
        lc.name AS leave_type_name,
        lc.code AS leave_type_code,
        lc.is_paid

      FROM employee_leaves el

      INNER JOIN leave_configs lc
        ON lc.id = el.leave_config_id
        AND lc.is_deleted = 0

      WHERE el.employee_id = ?
        AND el.company_id = ?
        AND el.is_deleted = 0
    `;

    const params = [employee_id, company_id];




    if (status) {
      query += ` AND LOWER(el.status) = ? `;
      params.push(status);
    }




    if (leave_type) {
      query += `
        AND (
          LOWER(lc.name) LIKE ?
          OR LOWER(lc.code) LIKE ?
        )
      `;

      params.push(
        `%${leave_type.toLowerCase()}%`,
        `%${leave_type.toLowerCase()}%`
      );
    }




    if (start_date) {
      query += ` AND el.start_date >= ? `;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND el.end_date <= ? `;
      params.push(end_date);
    }




    if (search) {
      const terms = search
        .toLowerCase()
        .split(" ")
        .filter(Boolean);

      const conditions = terms
        .map(
          () => `
          (
            LOWER(lc.name) LIKE ?
            OR LOWER(lc.code) LIKE ?
            OR LOWER(el.reason) LIKE ?
            OR LOWER(el.status) LIKE ?
          )
        `
        )
        .join(" AND ");

      query += ` AND (${conditions}) `;

      terms.forEach((term) => {
        const value = `%${term}%`;

        params.push(
          value,
          value,
          value,
          value
        );
      });
    }




    query += `
      ORDER BY
        el.created_at DESC,
        el.id DESC
      LIMIT ?
      OFFSET ?
    `;

    params.push(limit, offset);




    const [rows] = await conn.query(query, params);




    const leaveIds = rows.map((row) => row.id);

    let attachmentMap = {};

    if (leaveIds.length > 0) {
      const [attachments] = await conn.query(
        `
        SELECT
          id,
          leave_id,
          file_url,
          file_type,
          file_size

        FROM employee_leave_attachments

        WHERE leave_id IN (?)
          AND is_deleted = 0
        `,
        [leaveIds]
      );

      attachmentMap = attachments.reduce((acc, file) => {
        if (!acc[file.leave_id]) {
          acc[file.leave_id] = [];
        }

        acc[file.leave_id].push({
          id: file.id,
          file_url: file.file_url,
          file_type: file.file_type,
          file_size: file.file_size,
        });

        return acc;
      }, {});
    }




    let countQuery = `
      SELECT COUNT(*) AS total

      FROM employee_leaves el

      INNER JOIN leave_configs lc
        ON lc.id = el.leave_config_id
        AND lc.is_deleted = 0

      WHERE el.employee_id = ?
        AND el.company_id = ?
        AND el.is_deleted = 0
    `;

    const countParams = [employee_id, company_id];

    if (status) {
      countQuery += ` AND LOWER(el.status) = ? `;
      countParams.push(status);
    }

    if (leave_type) {
      countQuery += `
        AND (
          LOWER(lc.name) LIKE ?
          OR LOWER(lc.code) LIKE ?
        )
      `;

      countParams.push(
        `%${leave_type.toLowerCase()}%`,
        `%${leave_type.toLowerCase()}%`
      );
    }

    if (start_date) {
      countQuery += ` AND el.start_date >= ? `;
      countParams.push(start_date);
    }

    if (end_date) {
      countQuery += ` AND el.end_date <= ? `;
      countParams.push(end_date);
    }

    if (search) {
      const terms = search
        .toLowerCase()
        .split(" ")
        .filter(Boolean);

      const conditions = terms
        .map(
          () => `
          (
            LOWER(lc.name) LIKE ?
            OR LOWER(lc.code) LIKE ?
            OR LOWER(el.reason) LIKE ?
            OR LOWER(el.status) LIKE ?
          )
        `
        )
        .join(" AND ");

      countQuery += ` AND (${conditions}) `;

      terms.forEach((term) => {
        const value = `%${term}%`;

        countParams.push(
          value,
          value,
          value,
          value
        );
      });
    }

    const [[{ total }]] = await conn.query(
      countQuery,
      countParams
    );




    const [statusCounts] = await conn.query(
      `
      SELECT
        status,
        COUNT(*) AS total

      FROM employee_leaves

      WHERE employee_id = ?
        AND company_id = ?
        AND is_deleted = 0

      GROUP BY status
      `,
      [employee_id, company_id]
    );

    const counts = {
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
    };

    statusCounts.forEach((item) => {
      counts[item.status] = Number(item.total);
    });




    const booleanFields = [
      "is_half_day",
      "is_paid",
    ];

    const data = rows.map((row) => ({
      ...toBooleanFields(
        { ...row },
        booleanFields
      ),
      total_days: Number(row.total_days),
      attachments:
        attachmentMap[row.id] || [],
    }));





    return res.json({
      success: true,
      message:
        "Leave applications fetched successfully",



      data,

      meta: {
        filters: {
          search,
          status,
          leave_type,
          start_date,
          end_date,
        },

        counts,
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
        has_next_page:
          page < Math.ceil(total / limit),
        has_prev_page: page > 1,
      },
    });

  } catch (error) {
    console.error(
      "[GET /my-applications]",
      error
    );

    return res.status(error.status || 500).json({
      success: false,
      message:
        error.message ||
        "Internal server error",
    });

  } finally {
    if (conn) conn.release();
  }
});

// can view all employee leave applications
router.get("/emp-leaves", auth(LEAVE.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const company_id = req.company?.id;
    if (!company_id) {
      throw { status: 400, message: "Invalid company" };
    }

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const offset = (page - 1) * limit;

    const search = (req.query.search || "").trim();
    const status = req.query.status?.trim();
    const start_date = req.query.start_date;
    const end_date = req.query.end_date;




    const allowedEmpLeaveStatuses = [
      "pending",
      "approved",
      "rejected"
    ];

    if (status) {
      const normalizedStatus = status.toLowerCase();

      if (!allowedEmpLeaveStatuses.includes(normalizedStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Allowed: ${allowedEmpLeaveStatuses.join(", ")}`
        });
      }
    }

    if (start_date && isNaN(new Date(start_date))) {
      throw { status: 400, message: "Invalid start_date" };
    }

    if (end_date && isNaN(new Date(end_date))) {
      throw { status: 400, message: "Invalid end_date" };
    }

    let query = `
      SELECT 
        el.id,
        el.employee_id,
        el.leave_config_id,
        el.start_date,
        el.end_date,
        el.total_days,
        el.is_half_day,
        el.half_day_type,
        el.reason,
        el.status,
        el.approved_by,
        el.approved_at,
        el.approval_remarks,
        el.applied_at,
        el.cancelled_at,
        el.created_at,

        e.employee_code,
        e.designation,

        u.name AS employee_name,
        u.email,
        u.profile_picture,

        lc.code AS leave_code,
        lc.name AS leave_name,
        lc.is_paid,

        au.name AS approved_by_name

      FROM employee_leaves el

      JOIN employees e 
        ON e.id = el.employee_id
        AND e.company_id = ?
        AND e.is_deleted = 0
        AND e.is_active = 1

      JOIN users u 
        ON u.id = e.user_id
        AND u.is_deleted = 0

      JOIN leave_configs lc
        ON lc.id = el.leave_config_id
        AND lc.is_deleted = 0

      LEFT JOIN users au
        ON au.id = el.approved_by

      WHERE el.company_id = ?
        AND el.is_deleted = 0
        AND LOWER(TRIM(el.status)) != 'cancelled'
    `;

    const params = [company_id, company_id];

    if (status) {
      query += ` AND el.status = ?`;
      params.push(status);
    }

    if (start_date && end_date) {
      query += ` AND el.start_date BETWEEN ? AND ?`;
      params.push(start_date, end_date);
    } else if (start_date) {
      query += ` AND el.start_date >= ?`;
      params.push(start_date);
    } else if (end_date) {
      query += ` AND el.start_date <= ?`;
      params.push(end_date);
    }

    if (search) {
      const terms = search.toLowerCase().split(" ").filter(Boolean);

      const conditions = terms.map(() => `
        (
          LOWER(u.name) LIKE ?
          OR LOWER(u.email) LIKE ?
          OR LOWER(e.employee_code) LIKE ?
          OR LOWER(lc.name) LIKE ?
          OR LOWER(lc.code) LIKE ?
          OR LOWER(el.reason) LIKE ?
        )
      `).join(" AND ");

      query += ` AND (${conditions})`;

      terms.forEach(term => {
        const s = `%${term}%`;
        params.push(s, s, s, s, s, s);
      });
    }

    query += ` ORDER BY el.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await conn.query(query, params);




    const leaveIds = rows.map(r => r.id);

    let attachmentMap = {};

    if (leaveIds.length > 0) {
      const [attachments] = await conn.query(
        `SELECT id, leave_id, file_url, file_type, file_size
         FROM employee_leave_attachments
         WHERE leave_id IN (?) AND is_deleted = 0`,
        [leaveIds]
      );

      attachmentMap = attachments.reduce((acc, file) => {
        if (!acc[file.leave_id]) acc[file.leave_id] = [];
        acc[file.leave_id].push({
          id: file.id,
          file_url: file.file_url,
          file_type: file.file_type,
          file_size: file.file_size
        });
        return acc;
      }, {});
    }




    let countQuery = `
      SELECT COUNT(*) as total
      FROM employee_leaves el
      JOIN employees e 
        ON e.id = el.employee_id
        AND e.company_id = ?
        AND e.is_deleted = 0
        AND e.is_active = 1
      JOIN users u ON u.id = e.user_id AND u.is_deleted = 0
      JOIN leave_configs lc ON lc.id = el.leave_config_id AND lc.is_deleted = 0
      WHERE el.company_id = ?
        AND el.is_deleted = 0
        AND LOWER(TRIM(el.status)) != 'cancelled'
    `;

    const countParams = [company_id, company_id];

    if (status) {
      countQuery += ` AND el.status = ?`;
      countParams.push(status);
    }

    if (start_date && end_date) {
      countQuery += ` AND el.start_date BETWEEN ? AND ?`;
      countParams.push(start_date, end_date);
    } else if (start_date) {
      countQuery += ` AND el.start_date >= ?`;
      countParams.push(start_date);
    } else if (end_date) {
      countQuery += ` AND el.start_date <= ?`;
      countParams.push(end_date);
    }

    if (search) {
      const terms = search.toLowerCase().split(" ").filter(Boolean);

      const conditions = terms.map(() => `
        (
          LOWER(u.name) LIKE ?
          OR LOWER(u.email) LIKE ?
          OR LOWER(e.employee_code) LIKE ?
          OR LOWER(lc.name) LIKE ?
          OR LOWER(lc.code) LIKE ?
          OR LOWER(el.reason) LIKE ?
        )
      `).join(" AND ");

      countQuery += ` AND (${conditions})`;

      terms.forEach(term => {
        const s = `%${term}%`;
        countParams.push(s, s, s, s, s, s);
      });
    }

    const [[{ total }]] = await conn.query(countQuery, countParams);




    const booleanFields = ["is_half_day", "is_paid"];

    const data = rows.map(row => ({
      ...toBooleanFields({ ...row }, booleanFields),
      profile_picture: buildFileUrl(row.profile_picture) || null,
      total_days: Number(row.total_days),
      attachments: attachmentMap[row.id] || []
    }));

    return res.json({
      success: true,
      message: "Employee leaves fetched successfully",
      data,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error("Leave List Error:", error);

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error"
    });

  } finally {
    if (conn) conn.release();
  }
});


export default router;
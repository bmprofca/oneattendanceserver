import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import checkPermission from "../middleware/permissionValidationMiddleware.js";
import {
  validateFields, employmentValidation, salaryValidation, designationValidation,
  attendanceMethodValidation, inviteStatusValidation
} from "../utils/constantsValidator.js";
import { convertToISTFields, toISTString, normalizeWeekends } from "../utils/time.js";
import { toBooleanFields, toBool } from "../utils/toBooleanFields.js";
import { generateRandomToken } from "../utils/auth.js"
import { sendSuccess, sendError, parseJSONSafe, toBoolean, buildMeta } from "../utils/sendResponse.js"
import { buildFileUrl } from "../utils/fileService.js";
import { queueCompanyInvitationEmail } from "../email/services/email.processor.js";
import { getEnumObject } from "../utils/constantsValidator.js";
import { DESIGNATIONS, SALARY_TYPES, EMPLOYMENT_TYPES } from "../constants/constants_values.js";
import { INV, INV_PKG } from "../constants/permissions.js";


const router = express.Router();


router.post("/package-create", auth(INV_PKG.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = req.company?.id;
    const user_id = req.user?.id;

    let {
      code,
      name,

      designation,
      salary_type,
      employment_type,

      permission_package_id,

      shift_start,
      shift_end,

      break_minutes,
      grace_minutes,

      weekends,
      attendance_methods,

      auto_approve,
      is_active,

      remarks,
      component_package
    } = req.body;


    code = code?.trim()?.toUpperCase();
    name = name?.trim();
    designation = designation?.trim()?.toLowerCase() || null;
    salary_type = salary_type?.trim()?.toLowerCase() || null;
    employment_type = employment_type?.trim()?.toLowerCase() || null;
    remarks = remarks?.trim() || null;
    auto_approve = auto_approve ? 1 : 0;

    is_active = is_active === undefined ? 1 : (is_active ? 1 : 0);

    if (!code || !name) {
      return sendError(
        res,
        400,
        "code and name are required"
      );
    }

    const validations = [];

    if (designation) { validations.push({ field: "designation", value: designation, validator: designationVali }); }

    if (salary_type) { validations.push({ field: "salary_type", value: salary_type, validator: salaryValidation }); }

    if (employment_type) { validations.push({ field: "employment_type", value: employment_type, validator: employmentValidation }); }

    const errors = validateFields(validations);

    if (errors.length) { return sendError(res, 422, errors[0].message); }

    const isValidHHMM = (value) => {
      return /^([[0-1]\d|2[[0-3]):([[0-5]\d)$/.test(value);
    };

    const isValidHHMMSS = (value) => {
      return /^([[0-1]\d|2[[0-3]):([[0-5]\d):([[0-5]\d)$/.test(value);
    };

    const convertHHMMToMinutes = (value) => {
      const [hours, minutes] =
        value.split(":").map(Number);

      return (hours * 60) + minutes;
    };


    if (shift_start && !isValidHHMMSS(shift_start)) {
      throw {
        status: 400,
        message: "shift_start must be HH:mm:ss"
      };
    }

    if (shift_end && !isValidHHMMSS(shift_end)) {
      throw {
        status: 400,
        message: "shift_end must be HH:mm:ss"
      };
    }

    if (shift_start && shift_end && shift_start === shift_end) {
      throw {
        status: 400,
        message:
          "shift_start and shift_end cannot be same"
      };
    }

    if (break_minutes !== undefined) {

      if (typeof break_minutes !== "string" || !isValidHHMM(break_minutes)) {
        throw {
          status: 400,
          message:
            "break_minutes must be HH:mm"
        };
      }

      break_minutes = convertHHMMToMinutes(break_minutes);
    } else {
      break_minutes = null;
    }

    if (grace_minutes !== undefined) {

      if (typeof grace_minutes !== "string" || !isValidHHMM(grace_minutes)) {
        throw {
          status: 400,
          message:
            "grace_minutes must be HH:mm"
        };
      }

      grace_minutes = convertHHMMToMinutes(grace_minutes);
    } else {
      grace_minutes = null;
    }

    const [[company]] = await conn.query(
      `
      SELECT
        attendance_methods
      FROM companies
      WHERE id = ?
        AND is_deleted = 0
      LIMIT 1
      `,
      [company_id]
    );

    if (!company) {
      throw {
        status: 404,
        message: "Company not found"
      };
    }

    const allowedAttendanceMethods = [
      "manual",
      "ip",
      "gps",
      "qr",
      "face"
    ];

    const companyAttendanceMethods = company.attendance_methods ? JSON.parse(company.attendance_methods) : [];

    if (attendance_methods === undefined) {
      attendance_methods = companyAttendanceMethods;
    }

    if (!Array.isArray(attendance_methods)) {
      throw {
        status: 400,
        message:
          "attendance_methods must be an array"
      };
    }

    const cleanedMethods = [];
    const uniqueMethods = new Set();

    for (let i = 0; i < attendance_methods.length; i++) {

      const method = attendance_methods[i];

      if (!method || typeof method !== "string") {
        throw {
          status: 400,
          message:
            `Invalid attendance method at index ${i}`
        };
      }

      const normalizedMethod = method.trim().toLowerCase();

      if (!allowedAttendanceMethods.includes(normalizedMethod)) {
        throw {
          status: 400,
          message:
            `Unsupported attendance method: ${normalizedMethod}`
        };
      }

      if (!companyAttendanceMethods.includes(normalizedMethod)) {
        throw {
          status: 400,
          message:
            `Attendance method not enabled in company: ${normalizedMethod}`
        };
      }

      if (uniqueMethods.has(normalizedMethod)) {
        continue;
      }

      uniqueMethods.add(normalizedMethod);
      cleanedMethods.push(normalizedMethod);
    }

    attendance_methods = JSON.stringify(cleanedMethods);

    const [existingPackage] =
      await conn.query(
        `
        SELECT id
        FROM invite_packages
        WHERE company_id = ?
          AND code = ?
          AND is_deleted = 0
        LIMIT 1
        FOR UPDATE
        `,
        [
          company_id,
          code
        ]
      );

    if (existingPackage.length) {
      throw {
        status: 409,
        message:
          "Invite package code already exists"
      };
    }

    if (permission_package_id) {

      const [[permissionPackage]] =
        await conn.query(
          `
          SELECT id
          FROM permission_packages
          WHERE id = ?
            AND company_id = ?
            AND is_deleted = 0
            AND is_active = 1
          LIMIT 1
          `,
          [
            permission_package_id,
            company_id
          ]
        );

      if (!permissionPackage) {
        throw {
          status: 400,
          message:
            "Invalid permission_package_id"
        };
      }
    }

    if (component_package !== undefined && component_package !== null && component_package !== "") {
      const [[salaryPackage]] = await conn.query(
        `
        SELECT id
        FROM salary_component_packages
        WHERE id = ?
          AND company_id = ?
          AND is_deleted = 0
          AND is_active = 1
        LIMIT 1
        `,
        [component_package, company_id]
      );

      if (!salaryPackage) {
        throw {
          status: 400,
          message: "Invalid component_package ID"
        };
      }
      component_package = salaryPackage.id;
    } else {
      component_package = null;
    }

    const [insertResult] = await conn.query(
      `
      INSERT INTO invite_packages (
        company_id,
        code,
        name,

        designation,
        salary_type,
        employment_type,

        shift_start,
        shift_end,

        break_minutes,
        grace_minutes,

        permission_package_id,
        component_package,

        remarks,

        weekends,
        attendance_methods,

        auto_approve,
        is_active,

        created_by,
        updated_by
      )
      VALUES (
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?,
        ?, ?,
        ?, ?,
        ?, ?
      )
      `,
      [
        company_id,
        code,
        name,

        designation,
        salary_type,
        employment_type,

        shift_start || null,
        shift_end || null,

        break_minutes,
        grace_minutes,

        permission_package_id || null,
        component_package,

        remarks,
        JSON.stringify(normalizeWeekends(weekends || [])),
        attendance_methods,

        auto_approve,
        is_active,

        user_id || null,
        user_id || null
      ]
    );

    await conn.commit();

    return sendSuccess(
      res,
      201,
      "Invite package created successfully"
    );

  } catch (err) {

    if (conn) {
      await conn.rollback();
    }

    console.error(
      "Create Invite Package Error:",
      err
    );

    return sendError(
      res,
      err.status || 500,
      err.message || "Internal server error"
    );

  } finally {

    if (conn) {
      conn.release();
    }
  }
});

router.put("/package-update", auth(INV_PKG.MNG), async (req, res) => {
  let conn;

  try {

    conn = await db.getConnection();
    await conn.beginTransaction();

    const company_id = req.company?.id;
    const user_id = req.user?.id;

    if (!company_id) {
      return sendError(
        res,
        400,
        "Company missing"
      );
    }

    let {
      package_id,

      name,

      designation,
      salary_type,
      employment_type,

      permission_package_id,

      shift_start,
      shift_end,

      break_minutes,
      grace_minutes,

      weekends,
      attendance_methods,

      auto_approve,
      is_active,

      remarks,

      component_package
    } = req.body;

    if (!package_id) {
      return sendError(
        res,
        400,
        "package_id is required"
      );
    }

    const [[existingPackage]] = await conn.query(
      `
      SELECT
        id,
        code,
        company_id,
        is_active,
        is_deleted
      FROM invite_packages
      WHERE id = ?
        AND company_id = ?
        AND is_deleted = 0
      LIMIT 1
      FOR UPDATE
      `,
      [
        package_id,
        company_id
      ]
    );

    if (!existingPackage) {
      throw {
        status: 404,
        message: "Invite package not found"
      };
    }

    if (name !== undefined) {
      name = name?.trim();

      if (!name) {
        throw {
          status: 400,
          message: "name cannot be empty"
        };
      }
    }

    if (designation !== undefined) {
      designation =
        designation?.trim()?.toLowerCase() || null;
    }

    if (salary_type !== undefined) {
      salary_type =
        salary_type?.trim()?.toLowerCase() || null;
    }

    if (employment_type !== undefined) {
      employment_type =
        employment_type?.trim()?.toLowerCase() || null;
    }

    if (remarks !== undefined) {
      remarks = remarks?.trim() || null;
    }

    if (auto_approve !== undefined) {
      auto_approve = auto_approve ? 1 : 0;
    }

    if (is_active !== undefined) {
      is_active = is_active ? 1 : 0;
    }

    const validations = [];

    if (
      designation !== undefined &&
      designation !== null
    ) {
      validations.push({
        field: "designation",
        value: designation,
        validator: designationValidation
      });
    }

    if (
      salary_type !== undefined &&
      salary_type !== null
    ) {
      validations.push({
        field: "salary_type",
        value: salary_type,
        validator: salaryValidation
      });
    }

    if (
      employment_type !== undefined &&
      employment_type !== null
    ) {
      validations.push({
        field: "employment_type",
        value: employment_type,
        validator: employmentValidation
      });
    }

    const errors = validateFields(validations);

    if (errors.length) {
      return sendError(
        res,
        422,
        errors[0].message
      );
    }

    const isValidHHMM = (value) => {
      return /^([[0-1]\d|2[[0-3]):([[0-5]\d)$/.test(value);
    };

    const isValidHHMMSS = (value) => {
      return /^([[0-1]\d|2[[0-3]):([[0-5]\d):([[0-5]\d)$/.test(value);
    };

    const convertHHMMToMinutes = (value) => {
      const [hours, minutes] =
        value.split(":").map(Number);

      return (hours * 60) + minutes;
    };

    let parsedBreakMinutes;
    let parsedGraceMinutes;

    if (shift_start !== undefined) {

      if (
        shift_start !== null &&
        shift_start !== ""
      ) {

        if (
          typeof shift_start !== "string" ||
          !isValidHHMMSS(shift_start)
        ) {
          throw {
            status: 400,
            message:
              "shift_start must be HH:mm:ss"
          };
        }

      } else {
        shift_start = null;
      }
    }

    if (shift_end !== undefined) {

      if (
        shift_end !== null &&
        shift_end !== ""
      ) {

        if (
          typeof shift_end !== "string" ||
          !isValidHHMMSS(shift_end)
        ) {
          throw {
            status: 400,
            message:
              "shift_end must be HH:mm:ss"
          };
        }

      } else {
        shift_end = null;
      }
    }

    if (
      shift_start &&
      shift_end &&
      shift_start === shift_end
    ) {
      throw {
        status: 400,
        message:
          "shift_start and shift_end cannot be same"
      };
    }

    if (break_minutes !== undefined) {

      if (
        break_minutes !== null &&
        break_minutes !== ""
      ) {

        if (
          typeof break_minutes !== "string" ||
          !isValidHHMM(break_minutes)
        ) {
          throw {
            status: 400,
            message:
              "break_minutes must be HH:mm"
          };
        }

        parsedBreakMinutes =
          convertHHMMToMinutes(
            break_minutes
          );

      } else {
        parsedBreakMinutes = null;
      }
    }

    if (grace_minutes !== undefined) {

      if (
        grace_minutes !== null &&
        grace_minutes !== ""
      ) {

        if (
          typeof grace_minutes !== "string" ||
          !isValidHHMM(grace_minutes)
        ) {
          throw {
            status: 400,
            message:
              "grace_minutes must be HH:mm"
          };
        }

        parsedGraceMinutes =
          convertHHMMToMinutes(
            grace_minutes
          );

      } else {
        parsedGraceMinutes = null;
      }
    }

    if (component_package !== undefined) {
      if (component_package !== null && component_package !== "") {
        const [[salaryPackage]] = await conn.query(
          `
          SELECT id
          FROM salary_component_packages
          WHERE id = ?
            AND company_id = ?
            AND is_deleted = 0
            AND is_active = 1
          LIMIT 1
          `,
          [component_package, company_id]
        );

        if (!salaryPackage) {
          throw {
            status: 400,
            message: "Invalid component_package ID"
          };
        }
        component_package = salaryPackage.id;
      } else {
        component_package = null;
      }
    }

    const [[company]] = await conn.query(
      `
      SELECT
        attendance_methods
      FROM companies
      WHERE id = ?
        AND is_deleted = 0
      LIMIT 1
      `,
      [company_id]
    );

    if (!company) {
      throw {
        status: 404,
        message: "Company not found"
      };
    }

    const allowedAttendanceMethods = [
      "manual",
      "ip",
      "gps",
      "qr",
      "face"
    ];

    const companyAttendanceMethods =
      company.attendance_methods
        ? JSON.parse(company.attendance_methods)
        : [];

    if (attendance_methods !== undefined) {

      if (!Array.isArray(attendance_methods)) {
        throw {
          status: 400,
          message:
            "attendance_methods must be an array"
        };
      }

      const cleanedMethods = [];
      const uniqueMethods = new Set();

      for (let i = 0; i < attendance_methods.length; i++) {

        const method =
          attendance_methods[i];

        if (
          !method ||
          typeof method !== "string"
        ) {
          throw {
            status: 400,
            message:
              `Invalid attendance method at index ${i}`
          };
        }

        const normalizedMethod =
          method.trim().toLowerCase();

        if (
          !allowedAttendanceMethods.includes(
            normalizedMethod
          )
        ) {
          throw {
            status: 400,
            message:
              `Unsupported attendance method: ${normalizedMethod}`
          };
        }

        if (
          !companyAttendanceMethods.includes(
            normalizedMethod
          )
        ) {
          throw {
            status: 400,
            message:
              `Attendance method not allowed: ${normalizedMethod}`
          };
        }

        if (uniqueMethods.has(normalizedMethod)) {
          continue;
        }

        uniqueMethods.add(normalizedMethod);

        cleanedMethods.push(normalizedMethod);
      }

      attendance_methods =
        JSON.stringify(cleanedMethods);
    }

    if (permission_package_id !== undefined) {

      if (
        permission_package_id !== null &&
        permission_package_id !== ""
      ) {

        const [[permissionPackage]] =
          await conn.query(
            `
            SELECT
              id
            FROM permission_packages
            WHERE id = ?
              AND company_id = ?
              AND is_deleted = 0
              AND is_active = 1
            LIMIT 1
            `,
            [
              permission_package_id,
              company_id
            ]
          );

        if (!permissionPackage) {
          throw {
            status: 400,
            message:
              "Invalid permission_package_id"
          };
        }

      } else {
        permission_package_id = null;
      }
    }

    const fields = [];
    const values = [];

    const pushField = (field, value) => {
      fields.push(`${field} = ?`);
      values.push(value);
    };

    if (name !== undefined) {
      pushField("name", name);
    }

    if (designation !== undefined) {
      pushField("designation", designation);
    }

    if (salary_type !== undefined) {
      pushField("salary_type", salary_type);
    }

    if (employment_type !== undefined) {
      pushField(
        "employment_type",
        employment_type
      );
    }

    if (shift_start !== undefined) {
      pushField(
        "shift_start",
        shift_start
      );
    }

    if (shift_end !== undefined) {
      pushField(
        "shift_end",
        shift_end
      );
    }

    if (break_minutes !== undefined) {
      pushField(
        "break_minutes",
        parsedBreakMinutes
      );
    }

    if (grace_minutes !== undefined) {
      pushField(
        "grace_minutes",
        parsedGraceMinutes
      );
    }

    if (permission_package_id !== undefined) {
      pushField(
        "permission_package_id",
        permission_package_id
      );
    }

    if (weekends !== undefined) {
      pushField(
        "weekends",
        JSON.stringify(normalizeWeekends(weekends || []))
      );
    }

    if (attendance_methods !== undefined) {
      pushField(
        "attendance_methods",
        attendance_methods
      );
    }

    if (auto_approve !== undefined) {
      pushField(
        "auto_approve",
        auto_approve
      );
    }

    if (is_active !== undefined) {
      pushField(
        "is_active",
        is_active
      );
    }

    if (remarks !== undefined) {
      pushField(
        "remarks",
        remarks
      );
    }

    if (component_package !== undefined) {
      pushField(
        "component_package",
        component_package
      );
    }

    pushField(
      "updated_by",
      user_id || null
    );

    if (fields.length <= 1) {
      throw {
        status: 400,
        message: "No fields to update"
      };
    }

    if (fields.length > 1) {
      await conn.query(
        `
        UPDATE invite_packages
        SET
          ${fields.join(", ")}
        WHERE id = ?
          AND company_id = ?
          AND is_deleted = 0
        `,
        [
          ...values,
          package_id,
          company_id
        ]
      );
    }

    await conn.commit();

    return sendSuccess(
      res,
      200,
      "Invite package updated successfully"
    );

  } catch (err) {

    if (conn) {
      await conn.rollback();
    }

    console.error(
      "Update Invite Package Error:",
      err
    );

    return sendError(
      res,
      err.status || 500,
      err.message || "Internal server error"
    );

  } finally {

    if (conn) {
      conn.release();
    }
  }
});

router.get("/package-list", auth(INV_PKG.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const company_id = req.company?.id;

    if (!company_id) {
      return sendError(
        res,
        400,
        "Company missing"
      );
    }


    let {
      page = 1,
      limit = 10,
      search = "",
      is_active
    } = req.query;

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


    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) as total FROM invite_packages ip ${where}`,
      params
    );


    const [packages] = await conn.query(
      `
      SELECT 
        ip.*,
        pp.package_name AS permission_package_name
      FROM invite_packages ip
      LEFT JOIN permission_packages pp 
        ON pp.id = ip.permission_package_id
      ${where}
      ORDER BY ip.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    const packageIds = packages.map(p => p.id);
    const permissionPackageIds = packages
      .map(p => p.permission_package_id)
      .filter(Boolean);


    const permissionsMap = new Map();

    if (permissionPackageIds.length > 0) {
      const [permRows] = await conn.query(
        `
        SELECT 
          ppi.package_id,
          p.id,
          p.action,
          p.code,
          p.name
        FROM permission_package_items ppi
        JOIN permissions p ON p.id = ppi.permission_id
        WHERE ppi.package_id IN (?)
          AND ppi.is_deleted = 0
          AND ppi.is_active = 1
        `,
        [permissionPackageIds]
      );

      for (const row of permRows) {
        if (!permissionsMap.has(row.package_id)) {
          permissionsMap.set(row.package_id, []);
        }

        permissionsMap.get(row.package_id).push({
          id: row.id,
          action: row.action,
          code: row.code,
          name: row.name
        });
      }
    }

    const salaryComponentsMap = new Map();

    const componentPackageIds = packages
      .map(p => p.component_package)
      .filter(Boolean);

    if (componentPackageIds.length > 0) {
      const [salaryRows] = await conn.query(
        `
        SELECT 
          scpi.id,
          scpi.package_id AS component_package_id,
          scpi.component_id,
          scpi.is_active,
          sc.name AS component_name,
          sc.code AS component_code,
          sc.type AS component_type,
          sc.calc_type,
          sc.calc_value
        FROM salary_component_package_items scpi
        JOIN salary_components sc ON sc.id = scpi.component_id
        WHERE scpi.package_id IN (?)
          AND scpi.is_deleted = 0
          AND scpi.is_active = 1
          AND sc.is_deleted = 0
          AND sc.is_active = 1
        `,
        [componentPackageIds]
      );

      for (const sRow of salaryRows) {
        if (!salaryComponentsMap.has(sRow.component_package_id)) {
          salaryComponentsMap.set(sRow.component_package_id, []);
        }
        salaryComponentsMap.get(sRow.component_package_id).push({
          id: sRow.id,
          component_id: sRow.component_id,
          component_name: sRow.component_name,
          component_code: sRow.component_code,
          component_type: sRow.component_type,
          calc_type: sRow.calc_type,
          calc_value: parseFloat(sRow.calc_value),
          is_active: Boolean(sRow.is_active)
        });
      }
    }


    const data = packages.map(pkg => ({
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

      auto_approve: toBoolean(pkg.auto_approve),
      is_active: toBoolean(pkg.is_active),


      weekends: parseJSONSafe(pkg.weekends, []),

      attendance_methods: parseJSONSafe(pkg.attendance_methods, []),

      permissions: permissionsMap.get(pkg.permission_package_id) || [],

      component_package: pkg.component_package,
      remarks: pkg.remarks,
      salary_components: salaryComponentsMap.get(pkg.component_package) || []
    }));

    const meta = buildMeta(page, limit, total, data.length)

    return sendSuccess(
      res,
      200,
      "Invite package list fetched successfully",
      data,
      meta
    );

  } catch (err) {
    console.error("Package List Error:", err);

    return sendError(
      res,
      500,
      "Internal server error"
    );

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

    if (!company_id) {
      return sendError(
        res,
        400,
        "Company missing"
      );
    }

    const { package_id } = req.body;

    if (!package_id) {
      return sendError(
        res,
        400,
        "package_id is required"
      );
    }


    const [[pkg]] = await conn.query(
      `
      SELECT id, is_deleted 
      FROM invite_packages
      WHERE id = ? 
        AND company_id = ?
      LIMIT 1 FOR UPDATE
      `,
      [package_id, company_id]
    );

    if (!pkg) {
      return sendError(
        res,
        404,
        "Invite package not found"
      );
    }

    if (pkg.is_deleted) {
      return sendError(
        res,
        400,
        "Package already deleted"
      );
    }


    const [[{ total }]] = await conn.query(
      `
      SELECT COUNT(*) as total
      FROM employees
      WHERE permission_package_id = ?
        AND company_id = ?
        AND is_deleted = 0
      `,
      [package_id, company_id]
    );

    if (total > 0) {
      return sendError(
        res,
        400,
        "Cannot delete package: assigned to employees"
      );
    }


    await conn.query(
      `
      UPDATE invite_packages
      SET is_deleted = 1,
          deleted_at = NOW(),
          deleted_by = ?
      WHERE id = ?
      `,
      [user_id || null, package_id]
    );

    await conn.commit();

    return sendSuccess(
      res,
      200,
      "Invite package deleted successfully"
    );

  } catch (err) {
    if (conn) await conn.rollback();

    console.error("Delete Invite Package Error:", err);

    return sendError(
      res,
      err.status || 500,
      err.message || "Internal server error"
    );

  } finally {
    if (conn) conn.release();
  }
});

router.post("/send", auth(INV.MNG), async (req, res) => {
  let conn;

  const rollback = async () => {
    if (conn) {
      await conn.rollback();
    }
  };

  const validationError = async (
    errors = {},
    message = "Please check the submitted information."
  ) => {

    await rollback();

    return res.status(422).json({
      success: false,
      message,
      errors
    });
  };

  try {

    conn = await db.getConnection();

    await conn.beginTransaction();

    let {
      user_id,
      permission_package_id,
      employment_type,
      salary_type,
      designation,
      attendance_methods,
      auto_approve,
      shift_start,
      shift_end,
      break_minutes,
      grace_minutes,
      weekends = [],
      base_amount,
      effective_from,
      effective_to,
      components
    } = req.body || {};

    const invitedBy = req.user?.id;

    const company_id = req.company?.id;

    const errors = {};

    user_id = Number(user_id);

    permission_package_id = Number(permission_package_id);

    if (!company_id) {
      errors.company = "Company information is missing.";
    }

    if (!user_id || !Number.isInteger(user_id)) {
      errors.user = "Please select a valid employee.";
    }

    if (
      !permission_package_id ||
      !Number.isInteger(permission_package_id)
    ) {
      errors.permission_package =
        "Please select a valid permission package.";
    }

    if (
      !Array.isArray(attendance_methods) ||
      attendance_methods.length === 0
    ) {
      errors.attendance_methods =
        "Please select at least one attendance method.";
    }

    if (
      shift_start &&
      shift_end &&
      shift_start >= shift_end
    ) {
      errors.shift =
        "Shift end time must be later than shift start time.";
    }

    if (!Array.isArray(weekends)) {
      errors.weekends =
        "Weekend days must be provided in array format.";
    }

    if (base_amount !== undefined && base_amount !== null && base_amount !== "") {
      const parsedBase = parseFloat(base_amount);
      if (isNaN(parsedBase) || parsedBase < 0) {
        errors.base_amount = "Base amount must be a valid non-negative number.";
      } else {
        base_amount = parsedBase;
      }
    } else {
      base_amount = null;
    }

    if (effective_from) {
      if (isNaN(Date.parse(effective_from))) {
        errors.effective_from = "Invalid effective_from date format.";
      }
    } else {
      effective_from = null;
    }

    if (effective_to) {
      if (isNaN(Date.parse(effective_to))) {
        errors.effective_to = "Invalid effective_to date format.";
      }
    } else {
      effective_to = null;
    }

    if (components !== undefined && components !== null) {
      if (!Array.isArray(components)) {
        errors.components = "Salary components must be provided in array format.";
      } else {
        components.forEach((comp, idx) => {
          if (!comp.component_id || !Number.isInteger(Number(comp.component_id))) {
            errors[`components_${idx}_component_id`] = "Component ID must be a valid integer.";
          }
          if (!comp.calc_type || typeof comp.calc_type !== "string" || !comp.calc_type.trim()) {
            errors[`components_${idx}_calc_type`] = "Calculation type is required.";
          }
          if (comp.calc_value === undefined || isNaN(parseFloat(comp.calc_value))) {
            errors[`components_${idx}_calc_value`] = "Calculation value must be a valid number.";
          }
        });
      }
    }

    if (Object.keys(errors).length > 0) {

      return validationError(
        errors,
        "Please fill all required information correctly."
      );
    }

    const parseMinutes = (val, field) => {

      if (!val) return null;

      if (typeof val !== "string") {
        throw new Error(`${field} must be in HH:mm format`);
      }

      const [h, m] = val.split(":");

      const hours = parseInt(h, 10);

      const minutes = parseInt(m, 10);

      if (
        isNaN(hours) ||
        isNaN(minutes) ||
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
      ) {
        throw new Error(`Invalid ${field}`);
      }

      return (hours * 60) + minutes;
    };

    let breakMinutes = null;

    let graceMinutes = null;

    try {

      breakMinutes = parseMinutes(
        break_minutes,
        "break time"
      );

      graceMinutes = parseMinutes(
        grace_minutes,
        "grace time"
      );

    } catch (e) {

      return validationError(
        {
          time: e.message
        },
        "Invalid time format provided."
      );
    }

    const isAuto = auto_approve === true ? 1 : 0;

    const [[company]] = await conn.query(
      `
      SELECT
        id,
        name,
        attendance_methods
      FROM companies
      WHERE id = ?
      AND is_deleted = 0
      AND is_active = 1
      `,
      [company_id]
    );

    if (!company) {

      return validationError(
        {
          company:
            "Company not found or currently unavailable."
        },
        "Unable to process invitation."
      );
    }

    const companyMethods = parseJSONSafe(
      company.attendance_methods,
      []
    );

    const allowedMethods = new Set(
      (Array.isArray(companyMethods)
        ? companyMethods
        : []
      )
        .map(m => (
          typeof m === "string"
            ? m
            : m?.method
        ))
        .filter(Boolean)
    );

    const cleanedAttendance = [];

    const methodSet = new Set();

    for (const m of attendance_methods) {

      const method = (
        typeof m === "string"
          ? m
          : m?.method
      );

      if (
        !method ||
        !allowedMethods.has(method)
      ) {

        return validationError(
          {
            attendance_methods:
              "One or more selected attendance methods are not allowed."
          },
          "Invalid attendance method selected."
        );
      }

      if (!methodSet.has(method)) {

        methodSet.add(method);

        cleanedAttendance.push(method);
      }
    }

    const [[user]] = await conn.query(
      `
      SELECT
        id,
        name,
        email,
        is_active
      FROM users
      WHERE id = ?
      AND is_deleted = 0
      `,
      [user_id]
    );

    if (!user || !user.is_active) {

      return validationError(
        {
          user:
            "Selected employee account is unavailable."
        },
        "Unable to send invitation."
      );
    }

    const [[employee]] = await conn.query(
      `
      SELECT id
      FROM employees
      WHERE company_id = ?
      AND user_id = ?
      AND is_deleted = 0
      `,
      [company_id, user_id]
    );

    if (employee) {

      return validationError(
        {
          user:
            "This user is already working in your company."
        },
        "Employee already exists."
      );
    }

    const [[existingInvite]] = await conn.query(
      `
      SELECT id
      FROM company_invites
      WHERE company_id = ?
      AND user_id = ?
      AND status = 'pending'
      AND is_active = 1
      AND is_deleted = 0
      AND expires_at > NOW()
      LIMIT 1
      `,
      [company_id, user_id]
    );

    if (existingInvite) {

      return validationError(
        {
          invite:
            "An active invitation has already been sent to this user."
        },
        "Invitation already pending."
      );
    }

    const [[pkg]] = await conn.query(
      `
      SELECT id
      FROM permission_packages
      WHERE id = ?
      AND company_id = ?
      AND is_active = 1
      AND is_deleted = 0
      `,
      [permission_package_id, company_id]
    );

    if (!pkg) {

      return validationError(
        {
          permission_package:
            "Selected permission package is unavailable."
        },
        "Invalid permission package selected."
      );
    }

    let inviteToken;

    let exists = true;

    while (exists) {

      inviteToken = generateRandomToken({
        size: 32
      });

      const [[row]] = await conn.query(
        `
        SELECT id
        FROM company_invites
        WHERE invite_token = ?
        `,
        [inviteToken]
      );

      if (!row) {
        exists = false;
      }
    }

    const expiresAt = new Date(
      Date.now() + (
        7 * 24 * 60 * 60 * 1000
      )
    );

    const [inviteResult] = await conn.query(
      `
      INSERT INTO company_invites
      (
        company_id,
        user_id,
        invited_by,
        invite_token,

        permission_package_id,
        employment_type,
        designation,
        salary_type,

        shift_start,
        shift_end,
        break_minutes,
        grace_minutes,

        weekends,
        attendance_methods,
        auto_approve,
        base_amount,
        effective_from,
        effective_to,
        status,
        is_active,

        expires_at,
        created_by,
        updated_by
      )
      VALUES
      (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, 'pending', 1,
        ?, ?, ?
      )
      `,
      [
        company_id,
        user_id,
        invitedBy,
        inviteToken,

        permission_package_id,
        employment_type,
        designation,
        salary_type,

        shift_start || null,
        shift_end || null,

        breakMinutes,
        graceMinutes,

        JSON.stringify(normalizeWeekends(weekends || [])),
        JSON.stringify(cleanedAttendance),
        isAuto,
        base_amount,
        effective_from,
        effective_to,

        expiresAt,
        invitedBy,
        invitedBy
      ]
    );

    const inviteId = inviteResult.insertId;

    if (components && components.length) {
      const compValues = components.map(comp => [
        inviteId,
        comp.component_id,
        comp.calc_type.trim(),
        parseFloat(comp.calc_value),
        comp.remark ? comp.remark.trim() : null,
        1
      ]);

      await conn.query(
        `
        INSERT INTO invite_salary_components
        (
          invite_id,
          component_id,
          calc_type,
          calc_value,
          remark,
          is_active
        )
        VALUES ?
        `,
        [compValues]
      );
    }

    await conn.commit();

    try {

      const appUrl = process.env.FRONTEND_URL || "https://oneattendanceclient.vercel.app";

      const acceptUrl = `${appUrl}/accept-invite?token=${inviteToken}`;

      await queueCompanyInvitationEmail({

        to: user.email,

        subject:
          `Invitation to join ${company.name}`,

        fromEmail: process.env.EMAIL_USER,

        fromName:
          company.name || "OneAttendance",

        replyTo: req.user?.email,

        appUrl,
        acceptUrl,

        inviteToken,

        invitedUser: {
          id: user.id,
          name: user.name,
          email: user.email
        },

        invitedBy: {
          id: req.user?.id,
          name: req.user?.name,
          email: req.user?.email
        },

        company: {
          id: company.id,
          name: company.name
        },

        invite: {

          employment_type:
            getEnumObject(
              EMPLOYMENT_TYPES,
              employment_type
            ).label,

          designation:
            getEnumObject(
              DESIGNATIONS,
              designation
            ).label,

          salary_type:
            getEnumObject(
              SALARY_TYPES,
              salary_type
            ).label,

          shift_start,
          shift_end,

          break_minutes: breakMinutes,

          grace_minutes: graceMinutes,

          weekends: normalizeWeekends(weekends || []),

          expires_at: expiresAt
        },

        attendanceMethods: cleanedAttendance.map(m => ({
          method: m,
          is_auto: isAuto
        })),

        maxAttempts: 3
      });

    } catch (emailError) {

      console.error(
        "Invitation Email Queue Error:",
        emailError
      );
    }

    return sendSuccess(
      res,
      201,
      "Invitation sent successfully."
    );

  } catch (err) {

    await rollback();

    console.error(
      "Invite Error:",
      err
    );

    return sendError(
      res,
      500,
      "Something went wrong while sending the invitation. Please try again later."
    );

  } finally {

    if (conn) {
      conn.release();
    }
  }
});

router.post("/resend", auth(INV.MNG), async (req, res) => {
  let conn;

  const rollback = async () => {
    if (conn) await conn.rollback();
  };

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const { invite_id } = req.body || {};

    const company_id = req.company?.id;
    const requestedBy = req.user?.id;

    const parsedInviteId = Number(invite_id);


    if (!company_id || !requestedBy || !parsedInviteId) {

      await rollback();

      return sendError(
        res,
        400,
        "invite_id is required"
      );
    }

    if (!Number.isInteger(parsedInviteId)) {

      await rollback();

      return sendError(
        res,
        400,
        "Invalid invite_id"
      );
    }


    const [[invite]] = await conn.query(
      `SELECT *
       FROM company_invites
       WHERE id = ?
       AND company_id = ?
       AND is_deleted = 0
       LIMIT 1`,
      [
        parsedInviteId,
        company_id
      ]
    );

    if (!invite) {

      await rollback();

      return sendError(
        res,
        404,
        "Invite not found"
      );
    }


    if (invite.status !== "pending") {

      await rollback();

      return sendError(
        res,
        400,
        `Cannot resend invite with status: ${invite.status}`
      );
    }

    if (
      invite.expires_at &&
      new Date(invite.expires_at) < new Date()
    ) {

      await rollback();

      return sendError(
        res,
        400,
        "Invite already expired"
      );
    }


    const [[user]] = await conn.query(
      `SELECT id, name, email, is_active
       FROM users
       WHERE id = ?
       AND is_deleted = 0`,
      [invite.user_id]
    );

    if (!user || !user.is_active) {

      await rollback();

      return sendError(
        res,
        404,
        "User not found or inactive"
      );
    }


    const [[company]] = await conn.query(
      `SELECT id, name
       FROM companies
       WHERE id = ?
       AND is_deleted = 0
       AND is_active = 1`,
      [company_id]
    );

    if (!company) {

      await rollback();

      return sendError(
        res,
        404,
        "Company not found"
      );
    }


    const methods = invite.attendance_methods ? JSON.parse(invite.attendance_methods) : [];

    const cleanedAttendance = methods.map(method => {
      const name = typeof method === "string" ? method : (method?.method || "");
      const isAuto = typeof method === "string" ? (invite.auto_approve || 0) : (method?.is_auto || invite.auto_approve || 0);
      return {
        method: name,
        is_auto: isAuto
      };
    }).filter(m => m.method);

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

        invitedUser: {
          id: user.id,
          name: user.name,
          email: user.email
        },

        invitedBy: {
          id: req.user?.id,
          name: req.user?.name,
          email: req.user?.email
        },

        company: {
          id: company.id,
          name: company.name
        },

        invite: {
          employment_type: getEnumObject(EMPLOYMENT_TYPES, invite.employment_type),
          designation: getEnumObject(DESIGNATIONS, invite.designation),
          salary_type: getEnumObject(SALARY_TYPES, invite.salary_type),

          shift_start: invite.shift_start,
          shift_end: invite.shift_end,

          break_minutes: invite.break_minutes,
          grace_minutes: invite.grace_minutes,

          weekends: parseJSONSafe(
            invite.weekends,
            []
          ),

          expires_at: invite.expires_at
        },

        attendanceMethods: cleanedAttendance,

        maxAttempts: 3
      });

    } catch (emailError) {

      console.error(
        "Resend Invitation Email Queue Error:",
        emailError
      );


    }


    return sendSuccess(
      res,
      200,
      "Invitation resent successfully",
      {
        invite_id: invite.id,
        email: user.email,
        status: invite.status,
        expires_at: invite.expires_at
      }
    );

  } catch (err) {

    if (conn) {
      await conn.rollback();
    }

    console.error(
      "Resend Invite Error:",
      err
    );

    return sendError(
      res,
      500,
      err.message || "Internal server error"
    );

  } finally {

    if (conn) {
      conn.release();
    }
  }
});

router.post("/accept", auth(), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    const { token } = req.body;
    const userId = req.user?.id;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Invite token is required"
      });
    }

    await conn.beginTransaction();


    const [[invite]] = await conn.query(
      `
      SELECT id, company_id, permission_package_id,
             designation, salary_type, employment_type,
             shift_start, shift_end, break_minutes, grace_minutes, weekends,
             attendance_methods, auto_approve, base_amount, effective_from, effective_to
      FROM company_invites
      WHERE invite_token = ?
        AND user_id = ?
        AND status = 'pending'
        AND is_active = 1
        AND is_deleted = 0
        AND (expires_at IS NULL OR expires_at > NOW())
      FOR UPDATE
      `,
      [token, userId]
    );

    if (!invite) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid or expired invite"
      });
    }

    const {
      id: inviteId,
      company_id: companyId,
      permission_package_id: packageId,
      designation,
      salary_type: salaryType,
      employment_type: employmentType,
      shift_start,
      shift_end,
      break_minutes: break_minutes,
      grace_minutes: grace_minutes,
      weekends
    } = invite;


    let expectedWorkMinutes = 0;

    let breakMinutes = break_minutes;
    let graceMinutes = grace_minutes;

    if (shift_start && shift_end) {
      const start = new Date(`1970-01-01T${shift_start}`);
      const end = new Date(`1970-01-01T${shift_end}`);

      if (end > start) {
        expectedWorkMinutes = Math.floor((end - start) / 60000);
      }
    }


    const inviteAttendance = invite.attendance_methods ? JSON.parse(invite.attendance_methods) : [];


    const [[existingEmployee]] = await conn.query(
      `SELECT id, employee_code
       FROM employees
       WHERE company_id=? AND user_id=? AND is_deleted=0
       FOR UPDATE`,
      [companyId, userId]
    );

    let employeeId;
    let employeeCode;


    if (existingEmployee) {
      employeeId = existingEmployee.id;
      employeeCode = existingEmployee.employee_code;

      await conn.query(
        `
        UPDATE employees SET
          designation=?,
          salary_type=?,
          employment_type=?,
          permission_package_id=?,
          weekends=?,
          shift_start=?,
          shift_end=?,
          break_minutes=?,
          grace_minutes=?,
          expected_work_minutes=?,
          status='active',
          is_active=1,
          is_deleted=0,
          updated_by=?,
          updated_at=NOW()
        WHERE id=?
        `,
        [
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
          userId,
          employeeId
        ]
      );
    } else {
      const random = generateRandomToken({ size: 1, encoding: "hex", uppercase: true });
      employeeCode = `EMP-${companyId}${random}`;

      const [result] = await conn.query(
        `
        INSERT INTO employees
        (
          company_id,
          user_id,
          permission_package_id,
          employee_code,
          designation,
          salary_type,
          employment_type,
          weekends,
          shift_start,
          shift_end,
          expected_work_minutes,
          break_minutes,
          grace_minutes,
          status,
          joining_date,
          created_by,
          updated_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?,?, ?, ?, ?, ?, 'active', CURDATE(), ?, ?)
        `,
        [
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
          userId,
          userId
        ]
      );

      employeeId = result.insertId;
    }


    if (!employeeId) {
      throw new Error("Employee insert failed");
    }

    if (invite.base_amount !== null && invite.base_amount !== undefined) {
      const [salaryResult] = await conn.query(
        `
        INSERT INTO salary_structures
        (
          company_id,
          employee_id,
          base_amount,
          effective_from,
          effective_to,
          is_active,
          created_by,
          updated_by
        )
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `,
        [
          companyId,
          employeeId,
          invite.base_amount,
          invite.effective_from || new Date().toISOString().split('T')[0],
          invite.effective_to,
          userId,
          userId
        ]
      );

      const salaryId = salaryResult.insertId;

      const [salaryComponents] = await conn.query(
        `
        SELECT component_id, calc_type, calc_value, remark
        FROM invite_salary_components
        WHERE invite_id = ?
          AND is_active = 1
        `,
        [inviteId]
      );

      if (salaryComponents.length) {
        const componentValues = salaryComponents.map(comp => [
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
          0
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
            created_by,
            updated_by,
            is_deleted
          )
          VALUES ?
          `,
          [componentValues]
        );
      }
    }


    await conn.query(
      `UPDATE employee_attendance_methods
       SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL
       WHERE employee_id = ? AND is_deleted = 1`,
      [employeeId]
    );


    if (inviteAttendance.length) {
      const values = inviteAttendance.map(m => {
        const method = typeof m === "string" ? m : (m?.method || "");
        const isAuto = typeof m === "string" ? (invite.auto_approve || 0) : (m?.is_auto || invite.auto_approve || 0);
        return [
          employeeId,
          method,
          Number(isAuto || 0),
          1,
          userId,
          userId,
          0
        ];
      }).filter(item => item[1]);

      await conn.query(
        `
        INSERT INTO employee_attendance_methods
        (employee_id, method, is_auto, is_active, created_by, updated_by, is_deleted)
        VALUES ?
        `,
        [values]
      );
    }


    await conn.query(
      `UPDATE company_invites
       SET status='accepted', is_active=0, updated_by=?, updated_at=NOW()
       WHERE id=?`,
      [userId, inviteId]
    );

    await conn.commit();

    return res.json({
      success: true,
      message: "Invitation accepted successfully"
    });

  } catch (error) {
    if (conn) await conn.rollback();

    console.error("Accept invite error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to accept invite"
    });

  } finally {
    if (conn) conn.release();
  }
});

router.post("/accept-invite", async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const token =
      req.query.token?.trim() ||
      req.body.token?.trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Invite token is required"
      });
    }

    await conn.beginTransaction();

    const [[invite]] = await conn.query(
      `
      SELECT
        ci.id,
        ci.company_id,
        ci.user_id,
        ci.permission_package_id,
        ci.designation,
        ci.salary_type,
        ci.employment_type,
        ci.shift_start,
        ci.shift_end,
        ci.break_minutes,
        ci.grace_minutes,
        ci.weekends,
        ci.status,
        ci.is_active,
        ci.expires_at,
        ci.attendance_methods,
        ci.auto_approve,
        ci.base_amount,
        ci.effective_from,
        ci.effective_to,

        u.name,
        u.email,
        u.phone

      FROM company_invites ci

      INNER JOIN users u
        ON u.id = ci.user_id
       AND u.is_deleted = 0

      WHERE ci.invite_token = ?
        AND ci.status = 'pending'
        AND ci.is_active = 1
        AND ci.is_deleted = 0
        AND (ci.expires_at IS NULL OR ci.expires_at > NOW())

      LIMIT 1
      FOR UPDATE
      `,
      [token]
    );


    if (!invite) {
      await conn.rollback();

      return res.status(400).json({
        success: false,
        message: "Invalid or expired invite"
      });
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
      weekends
    } = invite;

    let expectedWorkMinutes = 0;

    const breakMinutes = Number(break_minutes || 0);
    const graceMinutes = Number(grace_minutes || 0);

    if (shift_start && shift_end) {
      const start = new Date(`1970-01-01T${shift_start}`);
      const end = new Date(`1970-01-01T${shift_end}`);


      if (end <= start) {
        end.setDate(end.getDate() + 1);
      }

      expectedWorkMinutes = Math.floor(
        (end - start) / 60000
      );
    }

    const inviteAttendance = invite.attendance_methods ? JSON.parse(invite.attendance_methods) : [];

    const [[existingEmployee]] = await conn.query(
      `
      SELECT id, employee_code
      FROM employees
      WHERE company_id = ?
        AND user_id = ?
        AND is_deleted = 0
      LIMIT 1
      FOR UPDATE
      `,
      [companyId, userId]
    );

    let employeeId;
    let employeeCode;

    if (existingEmployee) {
      employeeId = existingEmployee.id;
      employeeCode = existingEmployee.employee_code;

      await conn.query(
        `
        UPDATE employees
        SET
          permission_package_id = ?,
          designation = ?,
          salary_type = ?,
          employment_type = ?,
          weekends = ?,
          shift_start = ?,
          shift_end = ?,
          expected_work_minutes = ?,
          break_minutes = ?,
          grace_minutes = ?,
          status = 'active',
          is_active = 1,
          is_deleted=0,
          updated_at = NOW(),
          updated_by = ?
        WHERE id = ?
        `,
        [
          packageId,
          designation,
          salaryType,
          employmentType,
          weekends || null,
          shift_start || null,
          shift_end || null,
          expectedWorkMinutes,
          breakMinutes || null,
          graceMinutes || null,
          userId,
          employeeId
        ]
      );
    }

    else {
      const random = generateRandomToken({ size: 1, encoding: "hex", uppercase: true });

      employeeCode = `EMP-${companyId}${random}`;

      const [employeeResult] = await conn.query(
        `
        INSERT INTO employees
        (
          company_id,
          user_id,
          permission_package_id,
          employee_code,
          designation,
          salary_type,
          employment_type,
          weekends,
          shift_start,
          shift_end,
          expected_work_minutes,
          break_minutes,
          grace_minutes,
          status,
          is_active,
          joining_date,
          created_by,
          updated_by
        )
        VALUES
        (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          'active',
          1,
          CURDATE(),
          ?,
          ?
        )
        `,
        [
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
          userId,
          userId
        ]
      );

      employeeId = employeeResult.insertId;
    }


    if (!employeeId) {
      throw new Error("Failed to create employee");
    }

    if (invite.base_amount !== null && invite.base_amount !== undefined) {
      const [salaryResult] = await conn.query(
        `
        INSERT INTO salary_structures
        (
          company_id,
          employee_id,
          base_amount,
          effective_from,
          effective_to,
          is_active,
          created_by,
          updated_by
        )
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `,
        [
          companyId,
          employeeId,
          invite.base_amount,
          invite.effective_from || new Date().toISOString().split('T')[0],
          invite.effective_to,
          userId,
          userId
        ]
      );

      const salaryId = salaryResult.insertId;

      const [salaryComponents] = await conn.query(
        `
        SELECT component_id, calc_type, calc_value, remark
        FROM invite_salary_components
        WHERE invite_id = ?
          AND is_active = 1
        `,
        [inviteId]
      );

      if (salaryComponents.length) {
        const componentValues = salaryComponents.map(comp => [
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
          0
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
            created_by,
            updated_by,
            is_deleted
          )
          VALUES ?
          `,
          [componentValues]
        );
      }
    }

    await conn.query(
      `
      UPDATE employee_attendance_methods
      SET
        is_deleted = 0,
        deleted_at = NULL,
        deleted_by = NULL
      WHERE employee_id = ?
        AND is_deleted = 1
      `,
      [employeeId]
    );

    if (inviteAttendance.length > 0) {
      const attendanceValues = inviteAttendance.map(m => {
        const method = typeof m === "string" ? m : (m?.method || "");
        const isAuto = typeof m === "string" ? (invite.auto_approve || 0) : (m?.is_auto || invite.auto_approve || 0);
        return [
          employeeId,
          method,
          Number(isAuto || 0),
          1,
          userId,
          userId,
          0
        ];
      }).filter(item => item[1]);

      await conn.query(
        `
        INSERT INTO employee_attendance_methods
        (
          employee_id,
          method,
          is_auto,
          is_active,
          created_by,
          updated_by,
          is_deleted
        )
        VALUES ?
        `,
        [attendanceValues]
      );
    }




    await conn.query(
      `
      UPDATE company_invites
      SET
        status = 'accepted',
        is_active = 0,
        updated_at = NOW(),
        updated_by = ?
      WHERE id = ?
      `,
      [userId, inviteId]
    );

    await conn.commit();

    return res.status(200).json({
      success: true,
      message: "Invitation accepted successfully"
    });

  } catch (error) {
    if (conn) {
      await conn.rollback();
    }

    console.error("Accept invite error:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message || "Failed to accept invitation"
    });

  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.get("/list", auth(INV.MNG), async (req, res) => {

  let conn;

  try {
    conn = await db.getConnection();
    const companyId = Number(req.company?.id);

    if (
      !Number.isInteger(companyId) ||
      companyId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid company ID"
      });
    }

    let {
      page = 1,
      limit = 10,
      search = "",
      status,
      date,
      month,
      year,
      from_date,
      to_date
    } = req.query;

    page = Math.max(
      parseInt(page, 10) || 1,
      1
    );

    limit = Math.min(
      Math.max(parseInt(limit, 10) || 10, 1),
      50
    );

    const offset = (page - 1) * limit;

    let whereClause = `
      WHERE ci.company_id = ?
        AND ci.is_deleted = 0
    `;

    const params = [companyId];

    if (
      status &&
      String(status).trim().toLowerCase() !== "all"
    ) {

      const allowedStatuses = [
        "pending",
        "accepted",
        "rejected",
        "cancelled"
      ];

      const normalizedStatus =
        String(status)
          .trim()
          .toLowerCase();

      if (
        !allowedStatuses.includes(
          normalizedStatus
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid status filter"
        });
      }

      whereClause += `
        AND LOWER(ci.status) = ?
      `;

      params.push(normalizedStatus);
    }

    search = String(search || "").trim();

    if (search.length >= 3) {

      const like = `%${search}%`;

      whereClause += `
        AND (
          u.name LIKE ?
          OR u.email LIKE ?
          OR ci.designation LIKE ?
        )
      `;

      params.push(
        like,
        like,
        like
      );
    }

    if (date) {

      whereClause += `
        AND DATE(ci.created_at) = ?
      `;

      params.push(date);
    }

    if (month && year) {

      const monthNum = Number(month);
      const yearNum = Number(year);

      if (
        Number.isInteger(monthNum) &&
        monthNum >= 1 &&
        monthNum <= 12 &&
        Number.isInteger(yearNum)
      ) {

        whereClause += `
          AND MONTH(ci.created_at) = ?
          AND YEAR(ci.created_at) = ?
        `;

        params.push(
          monthNum,
          yearNum
        );
      }

    } else if (year) {

      const yearNum = Number(year);

      if (Number.isInteger(yearNum)) {

        whereClause += `
          AND YEAR(ci.created_at) = ?
        `;

        params.push(yearNum);
      }
    }

    if (from_date && to_date) {

      whereClause += `
        AND DATE(ci.created_at)
        BETWEEN ? AND ?
      `;

      params.push(
        from_date,
        to_date
      );
    }

    const [[countResult]] =
      await conn.query(
        `
        SELECT COUNT(DISTINCT ci.id) AS total

        FROM company_invites ci

        LEFT JOIN users u
          ON u.id = ci.user_id
          AND u.is_deleted = 0

        ${whereClause}
        `,
        params
      );

    const total =
      Number(countResult?.total || 0);

    const [inviteRows] =
      await conn.query(
        `
        SELECT DISTINCT
          ci.id,
          ci.created_at

        FROM company_invites ci

        LEFT JOIN users u
          ON u.id = ci.user_id
          AND u.is_deleted = 0

        ${whereClause}

        ORDER BY
          ci.created_at DESC,
          ci.id DESC

        LIMIT ? OFFSET ?
        `,
        [
          ...params,
          limit,
          offset
        ]
      );

    const inviteIds =
      inviteRows.map(row => row.id);

    if (!inviteIds.length) {

      return res.status(200).json({
        success: true,
        message: "No invites found",
        data: [],
        meta: {
          page,
          limit,
          total,
          total_pages:
            Math.ceil(total / limit),
          is_last_page: true
        }
      });
    }

    const placeholders =
      inviteIds.map(() => "?").join(",");

    const [rows] = await conn.query(
      `
      SELECT

        ci.id,
        ci.invite_token,
        ci.company_id,
        ci.user_id,
        ci.invited_by,
        ci.permission_package_id,
        ci.employment_type,
        ci.designation,
        ci.salary_type,
        ci.shift_start,
        ci.shift_end,
        ci.break_minutes,
        ci.grace_minutes,
        ci.weekends,
        ci.status,
        ci.is_active,
        ci.is_deleted,
        ci.deleted_at,
        ci.deleted_by,
        ci.expires_at,
        ci.created_at,
        ci.attendance_methods,
        ci.auto_approve,
        ci.base_amount,
        ci.effective_from,
        ci.effective_to,

        u.name AS user_name,
        u.email AS user_email,
        u.profile_picture,

        ib.name AS inviter_name,

        pp.package_name,

        p.id AS permission_id,
        p.name AS permission_name,
        p.code AS permission_code

      FROM company_invites ci

      LEFT JOIN users u
        ON u.id = ci.user_id
        AND u.is_deleted = 0

      LEFT JOIN users ib
        ON ib.id = ci.invited_by
        AND ib.is_deleted = 0

      LEFT JOIN permission_packages pp
        ON pp.id = ci.permission_package_id
        AND pp.company_id = ci.company_id
        AND pp.is_active = 1
        AND pp.is_deleted = 0

      LEFT JOIN permission_package_items ppi
        ON ppi.package_id = pp.id
        AND ppi.is_active = 1
        AND ppi.is_deleted = 0

      LEFT JOIN permissions p
        ON p.id = ppi.permission_id

      WHERE ci.id IN (${placeholders})

      ORDER BY
        ci.created_at DESC,
        ci.id DESC
      `,
      inviteIds
    );

    const [salaryRows] = await conn.query(
      `
      SELECT 
        isc.id, 
        isc.invite_id, 
        isc.component_id, 
        isc.calc_type, 
        isc.calc_value, 
        isc.remark, 
        isc.is_active,
        sc.name AS component_name,
        sc.code AS component_code
      FROM invite_salary_components isc
      JOIN salary_components sc ON sc.id = isc.component_id
      WHERE isc.invite_id IN (${placeholders})
        AND isc.is_active = 1
      `,
      inviteIds
    );

    const salaryComponentsMap = new Map();
    for (const sRow of salaryRows) {
      if (!salaryComponentsMap.has(sRow.invite_id)) {
        salaryComponentsMap.set(sRow.invite_id, []);
      }
      salaryComponentsMap.get(sRow.invite_id).push({
        id: sRow.id,
        component_id: sRow.component_id,
        component_name: sRow.component_name,
        component_code: sRow.component_code,
        calc_type: sRow.calc_type,
        calc_value: parseFloat(sRow.calc_value),
        remark: sRow.remark,
        is_active: Boolean(sRow.is_active)
      });
    }

    const inviteMap = new Map();

    for (const row of rows) {
      if (!inviteMap.has(row.id)) {

        let parsedMethods = [];
        if (row.attendance_methods) {
          try {
            const parsed = typeof row.attendance_methods === "string"
              ? JSON.parse(row.attendance_methods)
              : row.attendance_methods;
            if (Array.isArray(parsed)) {
              parsedMethods = parsed.map(m => typeof m === "string" ? m : (m?.method || "")).filter(Boolean);
            }
          } catch (_) {
            parsedMethods = [];
          }
        }

        inviteMap.set(row.id, {

          invite_id: row.id,

          token: row.invite_token,

          company_id: row.company_id,

          employment_type: getEnumObject(EMPLOYMENT_TYPES, row.employment_type),

          designation: getEnumObject(DESIGNATIONS, row.designation),

          salary_type: getEnumObject(SALARY_TYPES, row.salary_type),

          shift_start: row.shift_start,

          shift_end: row.shift_end,

          break_minutes: row.break_minutes,

          grace_minutes: row.grace_minutes,

          weekends: normalizeWeekends(row.weekends || []),

          permission_package: {
            id: row.permission_package_id,
            name: row.package_name
          },

          status: row.status,

          is_active: Boolean(row.is_active),

          auto_approve: toBoolean(row.auto_approve),

          is_deleted: Boolean(row.is_deleted),

          deleted_at: row.deleted_at ? toISTString(row.deleted_at) : null,

          deleted_by: row.deleted_by,

          expires_at: row.expires_at ? toISTString(row.expires_at) : null,

          created_at: row.created_at ? toISTString(row.created_at) : null,

          base_amount: row.base_amount !== null ? parseFloat(row.base_amount) : null,
          effective_from: row.effective_from ? toISTString(row.effective_from).split(' ')[0] : null,
          effective_to: row.effective_to ? toISTString(row.effective_to).split(' ')[0] : null,

          user: row.user_id
            ? {
              id: row.user_id,
              name: row.user_name,
              email: row.user_email,
              profile_picture: buildFileUrl(row.profile_picture)
            }
            : null,

          invited_by: {
            id: row.invited_by,
            name: row.inviter_name
          },

          permissions: [],

          attendance_methods: parsedMethods,
          salary_components: salaryComponentsMap.get(row.id) || []
        });
      }

      const invite = inviteMap.get(row.id);

      if (row.permission_id) {

        const exists =
          invite.permissions.some(
            permission =>
              permission.id ===
              row.permission_id
          );

        if (!exists) {

          invite.permissions.push({
            id: row.permission_id,
            name: row.permission_name,
            code: row.permission_code
          });
        }
      }
    }

    const orderMap = new Map();

    inviteIds.forEach((id, index) => {
      orderMap.set(id, index);
    });

    const data =
      Array.from(inviteMap.values())
        .sort(
          (a, b) =>
            orderMap.get(a.invite_id) -
            orderMap.get(b.invite_id)
        );

    return res.status(200).json({

      success: true,

      message:
        "All company invites fetched successfully",

      data,

      meta: {
        page,
        limit,
        total,

        total_pages:
          Math.ceil(total / limit),

        is_last_page:
          offset + data.length >= total
      }
    });

  } catch (error) {

    console.error(
      "Error fetching invites:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch invites"
    });

  } finally {

    if (conn) {
      conn.release();
    }
  }
});

router.get("/my", auth(), async (req, res) => {

  let conn;

  try {

    conn = await db.getConnection();

    const userId = Number(req.user?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid user ID"
      });
    }

    let {
      page = 1,
      limit = 10,
      search = "",
      status,
      date,
      month,
      year,
      from_date,
      to_date
    } = req.query;

    page = Math.max(parseInt(page, 10) || 1, 1);

    limit = Math.min(
      Math.max(parseInt(limit, 10) || 10, 1),
      50
    );

    const offset = (page - 1) * limit;

    let where = `
      WHERE ci.user_id = ?
        AND ci.is_deleted = 0
        AND c.is_deleted = 0
    `;

    const params = [userId];

    if (
      status &&
      String(status).trim().toLowerCase() !== "all"
    ) {

      const allowedStatuses = [
        "pending",
        "accepted",
        "rejected",
        "cancelled"
      ];

      const normalizedStatus =
        String(status).trim().toLowerCase();

      if (!allowedStatuses.includes(normalizedStatus)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status filter"
        });
      }

      where += `
        AND LOWER(ci.status) = ?
      `;

      params.push(normalizedStatus);
    }

    search = String(search || "").trim();

    if (search.length >= 3) {

      const like = `%${search}%`;

      where += `
        AND (
          c.name LIKE ?
          OR c.city LIKE ?
          OR c.state LIKE ?
          OR c.country LIKE ?
          OR ci.designation LIKE ?
        )
      `;

      params.push(
        like,
        like,
        like,
        like,
        like
      );
    }

    if (date) {

      where += `
        AND DATE(ci.created_at) = ?
      `;

      params.push(date);
    }

    if (month && year) {

      const monthNum = Number(month);
      const yearNum = Number(year);

      if (
        Number.isInteger(monthNum) &&
        monthNum >= 1 &&
        monthNum <= 12 &&
        Number.isInteger(yearNum)
      ) {

        where += `
          AND MONTH(ci.created_at) = ?
          AND YEAR(ci.created_at) = ?
        `;

        params.push(
          monthNum,
          yearNum
        );
      }

    } else if (year) {

      const yearNum = Number(year);

      if (Number.isInteger(yearNum)) {

        where += `
          AND YEAR(ci.created_at) = ?
        `;

        params.push(yearNum);
      }
    }

    if (from_date && to_date) {

      where += `
        AND DATE(ci.created_at)
        BETWEEN ? AND ?
      `;

      params.push(
        from_date,
        to_date
      );
    }

    const [[countRow]] = await conn.query(
      `
      SELECT COUNT(DISTINCT ci.id) AS total

      FROM company_invites ci

      INNER JOIN companies c
        ON c.id = ci.company_id

      ${where}
      `,
      params
    );

    const total = Number(countRow?.total || 0);


    const [inviteRows] = await conn.query(
      `
      SELECT DISTINCT
        ci.id,
        ci.created_at

      FROM company_invites ci

      INNER JOIN companies c
        ON c.id = ci.company_id

      ${where}

      ORDER BY
        ci.created_at DESC,
        ci.id DESC

      LIMIT ? OFFSET ?
      `,
      [
        ...params,
        limit,
        offset
      ]
    );

    const inviteIds = inviteRows.map(row => row.id);

    if (!inviteIds.length) {

      return res.status(200).json({
        success: true,
        message: "No invites found",
        data: [],
        meta: {
          page,
          limit,
          total,
          total_pages:
            Math.ceil(total / limit),
          is_last_page: true
        }
      });
    }

    const placeholders = inviteIds.map(() => "?").join(",");

    const [rows] = await conn.query(
      `
      SELECT
        ci.id,
        ci.invite_token,
        ci.company_id,
        ci.permission_package_id,
        ci.employment_type,
        ci.designation,
        ci.salary_type,
        ci.shift_start,
        ci.shift_end,
        ci.break_minutes,
        ci.grace_minutes,
        ci.weekends,
        ci.status,
        ci.is_active,
        ci.is_deleted,
        ci.deleted_at,
        ci.deleted_by,
        ci.expires_at,
        ci.created_at,
        ci.attendance_methods,
        ci.auto_approve,
        ci.base_amount,
        ci.effective_from,
        ci.effective_to,

        c.name AS company_name,
        c.city,
        c.state,
        c.country,
        c.address_line1,
        c.address_line2,
        c.logo_url,

        ib.id AS invited_by_id,
        ib.name AS invited_by_name,
        ib.email AS invited_by_email,
        ib.profile_picture AS invited_by_profile_picture,

        pp.id AS package_id,
        pp.package_name,

        p.id AS permission_id,
        p.name AS permission_name,
        p.code AS permission_code

      FROM company_invites ci

      INNER JOIN companies c
        ON c.id = ci.company_id

      LEFT JOIN users ib
        ON ib.id = ci.invited_by
        AND ib.is_deleted = 0

      LEFT JOIN permission_packages pp
        ON pp.id = ci.permission_package_id
        AND pp.company_id = ci.company_id
        AND pp.is_deleted = 0
        AND pp.is_active = 1

      LEFT JOIN permission_package_items ppi
        ON ppi.package_id = pp.id
        AND ppi.is_deleted = 0
        AND ppi.is_active = 1

      LEFT JOIN permissions p
        ON p.id = ppi.permission_id

      WHERE ci.id IN (${placeholders})

      ORDER BY
        ci.created_at DESC,
        ci.id DESC
      `,
      inviteIds
    );

    const [salaryRows] = await conn.query(
      `
      SELECT 
        isc.id, 
        isc.invite_id, 
        isc.component_id, 
        isc.calc_type, 
        isc.calc_value, 
        isc.remark, 
        isc.is_active,
        sc.name AS component_name,
        sc.code AS component_code
      FROM invite_salary_components isc
      JOIN salary_components sc ON sc.id = isc.component_id
      WHERE isc.invite_id IN (${placeholders})
        AND isc.is_active = 1
      `,
      inviteIds
    );

    const salaryComponentsMap = new Map();
    for (const sRow of salaryRows) {
      if (!salaryComponentsMap.has(sRow.invite_id)) {
        salaryComponentsMap.set(sRow.invite_id, []);
      }
      salaryComponentsMap.get(sRow.invite_id).push({
        id: sRow.id,
        component_id: sRow.component_id,
        component_name: sRow.component_name,
        component_code: sRow.component_code,
        calc_type: sRow.calc_type,
        calc_value: parseFloat(sRow.calc_value),
        remark: sRow.remark,
        is_active: Boolean(sRow.is_active)
      });
    }

    const inviteMap = new Map();

    for (const row of rows) {

      if (!inviteMap.has(row.id)) {

        let weekends = [];

        if (row.weekends) {

          try {

            const parsed =
              typeof row.weekends === "string"
                ? JSON.parse(row.weekends)
                : row.weekends;

            if (
              parsed &&
              typeof parsed === "object" &&
              !Array.isArray(parsed)
            ) {

              weekends =
                Object.entries(parsed)
                  .map(([day, type]) => ({
                    day,
                    type
                  }));
            }

          } catch (_) {
            weekends = [];
          }
        }

        let parsedMethods = [];
        if (row.attendance_methods) {
          try {
            const parsed = typeof row.attendance_methods === "string"
              ? JSON.parse(row.attendance_methods)
              : row.attendance_methods;
            if (Array.isArray(parsed)) {
              parsedMethods = parsed.map(m => typeof m === "string" ? m : (m?.method || "")).filter(Boolean);
            }
          } catch (_) {
            parsedMethods = [];
          }
        }

        inviteMap.set(row.id, {

          invite_id: row.id,
          invite_token: row.invite_token,

          company_id: row.company_id,

          employment_type: getEnumObject(EMPLOYMENT_TYPES, row.employment_type),

          designation: getEnumObject(DESIGNATIONS, row.designation),

          salary_type: getEnumObject(SALARY_TYPES, row.salary_type),

          shift_start: row.shift_start,

          shift_end: row.shift_end,

          break_minutes: row.break_minutes,

          grace_minutes: row.grace_minutes,

          weekends:normalizeWeekends(row.weekends || []),

          status: row.status,

          is_active: Boolean(row.is_active),

          auto_approve: toBoolean(row.auto_approve),

          is_deleted: Boolean(row.is_deleted),

          deleted_at: row.deleted_at
            ? toISTString(row.deleted_at)
            : null,

          deleted_by: row.deleted_by,

          expires_at: row.expires_at
            ? toISTString(row.expires_at)
            : null,

          created_at: row.created_at
            ? toISTString(row.created_at)
            : null,

          base_amount: row.base_amount !== null ? parseFloat(row.base_amount) : null,
          effective_from: row.effective_from ? toISTString(row.effective_from).split(' ')[0] : null,
          effective_to: row.effective_to ? toISTString(row.effective_to).split(' ')[0] : null,

          company: {
            id: row.company_id,
            name: row.company_name,
            city: row.city,
            state: row.state,
            country: row.country,
            address_line1: row.address_line1,
            address_line2: row.address_line2,
            logo_url: row.logo_url
          },

          invited_by: row.invited_by_id
            ? {
              id: row.invited_by_id,
              name: row.invited_by_name,
              email: row.invited_by_email,
              profile_picture: buildFileUrl(row.invited_by_profile_picture)
            }
            : null,

          permission_package:
            row.package_id
              ? {
                id: row.package_id,
                name: row.package_name
              }
              : null,

          permissions: [],

          attendance_methods: parsedMethods,
          salary_components: salaryComponentsMap.get(row.id) || []
        });
      }

      const invite = inviteMap.get(row.id);

      if (row.permission_id) {

        const exists =
          invite.permissions.some(
            permission => permission.id === row.permission_id
          );

        if (!exists) {

          invite.permissions.push({
            id: row.permission_id,
            name: row.permission_name,
            code: row.permission_code
          });
        }
      }
    }

    const orderMap = new Map();

    inviteIds.forEach((id, index) => {
      orderMap.set(id, index);
    });

    const data =
      Array.from(inviteMap.values())
        .sort(
          (a, b) =>
            orderMap.get(a.invite_id) -
            orderMap.get(b.invite_id)
        );

    return res.status(200).json({

      success: true,

      message: data.length
        ? "User invites fetched successfully"
        : "No invites found",

      data,

      meta: {
        page,
        limit,
        total,

        total_pages: Math.ceil(total / limit),

        is_last_page: offset + data.length >= total
      }
    });

  } catch (error) {

    console.error(
      "Error fetching user invites:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch user invites"
    });

  } finally {

    if (conn) {
      conn.release();
    }
  }
});

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
      shift_start,
      shift_end,
      break_minutes,
      grace_minutes,
      weekends,
      base_amount,
      effective_from,
      effective_to,
      components
    } = req.body;

    const modifiedBy = req.user?.id;
    const company_id = req.company?.id;


    if (!invite_id && req.body["invite _id"]) {
      invite_id = req.body["invite _id"];
    }

    invite_id = Number(invite_id);


    if (!company_id || !invite_id) {
      return res.status(400).json({
        success: false,
        message: "company_id and invite_id are required"
      });
    }


    if (shift_start && shift_end && shift_start >= shift_end) {
      return res.status(422).json({
        success: false,
        message: "shift_start must be less than shift_end"
      });
    }

    let breakMinutes = null;
    let graceMinutes = null;

    if (break_minutes) {
      if (typeof break_minutes !== "string") {
        throw { status: 400, message: "break_minutes must be in HH:mm format" };
      }

      const parts = break_minutes.split(":");

      if (parts.length !== 2) {
        throw { status: 400, message: "Invalid break_minutes format. Use HH:mm" };
      }

      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);

      if (isNaN(hours) || isNaN(minutes)) {
        throw { status: 400, message: "Invalid break_minutes values" };
      }

      breakMinutes = (hours * 60) + minutes;
    }

    if (grace_minutes) {
      if (typeof grace_minutes !== "string") {
        throw { status: 400, message: "grace_minutes must be in HH:mm format" };
      }

      const parts = grace_minutes.split(":");

      if (parts.length !== 2) {
        throw { status: 400, message: "Invalid grace_minutes format. Use HH:mm" };
      }

      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);

      if (isNaN(hours) || isNaN(minutes)) {
        throw { status: 400, message: "Invalid grace_minutes values" };
      }

      graceMinutes = (hours * 60) + minutes;
    }

    if (base_amount !== undefined && base_amount !== null && base_amount !== "") {
      const parsedBase = parseFloat(base_amount);
      if (isNaN(parsedBase) || parsedBase < 0) {
        throw { status: 400, message: "base_amount must be a valid non-negative number" };
      }
      base_amount = parsedBase;
    } else if (base_amount === "") {
      base_amount = null;
    }

    if (effective_from) {
      if (isNaN(Date.parse(effective_from))) {
        throw { status: 400, message: "Invalid effective_from date format" };
      }
    }

    if (effective_to) {
      if (isNaN(Date.parse(effective_to))) {
        throw { status: 400, message: "Invalid effective_to date format" };
      }
    }

    if (components !== undefined && components !== null) {
      if (!Array.isArray(components)) {
        throw { status: 400, message: "components must be an array" };
      }
      // Use for-of so thrown errors propagate correctly out of the loop
      for (const [idx, comp] of components.entries()) {
        if (!comp.component_id || !Number.isInteger(Number(comp.component_id))) {
          throw { status: 400, message: `Invalid component_id at index ${idx}` };
        }
        if (!comp.calc_type || typeof comp.calc_type !== "string" || !comp.calc_type.trim()) {
          throw { status: 400, message: `Calculation type is required at index ${idx}` };
        }
        if (comp.calc_value === undefined || isNaN(parseFloat(comp.calc_value))) {
          throw { status: 400, message: `Invalid calculation value at index ${idx}` };
        }
      }
    }

    if (attendance_methods !== undefined) {
      if (!Array.isArray(attendance_methods)) {
        return res.status(400).json({
          success: false,
          message: "attendance_methods must be an array"
        });
      }

      const methodSet = new Set();

      attendance_methods = attendance_methods.map(m => {
        const method = typeof m === "string" ? m : m?.method;

        if (!method) {
          throw new Error("Invalid attendance method");
        }

        if (methodSet.has(method)) return null;
        methodSet.add(method);

        return method;
      }).filter(Boolean);
    }

    await conn.beginTransaction();


    const [[company]] = await conn.query(
      `SELECT id FROM companies
       WHERE id=? AND is_active=1 AND is_deleted=0`,
      [company_id]
    );

    if (!company) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "Company not found"
      });
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
      return res.status(404).json({
        success: false,
        message: "Invite not found"
      });
    }


    if (permission_package_id !== undefined) {
      const [[pkg]] = await conn.query(
        `SELECT id FROM permission_packages
         WHERE id=? AND company_id=? AND is_active=1 AND is_deleted=0`,
        [permission_package_id, company_id]
      );

      if (!pkg) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Invalid permission package"
        });
      }
    }


    const fields = [];
    const values = [];

    const addField = (key, value) => {
      fields.push(`${key}=?`);
      values.push(value);
    };

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
    if (auto_approve !== undefined) addField("auto_approve", auto_approve ? 1 : 0);
    if (base_amount !== undefined) addField("base_amount", base_amount);
    if (effective_from !== undefined) addField("effective_from", effective_from);
    if (effective_to !== undefined) addField("effective_to", effective_to);

    if (fields.length) {
      await conn.query(
        `UPDATE company_invites
         SET ${fields.join(", ")},
             updated_at=NOW(),
             updated_by=?
         WHERE id=?`,
        [...values, modifiedBy, invite.id]
      );
    }

    // Delsert invite_components only when explicitly provided (not undefined)
    if (components !== undefined && components !== null) {

      // Validate each component_id exists in components table for this company
      if (components.length > 0) {
        const componentIds = [...new Set(components.map(c => Number(c.component_id)))];
        const placeholders = componentIds.map(() => "?").join(", ");
        const [validComps] = await conn.query(
          `SELECT id FROM salary_components
           WHERE id IN (${placeholders})
             AND company_id = ?
             AND is_active = 1
             AND is_deleted = 0`,
          [...componentIds, company_id]
        );
        const validIds = new Set(validComps.map(r => r.id));
        for (const id of componentIds) {
          if (!validIds.has(id)) {
            await conn.rollback();
            return res.status(400).json({
              success: false,
              message: `Salary component with id ${id} not found or does not belong to this company`
            });
          }
        }
      }

      // Delete all existing components for this invite
      await conn.query(
        `DELETE FROM invite_salary_components WHERE invite_id = ?`,
        [invite.id]
      );

      // Re-insert if the new array is non-empty
      if (components.length > 0) {
        const compValues = components.map(comp => [
          invite.id,
          Number(comp.component_id),
          comp.calc_type.trim(),
          parseFloat(comp.calc_value),
          comp.remark ? comp.remark.trim() : null,
          1
        ]);

        await conn.query(
          `INSERT INTO invite_salary_components
           (invite_id, component_id, calc_type, calc_value, remark, is_active)
           VALUES ?`,
          [compValues]
        );
      }

    } else if (components === null) {
      // Explicitly passing null clears all components
      await conn.query(
        `DELETE FROM invite_salary_components WHERE invite_id = ?`,
        [invite.id]
      );
    }

    await conn.commit();

    return res.json({
      success: true,
      message: "Invite updated successfully"
    });

  } catch (err) {
    if (conn) await conn.rollback();

    console.error("Invite update error:", err);

    const status = err?.status || 500;
    const message = err?.message || "Internal server error";

    return res.status(status).json({
      success: false,
      message
    });

  } finally {
    if (conn) conn.release();
  }
});

router.delete("/cancel", auth(), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const { token } = req.body;
    const userId = req.user?.id;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Invite token is required"
      });
    }

    await conn.beginTransaction();


    const [[invite]] = await conn.query(
      `
      SELECT
        id,
        company_id,
        user_id,
        invited_by,
        permission_package_id,
        employment_type,
        designation,
        salary_type,
        invite_token
      FROM company_invites
      WHERE invite_token = ?
        AND status = 'pending'
        AND is_active = 1
        AND is_deleted = 0
        AND (expires_at IS NULL OR expires_at > NOW())
      FOR UPDATE
      `,
      [token]
    );

    if (!invite) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "Invalid, expired, or already processed invite"
      });
    }

    const inviteId = invite.id;


    await conn.query(
      `
      UPDATE company_invites
      SET
        status = 'cancelled',
        is_active = 0,
        updated_at = NOW(),
        updated_by = ?
      WHERE id = ?
      `,
      [userId, inviteId]
    );




    const [[user]] = await conn.query(
      `
      SELECT id, name, email, phone
      FROM users
      WHERE id = ?
        AND is_deleted = 0
      `,
      [invite.user_id]
    );

    const [[company]] = await conn.query(
      `
      SELECT id, name, legal_name, logo_url
      FROM companies
      WHERE id = ?
        AND is_deleted = 0
      `,
      [invite.company_id]
    );

    const [[invitedBy]] = await conn.query(
      `
      SELECT id, name, email
      FROM users
      WHERE id = ?
        AND is_deleted = 0
      `,
      [invite.invited_by]
    );


    const [permissions] = await conn.query(
      `
      SELECT p.id, p.name, p.code, p.action
      FROM permission_package_items ppi
      JOIN permissions p ON p.id = ppi.permission_id
      WHERE ppi.package_id = ?
        AND ppi.is_active = 1
        AND ppi.is_deleted = 0
      `,
      [invite.permission_package_id]
    );

    await conn.commit();

    return res.json({
      success: true,
      message: "Invitation cancelled successfully"
    });

  } catch (error) {
    if (conn) await conn.rollback();

    console.error("Cancel invite error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel invite"
    });

  } finally {
    if (conn) conn.release();
  }
});

router.put("/reject", auth(INV.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const { token } = req.body;
    const userId = req.user?.id;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Invite token is required"
      });
    }

    await conn.beginTransaction();


    const [[invite]] = await conn.query(
      `
      SELECT id, invite_token
      FROM company_invites
      WHERE invite_token = ?
        AND user_id = ?
        AND status = 'pending'
        AND is_active = 1
        AND is_deleted = 0
        AND (expires_at IS NULL OR expires_at > NOW())
      FOR UPDATE
      `,
      [token, userId]
    );

    if (!invite) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "Invite not found, expired, or already processed"
      });
    }

    const inviteId = invite.id;


    await conn.query(
      `
      UPDATE company_invites
      SET
        status = 'rejected',
        is_active = 0,
        updated_at = NOW(),
        updated_by = ?
      WHERE id = ?
      `,
      [userId, inviteId]
    );



    await conn.commit();

    return res.json({
      success: true,
      message: "Invite rejected successfully",
      data: {
        invite_token: invite.invite_token,
        status: "rejected"
      }
    });

  } catch (error) {
    if (conn) await conn.rollback();

    console.error("Reject invite error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reject invite"
    });

  } finally {
    if (conn) conn.release();
  }
});


export default router;
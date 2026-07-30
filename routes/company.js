import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import getClientMeta from "../utils/ipHelper.js";
import { saveMediaFromUrl, buildFileUrl } from "../utils/fileService.js";
import { validateFields, attendanceMethodValidation } from "../utils/constantsValidator.js";
import { ATTENDANCE_METHODS, LEAVE_TYPES } from "../constants/constants_values.js";
import { formatUTCToIST } from "../utils/time.js";
import { createDefaultPackages } from "../utils/defaultPackages.js";
import { sendSuccess, sendError, buildMeta } from "../utils/sendResponse.js";

const router = express.Router();

const SQL_COMPANY_EXISTS = `
  SELECT id
  FROM companies
  WHERE id = ?
    AND owner_user_id = ?
    AND is_deleted = 0
  LIMIT 1
`;

const SQL_COMPANY_BY_ID = `
  SELECT *
  FROM companies
  WHERE id = ?
`;

const SQL_COMPANY_WITH_USER_COLUMNS = `
  c.*,
  cu.id AS created_by_id,
  cu.name AS created_by_name,
  uu.id AS updated_by_id,
  uu.name AS updated_by_name
`;

const SQL_COMPANY_JOIN_USERS = `
  LEFT JOIN users cu ON cu.id = c.created_by
  LEFT JOIN users uu ON uu.id = c.updated_by
`;

const parseJsonArray = (val) => {
  if (!val) return [];
  try {
    return JSON.parse(val);
  } catch {
    return [];
  }
};

const formatCompany = (row, { includeAudit = false } = {}) => {
  let company = {
    id: row.id,
    owner_user_id: row.owner_user_id,

    name: row.name,
    legal_name: row.legal_name,
    logo_url: buildFileUrl(row.logo_url) || "",

    address_line1: row.address_line1,
    address_line2: row.address_line2,
    city: row.city,
    state: row.state,
    postal_code: row.postal_code,
    country: row.country,

    latitude: row.latitude,
    longitude: row.longitude,

    created_at: formatUTCToIST(row.created_at),
    updated_at: formatUTCToIST(row.updated_at),

    is_active: row.is_active == 1,
    is_deleted: row.is_deleted == 1,

    company_ips: parseJsonArray(row.company_ips),
    attendance_methods: parseJsonArray(row.attendance_methods),

    transaction_currency: row.transaction_currency,
    max_distance: row.max_distance,
  };

  if (includeAudit) {
    company.created_by = row.created_by_id
      ? { id: row.created_by_id, name: row.created_by_name }
      : null;
    company.updated_by = row.updated_by_id
      ? { id: row.updated_by_id, name: row.updated_by_name }
      : null;
  }

  return company;
};

const normalizePhone = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();

  if (!trimmed) {
    return null;
  }

  const digits = trimmed.replace(/\D/g, "");

  return digits.length >= 10 ? digits : null;
};

const maskPhone = (phone) => {
  if (!phone) {
    return null;
  }

  const digits = String(phone).replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (digits.length <= 4) {
    return "*".repeat(digits.length);
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 1)}${"*".repeat(digits.length - 2)}${digits.slice(-1)}`;
  }

  return `${digits.slice(0, 2)}${"*".repeat(digits.length - 4)}${digits.slice(-2)}`;
};

router.post("/create", auth(), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    let {
      name,
      legal_name,
      logo_url,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country,
      latitude,
      longitude
    } = req.body || {};

    name = typeof name === "string" ? name.trim() : "";
    legal_name = typeof legal_name === "string" ? legal_name.trim() : "";
    address_line1 = typeof address_line1 === "string" ? address_line1.trim() : "";
    address_line2 = typeof address_line2 === "string" ? address_line2.trim() : "";
    city = typeof city === "string" ? city.trim() : "";
    state = typeof state === "string" ? state.trim() : "";
    postal_code = typeof postal_code === "string" ? postal_code.trim() : "";
    country = typeof country === "string" ? country.trim() : "";

    const owner_user_id = Number(req.user?.id);

    if (!owner_user_id) {
      return sendError(res, 401, "Unauthorized");
    }

    if (!name) {
      return sendError(res, 400, "Company name is required");
    }

    if (name.length > 255) {
      return sendError(res, 400, "Company name is too long");
    }

    latitude = (latitude !== undefined && latitude !== null && latitude !== "")
      ? Number(latitude)
      : null;
    longitude = (longitude !== undefined && longitude !== null && longitude !== "")
      ? Number(longitude)
      : null;

    if (latitude !== null && Number.isNaN(latitude)) {
      return sendError(res, 400, "Invalid latitude");
    }
    if (longitude !== null && Number.isNaN(longitude)) {
      return sendError(res, 400, "Invalid longitude");
    }
    if (latitude !== null && (latitude < -90 || latitude > 90)) {
      return sendError(res, 400, "Latitude must be between -90 and 90");
    }
    if (longitude !== null && (longitude < -180 || longitude > 180)) {
      return sendError(res, 400, "Longitude must be between -180 and 180");
    }

    await conn.beginTransaction();

    const [users] = await conn.query(
      `SELECT id, name FROM users WHERE id = ? AND is_active = 1 AND is_deleted = 0 LIMIT 1`,
      [owner_user_id]
    );
    if (!users.length) {
      await conn.rollback();
      return sendError(res, 404, "User not found");
    }

    const [existingCompany] = await conn.query(
      `SELECT id FROM companies WHERE owner_user_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND is_deleted = 0 LIMIT 1`,
      [owner_user_id, name]
    );
    if (existingCompany.length) {
      await conn.rollback();
      return sendError(res, 409, "Company already exists");
    }

    const attendanceMethodsJson = JSON.stringify([ATTENDANCE_METHODS.MANUAL.value]);

    let finalLogoUrl = null;
    if (logo_url) {
      try {
        const media = await saveMediaFromUrl({ url: logo_url, folder: "company" });
        if (media?.success && media?.file_url) {
          finalLogoUrl = media.file_url;
        }
      } catch (error) {
        console.error("Logo Upload Error:", error);
      }
    }

    const [companyResult] = await conn.query(
      `INSERT INTO companies (
        owner_user_id, name, legal_name, logo_url,
        is_active, created_at, created_by, updated_at, updated_by,
        is_deleted, address_line1, address_line2, city, state,
        postal_code, country, latitude, longitude,
        company_ips, attendance_methods
      ) VALUES (
        ?, ?, ?, ?, 1,
        NOW(), ?, NOW(), ?, 0,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )`,
      [
        owner_user_id, name, legal_name || null, finalLogoUrl,
        owner_user_id, owner_user_id,
        address_line1 || null, address_line2 || null, city || null,
        state || null, postal_code || null, country || null,
        latitude, longitude,
        JSON.stringify([]), attendanceMethodsJson
      ]
    );
    const companyId = companyResult.insertId;

    const [[company]] = await conn.query(`SELECT * FROM companies WHERE id = ?`, [companyId]);

    await conn.commit();

    await createDefaultPackages(conn, companyId, owner_user_id);

    return sendSuccess(res, 201, "Company created successfully");
  } catch (error) {
    console.error("Create Company Error:", error);

    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("Rollback Error:", rollbackError);
      }
    }

    if (error?.code === "ER_DUP_ENTRY") {
      return sendError(res, 409, "Duplicate entry detected");
    }

    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.get("/list", auth([], { owner_only: true }), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const userId = req.user?.id;

    const search = req.query.search?.trim() || "";

    let pageNum = Number(req.query.page);
    let limitNum = Number(req.query.limit);

    pageNum = !isNaN(pageNum) && pageNum > 0 ? pageNum : 1;
    limitNum = !isNaN(limitNum) && limitNum > 0 ? limitNum : 20;

    if (limitNum > 100) limitNum = 100;

    const offset = (pageNum - 1) * limitNum;

    const params = [userId];

    let baseQuery = `
      FROM companies c
      ${SQL_COMPANY_JOIN_USERS}
      WHERE c.is_deleted = 0
        AND c.owner_user_id = ?
    `;

    if (search) {
      const like = `%${search}%`;

      baseQuery += `
        AND (
          c.name LIKE ?
          OR c.legal_name LIKE ?
          OR c.city LIKE ?
          OR c.state LIKE ?
          OR c.country LIKE ?
        )
      `;

      params.push(like, like, like, like, like);
    }

    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS total ${baseQuery}`,
      params
    );

    const total = countRows?.[0]?.total || 0;

    const [rows] = await conn.query(
      `
      SELECT ${SQL_COMPANY_WITH_USER_COLUMNS}
      ${baseQuery}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limitNum, offset]
    );

    const data = rows.map((row) => formatCompany(row));

    const meta = buildMeta(pageNum, limitNum, total, data.length);

    return sendSuccess(res, 200, "Company list retrieved successfully", data, meta);
  } catch (error) {
    console.error("List company error:", error);

    return sendError(res, 500, "Failed to fetch company list");
  } finally {
    if (conn) conn.release();
  }
});

router.get("/details", auth([], { owner_only: true }), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const userId = Number(req.user?.id);
    const companyId = Number(req.query?.company_id);

    if (!companyId) {
      return sendError(res, 400, "Company ID is required in header");
    }

    const [rows] = await conn.query(
      `
      SELECT ${SQL_COMPANY_WITH_USER_COLUMNS}
      FROM companies c
      ${SQL_COMPANY_JOIN_USERS}
      WHERE
        c.id = ?
        AND c.owner_user_id = ?
        AND c.is_deleted = 0
      LIMIT 1
      `,
      [companyId, userId]
    );

    if (!rows.length) {
      return sendError(res, 404, "Company not found");
    }

    const row = rows[0];

    const company = formatCompany(row, {
      includeAudit: true
    });

    return sendSuccess(res, 200, "Company details retrieved successfully", company);
  } catch (error) {
    console.error("Company details error:", error);

    return sendError(res, 500, "Failed to fetch company details");
  } finally {
    if (conn) conn.release();
  }
});

router.put("/update-basic", auth([], { owner_only: true }), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    let {
      id,
      is_active,
      name,
      legal_name,
      logo_url,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country,
      transaction_currency,
      gst_no
    } = req.body || {};

    const modifiedBy = req.user?.id;

    if (!modifiedBy) {
      return sendError(res, 401, "Unauthorized user");
    }

    if (!id || isNaN(Number(id))) {
      return sendError(res, 400, "Valid company id is required");
    }

    const normalize = v =>
      typeof v === "string"
        ? v.trim()
        : v;

    name = normalize(name);
    legal_name = normalize(legal_name);
    address_line1 = normalize(address_line1);
    address_line2 = normalize(address_line2);
    city = normalize(city);
    state = normalize(state);
    postal_code = normalize(postal_code);
    country = normalize(country);
    gst_no = normalize(gst_no);
    transaction_currency = normalize(transaction_currency);

    await conn.beginTransaction();

    const [[companyRow]] = await conn.query(SQL_COMPANY_EXISTS, [id, modifiedBy]);

    if (!companyRow) {
      await conn.rollback();
      return sendError(res, 404, "Company not found");
    }

    let finalLogoUrl = null;

    if (logo_url) {
      const media = await saveMediaFromUrl({
        url: logo_url,
        type: "image"
      });

      if (media?.success && media?.file_url) {
        finalLogoUrl = media.file_url;
      }
    }

    const fields = [];
    const values = [];

    const addField = (key, value, raw = false) => {
      if (raw) {
        fields.push(`${key} = ${value}`);
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    };

    if (name !== undefined) addField("name", name);
    if (legal_name !== undefined) addField("legal_name", legal_name);
    if (is_active !== undefined) addField("is_active", is_active);

    if (address_line1 !== undefined) addField("address_line1", address_line1);
    if (address_line2 !== undefined) addField("address_line2", address_line2);
    if (city !== undefined) addField("city", city);
    if (state !== undefined) addField("state", state);
    if (postal_code !== undefined) addField("postal_code", postal_code);
    if (country !== undefined) addField("country", country);
    if (gst_no !== undefined) addField("gst_no", gst_no);

    if (transaction_currency !== undefined) {
      addField("transaction_currency", transaction_currency);
    }

    if (finalLogoUrl !== null) {
      addField("logo_url", finalLogoUrl);
    }

    addField("updated_by", modifiedBy);
    addField("updated_at", "NOW()", true);

    if (!fields.length) {
      await conn.rollback();
      return sendError(res, 400, "No fields to update");
    }

    await conn.query(
      `
        UPDATE companies
        SET ${fields.join(", ")}
        WHERE id = ?
        `,
      [...values, id]
    );

    await conn.query(SQL_COMPANY_BY_ID, [id]);

    await conn.commit();

    return sendSuccess(res, 200, "Company basic details updated successfully");
  } catch (error) {
    if (conn) {
      await conn.rollback();
    }

    console.error(error);

    return sendError(res, 500, error.message);
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.put("/update-attendance-settings", auth([], { owner_only: true }), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    let {
      id,
      latitude,
      longitude,
      company_ips,
      clear_ips,
      attendance_methods,
      max_distance
    } = req.body || {};

    const modifiedBy = req.user?.id;

    if (!modifiedBy) {
      return sendError(res, 401, "Unauthorized user");
    }

    if (!id || isNaN(Number(id))) {
      return sendError(res, 400, "Valid company id is required");
    }

    const isValidIPv4 = ip =>
      /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(ip);

    const lat =
      latitude !== undefined && latitude !== ""
        ? Number(latitude)
        : undefined;

    const lng =
      longitude !== undefined && longitude !== ""
        ? Number(longitude)
        : undefined;

    if (lat !== undefined && (isNaN(lat) || lat < -90 || lat > 90)) {
      return sendError(res, 400, "Latitude must be between -90 and 90");
    }

    if (lng !== undefined && (isNaN(lng) || lng < -180 || lng > 180)) {
      return sendError(res, 400, "Longitude must be between -180 and 180");
    }

    if (
      max_distance !== undefined &&
      (max_distance === "" || isNaN(Number(max_distance)))
    ) {
      return sendError(res, 400, "Max Distance must be Numeric Value");
    }

    await conn.beginTransaction();

    const [[companyRow]] = await conn.query(SQL_COMPANY_EXISTS, [id, modifiedBy]);

    if (!companyRow) {
      await conn.rollback();
      return sendError(res, 404, "Company not found");
    }

    let shouldUpdateIps = false;
    let finalIps = null;

    if (clear_ips === true) {
      finalIps = null;
      shouldUpdateIps = true;

    } else if (company_ips !== undefined) {
      try {
        const parsed =
          typeof company_ips === "string"
            ? JSON.parse(company_ips)
            : company_ips;

        if (!Array.isArray(parsed)) {
          await conn.rollback();
          return sendError(res, 400, "company_ips must be an array");
        }

        if (parsed.length === 0) {
          const clientIp = getClientMeta(req).ip_v4;

          if (clientIp && isValidIPv4(clientIp)) {
            finalIps = JSON.stringify([clientIp]);
          } else {
            finalIps = null;
          }
        } else {
          for (const ip of parsed) {
            if (!isValidIPv4(String(ip).trim())) {
              await conn.rollback();
              return sendError(res, 400, `Invalid IPv4 address: ${ip}`);
            }
          }

          const cleanIps = [...new Set(parsed.map(ip => String(ip).trim()))];
          finalIps = JSON.stringify(cleanIps);
        }

        shouldUpdateIps = true;

      } catch {
        await conn.rollback();
        return sendError(res, 400, "Invalid JSON format for company_ips");
      }
    }

    const fields = [];
    const values = [];

    const addField = (key, value, raw = false) => {
      if (raw) {
        fields.push(`${key} = ${value}`);
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    };

    if (lat !== undefined) addField("latitude", lat);
    if (lng !== undefined) addField("longitude", lng);
    if (max_distance !== undefined) addField("max_distance", max_distance);
    if (shouldUpdateIps) addField("company_ips", finalIps);

    if (attendance_methods !== undefined) {
      try {
        const parsed =
          typeof attendance_methods === "string"
            ? JSON.parse(attendance_methods)
            : attendance_methods;

        if (Array.isArray(parsed)) {
          if (parsed.length === 0) {
            addField("attendance_methods", JSON.stringify(["manual"]));
          } else {
            const cleanMethods = [
              ...new Set(parsed.map(m => String(m).trim().toLowerCase()))
            ];
            addField("attendance_methods", JSON.stringify(cleanMethods));
          }
        }
      } catch { }
    }

    addField("updated_by", modifiedBy);
    addField("updated_at", "NOW()", true);

    if (!fields.length) {
      await conn.rollback();
      return sendError(res, 400, "No fields to update");
    }

    await conn.query(
      `
        UPDATE companies
        SET ${fields.join(", ")}
        WHERE id = ?
        `,
      [...values, id]
    );

    await conn.query(SQL_COMPANY_BY_ID, [id]);

    await conn.commit();

    return sendSuccess(res, 200, "Attendance settings updated successfully");
  } catch (error) {
    if (conn) {
      await conn.rollback();
    }

    console.error(error);

    return sendError(res, 500, error.message);
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.delete("/delete", auth([], { owner_only: true }), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const userId = req.user?.id;
    const id = req.body?.id;

    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    if (!id) {
      return sendError(res, 400, "Company id is required");
    }

    await conn.beginTransaction();

    const [rows] = await conn.query(SQL_COMPANY_EXISTS, [id, userId]);

    if (!rows.length) {
      await conn.rollback();
      return sendError(res, 404, "Company not found or access denied");
    }

    await conn.query(
      `UPDATE companies
       SET 
         is_deleted = 1,
         deleted_by = ?,
         deleted_at = NOW(),
         updated_by = ?,
         updated_at = NOW()
       WHERE id = ?`,
      [userId, userId, id]
    );

    await conn.commit();

    return sendSuccess(res, 200, "Company deleted successfully");
  } catch (error) {
    if (conn) await conn.rollback();

    console.error("Delete company error:", error);

    return sendError(res, 500, "Failed to delete company");
  } finally {
    if (conn) conn.release();
  }
});

router.get("/users/available", auth([], { owner_only: true }), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const companyId = Number(req.company?.id);
    const currentUserId = Number(req.user?.id);

    if (!companyId || !currentUserId) {
      return sendError(res, 401, "Your session is invalid or company context is missing. Please login again and select a company.");
    }

    const emailRaw = String(req.query.email || "").trim();
    const mobileRaw = String(req.query.mobile || "").trim();

    const hasEmail = Boolean(emailRaw);
    const hasMobile = Boolean(mobileRaw);

    if (hasEmail && hasMobile) {
      return sendError(res, 400, "Please provide either email or mobile, not both at the same time.");
    }

    if (!hasEmail && !hasMobile) {
      return sendError(res, 400, "Please enter an email address or mobile number.");
    }

    let lookupType = null;
    let email = null;
    let mobile = null;

    if (hasEmail) {
      email = emailRaw.toLowerCase();

      const emailRegex =
        /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

      if (!emailRegex.test(email)) {
        return sendError(res, 400, "The email address format is invalid. Please check and try again.");
      }

      lookupType = "email";
    } else {
      mobile = normalizePhone(mobileRaw);

      if (!mobile) {
        return sendError(res, 400, "The mobile number format is invalid. Please check and try again.");
      }

      lookupType = "mobile";
    }

    const [companyRows] = await conn.query(
      `
      SELECT
        id,
        owner_user_id,
        is_active,
        is_deleted
      FROM companies
      WHERE id = ?
      LIMIT 1
      `,
      [companyId]
    );

    if (!companyRows.length) {
      return sendError(res, 404, "The selected company does not exist.");
    }

    const company = companyRows[0];

    if (company.is_deleted) {
      return sendError(res, 410, "This company has been deleted and is no longer accessible.");
    }

    if (!company.is_active) {
      return sendError(res, 403, "This company is currently inactive. Please contact support or the company owner.");
    }

    const userQuery =
      lookupType === "email"
        ? `
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.profile_picture,
        u.is_active,
        u.is_deleted,
        u.created_at
      FROM users u
      WHERE LOWER(u.email) = ?
      LIMIT 1
      `
        : `
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.is_active,
        u.is_deleted,
        u.created_at
      FROM users u
      WHERE u.phone = ?
      LIMIT 1
      `;

    const userQueryParams =
      lookupType === "email" ? [email] : [mobile];

    const [userRows] = await conn.query(userQuery, userQueryParams);

    if (!userRows.length) {
      return sendError(res, 404,
        lookupType === "email"
          ? "No account exists with this email address."
          : "No account exists with this mobile number.");
    }

    const user = userRows[0];

    if (user.is_deleted) {
      return sendError(res, 410, "This user account has been deleted and cannot receive invitations.");
    }

    if (user.id === currentUserId) {
      return sendError(res, 400, "You cannot send a company invitation to yourself.");
    }

    if (user.id === Number(company.owner_user_id)) {
      return sendError(res, 400, "This user is already the owner of the company.");
    }

    if (!user.is_active) {
      return sendError(res, 403, "This user's account is inactive and cannot receive invitations.");
    }

    const [employeeRows] = await conn.query(
      `
      SELECT
        id,
        is_active,
        is_deleted,
        status
      FROM employees
      WHERE company_id = ?
        AND user_id = ?
      LIMIT 1
      `,
      [companyId, user.id]
    );

    if (employeeRows.length) {
      const employee = employeeRows[0];

      if (employee.status == "inactive") {
        return sendError(res, 409, "This user was previously associated with the company. Please restore the employee record instead of sending a new invitation.");
      }

      return sendError(res, 409, "This user is already a member of the company.");
    }

    const [inviteRows] = await conn.query(
      `
      SELECT
        id,
        status,
        is_active,
        is_deleted,
        expires_at
      FROM company_invites
      WHERE company_id = ?
        AND user_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [companyId, user.id]
    );

    if (inviteRows.length) {
      const invite = inviteRows[0];

      if (invite.is_deleted) {
        return sendError(res, 409, "An old invitation record exists for this user. Please create a fresh invitation from the admin panel.");
      }

      if (invite.status === "accepted") {
        return sendError(res, 409, "This user has already accepted the company invitation.");
      }

      if (invite.status === "rejected") {
        return sendError(res, 409, "This user previously rejected the company invitation. You may send a new invitation.");
      }

      if (
        invite.status === "pending" &&
        invite.expires_at &&
        new Date(invite.expires_at) < new Date()
      ) {
        return sendError(res, 409, "A previous invitation for this user has expired. Please resend a new invitation.");
      }

      if (
        invite.status === "pending" &&
        invite.is_active
      ) {
        return sendError(res, 409, "A pending invitation has already been sent to this user.");
      }
    }

    const responseData = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: maskPhone(user.phone),
      profile_picture: buildFileUrl(user.profile_picture),
      is_active: Boolean(user.is_active),
      created_at: user.created_at
    };

    responseData.created_at = formatUTCToIST(responseData.created_at);

    return sendSuccess(res, 200, "User found and available for company invitation.", responseData);
  } catch (error) {
    console.error("AVAILABLE_USER_ERROR:", error);

    return sendError(res, 500, "Something went wrong while checking user availability. Please try again later.");
  } finally {
    if (conn) conn.release();
  }
});

export default router;
import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import { hashPassword, comparePassword, generateOTP, verifyOtpHash, } from "../utils/auth.js";
import { queuePhoneUpdateOTPEmail, queueDeleteAccountOTPEmail, sendDeleteAccountOTPEmail } from "../email/services/email.processor.js";
import { sendEmailUpdateOTP, sendOtpSms } from "../utils/sendSMS.js";
import { sendOtpWhatsApp } from "../utils/whatsapp.js";
import { saveMediaFromUrl, buildFileUrl } from "../utils/fileService.js";
import getClientMeta from "../utils/ipHelper.js";
import { sendSuccess, sendError } from "../utils/sendResponse.js";
import { getEnumObject } from "../utils/constantsValidator.js";
import { DESIGNATIONS, SALARY_TYPES, EMPLOYMENT_TYPES } from "../constants/constants_values.js";
import { NODE_ENV, EMAIL_USER } from "../config/config.js";
import { normalizeIndianMobile } from "../utils/mobile.js";


const router = express.Router();


const rollbackTransaction = async (conn, transactionStarted) => {
  if (!conn || !transactionStarted) {
    return;
  }

  try {
    await conn.rollback();
  } catch (_) {
  }
};

const getDeliverableEmail = (email) => {
  const normalized = email?.trim()?.toLowerCase() || "";

  return normalized.includes("@") ? normalized : null;
};

const validatePhoneUpdate = async (conn, userId, normalizedPhone) => {
  if (!normalizedPhone) {
    return {
      error: {
        status: 400,
        message: "Invalid phone number",
      },
    };
  }

  const [[user]] = await conn.query(
    `
    SELECT phone
    FROM users
    WHERE id = ?
      AND is_deleted = 0
    LIMIT 1
    `,
    [userId]
  );

  if (!user) {
    return {
      error: {
        status: 404,
        message: "User not found",
      },
    };
  }

  const currentPhone = normalizeIndianMobile(user.phone);

  if (currentPhone && currentPhone === normalizedPhone) {
    return {
      error: {
        status: 400,
        message: "This is already your current phone number",
      },
    };
  }

  const [existingRows] = await conn.query(
    `
    SELECT id
    FROM users
    WHERE phone = ?
      AND id != ?
      AND is_deleted = 0
      AND phone IS NOT NULL
      AND phone <> ''
    LIMIT 1
    `,
    [normalizedPhone, userId]
  );

  if (existingRows.length) {
    return {
      error: {
        status: 409,
        message: "Phone number is already registered to another account",
      },
    };
  }

  return { ok: true };
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();

  if (!normalized || !EMAIL_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
};

const getDeliverablePhone = (phone) => normalizeIndianMobile(phone);

const validateEmailUpdate = async (conn, userId, normalizedEmail) => {
  if (!normalizedEmail) {
    return {
      error: {
        status: 400,
        message: "Invalid email address",
      },
    };
  }

  const [[user]] = await conn.query(
    `
    SELECT email
    FROM users
    WHERE id = ?
      AND is_deleted = 0
    LIMIT 1
    `,
    [userId]
  );

  if (!user) {
    return {
      error: {
        status: 404,
        message: "User not found",
      },
    };
  }

  const currentEmail = getDeliverableEmail(user.email);

  if (currentEmail && currentEmail === normalizedEmail) {
    return {
      error: {
        status: 400,
        message: "This is already your current email address",
      },
    };
  }

  const [existingRows] = await conn.query(
    `
    SELECT id
    FROM users
    WHERE email = ?
      AND id != ?
      AND is_deleted = 0
      AND email IS NOT NULL
      AND email <> ''
    LIMIT 1
    `,
    [normalizedEmail, userId]
  );

  if (existingRows.length) {
    return {
      error: {
        status: 409,
        message: "Email address is already registered to another account",
      },
    };
  }

  return { ok: true };
};

router.put("/update-profile", auth(), async (req, res) => {

  let conn;

  try {

    conn = await db.getConnection();


    const {
      name,
      profile_picture,
      profession,
      whatsapp,
    } = req.body;

    const userId = Number(req.user?.id);

    const modifyBy = Number(
      req.user?.id
    );


    if (
      !Number.isInteger(userId) ||
      userId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid user_id is required",
      });
    }

    if (!modifyBy) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (
      name === undefined ||
      name === null ||
      typeof name !== "string" ||
      !name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }


    const normalizedName = name.trim();

    let normalizedProfession = undefined;

    if (profession !== undefined) {
      if (profession === null || profession === "") {
        normalizedProfession = null;
      } else if (typeof profession === "string") {
        normalizedProfession = profession.trim() || null;
      } else {
        return res.status(400).json({
          success: false,
          message: "profession must be a string",
        });
      }
    }

    let normalizedWhatsapp = undefined;

    if (whatsapp !== undefined) {
      if (whatsapp === null || whatsapp === "") {
        normalizedWhatsapp = null;
      } else if (typeof whatsapp === "string") {
        const digits = whatsapp.trim().replace(/\D/g, "");

        if (digits && !/^\d{10,15}$/.test(digits)) {
          return res.status(400).json({
            success: false,
            message: "Invalid WhatsApp number",
          });
        }

        normalizedWhatsapp = digits || null;
      } else {
        return res.status(400).json({
          success: false,
          message: "whatsapp must be a string",
        });
      }
    }

    let normalizedProfilePicture =
      undefined;


    if (
      profile_picture !== undefined
    ) {

      if (
        profile_picture === null ||
        profile_picture === ""
      ) {

        normalizedProfilePicture =
          null;
      }

      else if (
        typeof profile_picture ===
        "string"
      ) {

        const media =
          await saveMediaFromUrl({
            url: profile_picture,
            folder:
              "profile_picture",
            optimizeImage: true,
          });

        if (!media.success) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                media.message ||
                "Failed to upload profile picture",
            });
        }

        normalizedProfilePicture =
          media.file_url;
      }

      else {
        return res.status(400).json({
          success: false,
          message:
            "profile_picture must be a valid URL string",
        });
      }
    }


    const [existingRows] =
      await conn.query(
        `
          SELECT id
          FROM users
          WHERE id = ?
          AND is_deleted = 0
          LIMIT 1
          `,
        [userId]
      );

    if (!existingRows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }


    const updateFields = ["name = ?"];
    const values = [normalizedName];

    if (normalizedProfession !== undefined) {
      updateFields.push("profession = ?");
      values.push(normalizedProfession);
    }

    if (normalizedWhatsapp !== undefined) {
      updateFields.push("whatsapp = ?");
      values.push(normalizedWhatsapp);
    }

    if (
      normalizedProfilePicture !==
      undefined
    ) {
      updateFields.push(
        "profile_picture = ?"
      );

      values.push(
        normalizedProfilePicture
      );
    }

    updateFields.push(
      "updated_by = ?"
    );

    values.push(modifyBy);

    updateFields.push(
      "updated_at = NOW()"
    );

    values.push(userId);


    await conn.beginTransaction();

    await conn.query(
      `
        UPDATE users
        SET ${updateFields.join(", ")}
        WHERE id = ?
        `,
      values
    );

    await conn.commit();

    return res.status(200).json({
      success: true,
      message: "User profile updated successfully",
    });

  } catch (error) {

    console.error(
      "Error updating user profile:",
      error
    );

    if (conn) {
      try {
        await conn.rollback();
      } catch { }
    }

    return res.status(500).json({
      success: false,
      message:
        "Failed to update user profile",

      error:
        NODE_ENV ===
          "development"
          ? error.message
          : undefined,
    });

  } finally {

    if (conn) {
      conn.release();
    }
  }
}
);

router.post("/delete/request-otp", auth(), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const { email } = req.body;
    const requestedBy = req.user?.id;

    if (!requestedBy) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const [userRows] = await conn.query(
      `SELECT id, email FROM users 
       WHERE email=? AND is_deleted=0 
       LIMIT 1`,
      [email]
    );

    if (!userRows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = userRows[0];

    if (user.id !== requestedBy) {
      return res.status(403).json({
        success: false,
        message: "You can only request deletion for your own account",
      });
    }

    const [companies] = await conn.query(
      `SELECT id FROM companies 
       WHERE owner_user_id=? AND is_deleted=0`,
      [user.id]
    );

    if (companies.length) {
      return res.status(400).json({
        success: false,
        message: "User owns a company. Transfer ownership first.",
      });
    }

    const [recentOtp] = await conn.query(
      `SELECT id FROM otps
       WHERE email=? 
       AND created_at > NOW() - INTERVAL 30 SECOND
       LIMIT 1`,
      [email]
    );

    if (recentOtp.length) {
      return res.status(429).json({
        success: false,
        message: "Wait 30 seconds before requesting another OTP",
      });
    }

    const otp = generateOTP();
    const otpHash = await hashPassword(otp);
    const expiry = new Date(Date.now() + 5 * 60 * 1000);
    console.log(otp);

    await conn.query(
      `INSERT INTO otps 
       (email, otp_hash, otp_expiry, signup_attempts, login_attempts)
       VALUES (?, ?, ?, 0, 0)`,
      [email, otpHash, expiry]
    );

    queueDeleteAccountOTPEmail({
      to: email,
      otp,
      userName: user?.name || "User",
      fromEmail: EMAIL_USER,
      fromName: "OneAttendance Security",
      replyTo: email
    })
      .then(() => {
        if (NODE_ENV !== "production") {
          console.log(`Delete account OTP for ${email}: ${otp}`);
        }
      })
      .catch((err) => {
        console.error("DELETE ACCOUNT OTP EMAIL ERROR:", err);
      });

    if (user?.phone) {
      sendOtpSms(user.phone, otp).catch(err => console.error("DELETE ACCOUNT OTP SMS ERROR:", err.message));
      sendOtpWhatsApp(user.phone, otp).catch(err => console.error("DELETE ACCOUNT OTP WHATSAPP ERROR:", err.message));
    }

    return res.json({
      success: true,
      message: "OTP sent to email"
    });
  } catch (error) {
    console.error("REQUEST DELETE OTP ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });

  } finally {
    if (conn) conn.release();
  }
});

router.delete("/delete/confirm", auth(), async (req, res) => {
  let conn;
  let tx = false;

  try {
    conn = await db.getConnection();

    const { email, otp } = req.body;
    const deletedBy = req.user?.id;

    if (!deletedBy) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email & OTP required",
      });
    }

    await conn.beginTransaction();
    tx = true;

    const [userRows] = await conn.query(
      `SELECT id FROM users WHERE email=? AND is_deleted=0 LIMIT 1`,
      [email]
    );

    if (!userRows.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const userId = userRows[0].id;

    const [otpRows] = await conn.query(
      `SELECT id, otp_hash, otp_expiry, is_verified
       FROM otps
       WHERE email=? AND is_verified=0
       ORDER BY id DESC
       LIMIT 1`,
      [email]
    );

    if (!otpRows.length) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "OTP not found" });
    }

    const otpData = otpRows[0];

    if (new Date(otpData.otp_expiry) < new Date()) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    const isValid = await comparePassword(otp, otpData.otp_hash);

    if (!isValid) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    await conn.query(
      `UPDATE otps SET is_verified=1 WHERE id=?`,
      [otpData.id]
    );

    const [companies] = await conn.query(
      `SELECT id FROM companies WHERE owner_user_id=? AND is_deleted=0`,
      [userId]
    );

    if (companies.length) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "User owns a company. Transfer ownership first.",
      });
    }

    const [employees] = await conn.query(
      `SELECT id FROM employees WHERE user_id=? AND is_deleted=0`,
      [userId]
    );

    const employeeIds = employees.map(e => e.id);

    if (employeeIds.length) {
      await conn.query(
        `UPDATE company_employee_permissions
         SET is_active=0, deleted_at=NOW(), deleted_by=?
         WHERE employee_id IN (?)`,
        [deletedBy, employeeIds]
      );

      await conn.query(
        `UPDATE employees
         SET is_deleted=1, deleted_at=NOW(), deleted_by=?
         WHERE id IN (?)`,
        [deletedBy, employeeIds]
      );
    }

    await conn.query(
      `UPDATE sessions
       SET is_active=0,
           forced_logged_out=1,
           forced_logged_out_by_id=?,
           updated_at=NOW(),
           updated_by=?
       WHERE user_id=? AND is_active=1`,
      [deletedBy, deletedBy, userId]
    );

    await conn.query(
      `UPDATE users
       SET is_deleted=1,
           deleted_at=NOW(),
           deleted_by=?,
           updated_by=?,
           updated_at=NOW()
       WHERE id=?`,
      [deletedBy, deletedBy, userId]
    );

    await conn.commit();

    return res.json({
      success: true,
      message: "Account deleted successfully",
    });

  } catch (error) {
    if (tx) await conn.rollback();

    console.error("DELETE CONFIRM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Delete failed",
    });

  } finally {
    if (conn) conn.release();
  }
});

router.get("/profile-role", auth(), async (req, res) => {

  let conn;

  try {

    conn = await db.getConnection();

    const userId = Number(req.user?.id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const toBoolean = (value) => Number(value) === 1;

    const safeParse = (value) => {

      if (!value) return [];

      if (Array.isArray(value)) {
        return value;
      }

      try {
        return JSON.parse(value);
      } catch {
        return [];
      }

    };


    const [users] = await conn.query(
      `
      SELECT
        id,
        email,
        phone,
        name,
        profession,
        whatsapp,
        is_active,
        is_system_admin,
        created_at,
        profile_picture
      FROM users
      WHERE id = ?
      AND is_deleted = 0
      LIMIT 1
      `,
      [userId]
    );

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const user = users[0];

    user.is_active = toBoolean(user.is_active);

    user.is_system_admin = toBoolean(
      user.is_system_admin
    );

    user.profile_picture = buildFileUrl(user.profile_picture);

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "User account is inactive"
      });
    }

    const [allPermissions] = await conn.query(
      `
      SELECT
        id,
        action,
        code,
        name
      FROM permissions
      `
    );

    const fullPermissions = allPermissions.map(p => ({
      ...p,
      is_allowed: 1
    }));

    const [ownedCompaniesRaw] = await conn.query(
      `
      SELECT
        id,
        owner_user_id,
        name,
        legal_name,
        logo_url,
        is_active,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        country,
        latitude,
        longitude,
        company_ips,
        attendance_methods,
        transaction_currency
      FROM companies
      WHERE owner_user_id = ?
      AND is_deleted = 0
      AND is_active = 1
      `,
      [userId]
    );

    const owned_companies = ownedCompaniesRaw.map(comp => ({
      ...comp,

      logo_url: buildFileUrl(comp.logo_url),

      is_active: toBoolean(comp.is_active),

      company_ips: safeParse(comp.company_ips),

      attendance_methods: safeParse(
        comp.attendance_methods
      ),
      transaction_currency: comp.transaction_currency,

      role: "company_owner",

      permissions: fullPermissions
    }));

    const [employees] = await conn.query(
      `
      SELECT
        e.id,
        e.company_id,
        e.designation,
        e.salary_type,
        e.employment_type,
        e.permission_package_id,
        e.attendance_methods AS emp_attendance_methods,
        e.is_auto,

        c.owner_user_id,
        c.name,
        c.legal_name,
        c.logo_url,
        c.is_active AS company_is_active,
        c.address_line1,
        c.address_line2,
        c.city,
        c.state,
        c.postal_code,
        c.country,
        c.latitude,
        c.longitude,
        c.company_ips,
        c.attendance_methods AS company_attendance_methods,
        c.transaction_currency

      FROM employees e

      INNER JOIN companies c
        ON c.id = e.company_id
        AND c.is_deleted = 0
        AND c.is_active = 1

      WHERE e.user_id = ?
      AND e.is_deleted = 0
      AND LOWER(e.status) = 'active'
      `,
      [userId]
    );

    const packageIds = [
      ...new Set(
        employees
          .map(e => e.permission_package_id)
          .filter(Boolean)
      )
    ];

    const employeeIds = employees.map(e => e.id);

    let permissionMap = {};

    if (packageIds.length) {

      const [permissionRows] = await conn.query(
        `
        SELECT
          package_id,
          permission_id
        FROM permission_package_items
        WHERE package_id IN (?)
        AND is_active = 1
        AND is_deleted = 0
        `,
        [packageIds]
      );

      permissionMap = permissionRows.reduce(
        (acc, row) => {

          if (!acc[row.package_id]) {
            acc[row.package_id] = new Set();
          }

          acc[row.package_id].add(
            row.permission_id
          );

          return acc;

        },
        {}
      );

    }

    let attendanceMap = {};

    for (const emp of employees) {
      const empMethods = safeParse(emp.emp_attendance_methods, []);
      const compMethods = new Set(safeParse(emp.company_attendance_methods, []));
      attendanceMap[emp.id] = empMethods
        .filter(m => compMethods.has(m))
        .map(m => ({
          method: m,
          is_auto: toBoolean(emp.is_auto)
        }));
    }

    const employeeCompanies = employees.map(emp => {

      const allowedSet =
        permissionMap[
        emp.permission_package_id
        ] || new Set();

      const permissions = allPermissions.map(p => ({
        ...p,
        is_allowed: allowedSet.has(p.id) ? 1 : 0
      }));

      const isAlsoOwner = owned_companies.some(
        c => c.id === emp.company_id
      );

      return {
        id: emp.company_id,

        owner_user_id: emp.owner_user_id,

        employee_id: emp.id,

        name: emp.name,
        designation: getEnumObject(DESIGNATIONS, emp.designation),

        employment_type: getEnumObject(EMPLOYMENT_TYPES, emp.employment_type),

        salary_type: getEnumObject(SALARY_TYPES, emp.salary_type),

        legal_name: emp.legal_name,

        logo_url: buildFileUrl(emp.logo_url),

        is_active: toBoolean(
          emp.company_is_active
        ),

        address_line1: emp.address_line1,
        address_line2: emp.address_line2,
        city: emp.city,
        state: emp.state,
        postal_code: emp.postal_code,
        country: emp.country,

        latitude: emp.latitude,
        longitude: emp.longitude,

        company_ips: safeParse(
          emp.company_ips
        ),
        transaction_currency: emp.transaction_currency,

        attendance_methods:
          attendanceMap[emp.id] || [],

        role: isAlsoOwner
          ? "company_owner_employee"
          : "employee",

        permissions
      };

    });

    const isOwner =
      owned_companies.length > 0;

    const isEmployee =
      employeeCompanies.length > 0;

    let role = "user";

    if (isOwner && isEmployee) {
      role = "owner_employee";
    } else if (isOwner) {
      role = "company_owner";
    } else if (isEmployee) {
      role = "employee";
    }

    return res.status(200).json({
      success: true,
      message: "Profile fetched successfully",

      role,

      data: {
        user,

        companies: {
          owned_companies,
          companies: employeeCompanies
        },

        meta: {
          is_owner: isOwner,
          is_employee: isEmployee,
          is_system_admin: user.is_system_admin
        }
      }
    });

  } catch (error) {

    console.error(
      "Profile Role API Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",

      error:
        NODE_ENV === "development"
          ? error.message
          : undefined
    });

  } finally {

    if (conn) {
      conn.release();
    }

  }

});

router.put("/update-password", auth(), async (req, res) => {
  let conn;
  let transactionStarted = false;

  try {
    const { old_password, new_password, keep_login } = req.body || {};
    const userId = req.user?.id;
    const currentSessionId = req.session?.id;
    const keepLogin = keep_login === true;

    if (!userId || !currentSessionId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!old_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: "old_password and new_password are required",
      });
    }

    conn = await db.getConnection();

    const [users] = await conn.query(
      `
      SELECT id, password
      FROM users
      WHERE id = ?
        AND is_deleted = 0
      LIMIT 1
      `,
      [userId]
    );

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = users[0];

    const isMatch = await comparePassword(old_password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Old password is incorrect",
      });
    }

    const hashedPassword = await hashPassword(new_password);

    await conn.beginTransaction();
    transactionStarted = true;

    await conn.query(
      `
      UPDATE users
      SET password = ?,
          updated_by = ?,
          updated_at = NOW()
      WHERE id = ?
      `,
      [hashedPassword, userId, userId]
    );

    let loggedOutSessions = 0;

    if (!keepLogin) {
      const [sessionResult] = await conn.query(
        `
        UPDATE sessions
        SET is_active = 0,
            forced_logged_out = 1,
            forced_logged_out_by_id = ?
        WHERE user_id = ?
          AND id != ?
          AND is_active = 1
        `,
        [userId, userId, currentSessionId]
      );

      loggedOutSessions = sessionResult.affectedRows;
    }

    await conn.commit();
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      message: keepLogin
        ? "Password updated successfully"
        : "Password updated successfully. Other devices have been logged out.",
      data: {
        keep_login: keepLogin,
        other_sessions_logged_out: loggedOutSessions,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await conn.rollback();
      } catch (_) {
      }
    }

    console.error("Password update error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update password",
      error:
        NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.post("/request-update-phone-otp", auth(), async (req, res) => {
  let conn;

  try {
    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const { phone } = req.body || {};
    const normalizedPhone = normalizeIndianMobile(phone);

    conn = await db.getConnection();

    const phoneCheck = await validatePhoneUpdate(conn, userId, normalizedPhone);

    if (phoneCheck.error) {
      return sendError(
        res,
        phoneCheck.error.status,
        phoneCheck.error.message
      );
    }

    const [[user]] = await conn.query(
      `
      SELECT email, name
      FROM users
      WHERE id = ?
        AND is_deleted = 0
      LIMIT 1
      `,
      [userId]
    );

    const userEmail = getDeliverableEmail(user?.email);

    if (!userEmail) {
      return sendError(
        res,
        400,
        "A registered email is required to verify phone number update"
      );
    }

    const clientMeta = getClientMeta(req);
    const ip =
      clientMeta?.ip_v4 ||
      clientMeta?.ip_v6 ||
      req.ip ||
      "0.0.0.0";

    const [[recentOtp]] = await conn.query(
      `
      SELECT COUNT(*) AS count
      FROM otps
      WHERE email = ?
        AND phone = ?
        AND otp_purpose = 'update_phone'
        AND created_at > NOW() - INTERVAL 30 SECOND
      `,
      [userEmail, normalizedPhone]
    );

    if (recentOtp.count > 0) {
      return sendError(res, 429, "Wait 30 seconds before requesting another OTP");
    }

    const otp =
      NODE_ENV === "production"
        ? String(generateOTP())
        : "123456";

    const otpHash = await hashPassword(otp);
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    await conn.query(
      `
      UPDATE otps
      SET used_at = NOW()
      WHERE email = ?
        AND phone = ?
        AND otp_purpose = 'update_phone'
        AND used_at IS NULL
      `,
      [userEmail, normalizedPhone]
    );

    await conn.query(
      `
      INSERT INTO otps (
        email,
        phone,
        otp_purpose,
        otp_hash,
        otp_expiry,
        used_at,
        ip_address
      )
      VALUES (?, ?, 'update_phone', ?, ?, NULL, ?)
      `,
      [userEmail, normalizedPhone, otpHash, otpExpiry, ip]
    );

    try {
      await queuePhoneUpdateOTPEmail({
        to: userEmail,
        otp,
        userName: user?.name || "User",
        phone: normalizedPhone,
        fromEmail: EMAIL_USER,
        fromName: "OneAttendance Security",
        replyTo: userEmail
      });
    } catch (emailErr) {
      console.error("UPDATE PHONE OTP EMAIL QUEUE ERROR:", emailErr.message);
      return sendError(res, 500, "Failed to queue phone update OTP email");
    }

    if (normalizedPhone) {
      try {
        await sendOtpSms(normalizedPhone, otp);
      } catch (smsErr) {
        console.error("UPDATE PHONE OTP SMS ERROR:", smsErr.message);
      }
      try {
        await sendOtpWhatsApp(normalizedPhone, otp);
      } catch (waErr) {
        console.error("UPDATE PHONE OTP WHATSAPP ERROR:", waErr.message);
      }
    }

    if (NODE_ENV !== "production") {
      console.log(`UPDATE PHONE OTP for ${userEmail} (${normalizedPhone}): ${otp}`);
    }

    return sendSuccess(res, 200, "OTP sent to your registered email");
  } catch (err) {
    console.error("REQUEST UPDATE PHONE OTP ERROR:", err);
    return sendError(res, 500, "Failed to send phone update OTP");
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.put("/verify-update-phone-otp", auth(), async (req, res) => {
  let conn;
  let transactionStarted = false;

  try {
    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const { phone, otp } = req.body || {};

    if (!otp || typeof otp !== "string") {
      return sendError(res, 400, "OTP is required");
    }

    const normalizedPhone = normalizeIndianMobile(phone);

    conn = await db.getConnection();

    const phoneCheck = await validatePhoneUpdate(conn, userId, normalizedPhone);

    if (phoneCheck.error) {
      return sendError(
        res,
        phoneCheck.error.status,
        phoneCheck.error.message
      );
    }

    const [[user]] = await conn.query(
      `
      SELECT email
      FROM users
      WHERE id = ?
        AND is_deleted = 0
      LIMIT 1
      `,
      [userId]
    );

    const userEmail = getDeliverableEmail(user?.email);

    if (!userEmail) {
      return sendError(
        res,
        400,
        "A registered email is required to verify phone number update"
      );
    }

    await conn.beginTransaction();
    transactionStarted = true;

    const [otpRows] = await conn.query(
      `
      SELECT
        id,
        otp_hash,
        otp_expiry,
        used_at
      FROM otps
      WHERE email = ?
        AND phone = ?
        AND otp_purpose = 'update_phone'
        AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
      `,
      [userEmail, normalizedPhone]
    );

    if (!otpRows.length) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return sendError(res, 400, "OTP not found or expired");
    }

    const record = otpRows[0];

    if (new Date() > new Date(record.otp_expiry)) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return sendError(res, 400, "OTP expired");
    }

    const isOtpValid = await verifyOtpHash(otp.trim(), record.otp_hash);

    if (!isOtpValid) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return sendError(res, 400, "Invalid OTP");
    }

    const [duplicateRows] = await conn.query(
      `
      SELECT id
      FROM users
      WHERE phone = ?
        AND id != ?
        AND is_deleted = 0
        AND phone IS NOT NULL
        AND phone <> ''
      LIMIT 1
      FOR UPDATE
      `,
      [normalizedPhone, userId]
    );

    if (duplicateRows.length) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return sendError(
        res,
        409,
        "Phone number is already registered to another account"
      );
    }

    await conn.query(
      `
      UPDATE users
      SET phone = ?,
          updated_at = NOW(),
          updated_by = ?
      WHERE id = ?
        AND is_deleted = 0
      `,
      [normalizedPhone, userId, userId]
    );

    await conn.query(
      `
      UPDATE otps
      SET is_verified = 1,
          verified_at = NOW(),
          used_at = NOW()
      WHERE id = ?
      `,
      [record.id]
    );

    await conn.commit();
    transactionStarted = false;

    return sendSuccess(res, 200, "Phone number updated successfully", {
      phone: normalizedPhone,
    });
  } catch (err) {
    await rollbackTransaction(conn, transactionStarted);
    transactionStarted = false;

    if (err.code === "ER_DUP_ENTRY") {
      return sendError(
        res,
        409,
        "Phone number is already registered to another account"
      );
    }

    console.error("VERIFY UPDATE PHONE OTP ERROR:", err);
    return sendError(res, 500, "Failed to update phone number");
  } finally {
    await rollbackTransaction(conn, transactionStarted);

    if (conn) {
      conn.release();
    }
  }
});

router.post("/request-update-email-otp", auth(), async (req, res) => {
  let conn;

  try {
    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const { email } = req.body || {};
    const normalizedEmail = normalizeEmail(email);

    conn = await db.getConnection();

    const emailCheck = await validateEmailUpdate(conn, userId, normalizedEmail);

    if (emailCheck.error) {
      return sendError(
        res,
        emailCheck.error.status,
        emailCheck.error.message
      );
    }

    const [[user]] = await conn.query(
      `
      SELECT email, phone, name
      FROM users
      WHERE id = ?
        AND is_deleted = 0
      LIMIT 1
      `,
      [userId]
    );

    const userPhone = getDeliverablePhone(user?.phone);

    if (!userPhone) {
      return sendError(
        res,
        400,
        "A registered phone number is required to verify email update"
      );
    }

    const clientMeta = getClientMeta(req);
    const ip =
      clientMeta?.ip_v4 ||
      clientMeta?.ip_v6 ||
      req.ip ||
      "0.0.0.0";

    const [[recentOtp]] = await conn.query(
      `
      SELECT COUNT(*) AS count
      FROM otps
      WHERE email = ?
        AND phone = ?
        AND otp_purpose = 'update_email'
        AND created_at > NOW() - INTERVAL 30 SECOND
      `,
      [normalizedEmail, userPhone]
    );

    if (recentOtp.count > 0) {
      return sendError(res, 429, "Wait 30 seconds before requesting another OTP");
    }

    const otp =
      NODE_ENV === "production"
        ? String(generateOTP())
        : "123456";

    const otpHash = await hashPassword(otp);
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    await conn.query(
      `
      UPDATE otps
      SET used_at = NOW()
      WHERE email = ?
        AND phone = ?
        AND otp_purpose = 'update_email'
        AND used_at IS NULL
      `,
      [normalizedEmail, userPhone]
    );

    await conn.query(
      `
      INSERT INTO otps (
        email,
        phone,
        otp_purpose,
        otp_hash,
        otp_expiry,
        used_at,
        ip_address
      )
      VALUES (?, ?, 'update_email', ?, ?, NULL, ?)
      `,
      [normalizedEmail, userPhone, otpHash, otpExpiry, ip]
    );

    try {
      await sendEmailUpdateOTP({
        phone: userPhone,
        otp,
        userName: user?.name || "User",
      });
    } catch (smsErr) {
      console.error("UPDATE EMAIL OTP SMS ERROR:", smsErr.message);
      return sendError(res, 500, "Failed to send email update OTP");
    }

    if (NODE_ENV !== "production") {
      console.log(`UPDATE EMAIL OTP for ${normalizedEmail} (SMS ${userPhone}): ${otp}`);
    }

    return sendSuccess(res, 200, "OTP sent to your registered phone number");
  } catch (err) {
    console.error("REQUEST UPDATE EMAIL OTP ERROR:", err);
    return sendError(res, 500, "Failed to send email update OTP");
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.put("/verify-update-email-otp", auth(), async (req, res) => {
  let conn;
  let transactionStarted = false;

  try {
    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const { email, otp } = req.body || {};

    if (!otp || typeof otp !== "string") {
      return sendError(res, 400, "OTP is required");
    }

    const normalizedEmail = normalizeEmail(email);

    conn = await db.getConnection();

    const emailCheck = await validateEmailUpdate(conn, userId, normalizedEmail);

    if (emailCheck.error) {
      return sendError(
        res,
        emailCheck.error.status,
        emailCheck.error.message
      );
    }

    const [[user]] = await conn.query(
      `
      SELECT phone
      FROM users
      WHERE id = ?
        AND is_deleted = 0
      LIMIT 1
      `,
      [userId]
    );

    const userPhone = getDeliverablePhone(user?.phone);

    if (!userPhone) {
      return sendError(
        res,
        400,
        "A registered phone number is required to verify email update"
      );
    }

    await conn.beginTransaction();
    transactionStarted = true;

    const [otpRows] = await conn.query(
      `
      SELECT
        id,
        otp_hash,
        otp_expiry,
        used_at
      FROM otps
      WHERE email = ?
        AND phone = ?
        AND otp_purpose = 'update_email'
        AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
      `,
      [normalizedEmail, userPhone]
    );

    if (!otpRows.length) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return sendError(res, 400, "OTP not found or expired");
    }

    const record = otpRows[0];

    if (new Date() > new Date(record.otp_expiry)) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return sendError(res, 400, "OTP expired");
    }

    const isOtpValid = await verifyOtpHash(otp.trim(), record.otp_hash);

    if (!isOtpValid) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return sendError(res, 400, "Invalid OTP");
    }

    const [duplicateRows] = await conn.query(
      `
      SELECT id
      FROM users
      WHERE email = ?
        AND id != ?
        AND is_deleted = 0
        AND email IS NOT NULL
        AND email <> ''
      LIMIT 1
      FOR UPDATE
      `,
      [normalizedEmail, userId]
    );

    if (duplicateRows.length) {
      await rollbackTransaction(conn, transactionStarted);
      transactionStarted = false;
      return sendError(
        res,
        409,
        "Email address is already registered to another account"
      );
    }

    await conn.query(
      `
      UPDATE users
      SET email = ?,
          updated_at = NOW(),
          updated_by = ?
      WHERE id = ?
        AND is_deleted = 0
      `,
      [normalizedEmail, userId, userId]
    );

    await conn.query(
      `
      UPDATE otps
      SET is_verified = 1,
          verified_at = NOW(),
          used_at = NOW()
      WHERE id = ?
      `,
      [record.id]
    );

    await conn.commit();
    transactionStarted = false;

    return sendSuccess(res, 200, "Email updated successfully", {
      email: normalizedEmail,
    });
  } catch (err) {
    await rollbackTransaction(conn, transactionStarted);
    transactionStarted = false;

    if (err.code === "ER_DUP_ENTRY") {
      return sendError(
        res,
        409,
        "Email address is already registered to another account"
      );
    }

    console.error("VERIFY UPDATE EMAIL OTP ERROR:", err);
    return sendError(res, 500, "Failed to update email address");
  } finally {
    await rollbackTransaction(conn, transactionStarted);

    if (conn) {
      conn.release();
    }
  }
});

export default router;
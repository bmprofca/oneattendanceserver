import express from "express";
import db from "../config/db.js";
import adminAuth from "../middleware/adminAuthMiddleware.js";
import { hashPassword } from "../utils/auth.js";
import {
  sendSuccess,
  sendError,
  buildMeta,
} from "../utils/sendResponse.js";
import { normalizeTenDigitMobile } from "../utils/mobile.js";

const router = express.Router();

// ─── All admin user routes require admin auth ──────────────────
router.use(adminAuth());

// ─── GET /admin/users — List all users (paginated) ────────────

router.get("/", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    let { page = 1, limit = 20, search, is_active } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const conditions = ["u.is_deleted = 0"];
    const params = [];

    if (search && typeof search === "string" && search.trim()) {
      conditions.push("(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)");
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }

    if (is_active !== undefined && is_active !== "") {
      conditions.push("u.is_active = ?");
      params.push(Number(is_active) ? 1 : 0);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM users u ${whereClause}`,
      params
    );

    const [rows] = await conn.query(
      `
      SELECT
        u.id,
        u.email,
        u.phone,
        u.name,
        u.profile_picture,
        u.profession,
        u.whatsapp,
        u.is_active,
        u.is_system_admin,
        u.last_login,
        u.created_at,
        u.updated_at
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return sendSuccess(res, 200, "Users fetched successfully", rows, buildMeta(page, limit, total, rows.length));
  } catch (err) {
    console.error("ADMIN GET USERS ERROR:", err);
    return sendError(res, 500, "Failed to fetch users");
  } finally {
    if (conn) conn.release();
  }
});

// ─── GET /admin/users/:id — Get single user ───────────────────

router.get("/:id", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const userId = parseInt(req.params.id);
    if (!userId || userId <= 0) {
      return sendError(res, 400, "Valid user ID is required");
    }

    const [[user]] = await conn.query(
      `
      SELECT
        u.id,
        u.email,
        u.phone,
        u.name,
        u.profile_picture,
        u.profession,
        u.whatsapp,
        u.is_active,
        u.is_system_admin,
        u.last_login,
        u.created_at,
        u.created_by,
        u.updated_at,
        u.updated_by
      FROM users u
      WHERE u.id = ? AND u.is_deleted = 0
      LIMIT 1
      `,
      [userId]
    );

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    return sendSuccess(res, 200, "User fetched successfully", user);
  } catch (err) {
    console.error("ADMIN GET USER ERROR:", err);
    return sendError(res, 500, "Failed to fetch user");
  } finally {
    if (conn) conn.release();
  }
});

// ─── POST /admin/users — Create new user ──────────────────────

router.post("/", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const {
      email,
      phone,
      password,
      name,
      profile_picture,
      profession,
      whatsapp,
      is_active = 1,
      is_system_admin = 0,
    } = req.body || {};

    // Validate: at least email or phone
    const normalizedEmail = email?.trim()?.toLowerCase() || null;
    const normalizedPhone = normalizeTenDigitMobile(phone) || null;

    if (!normalizedEmail && !normalizedPhone) {
      return sendError(res, 400, "Email or phone is required");
    }

    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return sendError(res, 400, "Invalid email format");
    }

    if (normalizedPhone && normalizedPhone.length !== 10) {
      return sendError(res, 400, "Invalid phone number (must be 10 digits)");
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return sendError(res, 400, "Password must be at least 6 characters");
    }

    // Check for duplicates
    if (normalizedEmail) {
      const [[existing]] = await conn.query(
        "SELECT id FROM users WHERE email = ? AND is_deleted = 0 LIMIT 1",
        [normalizedEmail]
      );
      if (existing) {
        return sendError(res, 409, "Email already registered");
      }
    }

    if (normalizedPhone) {
      const [[existing]] = await conn.query(
        "SELECT id FROM users WHERE phone = ? AND is_deleted = 0 LIMIT 1",
        [normalizedPhone]
      );
      if (existing) {
        return sendError(res, 409, "Phone already registered");
      }
    }

    const hashed = await hashPassword(password);

    const [result] = await conn.query(
      `
      INSERT INTO users
        (email, phone, password, name, profile_picture, profession, whatsapp,
         is_active, is_system_admin, created_at, created_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW())
      `,
      [
        normalizedEmail || "",
        normalizedPhone || "",
        hashed,
        name?.trim() || null,
        profile_picture || null,
        profession?.trim() || null,
        whatsapp?.trim() || null,
        is_active ? 1 : 0,
        is_system_admin ? 1 : 0,
        req.admin.id,
      ]
    );

    return sendSuccess(res, 201, "User created successfully", {
      id: result.insertId,
    });
  } catch (err) {
    console.error("ADMIN CREATE USER ERROR:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return sendError(res, 409, "Email or phone already registered");
    }
    return sendError(res, 500, "Failed to create user");
  } finally {
    if (conn) conn.release();
  }
});

// ─── PUT /admin/users/:id — Update user ───────────────────────

router.put("/:id", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const userId = parseInt(req.params.id);
    if (!userId || userId <= 0) {
      return sendError(res, 400, "Valid user ID is required");
    }

    const [[existing]] = await conn.query(
      "SELECT id FROM users WHERE id = ? AND is_deleted = 0 LIMIT 1",
      [userId]
    );
    if (!existing) {
      return sendError(res, 404, "User not found");
    }

    const {
      name,
      email,
      phone,
      profile_picture,
      profession,
      whatsapp,
      is_active,
      is_system_admin,
    } = req.body || {};

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name?.trim() || null);
    }

    if (email !== undefined) {
      const normalizedEmail = email?.trim()?.toLowerCase() || null;
      if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return sendError(res, 400, "Invalid email format");
      }
      // Check duplicate
      if (normalizedEmail) {
        const [[dup]] = await conn.query(
          "SELECT id FROM users WHERE email = ? AND id != ? AND is_deleted = 0 LIMIT 1",
          [normalizedEmail, userId]
        );
        if (dup) {
          return sendError(res, 409, "Email already in use");
        }
      }
      updates.push("email = ?");
      params.push(normalizedEmail || "");
    }

    if (phone !== undefined) {
      const normalizedPhone = normalizeTenDigitMobile(phone) || null;
      if (normalizedPhone && normalizedPhone.length !== 10) {
        return sendError(res, 400, "Invalid phone number (must be 10 digits)");
      }
      if (normalizedPhone) {
        const [[dup]] = await conn.query(
          "SELECT id FROM users WHERE phone = ? AND id != ? AND is_deleted = 0 LIMIT 1",
          [normalizedPhone, userId]
        );
        if (dup) {
          return sendError(res, 409, "Phone already in use");
        }
      }
      updates.push("phone = ?");
      params.push(normalizedPhone || "");
    }

    if (profile_picture !== undefined) {
      updates.push("profile_picture = ?");
      params.push(profile_picture || null);
    }

    if (profession !== undefined) {
      updates.push("profession = ?");
      params.push(profession?.trim() || null);
    }

    if (whatsapp !== undefined) {
      updates.push("whatsapp = ?");
      params.push(whatsapp?.trim() || null);
    }

    if (is_active !== undefined) {
      updates.push("is_active = ?");
      params.push(is_active ? 1 : 0);
    }

    if (is_system_admin !== undefined) {
      updates.push("is_system_admin = ?");
      params.push(is_system_admin ? 1 : 0);
    }

    if (updates.length === 0) {
      return sendError(res, 400, "No fields to update");
    }

    updates.push("updated_by = ?");
    params.push(req.admin.id);
    updates.push("updated_at = NOW()");
    params.push(userId);

    await conn.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    return sendSuccess(res, 200, "User updated successfully");
  } catch (err) {
    console.error("ADMIN UPDATE USER ERROR:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return sendError(res, 409, "Email or phone already in use");
    }
    return sendError(res, 500, "Failed to update user");
  } finally {
    if (conn) conn.release();
  }
});

// ─── DELETE /admin/users/:id — Soft-delete user ───────────────

router.delete("/:id", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const userId = parseInt(req.params.id);
    if (!userId || userId <= 0) {
      return sendError(res, 400, "Valid user ID is required");
    }

    // Prevent self-deletion
    if (userId === req.admin.id) {
      return sendError(res, 400, "Cannot delete your own account");
    }

    const [[existing]] = await conn.query(
      "SELECT id FROM users WHERE id = ? AND is_deleted = 0 LIMIT 1",
      [userId]
    );
    if (!existing) {
      return sendError(res, 404, "User not found");
    }

    await conn.query(
      `
      UPDATE users
      SET is_deleted = 1, is_active = 0, deleted_at = NOW(), deleted_by = ?, updated_at = NOW()
      WHERE id = ?
      `,
      [req.admin.id, userId]
    );

    // Also deactivate all sessions for the deleted user
    await conn.query(
      `UPDATE sessions SET is_active = 0, forced_logged_out = 1, forced_logged_out_by_id = ? WHERE user_id = ? AND is_active = 1`,
      [req.admin.id, userId]
    );

    return sendSuccess(res, 200, "User deleted successfully");
  } catch (err) {
    console.error("ADMIN DELETE USER ERROR:", err);
    return sendError(res, 500, "Failed to delete user");
  } finally {
    if (conn) conn.release();
  }
});

export default router;

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

    const conditions = ["u.is_deleted = 0", "u.is_system_admin = 0"];
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

export default router;

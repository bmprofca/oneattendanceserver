import express from "express";
import db from "../config/db.js";
import adminAuth from "../middleware/adminAuthMiddleware.js";
import {
  sendSuccess,
  sendError,
  buildMeta,
} from "../utils/sendResponse.js";

const router = express.Router();

// ─── All admin company routes require admin auth ───────────────
router.use(adminAuth());

// ─── GET /admin/companies — List all companies (paginated) ────

router.get("/", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    let { page = 1, limit = 20, search, is_active } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const conditions = ["c.is_deleted = 0"];
    const params = [];

    if (search && typeof search === "string" && search.trim()) {
      conditions.push(
        "(c.name LIKE ? OR c.legal_name LIKE ? OR u.name LIKE ? OR u.email LIKE ?)"
      );
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    if (is_active !== undefined && is_active !== "") {
      conditions.push("c.is_active = ?");
      params.push(Number(is_active) ? 1 : 0);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const [[{ total }]] = await conn.query(
      `
      SELECT COUNT(*) AS total
      FROM companies c
      LEFT JOIN users u ON u.id = c.owner_user_id
      ${whereClause}
      `,
      params
    );

    const [rows] = await conn.query(
      `
      SELECT
        c.id,
        c.name,
        c.legal_name,
        c.logo_url,
        c.is_active,
        c.owner_user_id,
        u.name AS owner_name,
        u.email AS owner_email,
        u.phone AS owner_phone,
        c.address_line1,
        c.address_line2,
        c.city,
        c.state,
        c.postal_code,
        c.country,
        c.gst_no,
        c.transaction_currency,
        c.created_at,
        c.updated_at
      FROM companies c
      LEFT JOIN users u ON u.id = c.owner_user_id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return sendSuccess(
      res,
      200,
      "Companies fetched successfully",
      rows,
      buildMeta(page, limit, total, rows.length)
    );
  } catch (err) {
    console.error("ADMIN GET COMPANIES ERROR:", err);
    return sendError(res, 500, "Failed to fetch companies");
  } finally {
    if (conn) conn.release();
  }
});



export default router;

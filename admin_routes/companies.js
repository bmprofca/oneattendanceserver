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

// ─── GET /admin/companies/:id — Get single company ────────────

router.get("/:id", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const companyId = parseInt(req.params.id);
    if (!companyId || companyId <= 0) {
      return sendError(res, 400, "Valid company ID is required");
    }

    const [[company]] = await conn.query(
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
        c.latitude,
        c.longitude,
        c.company_ips,
        c.attendance_methods,
        c.transaction_currency,
        c.max_distance,
        c.gst_no,
        c.created_at,
        c.created_by,
        c.updated_at,
        c.updated_by
      FROM companies c
      LEFT JOIN users u ON u.id = c.owner_user_id
      WHERE c.id = ? AND c.is_deleted = 0
      LIMIT 1
      `,
      [companyId]
    );

    if (!company) {
      return sendError(res, 404, "Company not found");
    }

    return sendSuccess(res, 200, "Company fetched successfully", company);
  } catch (err) {
    console.error("ADMIN GET COMPANY ERROR:", err);
    return sendError(res, 500, "Failed to fetch company");
  } finally {
    if (conn) conn.release();
  }
});

// ─── POST /admin/companies — Create new company ───────────────

router.post("/", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const {
      name,
      owner_user_id,
      legal_name,
      logo_url,
      is_active = 1,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country,
      latitude,
      longitude,
      transaction_currency,
      max_distance,
      gst_no,
    } = req.body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return sendError(res, 400, "Company name is required");
    }

    if (!owner_user_id || !Number.isInteger(Number(owner_user_id)) || Number(owner_user_id) <= 0) {
      return sendError(res, 400, "Valid owner_user_id is required");
    }

    // Verify owner exists
    const [[owner]] = await conn.query(
      "SELECT id FROM users WHERE id = ? AND is_deleted = 0 AND is_active = 1 LIMIT 1",
      [owner_user_id]
    );

    if (!owner) {
      return sendError(res, 404, "Owner user not found or inactive");
    }

    const [result] = await conn.query(
      `
      INSERT INTO companies
        (owner_user_id, name, legal_name, logo_url, is_active,
         address_line1, address_line2, city, state, postal_code, country,
         latitude, longitude, transaction_currency, max_distance, gst_no,
         created_at, created_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW())
      `,
      [
        owner_user_id,
        name.trim(),
        legal_name?.trim() || null,
        logo_url || null,
        is_active ? 1 : 0,
        address_line1?.trim() || null,
        address_line2?.trim() || null,
        city?.trim() || null,
        state?.trim() || null,
        postal_code?.trim() || null,
        country?.trim() || null,
        latitude || null,
        longitude || null,
        transaction_currency?.trim() || null,
        max_distance || null,
        gst_no?.trim() || null,
        req.admin.id,
      ]
    );

    return sendSuccess(res, 201, "Company created successfully", {
      id: result.insertId,
    });
  } catch (err) {
    console.error("ADMIN CREATE COMPANY ERROR:", err);
    return sendError(res, 500, "Failed to create company");
  } finally {
    if (conn) conn.release();
  }
});

// ─── PUT /admin/companies/:id — Update company ───────────────

router.put("/:id", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const companyId = parseInt(req.params.id);
    if (!companyId || companyId <= 0) {
      return sendError(res, 400, "Valid company ID is required");
    }

    const [[existing]] = await conn.query(
      "SELECT id FROM companies WHERE id = ? AND is_deleted = 0 LIMIT 1",
      [companyId]
    );
    if (!existing) {
      return sendError(res, 404, "Company not found");
    }

    const {
      name,
      owner_user_id,
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
      transaction_currency,
      max_distance,
      gst_no,
    } = req.body || {};

    const updates = [];
    const params = [];

    if (name !== undefined) {
      if (!name || typeof name !== "string" || !name.trim()) {
        return sendError(res, 400, "Company name cannot be empty");
      }
      updates.push("name = ?");
      params.push(name.trim());
    }

    if (owner_user_id !== undefined) {
      if (
        !Number.isInteger(Number(owner_user_id)) ||
        Number(owner_user_id) <= 0
      ) {
        return sendError(res, 400, "Valid owner_user_id is required");
      }
      const [[owner]] = await conn.query(
        "SELECT id FROM users WHERE id = ? AND is_deleted = 0 AND is_active = 1 LIMIT 1",
        [owner_user_id]
      );
      if (!owner) {
        return sendError(res, 404, "Owner user not found or inactive");
      }
      updates.push("owner_user_id = ?");
      params.push(owner_user_id);
    }

    if (legal_name !== undefined) {
      updates.push("legal_name = ?");
      params.push(legal_name?.trim() || null);
    }
    if (logo_url !== undefined) {
      updates.push("logo_url = ?");
      params.push(logo_url || null);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      params.push(is_active ? 1 : 0);
    }
    if (address_line1 !== undefined) {
      updates.push("address_line1 = ?");
      params.push(address_line1?.trim() || null);
    }
    if (address_line2 !== undefined) {
      updates.push("address_line2 = ?");
      params.push(address_line2?.trim() || null);
    }
    if (city !== undefined) {
      updates.push("city = ?");
      params.push(city?.trim() || null);
    }
    if (state !== undefined) {
      updates.push("state = ?");
      params.push(state?.trim() || null);
    }
    if (postal_code !== undefined) {
      updates.push("postal_code = ?");
      params.push(postal_code?.trim() || null);
    }
    if (country !== undefined) {
      updates.push("country = ?");
      params.push(country?.trim() || null);
    }
    if (latitude !== undefined) {
      updates.push("latitude = ?");
      params.push(latitude || null);
    }
    if (longitude !== undefined) {
      updates.push("longitude = ?");
      params.push(longitude || null);
    }
    if (transaction_currency !== undefined) {
      updates.push("transaction_currency = ?");
      params.push(transaction_currency?.trim() || null);
    }
    if (max_distance !== undefined) {
      updates.push("max_distance = ?");
      params.push(max_distance || null);
    }
    if (gst_no !== undefined) {
      updates.push("gst_no = ?");
      params.push(gst_no?.trim() || null);
    }

    if (updates.length === 0) {
      return sendError(res, 400, "No fields to update");
    }

    updates.push("updated_by = ?");
    params.push(req.admin.id);
    updates.push("updated_at = NOW()");
    params.push(companyId);

    await conn.query(
      `UPDATE companies SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    return sendSuccess(res, 200, "Company updated successfully");
  } catch (err) {
    console.error("ADMIN UPDATE COMPANY ERROR:", err);
    return sendError(res, 500, "Failed to update company");
  } finally {
    if (conn) conn.release();
  }
});

// ─── DELETE /admin/companies/:id — Soft-delete company ────────

router.delete("/:id", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const companyId = parseInt(req.params.id);
    if (!companyId || companyId <= 0) {
      return sendError(res, 400, "Valid company ID is required");
    }

    const [[existing]] = await conn.query(
      "SELECT id FROM companies WHERE id = ? AND is_deleted = 0 LIMIT 1",
      [companyId]
    );
    if (!existing) {
      return sendError(res, 404, "Company not found");
    }

    await conn.query(
      `
      UPDATE companies
      SET is_deleted = 1, is_active = 0, deleted_at = NOW(), deleted_by = ?, updated_at = NOW()
      WHERE id = ?
      `,
      [req.admin.id, companyId]
    );

    return sendSuccess(res, 200, "Company deleted successfully");
  } catch (err) {
    console.error("ADMIN DELETE COMPANY ERROR:", err);
    return sendError(res, 500, "Failed to delete company");
  } finally {
    if (conn) conn.release();
  }
});

export default router;

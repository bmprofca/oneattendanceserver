import express from "express";
import db from "../config/db.js";
import adminAuth from "../middleware/adminAuthMiddleware.js";
import {
  sendSuccess,
  sendError,
  buildMeta,
} from "../utils/sendResponse.js";

const router = express.Router();

router.use(adminAuth());

// ─── GET /admin/custom-packages — List all custom packages (paginated) ────

router.get("/", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    let { page = 1, limit = 20, search, is_active, client_id } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const conditions = ["csp.is_deleted = 0"];
    const params = [];

    if (search && typeof search === "string" && search.trim()) {
      conditions.push("(csp.name LIKE ? OR c.name LIKE ?)");
      const s = `%${search.trim()}%`;
      params.push(s, s);
    }

    if (is_active !== undefined && is_active !== "") {
      conditions.push("csp.is_active = ?");
      params.push(Number(is_active) ? 1 : 0);
    }
    
    if (client_id && !isNaN(parseInt(client_id))) {
      conditions.push("csp.client_id = ?");
      params.push(parseInt(client_id));
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total 
       FROM custom_subscription_packages csp 
       LEFT JOIN companies c ON c.id = csp.client_id 
       ${whereClause}`,
      params
    );

    const [rows] = await conn.query(
      `
      SELECT
        csp.id, csp.client_id, c.name AS client_name, csp.name, csp.min_employee_count, csp.max_employee_count,
        csp.monthly_price, csp.quarterly_price, csp.half_yearly_price, csp.yearly_price,
        csp.accept_periods, csp.is_active, csp.created_at, csp.updated_at
      FROM custom_subscription_packages csp
      LEFT JOIN companies c ON c.id = csp.client_id 
      ${whereClause}
      ORDER BY csp.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    // Parse accept_periods for each row if needed
    const data = rows.map((row) => ({
      ...row,
      accept_periods: (() => {
        try {
          return typeof row.accept_periods === "string"
            ? JSON.parse(row.accept_periods)
            : row.accept_periods;
        } catch {
          return row.accept_periods;
        }
      })(),
    }));

    return sendSuccess(
      res,
      200,
      "Custom packages fetched successfully",
      data,
      buildMeta(page, limit, total, data.length)
    );
  } catch (err) {
    console.error("ADMIN GET CUSTOM PACKAGES ERROR:", err);
    return sendError(res, 500, "Failed to fetch custom packages");
  } finally {
    if (conn) conn.release();
  }
});

// ─── GET /admin/custom-packages/:id — Get details of a custom package ───────────────

router.get("/:id", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const packageId = parseInt(req.params.id);

    if (!packageId || isNaN(packageId)) {
      return sendError(res, 400, "Valid package ID is required");
    }

    const [[packageDetails]] = await conn.query(
      `SELECT csp.*, c.name AS client_name 
       FROM custom_subscription_packages csp
       LEFT JOIN companies c ON c.id = csp.client_id 
       WHERE csp.id = ? AND csp.is_deleted = 0`,
      [packageId]
    );

    if (!packageDetails) {
      return sendError(res, 404, "Custom package not found");
    }

    try {
      packageDetails.accept_periods = typeof packageDetails.accept_periods === "string" 
        ? JSON.parse(packageDetails.accept_periods) 
        : packageDetails.accept_periods;
    } catch (e) {
      // Ignored
    }

    return sendSuccess(res, 200, "Custom package details fetched successfully", packageDetails);
  } catch (err) {
    console.error("ADMIN GET CUSTOM PACKAGE DETAILS ERROR:", err);
    return sendError(res, 500, "Failed to fetch custom package details");
  } finally {
    if (conn) conn.release();
  }
});


// ─── POST /admin/custom-packages — Create new custom package ───────────────

router.post("/", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const {
      client_id,
      name,
      min_employee_count,
      max_employee_count,
      monthly_price,
      quarterly_price,
      half_yearly_price,
      yearly_price,
      accept_periods,
      is_active = 1,
    } = req.body || {};
    
    if (!client_id || isNaN(parseInt(client_id))) {
      return sendError(res, 400, "Client ID is required and must be a valid ID");
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return sendError(res, 400, "Package name is required");
    }

    if (min_employee_count === undefined || max_employee_count === undefined) {
      return sendError(res, 400, "min_employee_count and max_employee_count are required");
    }

    const mPrice = monthly_price || 0;
    const qPrice = quarterly_price || 0;
    const hPrice = half_yearly_price || 0;
    const yPrice = yearly_price || 0;
    const periods = accept_periods ? JSON.stringify(accept_periods) : JSON.stringify(["monthly", "quarterly", "half_yearly", "yearly"]);

    const [result] = await conn.query(
      `
      INSERT INTO custom_subscription_packages
        (client_id, name, min_employee_count, max_employee_count,
         monthly_price, quarterly_price, half_yearly_price, yearly_price,
         accept_periods, is_active, created_at, created_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW())
      `,
      [
        parseInt(client_id),
        name.trim(),
        min_employee_count,
        max_employee_count,
        mPrice,
        qPrice,
        hPrice,
        yPrice,
        periods,
        is_active ? 1 : 0,
        req.admin.id,
      ]
    );

    return sendSuccess(res, 201, "Custom package created successfully", {
      id: result.insertId,
    });
  } catch (err) {
    console.error("ADMIN CREATE CUSTOM PACKAGE ERROR:", err);
    return sendError(res, 500, "Failed to create custom package");
  } finally {
    if (conn) conn.release();
  }
});

// ─── PUT /admin/custom-packages/:id — Update custom package ───────────────

router.put("/:id", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const packageId = parseInt(req.params.id);
    if (!packageId || packageId <= 0) {
      return sendError(res, 400, "Valid package ID is required");
    }

    const [[existing]] = await conn.query(
      "SELECT id FROM custom_subscription_packages WHERE id = ? AND is_deleted = 0 LIMIT 1",
      [packageId]
    );
    if (!existing) {
      return sendError(res, 404, "Custom package not found");
    }

    const {
      client_id,
      name,
      min_employee_count,
      max_employee_count,
      monthly_price,
      quarterly_price,
      half_yearly_price,
      yearly_price,
      accept_periods,
      is_active,
    } = req.body || {};

    const updates = [];
    const params = [];
    
    if (client_id !== undefined) {
      if (isNaN(parseInt(client_id))) {
        return sendError(res, 400, "Client ID must be a valid ID");
      }
      updates.push("client_id = ?");
      params.push(parseInt(client_id));
    }

    if (name !== undefined) {
      if (!name || typeof name !== "string" || !name.trim()) {
        return sendError(res, 400, "Package name cannot be empty");
      }
      updates.push("name = ?");
      params.push(name.trim());
    }

    if (min_employee_count !== undefined) {
      updates.push("min_employee_count = ?");
      params.push(min_employee_count);
    }
    if (max_employee_count !== undefined) {
      updates.push("max_employee_count = ?");
      params.push(max_employee_count);
    }
    if (monthly_price !== undefined) {
      updates.push("monthly_price = ?");
      params.push(monthly_price);
    }
    if (quarterly_price !== undefined) {
      updates.push("quarterly_price = ?");
      params.push(quarterly_price);
    }
    if (half_yearly_price !== undefined) {
      updates.push("half_yearly_price = ?");
      params.push(half_yearly_price);
    }
    if (yearly_price !== undefined) {
      updates.push("yearly_price = ?");
      params.push(yearly_price);
    }
    if (accept_periods !== undefined) {
      updates.push("accept_periods = ?");
      params.push(JSON.stringify(accept_periods));
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      params.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return sendError(res, 400, "No fields to update");
    }

    updates.push("updated_by = ?");
    params.push(req.admin.id);
    updates.push("updated_at = NOW()");
    params.push(packageId);

    await conn.query(
      `UPDATE custom_subscription_packages SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    return sendSuccess(res, 200, "Custom package updated successfully");
  } catch (err) {
    console.error("ADMIN UPDATE CUSTOM PACKAGE ERROR:", err);
    return sendError(res, 500, "Failed to update custom package");
  } finally {
    if (conn) conn.release();
  }
});

// ─── PATCH /admin/custom-packages/:id/status — Update custom package status ───────────────

router.patch("/:id/status", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const packageId = parseInt(req.params.id);
    if (!packageId || packageId <= 0) {
      return sendError(res, 400, "Valid package ID is required");
    }

    const { is_active } = req.body;
    
    if (is_active === undefined) {
      return sendError(res, 400, "is_active field is required");
    }

    const [[existing]] = await conn.query(
      "SELECT id FROM custom_subscription_packages WHERE id = ? AND is_deleted = 0 LIMIT 1",
      [packageId]
    );
    if (!existing) {
      return sendError(res, 404, "Custom package not found");
    }

    await conn.query(
      `UPDATE custom_subscription_packages SET is_active = ?, updated_by = ?, updated_at = NOW() WHERE id = ?`,
      [is_active ? 1 : 0, req.admin.id, packageId]
    );

    return sendSuccess(res, 200, "Custom package status updated successfully");
  } catch (err) {
    console.error("ADMIN UPDATE CUSTOM PACKAGE STATUS ERROR:", err);
    return sendError(res, 500, "Failed to update custom package status");
  } finally {
    if (conn) conn.release();
  }
});

// ─── DELETE /admin/custom-packages/:id — Soft-delete custom package ────────

router.delete("/:id", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const packageId = parseInt(req.params.id);
    if (!packageId || packageId <= 0) {
      return sendError(res, 400, "Valid package ID is required");
    }

    const [[existing]] = await conn.query(
      "SELECT id FROM custom_subscription_packages WHERE id = ? AND is_deleted = 0 LIMIT 1",
      [packageId]
    );
    if (!existing) {
      return sendError(res, 404, "Custom package not found");
    }

    await conn.query(
      `
      UPDATE custom_subscription_packages
      SET is_deleted = 1, is_active = 0, deleted_at = NOW(), deleted_by = ?, updated_at = NOW()
      WHERE id = ?
      `,
      [req.admin.id, packageId]
    );

    return sendSuccess(res, 200, "Custom package deleted successfully");
  } catch (err) {
    console.error("ADMIN DELETE CUSTOM PACKAGE ERROR:", err);
    return sendError(res, 500, "Failed to delete custom package");
  } finally {
    if (conn) conn.release();
  }
});

export default router;

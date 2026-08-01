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

// ─── GET /admin/packages — List all packages (paginated) ────

router.get("/", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    let { page = 1, limit = 20, search, is_active } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const conditions = ["is_deleted = 0"];
    const params = [];

    if (search && typeof search === "string" && search.trim()) {
      conditions.push("name LIKE ?");
      params.push(`%${search.trim()}%`);
    }

    if (is_active !== undefined && is_active !== "") {
      conditions.push("is_active = ?");
      params.push(Number(is_active) ? 1 : 0);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM subscription_packages ${whereClause}`,
      params
    );

    const [rows] = await conn.query(
      `
      SELECT
        id, name, min_employee_count, max_employee_count,
        monthly_price, quarterly_price, half_yearly_price, yearly_price,
        accept_periods, is_active, created_at, updated_at
      FROM subscription_packages
      ${whereClause}
      ORDER BY min_employee_count ASC, created_at DESC
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
      "Packages fetched successfully",
      data,
      buildMeta(page, limit, total, data.length)
    );
  } catch (err) {
    console.error("ADMIN GET PACKAGES ERROR:", err);
    return sendError(res, 500, "Failed to fetch packages");
  } finally {
    if (conn) conn.release();
  }
});


// ─── POST /admin/packages — Create new package ───────────────

router.post("/", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const {
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
      INSERT INTO subscription_packages
        (name, min_employee_count, max_employee_count,
         monthly_price, quarterly_price, half_yearly_price, yearly_price,
         accept_periods, is_active, created_at, created_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW())
      `,
      [
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

    return sendSuccess(res, 201, "Package created successfully", {
      id: result.insertId,
    });
  } catch (err) {
    console.error("ADMIN CREATE PACKAGE ERROR:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return sendError(res, 400, "A package with this employee range already exists");
    }
    return sendError(res, 500, "Failed to create package");
  } finally {
    if (conn) conn.release();
  }
});

// ─── PUT /admin/packages/:id — Update package ───────────────

router.put("/:id", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const packageId = parseInt(req.params.id);
    if (!packageId || packageId <= 0) {
      return sendError(res, 400, "Valid package ID is required");
    }

    const [[existing]] = await conn.query(
      "SELECT id FROM subscription_packages WHERE id = ? AND is_deleted = 0 LIMIT 1",
      [packageId]
    );
    if (!existing) {
      return sendError(res, 404, "Package not found");
    }

    const {
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
      `UPDATE subscription_packages SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    return sendSuccess(res, 200, "Package updated successfully");
  } catch (err) {
    console.error("ADMIN UPDATE PACKAGE ERROR:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return sendError(res, 400, "A package with this employee range already exists");
    }
    return sendError(res, 500, "Failed to update package");
  } finally {
    if (conn) conn.release();
  }
});

// ─── DELETE /admin/packages/:id — Soft-delete package ────────

router.delete("/:id", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const packageId = parseInt(req.params.id);
    if (!packageId || packageId <= 0) {
      return sendError(res, 400, "Valid package ID is required");
    }

    const [[existing]] = await conn.query(
      "SELECT id FROM subscription_packages WHERE id = ? AND is_deleted = 0 LIMIT 1",
      [packageId]
    );
    if (!existing) {
      return sendError(res, 404, "Package not found");
    }

    await conn.query(
      `
      UPDATE subscription_packages
      SET is_deleted = 1, is_active = 0, deleted_at = NOW(), deleted_by = ?, updated_at = NOW()
      WHERE id = ?
      `,
      [req.admin.id, packageId]
    );

    return sendSuccess(res, 200, "Package deleted successfully");
  } catch (err) {
    console.error("ADMIN DELETE PACKAGE ERROR:", err);
    return sendError(res, 500, "Failed to delete package");
  } finally {
    if (conn) conn.release();
  }
});

export default router;

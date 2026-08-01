import express from "express";
import db from "../config/db.js";
import adminAuth from "../middleware/adminAuthMiddleware.js";
import { sendSuccess, sendError } from "../utils/sendResponse.js";

const router = express.Router();

router.use(adminAuth());

router.get("/", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const [usersResult] = await conn.query("SELECT COUNT(*) as count FROM users WHERE is_deleted = 0");
    const [companiesResult] = await conn.query("SELECT COUNT(*) as count FROM companies WHERE is_deleted = 0");
    const [employeesResult] = await conn.query("SELECT COUNT(*) as count FROM employees WHERE is_deleted = 0");
    const [subscriptionsResult] = await conn.query("SELECT COUNT(*) as count FROM company_subscriptions WHERE is_active = 1");
    
    const [recentCompanies] = await conn.query(`
      SELECT id, name, created_at 
      FROM companies 
      WHERE is_deleted = 0 
      ORDER BY created_at DESC 
      LIMIT 5
    `);

    const [recentSubscriptions] = await conn.query(`
      SELECT cs.id, c.name as company_name, sp.name as package_name, cs.created_at, cs.is_active
      FROM company_subscriptions cs
      LEFT JOIN companies c ON cs.company_id = c.id
      LEFT JOIN subscription_packages sp ON cs.subscription_package_id = sp.id
      ORDER BY cs.created_at DESC
      LIMIT 5
    `);

    const data = {
      kpis: {
        total_users: usersResult[0]?.count || 0,
        total_companies: companiesResult[0]?.count || 0,
        total_employees: employeesResult[0]?.count || 0,
        active_subscriptions: subscriptionsResult[0]?.count || 0,
      },
      recent_companies: recentCompanies,
      recent_subscriptions: recentSubscriptions,
    };

    return sendSuccess(res, 200, "Dashboard data fetched successfully", data);
  } catch (err) {
    console.error("ADMIN GET DASHBOARD ERROR:", err);
    return sendError(res, 500, "Failed to fetch dashboard data");
  } finally {
    if (conn) conn.release();
  }
});

export default router;

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

    const { from_date, to_date, year, month } = req.query;

    const getDateCondition = (columnName) => {
      let condition = "";
      let params = [];
      if (from_date && to_date) {
        condition = ` AND DATE(${columnName}) BETWEEN ? AND ?`;
        params.push(from_date, to_date);
      } else if (year) {
        if (month) {
          condition = ` AND YEAR(${columnName}) = ? AND MONTH(${columnName}) = ?`;
          params.push(year, month);
        } else {
          condition = ` AND YEAR(${columnName}) = ?`;
          params.push(year);
        }
      }
      return { condition, params };
    };

    const cAt = getDateCondition('created_at');
    const aDate = getDateCondition('attendance_date');
    const sDate = getDateCondition('start_date');
    const hDate = getDateCondition('date');
    const tDate = getDateCondition('transaction_date');
    
    // For queries that don't have an existing WHERE clause
    const aDateNoWhere = getDateCondition('attendance_date');
    if(aDateNoWhere.condition) {
      aDateNoWhere.condition = " WHERE " + aDateNoWhere.condition.substring(5); // replace ' AND ' with ' WHERE '
    }

    const csAt = getDateCondition('cs.created_at');

    const queries = [
      conn.query("SELECT COUNT(*) as count FROM users WHERE is_deleted = 0" + cAt.condition, cAt.params),
      conn.query("SELECT COUNT(*) as count FROM companies WHERE is_deleted = 0" + cAt.condition, cAt.params),
      conn.query("SELECT COUNT(*) as count FROM employees WHERE is_deleted = 0" + cAt.condition, cAt.params),
      conn.query("SELECT COUNT(*) as count FROM company_subscriptions WHERE is_active = 1" + cAt.condition, cAt.params),
      conn.query("SELECT COUNT(*) as count FROM attendance" + aDateNoWhere.condition, aDateNoWhere.params),
      conn.query("SELECT COUNT(*) as count FROM employee_leaves WHERE is_deleted = 0" + sDate.condition, sDate.params),
      conn.query("SELECT COUNT(*) as count FROM holidays WHERE is_deleted = 0" + hDate.condition, hDate.params),
      conn.query("SELECT COUNT(*) as count FROM transactions WHERE is_deleted = 0" + tDate.condition, tDate.params),
      conn.query("SELECT COUNT(*) as count FROM shifts WHERE is_deleted = 0" + cAt.condition, cAt.params),
      conn.query("SELECT COUNT(*) as count FROM subscription_packages WHERE is_deleted = 0" + cAt.condition, cAt.params),
      conn.query("SELECT COUNT(*) as count FROM custom_subscription_packages WHERE is_deleted = 0" + cAt.condition, cAt.params),
      conn.query("SELECT COUNT(*) as count FROM payroll_entries WHERE is_deleted = 0" + cAt.condition, cAt.params),
      conn.query("SELECT COUNT(*) as count FROM salary_components WHERE is_deleted = 0" + cAt.condition, cAt.params),
      conn.query("SELECT COUNT(*) as count FROM permission_packages WHERE is_deleted = 0" + cAt.condition, cAt.params),
      conn.query(`
        SELECT id, name, created_at 
        FROM companies 
        WHERE is_deleted = 0 ${cAt.condition}
        ORDER BY created_at DESC 
        LIMIT 5
      `, cAt.params),
      conn.query(`
        SELECT cs.id, c.name as company_name,
          CASE cs.package_type
            WHEN 'custom' THEN csp.name
            ELSE sp.name
          END as package_name,
          cs.package_type, cs.created_at, cs.is_active
        FROM company_subscriptions cs
        LEFT JOIN companies c ON cs.company_id = c.id
        LEFT JOIN subscription_packages sp ON cs.package_type = 'normal' AND cs.package_id = sp.id
        LEFT JOIN custom_subscription_packages csp ON cs.package_type = 'custom' AND cs.package_id = csp.id
        WHERE 1=1 ${csAt.condition}
        ORDER BY cs.created_at DESC
        LIMIT 5
      `, csAt.params),
      conn.query(`
        SELECT id, name, email, created_at
        FROM users
        WHERE is_deleted = 0 ${cAt.condition}
        ORDER BY created_at DESC
        LIMIT 5
      `, cAt.params)
    ];

    const results = await Promise.all(queries);

    const data = {
      kpis: {
        total_users: results[0][0][0]?.count || 0,
        total_companies: results[1][0][0]?.count || 0,
        total_employees: results[2][0][0]?.count || 0,
        active_subscriptions: results[3][0][0]?.count || 0,
        total_attendance: results[4][0][0]?.count || 0,
        total_leaves: results[5][0][0]?.count || 0,
        total_holidays: results[6][0][0]?.count || 0,
        total_transactions: results[7][0][0]?.count || 0,
        total_shifts: results[8][0][0]?.count || 0,
        total_subscription_packages: results[9][0][0]?.count || 0,
        total_custom_packages: results[10][0][0]?.count || 0,
        total_payroll_entries: results[11][0][0]?.count || 0,
        total_salary_components: results[12][0][0]?.count || 0,
        total_permission_packages: results[13][0][0]?.count || 0,
      },
      recent_companies: results[14][0],
      recent_subscriptions: results[15][0],
      recent_users: results[16][0],
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

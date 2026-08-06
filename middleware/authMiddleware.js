import db from "../config/db.js";
import { sendError } from "../utils/sendResponse.js";
import { checkCompanyPermissions } from "../utils/checkPermissions.js";

/**
 * Fire-and-forget session touch update.
 * Uses pool.query (no connection hold) and swallows errors
 * so it never blocks the request.
 */
function touchSession(sessionId, renewExpiry) {
  const sql = renewExpiry
    ? `UPDATE sessions
       SET expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY),
           last_used_at = NOW()
       WHERE id = ?`
    : `UPDATE sessions
       SET last_used_at = NOW()
       WHERE id = ?`;

  db.query(sql, [sessionId]).catch((err) => {
    console.error("SESSION TOUCH ERROR (non-blocking):", err.message);
  });
}

const auth = (permissions = [], { allow_owner = true, owner_only = false, employee_only = false } = {}) => {

  return async (req, res, next) => {

    let conn;

    try {

      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return sendError(
          res,
          401,
          "No session token provided"
        );
      }

      const token = authHeader.split(" ")[1]?.trim();

      if (!token) {
        return sendError(
          res,
          401,
          "Invalid session token"
        );

      }

      conn = await db.getConnection();

      const [[sessionData]] = await conn.query(
        `
          SELECT 
            s.id AS session_id,
            s.user_id,
            s.is_active,
            s.forced_logged_out,
            s.expires_at,
            s.last_used_at,

            u.email,
            u.name,
            u.is_active AS user_active,
            u.is_deleted

          FROM sessions s

          INNER JOIN users u
            ON u.id = s.user_id

          WHERE s.session_token = ?
          LIMIT 1
          `,
        [token]
      );

      if (!sessionData) {
        conn.release();
        conn = null;
        return sendError(
          res,
          401,
          "Session not found"
        );

      }

      if (!sessionData.is_active || sessionData.forced_logged_out) {
        conn.release();
        conn = null;
        return sendError(
          res,
          401,
          "Session logged out"
        );
      }

      const now = Date.now();

      const expiresAt = new Date(sessionData.expires_at).getTime();

      if (!expiresAt || expiresAt <= now) {
        conn.release();
        conn = null;
        return sendError(
          res,
          401,
          "Session expired"
        );
      }

      if (!sessionData.user_active || sessionData.is_deleted) {
        conn.release();
        conn = null;
        return sendError(
          res,
          403,
          "User inactive or deleted"
        );
      }

      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;
      const FIVE_MINUTES_MS = 5 * 60 * 1000;

      const lastUsedAt = sessionData.last_used_at
        ? new Date(sessionData.last_used_at).getTime() : 0;

      let updatedExpiresAt = sessionData.expires_at;

      // Only renew when less than half the window remains (< 15 days left)
      if (expiresAt - now < FIFTEEN_DAYS_MS) {
        // Fire-and-forget — don't await, don't hold connection
        touchSession(sessionData.session_id, true);
        updatedExpiresAt = new Date(now + THIRTY_DAYS_MS);
      }
      // Throttle last_used_at to once every 5 minutes
      else if (now - lastUsedAt > FIVE_MINUTES_MS) {
        touchSession(sessionData.session_id, false);
      }

      req.user = {
        id: sessionData.user_id,
        email: sessionData.email,
        name: sessionData.name || null
      };

      req.session = {
        id: sessionData.session_id,
        token,
        expires_at: updatedExpiresAt
      };

      const rawCompanyId = req.headers.company;

      let company_id = null;

      if (
        rawCompanyId !== undefined &&
        rawCompanyId !== null &&
        rawCompanyId !== ""
      ) {

        company_id = Number(rawCompanyId);
        if (!Number.isInteger(company_id) || company_id <= 0) {
          conn.release();
          conn = null;
          return sendError(
            res,
            400,
            "Valid company id required"
          );
        }

        req.company = {
          id: company_id
        };

      }

      const needsCompanyCheck =
        permissions.length > 0 ||
        owner_only ||
        employee_only;

      if (!needsCompanyCheck) {
        conn.release();
        conn = null;
        return next();
      }

      let permissionResult = {
        role: "owner"
      };

      if (company_id) {
        permissionResult =
          await checkCompanyPermissions({
            conn,
            user_id: sessionData.user_id,
            company_id,
            permissions,
            allow_owner,
            owner_only,
            employee_only
          });

      }
      else {
        if (!owner_only) {
          conn.release();
          conn = null;
          return sendError(
            res,
            400,
            "Company id required"
          );
        }
      }

      let employee = null;

      if (permissionResult.role === "employee") {

        const [[employeeData]] =
          await conn.query(
            `
            SELECT
              id,
              company_id,
              permission_package_id,
              designation,
              employee_code
            FROM employees
            WHERE
              user_id = ?
              AND company_id = ?
              AND is_active = 1
              AND is_deleted = 0
            LIMIT 1
            `,
            [
              sessionData.user_id,
              company_id
            ]
          );

        if (!employeeData) {
          conn.release();
          conn = null;
          return sendError(
            res,
            403,
            "Employee record not found"
          );

        }

        employee = employeeData;

      }

      // Release the connection BEFORE calling next()
      // so route handlers don't compete for this connection
      conn.release();
      conn = null;

      req.employee = employee;

      req.role = permissionResult.role;

      req.permissions = permissions;

      return next();

    } catch (err) {

      console.error("AUTH MIDDLEWARE ERROR:", err);

      const status =
        typeof err === "object" &&
          err !== null &&
          err.status
          ? err.status
          : 500;

      const message =
        typeof err === "object" &&
          err !== null &&
          err.message
          ? err.message
          : "Internal server error";

      const errors =
        typeof err === "object" &&
          err !== null
          ? (
            err.errors ||
            err.missing_permissions ||
            null
          )
          : null;

      return sendError(
        res,
        status,
        message,
        errors
      );

    } finally {
      if (conn) {
        conn.release();
      }

    }

  };

};

export default auth;
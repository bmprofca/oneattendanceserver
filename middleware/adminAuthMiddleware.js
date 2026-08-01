import db from "../config/db.js";
import { sendError } from "../utils/sendResponse.js";

/**
 * Admin authentication middleware.
 * Validates bearer token, checks session is active/unexpired,
 * and ensures the user has is_system_admin = 1.
 */
const adminAuth = () => {
  return async (req, res, next) => {
    let conn;

    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return sendError(res, 401, "No session token provided");
      }

      const token = authHeader.split(" ")[1]?.trim();

      if (!token) {
        return sendError(res, 401, "Invalid session token");
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
          u.phone,
          u.name,
          u.profile_picture,
          u.is_active AS user_active,
          u.is_system_admin,
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
        return sendError(res, 401, "Session not found");
      }

      if (!sessionData.is_active || sessionData.forced_logged_out) {
        return sendError(res, 401, "Session logged out");
      }

      const now = Date.now();
      const expiresAt = new Date(sessionData.expires_at).getTime();

      if (!expiresAt || expiresAt <= now) {
        return sendError(res, 401, "Session expired");
      }

      if (!sessionData.user_active || sessionData.is_deleted) {
        return sendError(res, 403, "User inactive or deleted");
      }

      // ── Admin check ──
      if (!sessionData.is_system_admin) {
        return sendError(res, 403, "Admin access required");
      }

      // ── Extend session if needed ──
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const FIVE_MINUTES_MS = 5 * 60 * 1000;

      const lastUsedAt = sessionData.last_used_at
        ? new Date(sessionData.last_used_at).getTime()
        : 0;

      if (expiresAt <= now + THIRTY_DAYS_MS) {
        await conn.query(
          `
          UPDATE sessions
          SET
            expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY),
            last_used_at = NOW()
          WHERE id = ?
          `,
          [sessionData.session_id]
        );
      } else if (now - lastUsedAt > FIVE_MINUTES_MS) {
        await conn.query(
          `
          UPDATE sessions
          SET last_used_at = NOW()
          WHERE id = ?
          `,
          [sessionData.session_id]
        );
      }

      req.admin = {
        id: sessionData.user_id,
        email: sessionData.email,
        phone: sessionData.phone,
        name: sessionData.name,
        profile_picture: sessionData.profile_picture,
        is_system_admin: true,
      };

      req.session = {
        id: sessionData.session_id,
        token,
        expires_at: sessionData.expires_at,
      };

      return next();
    } catch (err) {
      console.error("ADMIN AUTH MIDDLEWARE ERROR:", err);
      return sendError(res, 500, "Internal server error");
    } finally {
      if (conn) conn.release();
    }
  };
};

export default adminAuth;

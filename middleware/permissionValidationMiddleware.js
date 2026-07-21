import db from "../config/db.js";

const checkPermission = (...requiredPermissions) => {
  return async (req, res, next) => {
    let conn;

    try {
      
      const authHeader = req.headers.authorization;
      const companyId = Number(req.headers["company"]);

      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({
          success: false,
          message: "Authorization token missing or invalid format",
        });
      }

      if (!companyId || !Number.isInteger(companyId)) {
        return res.status(400).json({
          success: false,
          message: "Valid company id is required in headers",
        });
      }

      const token = authHeader.split(" ")[1];

      conn = await db.getConnection();

      
      const [[data]] = await conn.query(
        `SELECT 
            s.id AS session_id,
            s.user_id,
            s.is_active AS session_active,
            s.forced_logged_out,
            s.expires_at,
            s.last_used_at,

            u.email,
            u.is_active AS user_active,
            u.is_deleted AS user_deleted,

            c.id AS company_id,
            c.owner_user_id,

            e.id AS employee_id,
            e.permission_package_id

        FROM sessions s
        JOIN users u ON u.id = s.user_id
        JOIN companies c ON c.id = ?
        LEFT JOIN employees e 
          ON e.user_id = u.id 
          AND e.company_id = c.id
          AND e.is_active = 1
          AND e.is_deleted = 0

        WHERE s.session_token = ?
          AND c.is_active = 1
          AND c.is_deleted = 0

        LIMIT 1`,
        [companyId, token]
      );

      
      if (!data) {
        return res.status(401).json({
          success: false,
          message: "Invalid session or company",
        });
      }

      if (data.forced_logged_out) {
        return res.status(401).json({
          success: false,
          message: "Session terminated. Please login again",
        });
      }

      if (!data.session_active) {
        return res.status(401).json({
          success: false,
          message: "Session inactive",
        });
      }

      if (new Date(data.expires_at) <= new Date()) {
        return res.status(401).json({
          success: false,
          message: "Session expired",
        });
      }

      if (data.user_deleted) {
        return res.status(403).json({
          success: false,
          message: "User account deleted",
        });
      }

      if (!data.user_active) {
        return res.status(403).json({
          success: false,
          message: "User account inactive",
        });
      }

      
      const isOwner =
        Number(data.user_id) === Number(data.owner_user_id);

      if (!isOwner && !data.employee_id) {
        return res.status(403).json({
          success: false,
          message: "User is not part of this company",
        });
      }

      let permissions = [];

      
      if (isOwner) {
        permissions = ["*"]; 
      } else {
        const [rows] = await conn.query(
          `SELECT p.code
           FROM permission_package_items ppi
           JOIN permissions p ON p.id = ppi.permission_id
           WHERE ppi.package_id = ?
             AND ppi.is_active = 1
             AND ppi.is_deleted = 0`,
          [data.permission_package_id]
        );

        permissions = rows.map((r) => r.code);
      }

      
      if (
        requiredPermissions.length > 0 &&
        !permissions.includes("*")
      ) {
        const hasAccess = requiredPermissions.some((p) =>
          permissions.includes(p)
        );

        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: "Access denied",
            required_permissions: requiredPermissions,
          });
        }
      }

      
      const now = Date.now();
      const expiresAt = new Date(data.expires_at).getTime();
      const lastUsedAt = new Date(data.last_used_at).getTime();

      const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
      const FIVE_MIN = 5 * 60 * 1000;

      if (expiresAt - now < THREE_DAYS) {
        await conn.query(
          `UPDATE sessions 
           SET expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY),
               last_used_at = NOW()
           WHERE id = ?`,
          [data.session_id]
        );
      } else if (now - lastUsedAt > FIVE_MIN) {
        await conn.query(
          `UPDATE sessions 
           SET last_used_at = NOW()
           WHERE id = ?`,
          [data.session_id]
        );
      }

      
      req.user = {
        id: data.user_id,
        email: data.email,
        is_company_owner: isOwner,
      };

      req.company = {
        id: data.company_id,
      };

      req.employee = isOwner
        ? null
        : {
            id: data.employee_id,
            permission_package_id: data.permission_package_id,
          };

      req.permissions = permissions;

      req.session = {
        id: data.session_id,
      };

      next();
    } catch (err) {
      console.error("AUTH MIDDLEWARE ERROR:", err);

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    } finally {
      if (conn) conn.release();
    }
  };
};

export default checkPermission;
export async function checkCompanyPermissions({
  conn,
  user_id,
  company_id,
  permissions = [],

  allow_owner = true,
  owner_only = false,
  employee_only = false
}) {

  if (!conn) {
    throw {
      status: 500,
      message: "Database connection missing"
    };
  }

  if (!user_id || !company_id) {
    throw {
      status: 400,
      message: "user_id and company_id are required"
    };
  }

  if (!Array.isArray(permissions)) {
    throw {
      status: 400,
      message: "permissions must be array"
    };
  }

  if (owner_only && employee_only) {
    throw {
      status: 400,
      message: "owner_only and employee_only cannot both be true"
    };
  }
  
  const [companyRows] = await conn.query(
    `
      SELECT
        id,
        owner_user_id,
        is_active,
        is_deleted
      FROM companies
      WHERE id = ?
      LIMIT 1
    `,
    [company_id]
  );

  if (!companyRows.length) {
    throw {
      status: 404,
      message: "Company not found"
    };
  }

  const company = companyRows[0];

  if (!company.is_active || company.is_deleted) {
    throw {
      status: 403,
      message: "Company inactive"
    };
  }

  const isOwner = Number(company.owner_user_id) === Number(user_id);
  
  if (owner_only && !isOwner) {
    throw {
      status: 403,
      message: "Only company owner can access this resource"
    };
  }

  if (employee_only && isOwner) {
    throw {
      status: 403,
      message: "Company owner cannot access this resource"
    };
  }
  
  if (!allow_owner && isOwner) {
    throw {
      status: 403,
      message: "Company owner is not allowed for this resource"
    };
  }

  if (isOwner) {
    return {
      success: true,
      role: "owner",
      permissions
    };
  }
  
  const [rows] = await conn.query(
    `
      SELECT DISTINCT
        p.code
      FROM employees e

      INNER JOIN permission_packages pp
        ON pp.id = e.permission_package_id
        AND pp.company_id = e.company_id
        AND pp.is_active = 1
        AND pp.is_deleted = 0

      INNER JOIN permission_package_items ppi
        ON ppi.package_id = pp.id
        AND ppi.is_active = 1
        AND ppi.is_deleted = 0

      INNER JOIN permissions p
        ON p.id = ppi.permission_id

      WHERE
        e.user_id = ?
        AND e.company_id = ?
        AND e.is_active = 1
        AND e.is_deleted = 0
    `,
    [user_id, company_id]
  );

  if (!rows.length) {
    throw {
      status: 403,
      message: "User is not an employee of this company"
    };
  }

  const userPermissions = rows.map(r => r.code);

  if (permissions.length > 0) {
    const hasPermission = permissions.some(
      permission => userPermissions.includes(permission)
    );

    if (!hasPermission) {
      throw {
        status: 403,
        message: "Permission denied",
        required_permissions: permissions
      };
    }
  }
  
  return {
    success: true,
    role: "employee",
    permissions
  };

}

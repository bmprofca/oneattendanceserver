export const PERMISSIONS = {
  EMPLOYEES: "employees",
  ATTENDANCE: "attendance",
  LEAVE: "leave",
  FINANCIAL: "financial",
  PERMISSIONS: "permissions"
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const PERMISSION_DEFINITIONS = [
  {
    code: PERMISSIONS.EMPLOYEES,
    category: "Employees",
    action: "manage",
    description: "View and manage other employees and their information"
  },
  {
    code: PERMISSIONS.ATTENDANCE,
    category: "Attendance",
    action: "manage",
    description: "View and manage other employees' attendance, shifts, and holidays"
  },
  {
    code: PERMISSIONS.LEAVE,
    category: "Leave",
    action: "manage",
    description: "Manage leave configuration, balances, and requests"
  },
  {
    code: PERMISSIONS.FINANCIAL,
    category: "Financial",
    action: "manage",
    description: "View and manage employee salary and payroll"
  },
  {
    code: PERMISSIONS.PERMISSIONS,
    category: "Permissions",
    action: "manage",
    description: "Manage employees' roles and access"
  }
];

export default PERMISSIONS;

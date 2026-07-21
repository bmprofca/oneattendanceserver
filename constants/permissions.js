
export const PROFILE = {
  EMP: [
    "profile_view_own",
    "profile_update_own"
  ],

  MNG: [
    "profile_view_employee"
  ]
};

export const AT = {
  EMP: [
    "att_punch",
    "att_view_own"
  ],

  MNG: [
    "att_view_all",
    "att_create",
    "att_update",
    "att_delete",
    "att_verify"
  ]
};

export const LEAVE = {
  EMP: [
    "leave_apply",
    "leave_view_own",
    "leave_cancel_own"
  ],

  MNG: [
    "leave_view_all",
    "leave_approve",
    "leave_reject",
    "leave_update"
  ]
};

export const LEAVE_CFG = {
  MNG: [
    "leave_config_create",
    "leave_config_view",
    "leave_config_update",
    "leave_config_delete"
  ]
};

export const LEAVE_BAL = {
  EMP: [
    "leave_balance_view_own"
  ],

  MNG: [
    "leave_balance_assign",
    "leave_balance_view_all",
    "leave_balance_update",
    "leave_balance_delete"
  ]
};

export const EMP = {
  MNG: [
    "employee_create",
    "employee_view",
    "employee_view_all",
    "employee_update",
    "employee_delete"
  ]
};

export const INV = {
  MNG: [
    "invite_create",
    "invite_view_all",
    "invite_cancel",
    "invite_resend"
  ]
};

export const INV_PKG = {
  MNG: [
    "invite_package_create",
    "invite_package_view",
    "invite_package_update",
    "invite_package_delete"
  ]
};

export const SHIFT = {
  EMP:[
    "shift_view"
  ],
  
  MNG: [
    "shift_create",
    "shift_view_all",
    "shift_update"
  ]
};

export const SAL = {
  EMP: [
    "salary_view_own"
  ],

  MNG: [
    "salary_create",
    "salary_view_all",
    "salary_update",
    "salary_delete"
  ]
};

export const SAL_COMP = {
  MNG: [
    "salary_component_create",
    "salary_component_view",
    "salary_component_update",
    "salary_component_delete"
  ]
};

export const SAL_PKG = {
  MNG: [
    "salary_package_create",
    "salary_package_view",
    "salary_package_update",
    "salary_package_delete"
  ]
};

export const PAY = {
  EMP:[
    "payroll_view"
  ],

  MNG: [
    "payroll_generate",
    "payroll_view_all",
    "payroll_update",
    "payroll_delete",
    "payroll_approve",
    "payroll_hold",
    "payroll_release"
  ]
};

export const PAY_ADJ = {
  MNG: [
    "payroll_adjustment_create",
    "payroll_adjustment_view",
    "payroll_adjustment_update",
    "payroll_adjustment_delete"
  ]
};

export const CMP_BANK = {
  MNG: [
    "cmp_bank_view_own",
    "cmp_bank_create",
    "cmp_bank_view_all",
    "cmp_bank_update",
    "cmp_bank_delete"
  ]
};

export const EMP_BANK = {
  MNG: [
    "emp_bnk_create",
    "emp_bnk_view",
    "emp_bnk_update",
    "emp_bnk_delete"
  ]
};

export const HOLIDAY = {
  MNG: [
    "holiday_create",
    "holiday_view",
    "holiday_update",
    "holiday_delete"
  ]
};

export const CMP = {
  MNG: [
    "company_view",
    "company_update",
    "company_delete",
    "company_manage_settings"
  ]
};

export const PERM_PKG = {
  MNG: [
    "permission_package_create",
    "permission_package_view",
    "permission_package_update",
    "permission_package_delete",
    "permission_package_assign"
  ]
};

export const TXN = {
  MNG: [
    "transaction_create",
    "transaction_view",
    "transaction_update",
    "transaction_delete"
  ]
};

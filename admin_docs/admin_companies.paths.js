// ─── Admin Companies OpenAPI Paths ─────────────────────────────

export const schemas = {
  AdminCompanyListItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      name: { type: 'string', example: 'Acme Corp' },
      legal_name: { type: 'string', nullable: true, example: 'Acme Corporation Pvt Ltd' },
      logo_url: { type: 'string', nullable: true },
      is_active: { type: 'integer', example: 1 },
      owner_user_id: { type: 'integer', example: 1 },
      owner_name: { type: 'string', nullable: true, example: 'John Doe' },
      owner_email: { type: 'string', nullable: true, example: 'john@example.com' },
      owner_phone: { type: 'string', nullable: true, example: '9876543210' },
      address_line1: { type: 'string', nullable: true },
      address_line2: { type: 'string', nullable: true },
      city: { type: 'string', nullable: true },
      state: { type: 'string', nullable: true },
      postal_code: { type: 'string', nullable: true },
      country: { type: 'string', nullable: true },
      gst_no: { type: 'string', nullable: true },
      transaction_currency: { type: 'string', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  AdminCompanyDetail: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      name: { type: 'string', example: 'Acme Corp' },
      legal_name: { type: 'string', nullable: true, example: 'Acme Corporation Pvt Ltd' },
      logo_url: { type: 'string', nullable: true },
      is_active: { type: 'integer', example: 1 },
      owner_user_id: { type: 'integer', example: 1 },
      owner_name: { type: 'string', nullable: true, example: 'John Doe' },
      owner_email: { type: 'string', nullable: true, example: 'john@example.com' },
      owner_phone: { type: 'string', nullable: true, example: '9876543210' },
      owner_profile_picture: { type: 'string', nullable: true },
      address_line1: { type: 'string', nullable: true },
      address_line2: { type: 'string', nullable: true },
      city: { type: 'string', nullable: true },
      state: { type: 'string', nullable: true },
      postal_code: { type: 'string', nullable: true },
      country: { type: 'string', nullable: true },
      latitude: { type: 'number', nullable: true },
      longitude: { type: 'number', nullable: true },
      gst_no: { type: 'string', nullable: true },
      transaction_currency: { type: 'string', nullable: true },
      max_distance: { type: 'integer', nullable: true },
      attendance_methods: { type: 'string', nullable: true, description: 'JSON string of enabled attendance methods' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
      total_employees: { type: 'integer', example: 25 },
      active_employees: { type: 'integer', example: 20 },
      total_bank_accounts: { type: 'integer', example: 3 },
      total_subscriptions: { type: 'integer', example: 5 },
      active_subscription: {
        type: 'object',
        nullable: true,
        description: 'Currently active subscription, or null if none',
        properties: {
          id: { type: 'integer' },
          package_id: { type: 'integer' },
          package_type: { type: 'string', example: 'normal' },
          package_name: { type: 'string', nullable: true },
          employee_limit: { type: 'integer' },
          subscription_type: { type: 'string', enum: ['monthly', 'quarterly', 'half_yearly', 'yearly'] },
          amount_paid: { type: 'number' },
          starts_at: { type: 'string', format: 'date-time' },
          expires_at: { type: 'string', format: 'date-time' },
          payment_status: { type: 'string', enum: ['0', '1', '2', '3'] },
          is_active: { type: 'integer' },
        },
      },
    },
  },
  AdminCompanyEmployeeItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      user_id: { type: 'integer', example: 10 },
      name: { type: 'string', example: 'Jane Smith' },
      email: { type: 'string', example: 'jane@example.com' },
      phone: { type: 'string', example: '9876543210' },
      profile_picture: { type: 'string', nullable: true },
      employee_code: { type: 'string', nullable: true, example: 'EMP001' },
      designation: { type: 'string', nullable: true, example: 'Software Engineer' },
      salary_type: { type: 'string', nullable: true, example: 'monthly' },
      employment_type: { type: 'string', nullable: true, example: 'full_time' },
      joining_date: { type: 'string', format: 'date', nullable: true },
      status: { type: 'string', nullable: true, example: 'active' },
      is_active: { type: 'integer', example: 1 },
      face_enrolled: { type: 'integer', example: 0 },
      fingerprint_mapped: { type: 'integer', example: 0 },
      shift_start: { type: 'string', nullable: true, example: '09:00:00' },
      shift_end: { type: 'string', nullable: true, example: '18:00:00' },
      expected_work_minutes: { type: 'integer', nullable: true, example: 480 },
      enable_overtime: { type: 'integer', example: 0 },
      enable_deduction: { type: 'integer', example: 0 },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  AdminCompanySubscriptionItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      package_id: { type: 'integer', example: 2 },
      package_type: { type: 'string', example: 'normal' },
      package_name: { type: 'string', nullable: true, example: 'Pro Plan' },
      min_employee_count: { type: 'integer', nullable: true, example: 1 },
      max_employee_count: { type: 'integer', nullable: true, example: 50 },
      employee_limit: { type: 'integer', example: 50 },
      subscription_type: { type: 'string', enum: ['monthly', 'quarterly', 'half_yearly', 'yearly'] },
      amount_paid: { type: 'number', example: 999.00 },
      starts_at: { type: 'string', format: 'date-time' },
      expires_at: { type: 'string', format: 'date-time' },
      payment_reference: { type: 'string', nullable: true },
      payment_status: { type: 'string', enum: ['0', '1', '2', '3'], description: '0=pending, 1=success, 2=failed, 3=refunded' },
      payment_order_id: { type: 'string', nullable: true },
      payment_vpa: { type: 'string', nullable: true },
      payment_utr: { type: 'string', nullable: true },
      is_active: { type: 'integer', example: 1 },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  AdminCompanyTransactionItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      transaction_id: { type: 'string', nullable: true, example: 'TXN_20260801_001' },
      employee_id: { type: 'integer', example: 5 },
      employee_name: { type: 'string', nullable: true, example: 'Jane Smith' },
      transaction_date: { type: 'string', format: 'date', example: '2026-08-01' },
      transaction_type: { type: 'string', enum: ['payment', 'receive', 'salary', 'opening_balance', 'fine', 'bonus'] },
      entry_type: { type: 'string', enum: ['debit', 'credit'] },
      amount: { type: 'number', example: 25000.00 },
      remark: { type: 'string', nullable: true },
      create_date: { type: 'string', format: 'date-time' },
      modify_date: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  AdminCompanyTransactionSummary: {
    type: 'object',
    properties: {
      total_credit: { type: 'number', example: 150000.00 },
      total_debit: { type: 'number', example: 120000.00 },
    },
  },
  AdminCompanyBankAccountItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      employee_id: { type: 'integer', nullable: true, example: 5 },
      employee_name: { type: 'string', nullable: true, example: 'Jane Smith' },
      account_type: { type: 'string', enum: ['cash', 'current', 'savings', 'loan', 'upi'] },
      bank_name: { type: 'string', nullable: true, example: 'State Bank of India' },
      account_holder_name: { type: 'string', nullable: true, example: 'Jane Smith' },
      account_number: { type: 'string', nullable: true, example: '12345678901234' },
      ifsc_code: { type: 'string', nullable: true, example: 'SBIN0001234' },
      branch_name: { type: 'string', nullable: true },
      upi_id: { type: 'string', nullable: true, example: 'jane@upi' },
      is_primary: { type: 'integer', example: 1 },
      status: { type: 'string', enum: ['active', 'inactive'] },
      is_active: { type: 'integer', example: 1 },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  AdminCompanyAttendanceOverview: {
    type: 'object',
    properties: {
      period: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date', example: '2026-08-01' },
          to: { type: 'string', format: 'date', example: '2026-08-31' },
        },
      },
      status_breakdown: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            day_status: { type: 'string', enum: ['present', 'absent', 'leave', 'half_day'] },
            count: { type: 'integer', example: 120 },
          },
        },
      },
      time_summary: {
        type: 'object',
        properties: {
          unique_employees: { type: 'integer', example: 20 },
          total_shifts: { type: 'integer', example: 440 },
          total_worked_minutes: { type: 'integer', example: 211200 },
          total_overtime_minutes: { type: 'integer', example: 3600 },
          total_late_minutes: { type: 'integer', example: 1200 },
          total_deductible_minutes: { type: 'integer', example: 800 },
          total_early_leave_minutes: { type: 'integer', example: 600 },
        },
      },
      leave_summary: {
        type: 'object',
        properties: {
          total_leaves: { type: 'integer', example: 15 },
          employees_on_leave: { type: 'integer', example: 8 },
        },
      },
    },
  },
};

const SECURITY = [{ bearerAuth: [] }];

const COMMON_ERRORS = {
  401: {
    description: 'Not authenticated',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } },
  },
  403: {
    description: 'Not an admin',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } },
  },
  500: {
    description: 'Internal server error',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } },
  },
};

const NOT_FOUND = {
  404: {
    description: 'Company not found',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
  },
};

const COMPANY_ID_PARAM = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer' },
  description: 'Company ID',
};

export const paths = {
  '/admin/companies': {
    get: {
      tags: ['Admin Companies'],
      summary: 'List all companies',
      description: 'Paginated list of all companies with owner details. Supports search and active filter.',
      operationId: 'adminListCompanies',
      security: SECURITY,
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page (max 100)' },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by company name, legal name, or owner name/email' },
        { name: 'is_active', in: 'query', schema: { type: 'integer', enum: [0, 1] }, description: 'Filter by active status' },
      ],
      responses: {
        200: {
          description: 'Companies fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/AdminCompanyListItem' } },
                  meta: { $ref: '#/components/schemas/PaginationMeta' },
                },
              },
            },
          },
        },
        ...COMMON_ERRORS,
      },
    },
  },

  '/admin/companies/{id}': {
    get: {
      tags: ['Admin Companies'],
      summary: 'Get company details',
      description: 'Full company details including owner info, aggregated counts (employees, bank accounts, subscriptions), and the currently active subscription.',
      operationId: 'adminGetCompanyDetails',
      security: SECURITY,
      parameters: [COMPANY_ID_PARAM],
      responses: {
        200: {
          description: 'Company details fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { $ref: '#/components/schemas/AdminCompanyDetail' },
                },
              },
            },
          },
        },
        ...NOT_FOUND,
        ...COMMON_ERRORS,
      },
    },
  },

  '/admin/companies/{id}/employees': {
    get: {
      tags: ['Admin Companies'],
      summary: "List company's employees",
      description: 'Paginated list of employees in a company with user details. Searchable by name, email, phone, employee code, or designation.',
      operationId: 'adminGetCompanyEmployees',
      security: SECURITY,
      parameters: [
        COMPANY_ID_PARAM,
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page (max 100)' },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by name, email, phone, employee code, or designation' },
        { name: 'is_active', in: 'query', schema: { type: 'integer', enum: [0, 1] }, description: 'Filter by active status' },
        { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by employee status' },
        { name: 'employment_type', in: 'query', schema: { type: 'string' }, description: 'Filter by employment type (e.g. full_time, part_time)' },
      ],
      responses: {
        200: {
          description: 'Company employees fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/AdminCompanyEmployeeItem' } },
                  meta: { $ref: '#/components/schemas/PaginationMeta' },
                },
              },
            },
          },
        },
        ...COMMON_ERRORS,
      },
    },
  },

  '/admin/companies/{id}/subscriptions': {
    get: {
      tags: ['Admin Companies'],
      summary: "List company's subscriptions",
      description: 'Paginated subscription history for a company with package details and payment info.',
      operationId: 'adminGetCompanySubscriptions',
      security: SECURITY,
      parameters: [
        COMPANY_ID_PARAM,
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page (max 100)' },
        { name: 'is_active', in: 'query', schema: { type: 'integer', enum: [0, 1] }, description: 'Filter by active status' },
        { name: 'payment_status', in: 'query', schema: { type: 'string', enum: ['0', '1', '2', '3'] }, description: 'Filter by payment status (0=pending, 1=success, 2=failed, 3=refunded)' },
      ],
      responses: {
        200: {
          description: 'Company subscriptions fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/AdminCompanySubscriptionItem' } },
                  meta: { $ref: '#/components/schemas/PaginationMeta' },
                },
              },
            },
          },
        },
        ...COMMON_ERRORS,
      },
    },
  },

  '/admin/companies/{id}/transactions': {
    get: {
      tags: ['Admin Companies'],
      summary: "List company's transactions",
      description: 'Paginated financial transactions for a company. Includes a credit/debit summary. Supports date range and type filters.',
      operationId: 'adminGetCompanyTransactions',
      security: SECURITY,
      parameters: [
        COMPANY_ID_PARAM,
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page (max 100)' },
        { name: 'transaction_type', in: 'query', schema: { type: 'string', enum: ['payment', 'receive', 'salary', 'opening_balance', 'fine', 'bonus'] }, description: 'Filter by transaction type' },
        { name: 'entry_type', in: 'query', schema: { type: 'string', enum: ['debit', 'credit'] }, description: 'Filter by entry type' },
        { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date (inclusive)' },
        { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date (inclusive)' },
      ],
      responses: {
        200: {
          description: 'Company transactions fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: {
                    type: 'object',
                    properties: {
                      transactions: { type: 'array', items: { $ref: '#/components/schemas/AdminCompanyTransactionItem' } },
                      summary: { $ref: '#/components/schemas/AdminCompanyTransactionSummary' },
                    },
                  },
                  meta: { $ref: '#/components/schemas/PaginationMeta' },
                },
              },
            },
          },
        },
        ...COMMON_ERRORS,
      },
    },
  },

  '/admin/companies/{id}/bank-accounts': {
    get: {
      tags: ['Admin Companies'],
      summary: "List company's bank accounts",
      description: 'Paginated list of bank accounts belonging to a company, with employee names. Filterable by account type and status.',
      operationId: 'adminGetCompanyBankAccounts',
      security: SECURITY,
      parameters: [
        COMPANY_ID_PARAM,
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page (max 100)' },
        { name: 'account_type', in: 'query', schema: { type: 'string', enum: ['cash', 'current', 'savings', 'loan', 'upi'] }, description: 'Filter by account type' },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] }, description: 'Filter by account status' },
      ],
      responses: {
        200: {
          description: 'Company bank accounts fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/AdminCompanyBankAccountItem' } },
                  meta: { $ref: '#/components/schemas/PaginationMeta' },
                },
              },
            },
          },
        },
        ...COMMON_ERRORS,
      },
    },
  },

  '/admin/companies/{id}/attendance-overview': {
    get: {
      tags: ['Admin Companies'],
      summary: "Company attendance overview",
      description: 'Aggregated attendance statistics for a company in a given date range. Defaults to current month. Returns status breakdown (present/absent/leave/half_day), time summary (worked, overtime, late, deductions), and leave summary.',
      operationId: 'adminGetCompanyAttendanceOverview',
      security: SECURITY,
      parameters: [
        COMPANY_ID_PARAM,
        { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date (defaults to 1st of current month)' },
        { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date (defaults to last day of current month)' },
      ],
      responses: {
        200: {
          description: 'Attendance overview fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { $ref: '#/components/schemas/AdminCompanyAttendanceOverview' },
                },
              },
            },
          },
        },
        ...COMMON_ERRORS,
      },
    },
  },
};

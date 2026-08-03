// ─── Admin Users OpenAPI Paths ─────────────────────────────────

export const schemas = {
  AdminUserListItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      email: { type: 'string', example: 'user@example.com' },
      phone: { type: 'string', example: '9876543210' },
      name: { type: 'string', example: 'John Doe' },
      profile_picture: { type: 'string', nullable: true },
      profession: { type: 'string', nullable: true },
      whatsapp: { type: 'string', nullable: true },
      is_active: { type: 'integer', example: 1 },
      is_system_admin: { type: 'boolean', example: false },
      is_admin: { type: 'boolean', example: false },
      last_login: { type: 'string', format: 'date-time', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  AdminUserDetail: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      email: { type: 'string', example: 'user@example.com' },
      phone: { type: 'string', example: '9876543210' },
      name: { type: 'string', example: 'John Doe' },
      profile_picture: { type: 'string', nullable: true },
      profession: { type: 'string', nullable: true },
      whatsapp: { type: 'string', nullable: true },
      is_active: { type: 'integer', example: 1 },
      is_system_admin: { type: 'boolean', example: false },
      last_login: { type: 'string', format: 'date-time', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
      owned_companies_count: { type: 'integer', example: 2 },
      employee_memberships_count: { type: 'integer', example: 3 },
    },
  },
  AdminUserCompanyItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      name: { type: 'string', example: 'Acme Corp' },
      legal_name: { type: 'string', nullable: true, example: 'Acme Corporation Pvt Ltd' },
      logo_url: { type: 'string', nullable: true },
      is_active: { type: 'integer', example: 1 },
      owner_user_id: { type: 'integer', example: 1 },
      is_owner: { type: 'integer', example: 1, description: '1 if the user owns this company, 0 if employee' },
      city: { type: 'string', nullable: true },
      state: { type: 'string', nullable: true },
      country: { type: 'string', nullable: true },
      gst_no: { type: 'string', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
      employee_count: { type: 'integer', example: 15 },
    },
  },
  AdminUserPaymentItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      transaction_id: { type: 'string', nullable: true, example: 'TXN_20260801_001' },
      company_id: { type: 'integer', example: 1 },
      company_name: { type: 'string', nullable: true, example: 'Acme Corp' },
      employee_id: { type: 'integer', example: 5 },
      transaction_date: { type: 'string', format: 'date', example: '2026-08-01' },
      transaction_type: { type: 'string', enum: ['payment', 'receive', 'salary', 'opening_balance', 'fine', 'bonus'] },
      entry_type: { type: 'string', enum: ['debit', 'credit'] },
      amount: { type: 'number', example: 25000.00 },
      remark: { type: 'string', nullable: true },
      create_date: { type: 'string', format: 'date-time' },
      modify_date: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  AdminUserSubscriptionItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      company_id: { type: 'integer', example: 1 },
      company_name: { type: 'string', nullable: true, example: 'Acme Corp' },
      package_id: { type: 'integer', example: 2 },
      package_type: { type: 'string', example: 'normal' },
      package_name: { type: 'string', nullable: true, example: 'Pro Plan' },
      employee_limit: { type: 'integer', example: 50 },
      subscription_type: { type: 'string', enum: ['monthly', 'quarterly', 'half_yearly', 'yearly'] },
      amount_paid: { type: 'number', example: 999.00 },
      starts_at: { type: 'string', format: 'date-time' },
      expires_at: { type: 'string', format: 'date-time' },
      payment_reference: { type: 'string', nullable: true },
      payment_status: { type: 'string', enum: ['0', '1', '2', '3'], description: '0=pending, 1=success, 2=failed, 3=refunded' },
      payment_order_id: { type: 'string', nullable: true },
      is_active: { type: 'integer', example: 1 },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  AdminUserBankAccountItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      company_id: { type: 'integer', example: 1 },
      company_name: { type: 'string', nullable: true, example: 'Acme Corp' },
      employee_id: { type: 'integer', example: 5 },
      account_type: { type: 'string', enum: ['cash', 'current', 'savings', 'loan', 'upi'] },
      bank_name: { type: 'string', nullable: true, example: 'State Bank of India' },
      account_holder_name: { type: 'string', nullable: true, example: 'John Doe' },
      account_number: { type: 'string', nullable: true, example: '12345678901234' },
      ifsc_code: { type: 'string', nullable: true, example: 'SBIN0001234' },
      branch_name: { type: 'string', nullable: true },
      upi_id: { type: 'string', nullable: true, example: 'john@upi' },
      is_primary: { type: 'integer', example: 1 },
      status: { type: 'string', enum: ['active', 'inactive'] },
      is_active: { type: 'integer', example: 1 },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
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
    description: 'User not found',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
  },
};

const USER_ID_PARAM = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer' },
  description: 'User ID',
};

export const paths = {
  '/admin/users': {
    get: {
      tags: ['Admin Users'],
      summary: 'List regular users',
      description: 'Paginated list of non-admin users only, with optional search and active filter.',
      operationId: 'adminListUsers',
      security: SECURITY,
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page (max 100)' },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by name, email, or phone' },
        { name: 'is_active', in: 'query', schema: { type: 'integer', enum: [0, 1] }, description: 'Filter by active status' },
        { name: 'is_admin', in: 'query', schema: { type: 'boolean' }, description: 'Reserved for compatibility; this endpoint always returns non-admin users' },
      ],
      responses: {
        200: {
          description: 'Users fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/AdminUserListItem' } },
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

  '/admin/users/{id}': {
    get: {
      tags: ['Admin Users'],
      summary: 'Get user details',
      description: 'Fetch full details for a single user, including owned companies count and employee memberships count.',
      operationId: 'adminGetUserDetails',
      security: SECURITY,
      parameters: [USER_ID_PARAM],
      responses: {
        200: {
          description: 'User details fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { $ref: '#/components/schemas/AdminUserDetail' },
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

  '/admin/users/{id}/companies': {
    get: {
      tags: ['Admin Users'],
      summary: "List user's companies",
      description: 'Paginated list of companies the user owns or is employed at. Includes an is_owner flag and employee count per company.',
      operationId: 'adminGetUserCompanies',
      security: SECURITY,
      parameters: [
        USER_ID_PARAM,
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page (max 100)' },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by company name or legal name' },
        { name: 'is_active', in: 'query', schema: { type: 'integer', enum: [0, 1] }, description: 'Filter by active status' },
      ],
      responses: {
        200: {
          description: 'User companies fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/AdminUserCompanyItem' } },
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

  '/admin/users/{id}/payments': {
    get: {
      tags: ['Admin Users'],
      summary: "List user's payments",
      description: 'Paginated list of all payment transactions linked to the user via their employee records. Filterable by transaction type and entry type.',
      operationId: 'adminGetUserPayments',
      security: SECURITY,
      parameters: [
        USER_ID_PARAM,
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page (max 100)' },
        { name: 'transaction_type', in: 'query', schema: { type: 'string', enum: ['payment', 'receive', 'salary', 'opening_balance', 'fine', 'bonus'] }, description: 'Filter by transaction type' },
        { name: 'entry_type', in: 'query', schema: { type: 'string', enum: ['debit', 'credit'] }, description: 'Filter by entry type' },
      ],
      responses: {
        200: {
          description: 'User payments fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/AdminUserPaymentItem' } },
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

  '/admin/users/{id}/subscriptions': {
    get: {
      tags: ['Admin Users'],
      summary: "List user's subscriptions",
      description: "Paginated list of subscription packages for companies owned by this user. Shows package details, billing period, payment status, and expiry.",
      operationId: 'adminGetUserSubscriptions',
      security: SECURITY,
      parameters: [
        USER_ID_PARAM,
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page (max 100)' },
        { name: 'is_active', in: 'query', schema: { type: 'integer', enum: [0, 1] }, description: 'Filter by active status' },
      ],
      responses: {
        200: {
          description: 'User subscriptions fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/AdminUserSubscriptionItem' } },
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

  '/admin/users/{id}/bank-accounts': {
    get: {
      tags: ['Admin Users'],
      summary: "List user's bank accounts",
      description: "Paginated list of bank accounts linked to the user via their employee records. Filterable by account type and status.",
      operationId: 'adminGetUserBankAccounts',
      security: SECURITY,
      parameters: [
        USER_ID_PARAM,
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page (max 100)' },
        { name: 'account_type', in: 'query', schema: { type: 'string', enum: ['cash', 'current', 'savings', 'loan', 'upi'] }, description: 'Filter by account type' },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] }, description: 'Filter by account status' },
      ],
      responses: {
        200: {
          description: 'User bank accounts fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/AdminUserBankAccountItem' } },
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
};


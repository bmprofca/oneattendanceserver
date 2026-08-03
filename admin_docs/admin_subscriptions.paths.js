export const schemas = {
  AdminSubscriptionListItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 11 },
      company_id: { type: 'integer', example: 3 },
      company_name: { type: 'string', example: 'Acme Corp' },
      company_legal_name: { type: 'string', nullable: true, example: 'Acme Corporation Pvt Ltd' },
      owner_user_id: { type: 'integer', example: 7 },
      owner_name: { type: 'string', nullable: true, example: 'John Doe' },
      owner_email: { type: 'string', nullable: true, example: 'john@example.com' },
      package_id: { type: 'integer', example: 2 },
      package_type: { type: 'string', example: 'normal' },
      package_name: { type: 'string', example: 'Pro' },
      min_employee_count: { type: 'integer', example: 1 },
      max_employee_count: { type: 'integer', example: 100 },
      employee_limit: { type: 'integer', example: 100 },
      subscription_type: { type: 'string', example: 'monthly' },
      amount_paid: { type: 'number', example: 499 },
      starts_at: { type: 'string', format: 'date-time' },
      expires_at: { type: 'string', format: 'date-time' },
      payment_reference: { type: 'string', nullable: true },
      payment_status: { type: 'string', enum: ['pending', 'success', 'fail', 'cancel'], example: 'success' },
      payment_order_id: { type: 'string', nullable: true },
      payment_vpa: { type: 'string', nullable: true },
      payment_utr: { type: 'string', nullable: true },
      is_active: { type: 'boolean', example: true },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
      is_deleted: { type: 'boolean', example: false },
      deleted_at: { type: 'string', nullable: true, format: 'date-time' },
      deleted_by: { type: 'integer', nullable: true },
    },
  },
  AdminCreateSubscriptionRequest: {
    type: 'object',
    required: ['company_id', 'package_id', 'package_type', 'subscription_type', 'amount_paid', 'starts_at', 'expires_at'],
    properties: {
      company_id: { type: 'integer', example: 3 },
      package_id: { type: 'integer', example: 2 },
      package_type: { type: 'string', enum: ['normal', 'custom'], example: 'normal' },
      employee_limit: { type: 'integer', example: 100 },
      subscription_type: { type: 'string', enum: ['monthly', 'quarterly', 'half_yearly', 'yearly'], example: 'monthly' },
      amount_paid: { type: 'number', example: 499 },
      starts_at: { type: 'string', format: 'date-time', example: '2026-08-01T00:00:00.000Z' },
      expires_at: { type: 'string', format: 'date-time', example: '2026-09-01T00:00:00.000Z' },
      payment_reference: { type: 'string', nullable: true },
      payment_status: { type: 'string', enum: ['pending', 'success', 'fail', 'cancel'], example: 'success' },
      is_active: { type: 'integer', enum: [0, 1], example: 1 },
    },
  },
  AdminSubscriptionStatusUpdateRequest: {
    type: 'object',
    properties: {
      is_active: { type: 'integer', enum: [0, 1], description: 'Set subscription active/inactive state' },
      status: { type: 'string', enum: ['active', 'inactive'], description: 'Alternative human-friendly status flag' },
      payment_status: { type: 'string', enum: ['pending', 'success', 'fail', 'cancel'], description: 'Update payment status' },
      starts_at: { type: 'string', format: 'date-time', description: 'Update the subscription start date' },
      expires_at: { type: 'string', format: 'date-time', description: 'Update the subscription end date' },
    },
  },
  AdminUpdateSubscriptionRequest: {
    type: 'object',
    properties: {
      company_id: { type: 'integer', example: 3 },
      package_id: { type: 'integer', example: 2 },
      package_type: { type: 'string', enum: ['normal', 'custom'], example: 'normal' },
      employee_limit: { type: 'integer', example: 100 },
      subscription_type: { type: 'string', enum: ['monthly', 'quarterly', 'half_yearly', 'yearly'], example: 'monthly' },
      amount_paid: { type: 'number', example: 499 },
      starts_at: { type: 'string', format: 'date-time', example: '2026-08-01T00:00:00.000Z' },
      expires_at: { type: 'string', format: 'date-time', example: '2026-09-01T00:00:00.000Z' },
      payment_reference: { type: 'string', nullable: true },
      payment_status: { type: 'string', enum: ['pending', 'success', 'fail', 'cancel'], example: 'success' },
      payment_order_id: { type: 'string', nullable: true },
      payment_vpa: { type: 'string', nullable: true },
      payment_utr: { type: 'string', nullable: true },
      is_active: { type: 'integer', enum: [0, 1], example: 1 },
    },
  },
  AdminWhatsAppTemplateItem: {
    type: 'object',
    properties: {
      template_name: { type: 'string', example: 'oa_subscription_expire_alert' },
      template_id: { type: 'string', example: '519q8oqx146571iu6jlnib465lfo8h0lfft6f667oaw' },
      waba_template_id: { type: 'string', example: '1439548131345401' },
      status: { type: 'string', example: 'APPROVED' },
      category: { type: 'string', example: 'MARKETING' },
      language_code: { type: 'string', example: 'en' },
      body_text: { type: 'string', example: 'Hello {{1}}, Your *{{2}}* subscription will expire in *{{3}}* day(s) (*{{4}}*).' },
      variable_count: { type: 'integer', example: 4 },
      variables: { type: 'array', items: { type: 'string' }, example: ['{{1}}', '{{2}}', '{{3}}', '{{4}}'] },
      components: { type: 'array', items: { type: 'object' } },
    },
  },
  AdminAlertConfig: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      alert_days_before: { type: 'integer', example: 5, description: 'How many days before expiry alerts start' },
      alert_template_name: { type: 'string', nullable: true, example: 'oa_subscription_expire_alert' },
      alert_template_vars: {
        type: 'array',
        items: { type: 'string' },
        example: ['company_name', 'package_name', 'days_remaining', 'expiry_date'],
        description: 'Ordered list of variable source keys mapped to template placeholders',
      },
      renewal_template_name: { type: 'string', nullable: true, example: 'oa_subscription_expired_notice' },
      renewal_template_vars: {
        type: 'array',
        items: { type: 'string' },
        example: ['company_name', 'expiry_date'],
      },
      is_renewal_enabled: { type: 'boolean', example: false },
      is_alert_enabled: { type: 'boolean', example: true },
      updated_by: { type: 'integer', nullable: true },
      updated_at: { type: 'string', format: 'date-time', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  AdminUpdateAlertConfigRequest: {
    type: 'object',
    description: 'All fields are optional — only provided fields are updated.',
    properties: {
      alert_days_before: { type: 'integer', minimum: 1, maximum: 90, example: 7, description: 'Days before expiry to start sending alerts' },
      alert_template_name: { type: 'string', example: 'oa_subscription_expire_alert', description: 'OneChatting template name for pre-expiry alerts' },
      alert_template_vars: {
        type: 'array',
        items: { type: 'string', enum: ['company_name', 'package_name', 'owner_name', 'subscription_type', 'days_remaining', 'expiry_date'] },
        example: ['company_name', 'package_name', 'days_remaining', 'expiry_date'],
        description: 'Ordered variable source keys — must match template placeholder count',
      },
      renewal_template_name: { type: 'string', example: 'oa_subscription_expired_notice', description: 'Template for post-expiry renewal notices' },
      renewal_template_vars: {
        type: 'array',
        items: { type: 'string', enum: ['company_name', 'package_name', 'owner_name', 'subscription_type', 'days_remaining', 'expiry_date'] },
        example: ['company_name', 'expiry_date'],
      },
      is_renewal_enabled: { type: 'boolean', description: 'Whether to also send renewal notices after expiry' },
      is_alert_enabled: { type: 'boolean', description: 'Master switch — disables the entire alert cron when false' },
    },
  },
  AdminAlertLogItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 42 },
      subscription_id: { type: 'integer', example: 11 },
      alert_type: { type: 'string', enum: ['pre_expiry', 'renewal'], example: 'pre_expiry' },
      sent_at: { type: 'string', format: 'date-time' },
      days_before: { type: 'integer', nullable: true, example: 3, description: 'Positive = days until expiry, negative = days since expiry' },
      mobile: { type: 'string', example: '919876543210' },
      template_name: { type: 'string', example: 'oa_subscription_expire_alert' },
      status: { type: 'string', enum: ['sent', 'failed'], example: 'sent' },
      error_message: { type: 'string', nullable: true },
      company_name: { type: 'string', example: 'Acme Corp' },
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

export const paths = {
  '/admin/subscriptions': {
    post: {
      tags: ['Admin Subscriptions'],
      summary: 'Create a subscription',
      description: 'Create a subscription entry for a company from the admin panel.',
      operationId: 'adminCreateSubscription',
      security: SECURITY,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AdminCreateSubscriptionRequest' },
          },
        },
      },
      responses: {
        201: {
          description: 'Subscription created',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/IdResponse' } } },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        404: {
          description: 'Company or package not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
    get: {
      tags: ['Admin Subscriptions'],
      summary: 'List company subscriptions',
      description: 'Browse subscription records for all companies with filters for company, active state, payment status, and search terms.',
      operationId: 'adminListSubscriptions',
      security: SECURITY,
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page (max 100)' },
        { name: 'company_id', in: 'query', schema: { type: 'integer' }, description: 'Filter by company ID' },
        { name: 'is_active', in: 'query', schema: { type: 'integer', enum: [0, 1] }, description: 'Filter by active status' },
        { name: 'payment_status', in: 'query', schema: { type: 'string', enum: ['pending', 'success', 'fail', 'cancel'] }, description: 'Filter by payment status' },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by company name, legal name, package name, owner name, or email' },
      ],
      responses: {
        200: {
          description: 'Subscriptions fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/AdminSubscriptionListItem' } },
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

  '/admin/subscriptions/{id}': {
    get: {
      tags: ['Admin Subscriptions'],
      summary: 'Get a subscription by ID',
      description: 'Retrieve a single subscription with company and package details.',
      operationId: 'adminGetSubscription',
      security: SECURITY,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Subscription ID' },
      ],
      responses: {
        200: {
          description: 'Subscription fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { $ref: '#/components/schemas/AdminSubscriptionListItem' },
                },
              },
            },
          },
        },
        404: {
          description: 'Subscription not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
    put: {
      tags: ['Admin Subscriptions'],
      summary: 'Update a subscription fully',
      description: 'Update the entire subscription details, including company, package, dates, and payment info.',
      operationId: 'adminUpdateSubscription',
      security: SECURITY,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Subscription ID' },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AdminUpdateSubscriptionRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Subscription updated successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { $ref: '#/components/schemas/AdminSubscriptionListItem' },
                },
              },
            },
          },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        404: {
          description: 'Subscription, Company or package not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
  },

  '/admin/subscriptions/{id}/status': {
    patch: {
      tags: ['Admin Subscriptions'],
      summary: 'Update subscription details',
      description: 'Allow admins to update active/inactive state, payment status, and subscription dates like starts_at and expires_at.',
      operationId: 'adminUpdateSubscriptionStatus',
      security: SECURITY,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Subscription ID' },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AdminSubscriptionStatusUpdateRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Subscription status updated',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { $ref: '#/components/schemas/AdminSubscriptionListItem' },
                },
              },
            },
          },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        404: {
          description: 'Subscription not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
  },

  '/admin/subscriptions/whatsapp-templates': {
    get: {
      tags: ['Admin Subscriptions'],
      summary: 'List available WhatsApp templates',
      description: 'Fetches all WhatsApp message templates from OneChatting with parsed variable information so admin can choose which template to use for subscription alerts.',
      operationId: 'adminListWhatsAppTemplates',
      security: SECURITY,
      responses: {
        200: {
          description: 'Templates fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/AdminWhatsAppTemplateItem' } },
                },
              },
            },
          },
        },
        502: {
          description: 'Failed to fetch templates from OneChatting',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
  },

  '/admin/subscriptions/alert-config': {
    get: {
      tags: ['Admin Subscriptions'],
      summary: 'Get subscription alert config',
      description: 'Returns the current admin-configurable settings for the subscription WhatsApp alert cron job, including how many days before expiry alerts start, which templates to use, and the variable mappings.',
      operationId: 'adminGetAlertConfig',
      security: SECURITY,
      responses: {
        200: {
          description: 'Alert config fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { $ref: '#/components/schemas/AdminAlertConfig' },
                },
              },
            },
          },
        },
        404: {
          description: 'Alert config not found — run DB migration first',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
    put: {
      tags: ['Admin Subscriptions'],
      summary: 'Update subscription alert config',
      description: [
        'Admin updates the subscription WhatsApp alert configuration. All fields are optional — only provided fields are updated.',
        '',
        '**Supported variable source keys** (for `alert_template_vars` and `renewal_template_vars`):',
        '`company_name` | `package_name` | `owner_name` | `subscription_type` | `days_remaining` | `expiry_date`',
        '',
        'The order of keys in the array maps to `{{1}}`, `{{2}}`, etc. in the WhatsApp template body.',
      ].join('\n'),
      operationId: 'adminUpdateAlertConfig',
      security: SECURITY,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AdminUpdateAlertConfigRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Alert config updated successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { $ref: '#/components/schemas/AdminAlertConfig' },
                },
              },
            },
          },
        },
        400: {
          description: 'Validation error (invalid days, unsupported var keys, etc.)',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
  },

  '/admin/subscriptions/alert-logs': {
    get: {
      tags: ['Admin Subscriptions'],
      summary: 'List subscription alert logs',
      description: 'Paginated audit log of all WhatsApp subscription alerts sent by the cron job. Useful for tracking which companies received alerts, the template used, and whether the send succeeded or failed.',
      operationId: 'adminListAlertLogs',
      security: SECURITY,
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page (max 100)' },
        { name: 'subscription_id', in: 'query', schema: { type: 'integer' }, description: 'Filter by subscription ID' },
        { name: 'alert_type', in: 'query', schema: { type: 'string', enum: ['pre_expiry', 'renewal'] }, description: 'Filter by alert type' },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['sent', 'failed'] }, description: 'Filter by send status' },
      ],
      responses: {
        200: {
          description: 'Alert logs fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/AdminAlertLogItem' } },
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

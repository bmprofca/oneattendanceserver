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
  AdminSubscriptionNotifyResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'Subscription alert WhatsApp message sent successfully' },
      data: {
        type: 'object',
        oneOf: [
          {
            title: 'Expiry Alert (subscription still active)',
            properties: {
              type: { type: 'string', enum: ['expiry_alert'], example: 'expiry_alert' },
              company_name: { type: 'string', example: 'Acme Corp' },
              package_name: { type: 'string', example: 'Pro' },
              starts_at: { type: 'string', example: '01 Jul 2026' },
              expires_at: { type: 'string', example: '01 Aug 2026' },
              days_remaining: { type: 'integer', example: 5 },
              mobile_sent_to: { type: 'string', example: '919876543210' },
            },
          },
          {
            title: 'Renewal Request (subscription already expired)',
            properties: {
              type: { type: 'string', enum: ['renewal_request'], example: 'renewal_request' },
              company_name: { type: 'string', example: 'Acme Corp' },
              package_name: { type: 'string', example: 'Pro' },
              expired_on: { type: 'string', example: '01 Jul 2026' },
              mobile_sent_to: { type: 'string', example: '919876543210' },
            },
          },
        ],
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

  '/admin/subscriptions/{id}/notify': {
    post: {
      tags: ['Admin Subscriptions'],
      summary: 'Send subscription WhatsApp notification',
      description: [
        'Sends a WhatsApp message to the company owner regarding their subscription status.',
        '',
        '**Logic:**',
        '- If the subscription **has expired** (`now > expires_at`), a **renewal request** message is sent asking the owner to renew.',
        '- If the subscription is **still active**, a **pre-expiry alert** is sent showing the package name, start date, expiry date, and the number of days remaining.',
        '',
        'The response includes a `type` field (`expiry_alert` or `renewal_request`) so the frontend can display the appropriate UI feedback.',
      ].join('\n'),
      operationId: 'adminNotifySubscription',
      security: SECURITY,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Subscription ID' },
      ],
      responses: {
        200: {
          description: 'WhatsApp notification sent successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminSubscriptionNotifyResponse' },
            },
          },
        },
        400: {
          description: 'Invalid subscription ID',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        404: {
          description: 'Subscription not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
        },
        422: {
          description: 'Owner mobile number not found — cannot send WhatsApp message',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
  },
};

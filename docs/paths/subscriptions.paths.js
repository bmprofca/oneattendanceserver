export const schemas = {
  SubscriptionPackage: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      package_name: { type: 'string', example: 'Pro Tier' },
      min_employee_count: { type: 'integer', example: 1 },
      max_employee_count: { type: 'integer', example: 100 },
      monthly_price: { type: 'number', example: 499 },
      quarterly_price: { type: 'number', example: 1399 },
      half_yearly_price: { type: 'number', example: 2699 },
      yearly_price: { type: 'number', example: 4999 },
      description: { type: 'string', nullable: true, example: 'All feature package' },
    },
  },
  PurchaseSubscriptionPayload: {
    type: 'object',
    required: ['package_id', 'package_period', 'amount_paid'],
    properties: {
      package_id: { type: 'integer', example: 1 },
      package_period: { type: 'string', enum: ['monthly', 'quarterly', 'half_yearly', 'yearly'], example: 'monthly' },
      amount_paid: { type: 'number', example: 499 },
    },
  },
};

export const paths = {
  '/subscriptions/packages': {
    get: {
      tags: ['Subscriptions'],
      summary: 'Get available subscription packages list',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Subscription packages list fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Subscription packages fetched successfully',
                data: [
                  { id: 1, package_name: 'Starter', min_employee_count: 1, max_employee_count: 10, monthly_price: 499, quarterly_price: 1399, half_yearly_price: 2699, yearly_price: 4999 },
                ],
              },
            },
          },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/subscriptions/purchase-subscription': {
    post: {
      tags: ['Subscriptions'],
      summary: 'Purchase or renew company subscription package',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PurchaseSubscriptionPayload' },
            examples: {
              purchase: { summary: 'Purchase package', value: { package_id: 1, package_period: 'monthly', amount_paid: 499 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Payment token generated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Payment token generated successfully',
                data: { payment_token: 'tok_1234567890', order_id: 'ord_1234567890' },
              },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden / Owner only', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Package not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error / Gateway config error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/subscriptions/details': {
    get: {
      tags: ['Subscriptions'],
      summary: 'Get current active subscription details for company',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      responses: {
        200: {
          description: 'Current active subscription details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Subscription details fetched successfully',
                data: {
                  subscription_id: 10,
                  package_id: 2,
                  package_name: 'Pro Tier',
                  max_employee_count: 100,
                  current_employee_count: 35,
                  start_date: '2026-01-01',
                  end_date: '2027-01-01',
                  is_active: true,
                },
              },
            },
          },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },
};

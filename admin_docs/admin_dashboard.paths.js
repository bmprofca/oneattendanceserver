export const schemas = {
  AdminDashboardResponse: {
    type: 'object',
    properties: {
      kpis: {
        type: 'object',
        properties: {
          total_users: { type: 'integer', example: 150 },
          total_companies: { type: 'integer', example: 45 },
          total_employees: { type: 'integer', example: 1200 },
          active_subscriptions: { type: 'integer', example: 38 },
        }
      },
      recent_companies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Acme Corp' },
            created_at: { type: 'string', format: 'date-time' },
          }
        }
      },
      recent_subscriptions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 101 },
            company_name: { type: 'string', example: 'Acme Corp' },
            package_name: { type: 'string', example: 'Pro Tier' },
            is_active: { type: 'integer', example: 1 },
            created_at: { type: 'string', format: 'date-time' },
          }
        }
      }
    }
  }
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
  '/admin/dashboard': {
    get: {
      tags: ['Admin Dashboard'],
      summary: 'Get admin dashboard statistics',
      description: 'Fetch aggregated KPIs and recent activity for the admin dashboard.',
      operationId: 'adminGetDashboard',
      security: SECURITY,
      responses: {
        200: {
          description: 'Dashboard data fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { $ref: '#/components/schemas/AdminDashboardResponse' },
                },
              },
            },
          },
        },
        ...COMMON_ERRORS,
      },
    }
  }
};

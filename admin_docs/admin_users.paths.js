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


};

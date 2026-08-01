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
      is_system_admin: { type: 'integer', example: 0 },
      last_login: { type: 'string', format: 'date-time', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  AdminCreateUserRequest: {
    type: 'object',
    required: ['password'],
    properties: {
      email: { type: 'string', example: 'user@example.com', description: 'Email (required if phone not provided)' },
      phone: { type: 'string', example: '919876543210', description: 'Phone (required if email not provided). 10 digits or 12 digits with country code.' },
      password: { type: 'string', example: 'SecurePass123', description: 'Minimum 6 characters' },
      name: { type: 'string', example: 'John Doe' },
      profile_picture: { type: 'string', nullable: true },
      profession: { type: 'string', nullable: true },
      whatsapp: { type: 'string', nullable: true },
      is_active: { type: 'integer', example: 1, description: 'Defaults to 1' },
      is_system_admin: { type: 'integer', example: 0, description: 'Defaults to 0' },
    },
  },
  AdminUpdateUserRequest: {
    type: 'object',
    properties: {
      name: { type: 'string', example: 'Jane Doe' },
      email: { type: 'string', example: 'jane@example.com' },
      phone: { type: 'string', example: '9876543211' },
      profile_picture: { type: 'string', nullable: true },
      profession: { type: 'string', nullable: true },
      whatsapp: { type: 'string', nullable: true },
      is_active: { type: 'integer', example: 1 },
      is_system_admin: { type: 'integer', example: 0 },
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
      summary: 'List all users',
      description: 'Paginated list of all users with optional search and active filter.',
      operationId: 'adminListUsers',
      security: SECURITY,
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page (max 100)' },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by name, email, or phone' },
        { name: 'is_active', in: 'query', schema: { type: 'integer', enum: [0, 1] }, description: 'Filter by active status' },
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
    post: {
      tags: ['Admin Users'],
      summary: 'Create new user',
      description: 'Create a new user. At least email or phone is required.',
      operationId: 'adminCreateUser',
      security: SECURITY,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AdminCreateUserRequest' },
          },
        },
      },
      responses: {
        201: {
          description: 'User created',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/IdResponse' } } },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        409: {
          description: 'Email or phone already registered',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ConflictResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
  },

  '/admin/users/{id}': {
    get: {
      tags: ['Admin Users'],
      summary: 'Get user by ID',
      description: 'Retrieve a single user by their ID.',
      operationId: 'adminGetUser',
      security: SECURITY,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'User ID' },
      ],
      responses: {
        200: {
          description: 'User fetched',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { $ref: '#/components/schemas/AdminUserListItem' },
                },
              },
            },
          },
        },
        404: {
          description: 'User not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
    put: {
      tags: ['Admin Users'],
      summary: 'Update user',
      description: 'Update user fields. Only send the fields you want to change.',
      operationId: 'adminUpdateUser',
      security: SECURITY,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'User ID' },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AdminUpdateUserRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'User updated',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' } } },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        404: {
          description: 'User not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
        },
        409: {
          description: 'Email or phone already in use',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ConflictResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
    delete: {
      tags: ['Admin Users'],
      summary: 'Delete user',
      description: 'Soft-delete a user. Sets is_deleted = 1 and deactivates all sessions. Cannot delete your own admin account.',
      operationId: 'adminDeleteUser',
      security: SECURITY,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'User ID' },
      ],
      responses: {
        200: {
          description: 'User deleted',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' } } },
        },
        400: {
          description: 'Cannot delete self',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        404: {
          description: 'User not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
  },
};

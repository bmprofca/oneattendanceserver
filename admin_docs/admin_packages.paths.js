export const schemas = {
  AdminPackageListItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      name: { type: 'string', example: 'Pro Tier' },
      min_employee_count: { type: 'integer', example: 1 },
      max_employee_count: { type: 'integer', example: 50 },
      monthly_price: { type: 'number', example: 49.99 },
      quarterly_price: { type: 'number', example: 139.99 },
      half_yearly_price: { type: 'number', example: 259.99 },
      yearly_price: { type: 'number', example: 499.99 },
      accept_periods: {
        type: 'array',
        items: { type: 'string' },
        example: ['monthly', 'yearly'],
      },
      is_active: { type: 'integer', example: 1 },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },

  AdminCreatePackageRequest: {
    type: 'object',
    required: ['name', 'min_employee_count', 'max_employee_count'],
    properties: {
      name: { type: 'string', example: 'Pro Tier' },
      min_employee_count: { type: 'integer', example: 1 },
      max_employee_count: { type: 'integer', example: 50 },
      monthly_price: { type: 'number', example: 49.99 },
      quarterly_price: { type: 'number', example: 139.99 },
      half_yearly_price: { type: 'number', example: 259.99 },
      yearly_price: { type: 'number', example: 499.99 },
      accept_periods: {
        type: 'array',
        items: { type: 'string' },
        example: ['monthly', 'yearly'],
      },
      is_active: { type: 'integer', example: 1 },
    },
  },

  AdminUpdatePackageRequest: {
    type: 'object',
    properties: {
      name: { type: 'string', example: 'Pro Tier Updated' },
      min_employee_count: { type: 'integer', example: 1 },
      max_employee_count: { type: 'integer', example: 50 },
      monthly_price: { type: 'number', example: 49.99 },
      quarterly_price: { type: 'number', example: 139.99 },
      half_yearly_price: { type: 'number', example: 259.99 },
      yearly_price: { type: 'number', example: 499.99 },
      accept_periods: {
        type: 'array',
        items: { type: 'string' },
        example: ['monthly', 'yearly'],
      },
      is_active: { type: 'integer', example: 1 },
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
  '/admin/packages': {
    get: {
      tags: ['Admin Packages'],
      summary: 'List all subscription packages',
      description: 'Paginated list of all subscription packages. Supports search and active filter.',
      operationId: 'adminListPackages',
      security: SECURITY,
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page (max 100)' },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by package name' },
        { name: 'is_active', in: 'query', schema: { type: 'integer', enum: [0, 1] }, description: 'Filter by active status' },
      ],
      responses: {
        200: {
          description: 'Packages fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/AdminPackageListItem' } },
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
      tags: ['Admin Packages'],
      summary: 'Create new package',
      description: 'Create a new subscription package.',
      operationId: 'adminCreatePackage',
      security: SECURITY,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AdminCreatePackageRequest' },
          },
        },
      },
      responses: {
        201: {
          description: 'Package created',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/IdResponse' } } },
        },
        400: {
          description: 'Validation error (e.g. duplicate range)',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
  },

  '/admin/packages/{id}': {
    put: {
      tags: ['Admin Packages'],
      summary: 'Update package',
      description: 'Update an existing subscription package.',
      operationId: 'adminUpdatePackage',
      security: SECURITY,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Package ID' },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AdminUpdatePackageRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Package updated',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } },
        },
        400: {
          description: 'Validation error (e.g. duplicate range)',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        404: {
          description: 'Package not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
    delete: {
      tags: ['Admin Packages'],
      summary: 'Delete package',
      description: 'Soft delete a subscription package.',
      operationId: 'adminDeletePackage',
      security: SECURITY,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Package ID' },
      ],
      responses: {
        200: {
          description: 'Package deleted',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } },
        },
        404: {
          description: 'Package not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
  },

};

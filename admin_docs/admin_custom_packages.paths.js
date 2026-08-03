export const schemas = {
  AdminCustomPackageListItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      client_id: { type: 'integer', example: 10 },
      client_name: { type: 'string', example: 'Acme Corp' },
      name: { type: 'string', example: 'Custom Tier' },
      min_employee_count: { type: 'integer', example: 1 },
      max_employee_count: { type: 'integer', example: 100 },
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

  AdminCreateCustomPackageRequest: {
    type: 'object',
    required: ['client_id', 'name', 'min_employee_count', 'max_employee_count'],
    properties: {
      client_id: { type: 'integer', example: 10 },
      name: { type: 'string', example: 'Custom Tier' },
      min_employee_count: { type: 'integer', example: 1 },
      max_employee_count: { type: 'integer', example: 100 },
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

  AdminUpdateCustomPackageRequest: {
    type: 'object',
    properties: {
      client_id: { type: 'integer', example: 10 },
      name: { type: 'string', example: 'Custom Tier Updated' },
      min_employee_count: { type: 'integer', example: 1 },
      max_employee_count: { type: 'integer', example: 100 },
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
  
  AdminUpdateCustomPackageStatusRequest: {
    type: 'object',
    required: ['is_active'],
    properties: {
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
  '/admin/custom-packages': {
    get: {
      tags: ['Admin Custom Packages'],
      summary: 'List all custom subscription packages',
      description: 'Paginated list of all custom subscription packages. Supports search, filter by active status, and client ID.',
      operationId: 'adminListCustomPackages',
      security: SECURITY,
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page (max 100)' },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by package or client name' },
        { name: 'is_active', in: 'query', schema: { type: 'integer', enum: [0, 1] }, description: 'Filter by active status' },
        { name: 'client_id', in: 'query', schema: { type: 'integer' }, description: 'Filter by client ID' },
      ],
      responses: {
        200: {
          description: 'Custom packages fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/AdminCustomPackageListItem' } },
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
      tags: ['Admin Custom Packages'],
      summary: 'Create new custom package',
      description: 'Create a new custom subscription package for a specific client.',
      operationId: 'adminCreateCustomPackage',
      security: SECURITY,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AdminCreateCustomPackageRequest' },
          },
        },
      },
      responses: {
        201: {
          description: 'Custom package created',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/IdResponse' } } },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
  },

  '/admin/custom-packages/{id}': {
    get: {
      tags: ['Admin Custom Packages'],
      summary: 'Get custom package details',
      description: 'Get details of a specific custom subscription package.',
      operationId: 'adminGetCustomPackageDetails',
      security: SECURITY,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Package ID' },
      ],
      responses: {
        200: {
          description: 'Package details fetched',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { $ref: '#/components/schemas/AdminCustomPackageListItem' },
                },
              },
            },
          },
        },
        404: {
          description: 'Package not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    },
    put: {
      tags: ['Admin Custom Packages'],
      summary: 'Update custom package',
      description: 'Update an existing custom subscription package.',
      operationId: 'adminUpdateCustomPackage',
      security: SECURITY,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Package ID' },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AdminUpdateCustomPackageRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Package updated',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } },
        },
        400: {
          description: 'Validation error',
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
      tags: ['Admin Custom Packages'],
      summary: 'Delete custom package',
      description: 'Soft delete a custom subscription package.',
      operationId: 'adminDeleteCustomPackage',
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

  '/admin/custom-packages/{id}/status': {
    patch: {
      tags: ['Admin Custom Packages'],
      summary: 'Update custom package status',
      description: 'Activate or deactivate a custom subscription package.',
      operationId: 'adminUpdateCustomPackageStatus',
      security: SECURITY,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Package ID' },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AdminUpdateCustomPackageStatusRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Package status updated',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        404: {
          description: 'Package not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        ...COMMON_ERRORS,
      },
    }
  }

};

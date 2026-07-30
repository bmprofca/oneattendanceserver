export const schemas = {
  Permission: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      code: { type: 'string', example: 'emp_view' },
      name: { type: 'string', example: 'View Employees' },
      module: { type: 'string', example: 'Employees' },
    },
  },
  PermissionPackage: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      company_id: { type: 'integer', example: 1 },
      name: { type: 'string', example: 'HR Manager Package' },
      permissions: { type: 'array', items: { type: 'string' }, example: ['emp_view', 'emp_create'] },
    },
  },
  CreatePermissionPackagePayload: {
    type: 'object',
    required: ['name', 'permissions'],
    properties: {
      name: { type: 'string', example: 'HR Admin Package' },
      permissions: { type: 'array', items: { type: 'string' }, example: ['emp_view', 'emp_create'] },
    },
  },
  UpdatePermissionPackagePayload: {
    type: 'object',
    required: ['package_id', 'name', 'permissions'],
    properties: {
      package_id: { type: 'integer', example: 1 },
      name: { type: 'string', example: 'Updated HR Package' },
      permissions: { type: 'array', items: { type: 'string' }, example: ['emp_view', 'emp_create', 'emp_delete'] },
    },
  },
};

export const paths = {
  '/permissions/list': {
    get: {
      tags: ['Permissions'],
      summary: 'Get all available system permissions',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Permissions list fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Permissions list fetched successfully',
                data: [
                  { id: 1, code: 'emp_view', name: 'View Employees', module: 'Employees' },
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

  '/permissions/create-package': {
    post: {
      tags: ['Permissions'],
      summary: 'Create custom permission package template',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreatePermissionPackagePayload' },
            examples: {
              createPackage: { summary: 'Create package', value: { name: 'HR Admin Package', permissions: ['emp_view', 'emp_create'] } },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Permission package created',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IdResponse' },
              example: { success: true, message: 'Permission package created successfully', data: { id: 1 } },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        409: { description: 'Package name already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/ConflictResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/permissions/permission-packages': {
    get: {
      tags: ['Permissions'],
      summary: 'Get permission packages for company',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        200: {
          description: 'Permission packages list',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaginatedResponse' },
            },
          },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/permissions/update-package': {
    put: {
      tags: ['Permissions'],
      summary: 'Update permission package name or assigned permissions',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdatePermissionPackagePayload' },
            examples: {
              updatePackage: { summary: 'Update package', value: { package_id: 1, name: 'Updated HR Package', permissions: ['emp_view', 'emp_create', 'emp_delete'] } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Permission package updated',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Permission package updated successfully' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Package not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/permissions/delete-package': {
    delete: {
      tags: ['Permissions'],
      summary: 'Delete permission package',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['package_id'], properties: { package_id: { type: 'integer', example: 1 } } },
            examples: {
              deletePackage: { summary: 'Delete package', value: { package_id: 1 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Permission package deleted',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Permission package deleted successfully' },
            },
          },
        },
        400: { description: 'Validation error / Package in use', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Package not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/permissions/transfer-packages': {
    put: {
      tags: ['Permissions'],
      summary: 'Transfer user permissions package to another user',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['from_package_id', 'to_package_id'],
              properties: {
                from_package_id: { type: 'integer', example: 1 },
                to_package_id: { type: 'integer', example: 2 },
              },
            },
            examples: {
              transfer: { summary: 'Transfer employees package', value: { from_package_id: 1, to_package_id: 2 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Permissions package transferred',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Employees transferred to new package successfully' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },
};

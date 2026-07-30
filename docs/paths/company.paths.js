export const schemas = {
  Company: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      owner_user_id: { type: 'integer', example: 10 },
      name: { type: 'string', example: 'Acme Corp' },
      legal_name: { type: 'string', nullable: true, example: 'Acme Technologies Pvt Ltd' },
      logo_url: { type: 'string', nullable: true, example: 'https://example.com/logo.png' },
      address_line1: { type: 'string', nullable: true, example: '123 Business Park' },
      address_line2: { type: 'string', nullable: true, example: 'Suite 400' },
      city: { type: 'string', nullable: true, example: 'Bangalore' },
      state: { type: 'string', nullable: true, example: 'Karnataka' },
      postal_code: { type: 'string', nullable: true, example: '560001' },
      country: { type: 'string', nullable: true, example: 'India' },
      latitude: { type: 'number', nullable: true, example: 12.9716 },
      longitude: { type: 'number', nullable: true, example: 77.5946 },
      is_active: { type: 'boolean', example: true },
      is_deleted: { type: 'boolean', example: false },
      company_ips: { type: 'array', items: { type: 'string' }, example: ['192.168.1.1'] },
      attendance_methods: { type: 'array', items: { type: 'string' }, example: ['manual', 'selfie'] },
      transaction_currency: { type: 'string', example: 'INR' },
      max_distance: { type: 'number', example: 100 },
      created_at: { type: 'string', example: '2026-07-30 10:00:00' },
      updated_at: { type: 'string', example: '2026-07-30 10:00:00' },
    },
  },
  CreateCompanyPayload: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', example: 'Acme Corp' },
      legal_name: { type: 'string', nullable: true, example: 'Acme Technologies Pvt Ltd' },
      logo_url: { type: 'string', nullable: true, example: 'https://example.com/logo.png' },
      address_line1: { type: 'string', nullable: true, example: '123 Business Park' },
      address_line2: { type: 'string', nullable: true, example: 'Suite 400' },
      city: { type: 'string', nullable: true, example: 'Bangalore' },
      state: { type: 'string', nullable: true, example: 'Karnataka' },
      postal_code: { type: 'string', nullable: true, example: '560001' },
      country: { type: 'string', nullable: true, example: 'India' },
      latitude: { type: 'number', nullable: true, example: 12.9716 },
      longitude: { type: 'number', nullable: true, example: 77.5946 },
    },
  },
  UpdateAttendanceSettingsPayload: {
    type: 'object',
    required: ['company_id', 'attendance_methods'],
    properties: {
      company_id: { type: 'integer', example: 1 },
      attendance_methods: { type: 'array', items: { type: 'string' }, example: ['selfie', 'geofence'] },
      company_ips: { type: 'array', items: { type: 'string' }, example: ['192.168.1.1'] },
      max_distance: { type: 'number', example: 100 },
    },
  },
};

export const paths = {
  '/company/create': {
    post: {
      tags: ['Company'],
      summary: 'Register a new company',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateCompanyPayload' },
            examples: {
              createCompany: { summary: 'Register company', value: { name: 'Acme Corp', legal_name: 'Acme Tech Pvt Ltd', city: 'Bangalore' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Company created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: { success: true, message: 'Company created successfully', data: { id: 1, name: 'Acme Corp' } },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        409: { description: 'Company name already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/ConflictResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/company/list': {
    get: {
      tags: ['Company'],
      summary: 'Get list of companies owned by or associated with user',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'List of companies fetched successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Companies fetched successfully',
                data: [
                  { id: 1, name: 'Acme Corp', owner_user_id: 10, is_active: true },
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

  '/company/details': {
    get: {
      tags: ['Company'],
      summary: 'Get details for a specific company',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company_id', in: 'query', required: true, schema: { type: 'integer' } }],
      responses: {
        200: {
          description: 'Company details fetched successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: { success: true, message: 'Company details fetched successfully', data: { id: 1, name: 'Acme Corp' } },
            },
          },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        404: { description: 'Company not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/company/update-basic': {
    put: {
      tags: ['Company'],
      summary: 'Update basic company information',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['company_id', 'name'],
              properties: {
                company_id: { type: 'integer', example: 1 },
                name: { type: 'string', example: 'Acme Corp' },
                legal_name: { type: 'string', example: 'Acme Technologies Pvt Ltd' },
                address_line1: { type: 'string', example: '123 Business Park' },
                city: { type: 'string', example: 'Bangalore' },
                state: { type: 'string', example: 'Karnataka' },
              },
            },
            examples: {
              updateCompany: { summary: 'Update company info', value: { company_id: 1, name: 'Acme Global', city: 'Mumbai' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Company basic details updated',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Company details updated successfully' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Company not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/company/update-attendance-settings': {
    put: {
      tags: ['Company'],
      summary: 'Update company attendance methods, IPs & geofence rules',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateAttendanceSettingsPayload' },
            examples: {
              updateSettings: { summary: 'Update attendance settings', value: { company_id: 1, attendance_methods: ['manual', 'selfie'], max_distance: 150 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Attendance settings updated',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Attendance settings updated successfully' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Company not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/company/delete': {
    delete: {
      tags: ['Company'],
      summary: 'Delete (soft-delete) a company',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['company_id'],
              properties: { company_id: { type: 'integer', example: 1 } },
            },
            examples: {
              deleteCompany: { summary: 'Delete company', value: { company_id: 1 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Company soft-deleted',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Company deleted successfully' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Company not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/company/users/available': {
    get: {
      tags: ['Company'],
      summary: 'Get available users that can be added to company',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company_id', in: 'query', required: true, schema: { type: 'integer' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        200: {
          description: 'Available users list fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Available users fetched successfully',
                data: [
                  { id: 12, name: 'Amit Verma', email: 'amit@example.com', phone: '9876543211' },
                ],
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

export const schemas = {
  Holiday: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      company_id: { type: 'integer', example: 1 },
      name: { type: 'string', example: 'Independence Day' },
      date: { type: 'string', format: 'date', example: '2026-08-15' },
      is_optional: { type: 'boolean', example: false },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  CreateHolidayPayload: {
    type: 'object',
    required: ['name', 'date'],
    properties: {
      name: { type: 'string', example: 'Republic Day' },
      date: { type: 'string', format: 'date', example: '2026-01-26' },
      is_optional: { type: 'boolean', default: false, example: false },
    },
  },
  UpdateHolidayPayload: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'integer', example: 1 },
      name: { type: 'string', example: 'Revised Republic Day' },
      date: { type: 'string', format: 'date', example: '2026-01-26' },
      is_optional: { type: 'boolean', example: false },
    },
  },
};

export const paths = {
  '/holiday/master-holidays': {
    get: {
      tags: ['Holidays'],
      summary: 'Get national/state master holidays catalog',
      parameters: [
        { name: 'year', in: 'query', required: true, schema: { type: 'integer' }, example: 2026 },
        { name: 'month', in: 'query', schema: { type: 'integer' }, example: 8 },
      ],
      responses: {
        200: {
          description: 'Master holidays list fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                count: 3,
                data: [
                  { name: 'Republic Day', date: '2026-01-26', is_optional: false },
                  { name: 'Independence Day', date: '2026-08-15', is_optional: false },
                ],
              },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/holiday/create': {
    post: {
      tags: ['Holidays'],
      summary: 'Add company holiday',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateHolidayPayload' },
            examples: {
              createHoliday: { summary: 'Create holiday', value: { name: 'Republic Day', date: '2026-01-26', is_optional: false } },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Holiday created',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IdResponse' },
              example: { success: true, message: 'Holiday created successfully', data: { id: 1 } },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        409: { description: 'Holiday already exists on this date', content: { 'application/json': { schema: { $ref: '#/components/schemas/ConflictResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/holiday/company/list': {
    get: {
      tags: ['Holidays'],
      summary: 'Get company holiday calendar list',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'year', in: 'query', schema: { type: 'integer' }, example: 2026 },
        { name: 'month', in: 'query', schema: { type: 'integer' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        200: {
          description: 'Company holidays list',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                count: 1,
                data: [
                  { id: 1, company_id: 1, name: 'Independence Day', date: '2026-08-15', is_optional: false },
                ],
              },
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

  '/holiday/update': {
    put: {
      tags: ['Holidays'],
      summary: 'Update company holiday entry',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateHolidayPayload' },
            examples: {
              updateHoliday: { summary: 'Update holiday', value: { id: 1, name: 'Independence Day Observance', date: '2026-08-15' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Holiday updated',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Holiday updated successfully' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Holiday not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/holiday/delete': {
    delete: {
      tags: ['Holidays'],
      summary: 'Delete company holiday entry',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['id'], properties: { id: { type: 'integer', example: 1 } } },
            examples: {
              deleteHoliday: { summary: 'Delete holiday', value: { id: 1 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Holiday deleted',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Holiday deleted successfully' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Holiday not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },
};

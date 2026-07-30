export const schemas = {
  ShiftCalendarEntry: {
    type: 'object',
    properties: {
      date: { type: 'string', format: 'date', example: '2026-07-30' },
      shift_name: { type: 'string', example: 'Morning General Shift' },
      start_time: { type: 'string', example: '09:00:00' },
      end_time: { type: 'string', example: '18:00:00' },
      is_off_day: { type: 'boolean', example: false },
    },
  },
};

export const paths = {
  '/shifts/my-calendar': {
    get: {
      tags: ['Shifts'],
      summary: 'Get logged in employee work shift calendar',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'year', in: 'query', schema: { type: 'integer' }, example: 2026 },
        { name: 'month', in: 'query', schema: { type: 'integer' }, example: 7 },
        { name: 'employee_id', in: 'query', schema: { type: 'integer' }, example: 10 },
      ],
      responses: {
        200: {
          description: 'Employee shift calendar fetched successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Shift calendar fetched successfully',
                data: [
                  { date: '2026-07-30', shift_name: 'Morning General Shift', start_time: '09:00:00', end_time: '18:00:00', is_off_day: false },
                ],
              },
            },
          },
        },
        400: { description: 'Validation error / Invalid parameters', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/shifts/employees-shifts': {
    get: {
      tags: ['Shifts'],
      summary: 'Get shift schedule for all employees in company (Manager view)',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'year', in: 'query', schema: { type: 'integer' }, example: 2026 },
        { name: 'month', in: 'query', schema: { type: 'integer' }, example: 7 },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
      ],
      responses: {
        200: {
          description: 'All employees shift schedule fetched successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaginatedResponse' },
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

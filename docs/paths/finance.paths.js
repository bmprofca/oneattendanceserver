export const schemas = {
  FinanceReport: {
    type: 'object',
    properties: {
      opening_balance: { type: 'number', example: 5000 },
      records: {
        type: 'array',
        items: { type: 'object' },
        example: [],
      },
    },
  },
};

export const paths = {
  '/finance/employee-ledger-report': {
    get: {
      tags: ['Finance'],
      summary: 'Get financial employee ledger report across payroll and transactions',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'user_id', in: 'query', required: true, schema: { type: 'integer' }, example: 10 },
        { name: 'from_date', in: 'query', required: true, schema: { type: 'string', format: 'date' }, example: '2026-01-01' },
        { name: 'to_date', in: 'query', required: true, schema: { type: 'string', format: 'date' }, example: '2026-01-31' },
      ],
      responses: {
        200: {
          description: 'Employee ledger report fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { $ref: '#/components/schemas/FinanceReport' },
                },
                required: ['success', 'data'],
              },
              example: {
                success: true,
                data: {
                  opening_balance: 5000,
                  records: [],
                },
              },
            },
          },
        },
        401: {
          description: 'Unauthorized access',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UnauthorizedResponse' },
            },
          },
        },
        500: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/InternalServerErrorResponse' },
            },
          },
        },
      },
    },
  },
};

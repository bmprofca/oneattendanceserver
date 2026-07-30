export const schemas = {
  Transaction: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      company_id: { type: 'integer', example: 1 },
      party2_id: { type: 'integer', nullable: true, example: 10 },
      party2_type: { type: 'string', example: 'employee' },
      transaction_type: { type: 'string', enum: ['payment', 'receive'], example: 'payment' },
      amount: { type: 'number', example: 1500 },
      transaction_date: { type: 'string', example: '2026-07-30' },
      remark: { type: 'string', nullable: true, example: 'Salary advance payment' },
      created_at: { type: 'string', example: '2026-07-30 10:00:00' },
    },
  },
  AddTransactionPayload: {
    type: 'object',
    required: ['employee_id', 'transaction_type', 'amount', 'transaction_date'],
    properties: {
      employee_id: { type: 'integer', example: 10 },
      transaction_type: { type: 'string', enum: ['payment', 'receive'], example: 'payment' },
      amount: { type: 'number', example: 1500 },
      transaction_date: { type: 'string', format: 'date', example: '2026-07-30' },
      remark: { type: 'string', nullable: true, example: 'Advance payment' },
      employee_account: { type: 'integer', nullable: true, example: 1 },
      company_account: { type: 'integer', nullable: true, example: 2 },
    },
  },
  UpdateTransactionPayload: {
    type: 'object',
    required: ['transaction_id', 'transaction_type', 'amount', 'transaction_date'],
    properties: {
      transaction_id: { type: 'integer', example: 1 },
      transaction_type: { type: 'string', enum: ['payment', 'receive'], example: 'payment' },
      amount: { type: 'number', example: 2000 },
      transaction_date: { type: 'string', format: 'date', example: '2026-07-30' },
      remark: { type: 'string', nullable: true, example: 'Updated remark' },
      employee_account: { type: 'integer', nullable: true, example: 1 },
      company_account: { type: 'integer', nullable: true, example: 2 },
    },
  },
};

export const paths = {
  '/transactions/add': {
    post: {
      tags: ['Transactions'],
      summary: 'Add custom payment or receive transaction entry',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AddTransactionPayload' },
            examples: {
              addTransaction: {
                summary: 'Add transaction',
                value: { employee_id: 10, transaction_type: 'payment', amount: 1500, transaction_date: '2026-07-30', remark: 'Salary advance' },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Transaction recorded',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: { success: true, message: 'Transaction created successfully', data: { id: 1 } },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Employee not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/transactions/update': {
    put: {
      tags: ['Transactions'],
      summary: 'Update transaction record',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateTransactionPayload' },
            examples: {
              updateTransaction: {
                summary: 'Update transaction',
                value: { transaction_id: 1, transaction_type: 'payment', amount: 2000, transaction_date: '2026-07-30', remark: 'Corrected amount' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Transaction updated',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: { success: true, message: 'Transaction updated successfully' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Transaction not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/transactions/company-ledger': {
    get: {
      tags: ['Transactions'],
      summary: 'Get company financial ledger history',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'from_date', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'to_date', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'user_id', in: 'query', schema: { type: 'integer' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
      ],
      responses: {
        200: {
          description: 'Company ledger transactions',
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

  '/transactions/my-ledger': {
    get: {
      tags: ['Transactions'],
      summary: 'Get employee personal transaction ledger history',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'from_date', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'to_date', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
      ],
      responses: {
        200: {
          description: 'My ledger transactions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaginatedResponse' },
            },
          },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden / Employee inactive', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/transactions/delete': {
    delete: {
      tags: ['Transactions'],
      summary: 'Delete transaction record',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['id'], properties: { id: { type: 'integer', example: 1 } } },
            examples: {
              deleteRequest: { summary: 'Delete transaction', value: { id: 1 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Transaction deleted',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Transaction deleted successfully' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        404: { description: 'Transaction not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },
};

export const schemas = {
  PayrollRecord: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      company_id: { type: 'integer', example: 1 },
      employee_id: { type: 'integer', example: 10 },
      month: { type: 'integer', example: 7 },
      year: { type: 'integer', example: 2026 },
      gross_salary: { type: 'number', example: 50000 },
      total_deductions: { type: 'number', example: 5000 },
      net_salary: { type: 'number', example: 45000 },
      status: { type: 'string', example: 'processed' },
    },
  },
  PayrollAdjustment: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 5 },
      employee_id: { type: 'integer', example: 10 },
      type: { type: 'string', enum: ['bonus', 'deduction', 'overtime', 'reimbursement'], example: 'bonus' },
      amount: { type: 'number', example: 2500 },
      reason: { type: 'string', example: 'Performance bonus' },
    },
  },
};

export const paths = {
  '/payroll/generate-payroll': {
    post: {
      tags: ['Payroll'],
      summary: 'Generate monthly payroll for company employees',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['month', 'year'],
              properties: {
                month: { type: 'integer', example: 7 },
                year: { type: 'integer', example: 2026 },
              },
            },
            examples: {
              generatePayroll: { summary: 'Generate payroll', value: { month: 7, year: 2026 } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Payroll generated successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' }, example: { success: true, message: 'Payroll generated successfully' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/payroll/list': {
    get: {
      tags: ['Payroll'],
      summary: 'Get company payroll list for a month & year',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'month', in: 'query', schema: { type: 'integer' } },
        { name: 'year', in: 'query', schema: { type: 'integer' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
      ],
      responses: {
        200: {
          description: 'Payroll records list fetched',
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

  '/payroll/my': {
    get: {
      tags: ['Payroll'],
      summary: 'Get logged in employee payroll records',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'month', in: 'query', schema: { type: 'integer' } },
        { name: 'year', in: 'query', schema: { type: 'integer' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
      ],
      responses: {
        200: {
          description: 'My payroll records fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaginatedResponse' },
            },
          },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/payroll/adjustments': {
    post: {
      tags: ['Payroll'],
      summary: 'Add salary adjustment (bonus/deduction/overtime)',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['employee_id', 'type', 'amount'],
              properties: {
                employee_id: { type: 'integer', example: 10 },
                type: { type: 'string', enum: ['bonus', 'deduction', 'overtime', 'reimbursement'], example: 'bonus' },
                amount: { type: 'number', example: 2500 },
                reason: { type: 'string', example: 'Performance bonus' },
              },
            },
            examples: {
              addAdjustment: { summary: 'Add adjustment', value: { employee_id: 10, type: 'bonus', amount: 2500, reason: 'Performance bonus' } },
            },
          },
        },
      },
      responses: {
        201: { description: 'Adjustment added', content: { 'application/json': { schema: { $ref: '#/components/schemas/IdResponse' }, example: { success: true, message: 'Adjustment added', data: { id: 5 } } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/payroll/adjustments/list': {
    get: {
      tags: ['Payroll'],
      summary: 'List payroll adjustments for employee or company',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'employee_id', in: 'query', schema: { type: 'integer' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
      ],
      responses: {
        200: {
          description: 'Adjustments list fetched',
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

  '/payroll/adjustments/update': {
    put: {
      tags: ['Payroll'],
      summary: 'Update payroll adjustment entry',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['id', 'amount'],
              properties: {
                id: { type: 'integer', example: 5 },
                amount: { type: 'number', example: 3000 },
                reason: { type: 'string', example: 'Revised bonus' },
              },
            },
            examples: {
              updateAdjustment: { summary: 'Update adjustment', value: { id: 5, amount: 3000, reason: 'Revised bonus' } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Adjustment updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Adjustment updated' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Adjustment not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/payroll/adjustments/delete': {
    delete: {
      tags: ['Payroll'],
      summary: 'Delete payroll adjustment entry',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['id'], properties: { id: { type: 'integer', example: 5 } } },
            examples: {
              deleteAdjustment: { summary: 'Delete adjustment', value: { id: 5 } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Adjustment deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Adjustment deleted' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Adjustment not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/payroll/send-email': {
    post: {
      tags: ['Payroll'],
      summary: 'Send payslip email to employees',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['payroll_id'],
              properties: { payroll_id: { type: 'integer', example: 100 } },
            },
            examples: {
              sendEmail: { summary: 'Send payslip email', value: { payroll_id: 100 } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Payslip email queued/sent', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Payslip email sent' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/payroll/download': {
    post: {
      tags: ['Payroll'],
      summary: 'Generate & download payslip PDF file',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['payroll_id'],
              properties: { payroll_id: { type: 'integer', example: 100 } },
            },
            examples: {
              downloadPdf: { summary: 'Download PDF', value: { payroll_id: 100 } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Payslip PDF stream' },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },
};

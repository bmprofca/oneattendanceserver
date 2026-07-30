export const schemas = {
  SalaryComponent: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      company_id: { type: 'integer', example: 1 },
      name: { type: 'string', example: 'House Rent Allowance' },
      type: { type: 'string', enum: ['earning', 'deduction'], example: 'earning' },
      calculation_type: { type: 'string', enum: ['fixed', 'percentage'], example: 'percentage' },
      value: { type: 'number', example: 40 },
    },
  },
  SalaryPackage: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 2 },
      company_id: { type: 'integer', example: 1 },
      name: { type: 'string', example: 'Software Engineer Package' },
      annual_ctc: { type: 'number', example: 600000 },
    },
  },
};

export const paths = {
  '/salary/components/create': {
    post: {
      tags: ['Salary'],
      summary: 'Create salary component',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'type', 'calculation_type', 'value'],
              properties: {
                name: { type: 'string', example: 'Special Allowance' },
                type: { type: 'string', enum: ['earning', 'deduction'], example: 'earning' },
                calculation_type: { type: 'string', enum: ['fixed', 'percentage'], example: 'fixed' },
                value: { type: 'number', example: 5000 },
              },
            },
            examples: {
              createComponent: { summary: 'Create component', value: { name: 'Special Allowance', type: 'earning', calculation_type: 'fixed', value: 5000 } },
            },
          },
        },
      },
      responses: {
        201: { description: 'Salary component created', content: { 'application/json': { schema: { $ref: '#/components/schemas/IdResponse' }, example: { success: true, message: 'Component created', data: { id: 1 } } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        409: { description: 'Component name already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/ConflictResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/salary/components/list': {
    get: {
      tags: ['Salary'],
      summary: 'Get company salary components list',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      responses: {
        200: {
          description: 'Salary components list fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Components fetched successfully',
                data: [
                  { id: 1, name: 'Basic Salary', type: 'earning', calculation_type: 'percentage', value: 50 },
                  { id: 2, name: 'HRA', type: 'earning', calculation_type: 'percentage', value: 20 },
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

  '/salary/components/update': {
    put: {
      tags: ['Salary'],
      summary: 'Update salary component',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['id', 'name', 'value'],
              properties: {
                id: { type: 'integer', example: 1 },
                name: { type: 'string', example: 'HRA' },
                value: { type: 'number', example: 50 },
              },
            },
            examples: {
              updateComponent: { summary: 'Update component', value: { id: 1, name: 'HRA', value: 50 } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Component updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Component updated' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Component not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/salary/components/delete': {
    delete: {
      tags: ['Salary'],
      summary: 'Delete salary component',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['id'], properties: { id: { type: 'integer', example: 1 } } },
            examples: {
              deleteComponent: { summary: 'Delete component', value: { id: 1 } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Component deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Component deleted' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Component not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/salary/components/create-package': {
    post: {
      tags: ['Salary'],
      summary: 'Create salary component package template',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'annual_ctc'],
              properties: {
                name: { type: 'string', example: 'Developer Package 6L' },
                annual_ctc: { type: 'number', example: 600000 },
              },
            },
            examples: {
              createPackage: { summary: 'Create package', value: { name: 'Developer Package 6L', annual_ctc: 600000 } },
            },
          },
        },
      },
      responses: {
        201: { description: 'Salary package created', content: { 'application/json': { schema: { $ref: '#/components/schemas/IdResponse' }, example: { success: true, message: 'Package created', data: { id: 2 } } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        409: { description: 'Package name already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/ConflictResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/salary/components/packages': {
    get: {
      tags: ['Salary'],
      summary: 'Get salary packages for company',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      responses: {
        200: {
          description: 'Salary packages list fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Packages fetched successfully',
                data: [
                  { id: 2, name: 'Developer Package 6L', annual_ctc: 600000 },
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

  '/salary/components/update-package': {
    put: {
      tags: ['Salary'],
      summary: 'Update salary package template',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['id', 'name', 'annual_ctc'],
              properties: {
                id: { type: 'integer', example: 2 },
                name: { type: 'string', example: 'Senior Dev Package 9L' },
                annual_ctc: { type: 'number', example: 900000 },
              },
            },
            examples: {
              updatePackage: { summary: 'Update package', value: { id: 2, name: 'Senior Dev Package 9L', annual_ctc: 900000 } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Salary package updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Package updated' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Package not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/salary/components/delete-package': {
    delete: {
      tags: ['Salary'],
      summary: 'Delete salary package template',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['id'], properties: { id: { type: 'integer', example: 2 } } },
            examples: {
              deletePackage: { summary: 'Delete package', value: { id: 2 } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Salary package deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Package deleted' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Package not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/salary/assign-salary': {
    post: {
      tags: ['Salary'],
      summary: 'Assign salary structure to employee',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['employee_id', 'annual_ctc'],
              properties: {
                employee_id: { type: 'integer', example: 10 },
                annual_ctc: { type: 'number', example: 600000 },
                package_id: { type: 'integer', nullable: true, example: 2 },
                effective_date: { type: 'string', format: 'date', example: '2026-01-01' },
              },
            },
            examples: {
              assignSalary: { summary: 'Assign salary', value: { employee_id: 10, annual_ctc: 600000, package_id: 2, effective_date: '2026-01-01' } },
            },
          },
        },
      },
      responses: {
        201: { description: 'Salary assigned to employee', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Salary structure assigned' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        409: { description: 'Salary already assigned', content: { 'application/json': { schema: { $ref: '#/components/schemas/ConflictResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/salary/update-salary': {
    put: {
      tags: ['Salary'],
      summary: 'Update assigned employee salary structure',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['employee_id', 'annual_ctc'],
              properties: {
                employee_id: { type: 'integer', example: 10 },
                annual_ctc: { type: 'number', example: 700000 },
              },
            },
            examples: {
              updateSalary: { summary: 'Update salary', value: { employee_id: 10, annual_ctc: 700000 } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Salary updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Salary updated' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Salary record not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/salary/revise-salary': {
    post: {
      tags: ['Salary'],
      summary: 'Record salary increment/revision history entry',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['employee_id', 'new_annual_ctc', 'effective_date'],
              properties: {
                employee_id: { type: 'integer', example: 10 },
                new_annual_ctc: { type: 'number', example: 800000 },
                effective_date: { type: 'string', format: 'date', example: '2026-04-01' },
                reason: { type: 'string', example: 'Annual appraisal increment' },
              },
            },
            examples: {
              reviseSalary: { summary: 'Revise salary', value: { employee_id: 10, new_annual_ctc: 800000, effective_date: '2026-04-01', reason: 'Appraisal' } },
            },
          },
        },
      },
      responses: {
        201: { description: 'Salary revised', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Salary revised successfully' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/salary/delete-salary': {
    delete: {
      tags: ['Salary'],
      summary: 'Delete employee salary assignment',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['employee_id'], properties: { employee_id: { type: 'integer', example: 10 } } },
            examples: {
              deleteSalary: { summary: 'Delete salary', value: { employee_id: 10 } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Salary record deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Salary assignment deleted' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Salary record not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/salary/employees-salaries': {
    get: {
      tags: ['Salary'],
      summary: 'Get all employees salary structures list for company',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
      ],
      responses: {
        200: {
          description: 'Employees salaries list fetched',
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

  '/salary/employee-salary-history': {
    get: {
      tags: ['Salary'],
      summary: 'Get salary revision history for an employee',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'employee_id', in: 'query', required: true, schema: { type: 'integer' } },
      ],
      responses: {
        200: {
          description: 'Salary revision history fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Revision history fetched',
                data: [
                  { id: 1, employee_id: 10, previous_ctc: 600000, new_ctc: 800000, effective_date: '2026-04-01', reason: 'Appraisal' },
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

  '/salary/my-salary': {
    get: {
      tags: ['Salary'],
      summary: 'Get logged in employee salary structure details',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      responses: {
        200: {
          description: 'My salary details fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Salary details fetched',
                data: {
                  employee_id: 10,
                  annual_ctc: 600000,
                  monthly_gross: 50000,
                  components: [
                    { name: 'Basic Salary', amount: 25000 },
                    { name: 'HRA', amount: 10000 },
                  ],
                },
              },
            },
          },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },
};

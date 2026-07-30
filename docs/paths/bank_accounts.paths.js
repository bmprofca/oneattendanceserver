export const schemas = {
  BankAccount: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      company_id: { type: 'integer', example: 1 },
      employee_id: { type: 'integer', nullable: true, example: 10 },
      account_type: { type: 'string', enum: ['cash', 'current', 'savings', 'loan', 'upi'], example: 'savings' },
      bank_name: { type: 'string', nullable: true, example: 'HDFC Bank' },
      account_holder_name: { type: 'string', nullable: true, example: 'Rahul Sharma' },
      account_number: { type: 'string', nullable: true, example: '50100123456789' },
      ifsc_code: { type: 'string', nullable: true, example: 'HDFC0001234' },
      branch_name: { type: 'string', nullable: true, example: 'MG Road Branch' },
      upi_id: { type: 'string', nullable: true, example: 'rahul@upi' },
      is_primary: { type: 'boolean', example: true },
      status: { type: 'string', example: 'active' },
      is_active: { type: 'boolean', example: true },
      created_at: { type: 'string', example: '2026-07-30 15:30:00' },
      updated_at: { type: 'string', example: '2026-07-30 15:30:00' },
    },
  },
  CreateBankAccountPayload: {
    type: 'object',
    required: ['bank_owner_type', 'account_type'],
    properties: {
      bank_owner_type: { type: 'string', enum: ['company', 'employee'], example: 'employee' },
      employee_id: { type: 'integer', nullable: true, example: 10 },
      account_type: { type: 'string', enum: ['cash', 'current', 'savings', 'loan', 'upi'], example: 'savings' },
      bank_name: { type: 'string', nullable: true, example: 'HDFC Bank' },
      account_holder_name: { type: 'string', nullable: true, example: 'Rahul Sharma' },
      account_number: { type: 'string', nullable: true, example: '50100123456789' },
      ifsc_code: { type: 'string', nullable: true, example: 'HDFC0001234' },
      branch_name: { type: 'string', nullable: true, example: 'MG Road Branch' },
      upi_id: { type: 'string', nullable: true, example: 'rahul@upi' },
      is_primary: { type: 'boolean', default: false, example: true },
    },
  },
  UpdateBankAccountPayload: {
    type: 'object',
    required: ['bank_id'],
    properties: {
      bank_id: { type: 'integer', example: 1 },
      account_type: { type: 'string', enum: ['cash', 'current', 'savings', 'loan', 'upi'], example: 'savings' },
      bank_name: { type: 'string', nullable: true, example: 'HDFC Bank' },
      account_holder_name: { type: 'string', nullable: true, example: 'Rahul Sharma' },
      account_number: { type: 'string', nullable: true, example: '50100123456789' },
      ifsc_code: { type: 'string', nullable: true, example: 'HDFC0001234' },
      branch_name: { type: 'string', nullable: true, example: 'MG Road Branch' },
      upi_id: { type: 'string', nullable: true, example: 'rahul@upi' },
      is_primary: { type: 'boolean', example: true },
      status: { type: 'string', enum: ['active', 'inactive'], example: 'active' },
    },
  },
};

export const paths = {
  '/bank-accounts/ifsc/{ifsc_code}': {
    get: {
      tags: ['Bank Accounts'],
      summary: 'Lookup bank branch details from IFSC code',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'ifsc_code', in: 'path', required: true, schema: { type: 'string' }, example: 'HDFC0001234' }],
      responses: {
        200: {
          description: 'IFSC lookup details',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'IFSC details fetched successfully',
                data: {
                  ifsc: 'HDFC0001234',
                  bank_name: 'HDFC BANK',
                  branch: 'MG ROAD',
                  address: '123 MG ROAD',
                  city: 'BANGALORE',
                  district: 'BANGALORE',
                  state: 'KARNATAKA',
                  micr: '560240002',
                  contact: '18001234',
                  upi: true,
                },
              },
            },
          },
        },
        400: {
          description: 'Invalid IFSC format',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              example: { success: false, message: 'Invalid IFSC format (e.g. SBIN0001234)' },
            },
          },
        },
        404: {
          description: 'IFSC not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NotFoundResponse' },
              example: { success: false, message: 'Invalid IFSC or bank not found' },
            },
          },
        },
        500: {
          description: 'Server error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/InternalServerErrorResponse' },
            },
          },
        },
      },
    },
  },

  '/bank-accounts/create': {
    post: {
      tags: ['Bank Accounts'],
      summary: 'Add bank account for company or employee',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateBankAccountPayload' },
            examples: {
              employeeAccount: {
                summary: 'Employee bank account',
                value: { bank_owner_type: 'employee', employee_id: 10, account_type: 'savings', bank_name: 'HDFC Bank', account_holder_name: 'Rahul Sharma', account_number: '50100123456789', ifsc_code: 'HDFC0001234', branch_name: 'MG Road Branch', is_primary: true },
              },
              companyAccount: {
                summary: 'Company bank account',
                value: { bank_owner_type: 'company', account_type: 'current', bank_name: 'ICICI Bank', account_holder_name: 'Acme Corp', account_number: '900012345678', ifsc_code: 'ICIC0000001', branch_name: 'Main Branch', is_primary: true },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Bank account created',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Bank account created successfully' },
                  data: { $ref: '#/components/schemas/BankAccount' },
                },
              },
            },
          },
        },
        400: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UnauthorizedResponse' },
            },
          },
        },
        403: {
          description: 'Forbidden / Permission denied',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ForbiddenResponse' },
            },
          },
        },
        404: {
          description: 'Company or employee not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NotFoundResponse' },
            },
          },
        },
        409: {
          description: 'Duplicate bank account or UPI',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ConflictResponse' },
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

  '/bank-accounts/update': {
    put: {
      tags: ['Bank Accounts'],
      summary: 'Update bank account details',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateBankAccountPayload' },
            examples: {
              updateAccount: {
                summary: 'Update bank account',
                value: { bank_id: 1, account_type: 'savings', bank_name: 'HDFC Bank', account_holder_name: 'Rahul Sharma', account_number: '50100123456789', ifsc_code: 'HDFC0001234', status: 'active' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Bank account updated',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Bank account updated successfully' },
                  data: { $ref: '#/components/schemas/BankAccount' },
                },
              },
            },
          },
        },
        400: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UnauthorizedResponse' },
            },
          },
        },
        403: {
          description: 'Forbidden / Permission denied',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ForbiddenResponse' },
            },
          },
        },
        404: {
          description: 'Bank account not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NotFoundResponse' },
            },
          },
        },
        409: {
          description: 'Conflict / Duplicate account',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ConflictResponse' },
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

  '/bank-accounts/delete': {
    delete: {
      tags: ['Bank Accounts'],
      summary: 'Delete bank account',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['bank_id'],
              properties: { bank_id: { type: 'integer', example: 1 } },
            },
            examples: {
              deleteRequest: { summary: 'Delete bank account', value: { bank_id: 1 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Bank account deleted',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Bank account deleted successfully' },
            },
          },
        },
        400: {
          description: 'Bad request',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UnauthorizedResponse' },
            },
          },
        },
        403: {
          description: 'Forbidden',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ForbiddenResponse' },
            },
          },
        },
        404: {
          description: 'Not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NotFoundResponse' },
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

  '/bank-accounts/my': {
    get: {
      tags: ['Bank Accounts'],
      summary: 'Get logged in user bank accounts',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] } },
        { name: 'account_type', in: 'query', schema: { type: 'string', enum: ['cash', 'current', 'savings', 'loan', 'upi'] } },
        { name: 'is_primary', in: 'query', schema: { type: 'boolean' } },
        { name: 'sort_by', in: 'query', schema: { type: 'string', default: 'created_at' } },
        { name: 'sort_order', in: 'query', schema: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' } },
      ],
      responses: {
        200: {
          description: 'Employee bank accounts list',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaginatedResponse' },
            },
          },
        },
        401: {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UnauthorizedResponse' },
            },
          },
        },
        403: {
          description: 'Forbidden / Employee record inactive',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ForbiddenResponse' },
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

  '/bank-accounts/management/employee': {
    get: {
      tags: ['Bank Accounts'],
      summary: 'Get bank accounts for employees (Manager/Admin)',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'employee_id', in: 'query', schema: { type: 'integer' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] } },
        { name: 'account_type', in: 'query', schema: { type: 'string', enum: ['cash', 'current', 'savings', 'loan', 'upi'] } },
        { name: 'is_primary', in: 'query', schema: { type: 'boolean' } },
        { name: 'sort_by', in: 'query', schema: { type: 'string', default: 'created_at' } },
        { name: 'sort_order', in: 'query', schema: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' } },
      ],
      responses: {
        200: {
          description: 'Company employee bank accounts list',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaginatedResponse' },
            },
          },
        },
        400: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UnauthorizedResponse' },
            },
          },
        },
        403: {
          description: 'Forbidden',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ForbiddenResponse' },
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

  '/bank-accounts/management/company': {
    get: {
      tags: ['Bank Accounts'],
      summary: 'Get bank accounts for company (Manager/Admin)',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] } },
        { name: 'account_type', in: 'query', schema: { type: 'string', enum: ['cash', 'current', 'savings', 'loan', 'upi'] } },
        { name: 'is_primary', in: 'query', schema: { type: 'boolean' } },
        { name: 'sort_by', in: 'query', schema: { type: 'string', default: 'created_at' } },
        { name: 'sort_order', in: 'query', schema: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' } },
      ],
      responses: {
        200: {
          description: 'Company bank accounts list',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaginatedResponse' },
            },
          },
        },
        400: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UnauthorizedResponse' },
            },
          },
        },
        403: {
          description: 'Forbidden',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ForbiddenResponse' },
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

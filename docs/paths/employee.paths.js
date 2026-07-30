export const schemas = {
  Employee: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 10 },
      company_id: { type: 'integer', example: 1 },
      user_id: { type: 'integer', example: 5 },
      employee_code: { type: 'string', example: 'EMP001' },
      first_name: { type: 'string', example: 'Rahul' },
      last_name: { type: 'string', example: 'Sharma' },
      email: { type: 'string', example: 'rahul@example.com' },
      phone: { type: 'string', example: '9876543210' },
      designation: { type: 'string', example: 'Software Engineer' },
      joining_date: { type: 'string', format: 'date', example: '2025-01-01' },
      is_active: { type: 'boolean', example: true },
    },
  },
  CreateEmployeePayload: {
    type: 'object',
    required: ['employee_code', 'first_name'],
    properties: {
      employee_code: { type: 'string', example: 'EMP001' },
      first_name: { type: 'string', example: 'Rahul' },
      last_name: { type: 'string', nullable: true, example: 'Sharma' },
      email: { type: 'string', format: 'email', nullable: true, example: 'rahul@example.com' },
      phone: { type: 'string', nullable: true, example: '9876543210' },
      designation: { type: 'string', nullable: true, example: 'Software Engineer' },
      joining_date: { type: 'string', format: 'date', nullable: true, example: '2025-01-01' },
      otp: { type: 'string', nullable: true, example: '123456' },
    },
  },
  FaceEnrollPayload: {
    type: 'object',
    required: ['employee_id', 'face_descriptors'],
    properties: {
      employee_id: { type: 'integer', example: 10 },
      face_descriptors: { type: 'array', items: { type: 'number' }, description: 'Float array feature vector' },
      photo_url: { type: 'string', nullable: true, example: 'https://example.com/face_enroll.jpg' },
    },
  },
};

export const paths = {
  '/employees/request-create-otp': {
    post: {
      tags: ['Employees'],
      summary: 'Request OTP to create employee account',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['phone'],
              properties: { phone: { type: 'string', example: '9876543210' } },
            },
            examples: {
              requestOtp: { summary: 'Request OTP', value: { phone: '9876543210' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'OTP sent for employee creation',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'OTP sent to mobile for employee onboarding' },
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

  '/employees/create': {
    post: {
      tags: ['Employees'],
      summary: 'Add employee to company',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateEmployeePayload' },
            examples: {
              createEmployee: { summary: 'Add employee', value: { employee_code: 'EMP001', first_name: 'Rahul', last_name: 'Sharma', email: 'rahul@example.com', phone: '9876543210', designation: 'Software Engineer', joining_date: '2025-01-01' } },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Employee created',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IdResponse' },
              example: { success: true, message: 'Employee record created', data: { id: 10 } },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        409: { description: 'Employee code already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/ConflictResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/employees/list': {
    get: {
      tags: ['Employees'],
      summary: 'Get paginated employee list for company',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
      ],
      responses: {
        200: {
          description: 'Employees list',
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

  '/employees/update': {
    put: {
      tags: ['Employees'],
      summary: 'Update employee record',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['id'],
              properties: {
                id: { type: 'integer', example: 10 },
                first_name: { type: 'string', example: 'Rahul' },
                last_name: { type: 'string', example: 'Sharma' },
                designation: { type: 'string', example: 'Senior Engineer' },
              },
            },
            examples: {
              updateEmployee: { summary: 'Update employee', value: { id: 10, first_name: 'Rahul', last_name: 'Sharma', designation: 'Senior Engineer' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Employee updated',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Employee profile updated' },
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

  '/employees/delete': {
    delete: {
      tags: ['Employees'],
      summary: 'Soft-delete employee record',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['id'],
              properties: { id: { type: 'integer', example: 10 } },
            },
            examples: {
              deleteEmployee: { summary: 'Delete employee', value: { id: 10 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Employee deleted',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Employee soft deleted' },
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

  '/employees/all-list': {
    get: {
      tags: ['Employees'],
      summary: 'Get all employees without pagination',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      responses: {
        200: {
          description: 'All employees list',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Employees fetched successfully',
                data: [
                  { id: 10, employee_code: 'EMP001', name: 'Rahul Sharma', designation: 'Software Engineer' },
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

  '/employees/{id}': {
    get: {
      tags: ['Employees'],
      summary: 'Get employee profile details by ID',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
      ],
      responses: {
        200: {
          description: 'Employee details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Employee details fetched successfully',
                data: { id: 10, company_id: 1, employee_code: 'EMP001', first_name: 'Rahul', last_name: 'Sharma', email: 'rahul@example.com', phone: '9876543210', designation: 'Software Engineer', joining_date: '2025-01-01', is_active: true },
              },
            },
          },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Employee not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/employees/face-enroll/set': {
    post: {
      tags: ['Employees'],
      summary: 'Enroll face vector descriptors for employee',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/FaceEnrollPayload' },
            examples: {
              enrollFace: { summary: 'Enroll face', value: { employee_id: 10, face_descriptors: [0.12, -0.45, 0.88] } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Face enrolled successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Face data registered successfully' },
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

  '/employees/face-enroll/check': {
    get: {
      tags: ['Employees'],
      summary: 'Check employee face enrollment status (GET)',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'employee_id', in: 'query', required: true, schema: { type: 'integer' } },
      ],
      responses: {
        200: {
          description: 'Face enrollment status',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: { success: true, message: 'Face enrollment status fetched', data: { is_enrolled: true } },
            },
          },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
    post: {
      tags: ['Employees'],
      summary: 'Check employee face enrollment status (POST)',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['employee_id'],
              properties: { employee_id: { type: 'integer', example: 10 } },
            },
            examples: {
              checkStatus: { summary: 'Check face status', value: { employee_id: 10 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Face enrollment status',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: { success: true, message: 'Face enrollment status fetched', data: { is_enrolled: true } },
            },
          },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/employees/face-enroll/delete': {
    put: {
      tags: ['Employees'],
      summary: 'Delete employee face enrollment',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['employee_id'],
              properties: { employee_id: { type: 'integer', example: 10 } },
            },
            examples: {
              deleteFace: { summary: 'Delete face data', value: { employee_id: 10 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Face enrollment deleted',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Face data deleted' },
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

  '/employees/face-enroll/list': {
    get: {
      tags: ['Employees'],
      summary: 'List face enrollment status for company employees',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      responses: {
        200: {
          description: 'Face enrollments list',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Face enrollments list fetched',
                data: [
                  { employee_id: 10, employee_name: 'Rahul Sharma', is_enrolled: true },
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

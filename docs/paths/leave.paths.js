export const schemas = {
  LeaveType: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      company_id: { type: 'integer', example: 1 },
      name: { type: 'string', example: 'Casual Leave' },
      code: { type: 'string', example: 'CL' },
      days_per_year: { type: 'number', example: 12 },
    },
  },
  LeaveApplication: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 12 },
      company_id: { type: 'integer', example: 1 },
      employee_id: { type: 'integer', example: 10 },
      leave_type: { type: 'string', example: 'sick' },
      start_date: { type: 'string', format: 'date', example: '2026-08-01' },
      end_date: { type: 'string', format: 'date', example: '2026-08-02' },
      status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'cancelled'], example: 'pending' },
      reason: { type: 'string', nullable: true, example: 'Fever' },
    },
  },
};

export const paths = {
  '/leave/create': {
    post: {
      tags: ['Leave'],
      summary: 'Create leave type definition',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'code', 'days_per_year'],
              properties: {
                name: { type: 'string', example: 'Casual Leave' },
                code: { type: 'string', example: 'CL' },
                days_per_year: { type: 'number', example: 12 },
              },
            },
            examples: {
              createLeaveType: { summary: 'Create leave type', value: { name: 'Casual Leave', code: 'CL', days_per_year: 12 } },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Leave type created',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/IdResponse' }, example: { success: true, message: 'Leave type created successfully', data: { id: 1 } } } },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        409: { description: 'Code already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/ConflictResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/leave/company': {
    get: {
      tags: ['Leave'],
      summary: 'Get leave types for company',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      responses: {
        200: {
          description: 'Leave types list fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Leave types fetched successfully',
                data: [
                  { id: 1, name: 'Casual Leave', code: 'CL', days_per_year: 12 },
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

  '/leave/update': {
    put: {
      tags: ['Leave'],
      summary: 'Update leave type definition',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['id', 'name', 'days_per_year'],
              properties: {
                id: { type: 'integer', example: 1 },
                name: { type: 'string', example: 'Paid Leave' },
                days_per_year: { type: 'number', example: 15 },
              },
            },
            examples: {
              updateLeaveType: { summary: 'Update leave type', value: { id: 1, name: 'Paid Leave', days_per_year: 15 } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Leave type updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Leave type updated successfully' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        404: { description: 'Leave type not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/leave/delete': {
    delete: {
      tags: ['Leave'],
      summary: 'Delete leave type definition',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['id'], properties: { id: { type: 'integer', example: 1 } } },
            examples: {
              deleteLeaveType: { summary: 'Delete leave type', value: { id: 1 } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Leave type deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Leave type deleted successfully' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        404: { description: 'Leave type not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/leave/my-balance': {
    get: {
      tags: ['Leave'],
      summary: 'Get logged in employee leave balance',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      responses: {
        200: {
          description: 'My leave balance details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Leave balance fetched',
                data: [
                  { leave_type: 'Casual Leave', total_allocated: 12, used: 2, remaining: 10 },
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

  '/leave/assign-balance': {
    post: {
      tags: ['Leave'],
      summary: 'Assign leave balance to employee',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['employee_id', 'leave_type_id', 'allocated_days'],
              properties: {
                employee_id: { type: 'integer', example: 10 },
                leave_type_id: { type: 'integer', example: 1 },
                allocated_days: { type: 'number', example: 12 },
              },
            },
            examples: {
              assignBalance: { summary: 'Assign balance', value: { employee_id: 10, leave_type_id: 1, allocated_days: 12 } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Leave balance assigned', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Leave balance assigned successfully' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/leave/update-balance': {
    put: {
      tags: ['Leave'],
      summary: 'Update employee allocated leave balance',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['balance_id', 'allocated_days'],
              properties: {
                balance_id: { type: 'integer', example: 5 },
                allocated_days: { type: 'number', example: 14 },
              },
            },
            examples: {
              updateBalance: { summary: 'Update balance', value: { balance_id: 5, allocated_days: 14 } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Leave balance updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Balance updated successfully' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        404: { description: 'Balance record not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/leave/delete-balance': {
    delete: {
      tags: ['Leave'],
      summary: 'Delete employee leave balance record',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['balance_id'], properties: { balance_id: { type: 'integer', example: 5 } } },
            examples: {
              deleteBalance: { summary: 'Delete balance', value: { balance_id: 5 } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Leave balance deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Balance deleted successfully' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        404: { description: 'Balance record not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/leave/emp-balances': {
    get: {
      tags: ['Leave'],
      summary: 'Get leave balances for all employees in company',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'employee_id', in: 'query', schema: { type: 'integer' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
      ],
      responses: {
        200: {
          description: 'Employee balances list',
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

  '/leave/management/create': {
    post: {
      tags: ['Leave'],
      summary: 'Manager creates leave application on behalf of employee',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['employee_id', 'leave_type', 'start_date', 'end_date'],
              properties: {
                employee_id: { type: 'integer', example: 10 },
                leave_type: { type: 'string', example: 'sick' },
                start_date: { type: 'string', format: 'date', example: '2026-08-01' },
                end_date: { type: 'string', format: 'date', example: '2026-08-02' },
                reason: { type: 'string', example: 'Medical leave' },
              },
            },
            examples: {
              managerCreate: { summary: 'Create for employee', value: { employee_id: 10, leave_type: 'sick', start_date: '2026-08-01', end_date: '2026-08-02', reason: 'Medical leave' } },
            },
          },
        },
      },
      responses: {
        201: { description: 'Leave application created by manager', content: { 'application/json': { schema: { $ref: '#/components/schemas/IdResponse' }, example: { success: true, message: 'Leave application submitted', data: { id: 12 } } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/leave/apply': {
    post: {
      tags: ['Leave'],
      summary: 'Employee applies for leave',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['leave_type', 'start_date', 'end_date'],
              properties: {
                leave_type: { type: 'string', example: 'casual' },
                start_date: { type: 'string', format: 'date', example: '2026-08-10' },
                end_date: { type: 'string', format: 'date', example: '2026-08-12' },
                reason: { type: 'string', example: 'Family vacation' },
              },
            },
            examples: {
              applyLeave: { summary: 'Apply for leave', value: { leave_type: 'casual', start_date: '2026-08-10', end_date: '2026-08-12', reason: 'Family vacation' } },
            },
          },
        },
      },
      responses: {
        201: { description: 'Leave applied successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/IdResponse' }, example: { success: true, message: 'Leave request submitted', data: { id: 12 } } } } },
        400: { description: 'Validation error / Insufficient leave balance', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/leave/management/approve-edit': {
    put: {
      tags: ['Leave'],
      summary: 'Approve or edit leave application',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['leave_id', 'status'],
              properties: {
                leave_id: { type: 'integer', example: 12 },
                status: { type: 'string', enum: ['approved', 'rejected'], example: 'approved' },
                remark: { type: 'string', example: 'Approved by manager' },
              },
            },
            examples: {
              approveLeave: { summary: 'Approve leave', value: { leave_id: 12, status: 'approved', remark: 'Approved by manager' } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Leave application status updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Leave status updated successfully' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Leave not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/leave/management/bulk-approve-reject': {
    put: {
      tags: ['Leave'],
      summary: 'Bulk approve or reject leave applications',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['leave_ids', 'status'],
              properties: {
                leave_ids: { type: 'array', items: { type: 'integer' }, example: [12, 13, 14] },
                status: { type: 'string', enum: ['approved', 'rejected'], example: 'approved' },
                remark: { type: 'string', example: 'Bulk manager action' },
              },
            },
            examples: {
              bulkApprove: { summary: 'Bulk approve', value: { leave_ids: [12, 13], status: 'approved', remark: 'Bulk approval' } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Bulk leave action processed', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Bulk status updated successfully' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/leave/reject': {
    put: {
      tags: ['Leave'],
      summary: 'Reject leave application',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['leave_id'],
              properties: { leave_id: { type: 'integer', example: 12 }, remark: { type: 'string', example: 'Project deadline' } },
            },
            examples: {
              rejectLeave: { summary: 'Reject leave', value: { leave_id: 12, remark: 'Project deadline' } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Leave application rejected', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Leave rejected' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Leave not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/leave/cancel': {
    put: {
      tags: ['Leave'],
      summary: 'Cancel pending leave application',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['leave_id'],
              properties: { leave_id: { type: 'integer', example: 12 } },
            },
            examples: {
              cancelLeave: { summary: 'Cancel leave', value: { leave_id: 12 } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Leave application cancelled', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Leave cancelled successfully' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        404: { description: 'Leave not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/leave/application-update': {
    put: {
      tags: ['Leave'],
      summary: 'Update dates or reason for pending leave application',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['leave_id', 'start_date', 'end_date'],
              properties: {
                leave_id: { type: 'integer', example: 12 },
                start_date: { type: 'string', format: 'date', example: '2026-08-11' },
                end_date: { type: 'string', format: 'date', example: '2026-08-13' },
                reason: { type: 'string', example: 'Rescheduled dates' },
              },
            },
            examples: {
              updateApplication: { summary: 'Update leave application', value: { leave_id: 12, start_date: '2026-08-11', end_date: '2026-08-13', reason: 'Rescheduled dates' } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Leave application updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Application updated successfully' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        404: { description: 'Leave not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/leave/my-applications': {
    get: {
      tags: ['Leave'],
      summary: 'Get leave applications submitted by logged in employee',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected', 'cancelled'] } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
      ],
      responses: {
        200: {
          description: 'My leave applications list',
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

  '/leave/emp-leaves': {
    get: {
      tags: ['Leave'],
      summary: 'Get all company leave applications for manager review',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected', 'cancelled'] } },
        { name: 'employee_id', in: 'query', schema: { type: 'integer' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
      ],
      responses: {
        200: {
          description: 'All employee leaves list',
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
};

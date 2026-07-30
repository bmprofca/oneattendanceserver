export const schemas = {
  ConstantKeyValuePair: {
    type: 'object',
    properties: {
      key: { type: 'string', example: 'FULL_TIME' },
      value: { type: 'string', example: 'Full Time' },
    },
    required: ['key', 'value'],
  },
  ConstantsResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      count: { type: 'integer', example: 15 },
      data: {
        type: 'object',
        additionalProperties: {
          type: 'array',
          items: { $ref: '#/components/schemas/ConstantKeyValuePair' },
        },
      },
    },
    required: ['success', 'count', 'data'],
  },
};

export const paths = {
  '/constants': {
    get: {
      tags: ['Constants'],
      summary: 'Get all system allowed constants & dropdown option enumerations',
      parameters: [
        {
          name: 'type',
          in: 'query',
          schema: {
            type: 'string',
            enum: [
              'employment',
              'salary',
              'designation',
              'employment_status',
              'punch_type',
              'attendance_method',
              'attendance_mode',
              'leave_type',
              'invite_status',
              'half_day_type',
              'leave_status',
              'accrual_type',
              'payroll_status',
              'payment_method',
              'currency',
            ],
          },
          example: 'employment',
        },
        { name: 'search', in: 'query', schema: { type: 'string' }, example: 'full' },
      ],
      responses: {
        200: {
          description: 'System constant values fetched successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ConstantsResponse' },
              example: {
                success: true,
                count: 1,
                data: {
                  employment_types: [
                    { key: 'FULL_TIME', value: 'Full Time' },
                    { key: 'PART_TIME', value: 'Part Time' },
                  ],
                },
              },
            },
          },
        },
        400: {
          description: 'Invalid type parameter',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              example: { success: false, message: 'Invalid type parameter' },
            },
          },
        },
        500: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/InternalServerErrorResponse' },
              example: { success: false, message: 'Failed to fetch constants' },
            },
          },
        },
      },
    },
  },
};

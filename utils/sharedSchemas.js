export const SHARED_SCHEMAS = {
  SuccessResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'Operation successful' },
      data: { type: 'object', nullable: true },
    },
    required: ['success', 'message'],
  },
  MessageResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'Operation completed successfully' },
    },
    required: ['success', 'message'],
  },
  BooleanResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'Status updated successfully' },
      data: { type: 'boolean', example: true },
    },
    required: ['success', 'message', 'data'],
  },
  IdResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'Record created successfully' },
      data: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
        },
        required: ['id'],
      },
    },
    required: ['success', 'message', 'data'],
  },
  PaginationMeta: {
    type: 'object',
    properties: {
      total: { type: 'integer', example: 100 },
      total_pages: { type: 'integer', example: 5 },
      page: { type: 'integer', example: 1 },
      limit: { type: 'integer', example: 20 },
      has_prev: { type: 'boolean', example: false },
      has_next: { type: 'boolean', example: true },
      is_last_page: { type: 'boolean', example: false },
    },
    required: ['total', 'total_pages', 'page', 'limit', 'has_prev', 'has_next', 'is_last_page'],
  },
  PaginatedResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'Data fetched successfully' },
      data: { type: 'array', items: { type: 'object' } },
      meta: { $ref: '#/components/schemas/PaginationMeta' },
    },
    required: ['success', 'message', 'data', 'meta'],
  },
  PaginationResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'Data fetched successfully' },
      data: { type: 'array', items: { type: 'object' } },
      meta: { $ref: '#/components/schemas/PaginationMeta' },
    },
    required: ['success', 'message', 'data', 'meta'],
  },
  ErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'An error occurred' },
      errors: { nullable: true },
    },
    required: ['success', 'message'],
  },
  ValidationErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Validation failed or invalid parameters provided' },
      errors: { nullable: true, example: { field: 'Field is required' } },
    },
    required: ['success', 'message'],
  },
  UnauthorizedResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Unauthorized access or invalid session token' },
    },
    required: ['success', 'message'],
  },
  ForbiddenResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Access denied / Insufficient permissions' },
    },
    required: ['success', 'message'],
  },
  NotFoundResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Requested resource not found' },
    },
    required: ['success', 'message'],
  },
  ConflictResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Resource state conflict' },
    },
    required: ['success', 'message'],
  },
  InternalServerErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Internal server error' },
    },
    required: ['success', 'message'],
  },
};

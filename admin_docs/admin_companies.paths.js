// ─── Admin Companies OpenAPI Paths ─────────────────────────────

export const schemas = {
  AdminCompanyListItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      name: { type: 'string', example: 'Acme Corp' },
      legal_name: { type: 'string', nullable: true, example: 'Acme Corporation Pvt Ltd' },
      logo_url: { type: 'string', nullable: true },
      is_active: { type: 'integer', example: 1 },
      owner_user_id: { type: 'integer', example: 1 },
      owner_name: { type: 'string', nullable: true, example: 'John Doe' },
      owner_email: { type: 'string', nullable: true, example: 'john@example.com' },
      owner_phone: { type: 'string', nullable: true, example: '9876543210' },
      address_line1: { type: 'string', nullable: true },
      address_line2: { type: 'string', nullable: true },
      city: { type: 'string', nullable: true },
      state: { type: 'string', nullable: true },
      postal_code: { type: 'string', nullable: true },
      country: { type: 'string', nullable: true },
      gst_no: { type: 'string', nullable: true },
      transaction_currency: { type: 'string', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },

};

const SECURITY = [{ bearerAuth: [] }];

const COMMON_ERRORS = {
  401: {
    description: 'Not authenticated',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } },
  },
  403: {
    description: 'Not an admin',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } },
  },
  500: {
    description: 'Internal server error',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } },
  },
};

export const paths = {
  '/admin/companies': {
    get: {
      tags: ['Admin Companies'],
      summary: 'List all companies',
      description: 'Paginated list of all companies with owner details. Supports search and active filter.',
      operationId: 'adminListCompanies',
      security: SECURITY,
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Items per page (max 100)' },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by company name, legal name, or owner name/email' },
        { name: 'is_active', in: 'query', schema: { type: 'integer', enum: [0, 1] }, description: 'Filter by active status' },
      ],
      responses: {
        200: {
          description: 'Companies fetched successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/AdminCompanyListItem' } },
                  meta: { $ref: '#/components/schemas/PaginationMeta' },
                },
              },
            },
          },
        },
        ...COMMON_ERRORS,
      },
    },

  },

};

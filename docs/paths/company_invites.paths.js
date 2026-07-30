export const schemas = {
  InvitePackage: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      company_id: { type: 'integer', example: 1 },
      name: { type: 'string', example: 'Default Employee Package' },
      role: { type: 'string', example: 'employee' },
    },
  },
  CompanyInvite: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 5 },
      company_id: { type: 'integer', example: 1 },
      email: { type: 'string', nullable: true, example: 'invitee@example.com' },
      phone: { type: 'string', nullable: true, example: '9876543210' },
      role: { type: 'string', example: 'employee' },
      status: { type: 'string', enum: ['pending', 'accepted', 'rejected', 'cancelled', 'expired'], example: 'pending' },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  SendInvitePayload: {
    type: 'object',
    required: ['company_id'],
    properties: {
      company_id: { type: 'integer', example: 1 },
      email: { type: 'string', format: 'email', nullable: true, example: 'invitee@example.com' },
      phone: { type: 'string', nullable: true, example: '9876543210' },
      role: { type: 'string', default: 'employee', example: 'employee' },
      package_id: { type: 'integer', nullable: true, example: 2 },
    },
  },
};

export const paths = {
  '/company/invites/package-create': {
    post: {
      tags: ['Company Invites'],
      summary: 'Create invite package template',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['company_id', 'name'],
              properties: {
                company_id: { type: 'integer', example: 1 },
                name: { type: 'string', example: 'Sales Staff Package' },
                role: { type: 'string', example: 'employee' },
              },
            },
            examples: {
              minimalRequest: { summary: 'Minimal fields', value: { company_id: 1, name: 'Standard Staff' } },
              fullRequest: { summary: 'All fields', value: { company_id: 1, name: 'Sales Staff Package', role: 'employee' } },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Invite package created',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IdResponse' },
              example: { success: true, message: 'Package created', data: { id: 1 } },
            },
          },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        401: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } },
        },
        403: {
          description: 'Forbidden',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } },
        },
        500: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } },
        },
      },
    },
  },

  '/company/invites/package-update': {
    put: {
      tags: ['Company Invites'],
      summary: 'Update invite package template',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['id', 'name'],
              properties: {
                id: { type: 'integer', example: 2 },
                name: { type: 'string', example: 'Senior Staff Package' },
              },
            },
            examples: {
              minimalRequest: { summary: 'Minimal fields', value: { id: 2, name: 'Updated Package' } },
              fullRequest: { summary: 'All fields', value: { id: 2, name: 'Senior Staff Package' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Invite package updated',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Package updated' },
            },
          },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        401: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } },
        },
        404: {
          description: 'Package not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
        },
        500: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } },
        },
      },
    },
  },

  '/company/invites/package-list': {
    get: {
      tags: ['Company Invites'],
      summary: 'List company invite packages',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company_id', in: 'query', required: true, schema: { type: 'integer' } }],
      responses: {
        200: {
          description: 'Packages list',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Packages list fetched',
                data: [
                  { id: 1, company_id: 1, name: 'Standard Employee', role: 'employee' },
                  { id: 2, company_id: 1, name: 'Manager Package', role: 'manager' },
                ],
              },
            },
          },
        },
        401: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } },
        },
        500: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } },
        },
      },
    },
  },

  '/company/invites/package-delete': {
    delete: {
      tags: ['Company Invites'],
      summary: 'Delete invite package template',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['id'],
              properties: { id: { type: 'integer', example: 2 } },
            },
            examples: {
              minimalRequest: { summary: 'Minimal fields', value: { id: 2 } },
              fullRequest: { summary: 'All fields', value: { id: 2 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Package deleted',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Package deleted' },
            },
          },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        401: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } },
        },
        404: {
          description: 'Package not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
        },
        500: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } },
        },
      },
    },
  },

  '/company/invites/send': {
    post: {
      tags: ['Company Invites'],
      summary: 'Send company invitation',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SendInvitePayload' },
            examples: {
              minimalRequest: { summary: 'Minimal fields', value: { company_id: 1, email: 'invitee@example.com' } },
              fullRequest: { summary: 'All fields', value: { company_id: 1, email: 'invitee@example.com', phone: '9876543210', role: 'employee', package_id: 2 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Invitation sent',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: { success: true, message: 'Invite sent', data: { id: 5, company_id: 1, email: 'invitee@example.com', role: 'employee', status: 'pending' } },
            },
          },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        401: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } },
        },
        409: {
          description: 'Invite already sent or user already member',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ConflictResponse' } } },
        },
        500: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } },
        },
      },
    },
  },

  '/company/invites/resend': {
    post: {
      tags: ['Company Invites'],
      summary: 'Resend company invitation',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['invite_id'],
              properties: { invite_id: { type: 'integer', example: 5 } },
            },
            examples: {
              minimalRequest: { summary: 'Minimal fields', value: { invite_id: 5 } },
              fullRequest: { summary: 'All fields', value: { invite_id: 5 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Invitation resent',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Invite resent successfully' },
            },
          },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        401: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } },
        },
        404: {
          description: 'Invite not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
        },
        500: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } },
        },
      },
    },
  },

  '/company/invites/accept': {
    post: {
      tags: ['Company Invites'],
      summary: 'Accept company invitation with token',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token'],
              properties: { token: { type: 'string', example: 'inv_tok_123456' } },
            },
            examples: {
              minimalRequest: { summary: 'Minimal fields', value: { token: 'inv_tok_123456' } },
              fullRequest: { summary: 'All fields', value: { token: 'inv_tok_123456' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Invitation accepted',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Joined company successfully' },
            },
          },
        },
        400: {
          description: 'Invalid token or invite expired',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        401: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } },
        },
        500: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } },
        },
      },
    },
  },

  '/company/invites/accept-invite': {
    post: {
      tags: ['Company Invites'],
      summary: 'Accept invitation via invite ID',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['invite_id'],
              properties: { invite_id: { type: 'integer', example: 5 } },
            },
            examples: {
              minimalRequest: { summary: 'Minimal fields', value: { invite_id: 5 } },
              fullRequest: { summary: 'All fields', value: { invite_id: 5 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Invitation accepted',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Joined company successfully' },
            },
          },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        401: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } },
        },
        404: {
          description: 'Invite not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
        },
        500: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } },
        },
      },
    },
  },

  '/company/invites/list': {
    get: {
      tags: ['Company Invites'],
      summary: 'Get all sent company invitations',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company_id', in: 'query', required: true, schema: { type: 'integer' } },
        { name: 'status', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        200: {
          description: 'Company invites list',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                data: [
                  { id: 5, company_id: 1, email: 'invitee@example.com', phone: '9876543210', role: 'employee', status: 'pending', created_at: '2026-07-30T10:00:00.000Z' },
                ],
              },
            },
          },
        },
        401: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } },
        },
        500: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } },
        },
      },
    },
  },

  '/company/invites/my': {
    get: {
      tags: ['Company Invites'],
      summary: 'Get received invitations for current user',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'My received invitations list',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                data: [
                  { id: 8, company_name: 'Acme Corp', role: 'employee', status: 'pending', created_at: '2026-07-30T10:00:00.000Z' },
                ],
              },
            },
          },
        },
        401: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } },
        },
        500: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } },
        },
      },
    },
  },

  '/company/invites/update': {
    put: {
      tags: ['Company Invites'],
      summary: 'Update pending invitation role or package',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['invite_id'],
              properties: {
                invite_id: { type: 'integer', example: 5 },
                role: { type: 'string', example: 'manager' },
                package_id: { type: 'integer', example: 3 },
              },
            },
            examples: {
              minimalRequest: { summary: 'Minimal fields', value: { invite_id: 5 } },
              fullRequest: { summary: 'All fields', value: { invite_id: 5, role: 'manager', package_id: 3 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Invitation updated',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Invite updated' },
            },
          },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        401: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } },
        },
        404: {
          description: 'Invite not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
        },
        500: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } },
        },
      },
    },
  },

  '/company/invites/cancel': {
    delete: {
      tags: ['Company Invites'],
      summary: 'Cancel sent company invitation',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['invite_id'],
              properties: { invite_id: { type: 'integer', example: 5 } },
            },
            examples: {
              minimalRequest: { summary: 'Minimal fields', value: { invite_id: 5 } },
              fullRequest: { summary: 'All fields', value: { invite_id: 5 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Invitation cancelled',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Invite cancelled' },
            },
          },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        401: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } },
        },
        404: {
          description: 'Invite not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
        },
        500: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } },
        },
      },
    },
  },

  '/company/invites/reject': {
    put: {
      tags: ['Company Invites'],
      summary: 'Reject received invitation',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['invite_id'],
              properties: { invite_id: { type: 'integer', example: 5 } },
            },
            examples: {
              minimalRequest: { summary: 'Minimal fields', value: { invite_id: 5 } },
              fullRequest: { summary: 'All fields', value: { invite_id: 5 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Invitation rejected',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Invite rejected' },
            },
          },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
        },
        401: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } },
        },
        404: {
          description: 'Invite not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } },
        },
        500: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } },
        },
      },
    },
  },
};

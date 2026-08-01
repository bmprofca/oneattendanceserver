// ─── Admin Auth OpenAPI Paths ──────────────────────────────────

export const schemas = {
  AdminSendOtpRequest: {
    type: 'object',
    required: ['phone'],
    properties: {
      phone: {
        type: 'string',
        example: '919876543210',
        description: 'Admin phone number (10 digits or 12 digits with country code e.g. 91)',
      },
    },
  },
  AdminVerifyOtpRequest: {
    type: 'object',
    required: ['phone', 'otp'],
    properties: {
      phone: {
        type: 'string',
        example: '919876543210',
        description: 'Admin phone number (10 digits or 12 digits with country code)',
      },
      otp: {
        type: 'string',
        example: '123456',
        description: '6-digit OTP received via SMS/WhatsApp',
      },
    },
  },
  AdminLoginResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'Admin login successful' },
      data: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            description: 'Bearer session token',
          },
          user: {
            type: 'object',
            properties: {
              id: { type: 'integer', example: 1 },
              email: { type: 'string', example: 'admin@example.com' },
              phone: { type: 'string', example: '9876543210' },
              name: { type: 'string', example: 'Admin User' },
              profile_picture: { type: 'string', nullable: true },
              is_system_admin: { type: 'boolean', example: true },
            },
          },
        },
      },
    },
  },
  AdminProfileResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'Admin profile fetched' },
      data: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          email: { type: 'string', example: 'admin@example.com' },
          phone: { type: 'string', example: '9876543210' },
          name: { type: 'string', example: 'Admin User' },
          profile_picture: { type: 'string', nullable: true },
          is_system_admin: { type: 'boolean', example: true },
        },
      },
    },
  },
};

export const paths = {
  '/admin/auth/send-otp': {
    post: {
      tags: ['Admin Auth'],
      summary: 'Send OTP to admin phone',
      description: 'Sends a 6-digit OTP to the admin phone via SMS and WhatsApp. Only users with `is_system_admin = 1` can request this.',
      operationId: 'adminSendOtp',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AdminSendOtpRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'OTP sent successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
            },
          },
        },
        400: {
          description: 'Invalid phone number',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        403: {
          description: 'Not an admin user',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ForbiddenResponse' },
            },
          },
        },
        404: {
          description: 'Admin account not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NotFoundResponse' },
            },
          },
        },
        429: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
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

  '/admin/auth/verify-otp': {
    post: {
      tags: ['Admin Auth'],
      summary: 'Verify OTP and login as admin',
      description: 'Verifies the OTP, creates a session, and returns a bearer token for subsequent admin API calls.',
      operationId: 'adminVerifyOtp',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AdminVerifyOtpRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Admin login successful',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminLoginResponse' },
            },
          },
        },
        400: {
          description: 'Invalid/expired OTP or missing fields',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        403: {
          description: 'Not an admin user',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ForbiddenResponse' },
            },
          },
        },
        404: {
          description: 'Admin account not found',
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

  '/admin/auth/me': {
    get: {
      tags: ['Admin Auth'],
      summary: 'Get current admin profile',
      description: 'Returns the authenticated admin user profile.',
      operationId: 'adminGetMe',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Admin profile fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminProfileResponse' },
            },
          },
        },
        401: {
          description: 'Not authenticated',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UnauthorizedResponse' },
            },
          },
        },
        403: {
          description: 'Not an admin',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ForbiddenResponse' },
            },
          },
        },
      },
    },
  },

  '/admin/auth/logout': {
    post: {
      tags: ['Admin Auth'],
      summary: 'Logout admin session',
      description: 'Deactivates the current admin session.',
      operationId: 'adminLogout',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Logged out successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
            },
          },
        },
        401: {
          description: 'Not authenticated',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UnauthorizedResponse' },
            },
          },
        },
      },
    },
  },
};

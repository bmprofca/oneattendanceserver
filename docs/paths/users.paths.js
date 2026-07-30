export const schemas = {
  UserProfileData: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      email: { type: 'string', example: 'user@example.com' },
      phone: { type: 'string', example: '9876543210' },
      name: { type: 'string', example: 'John Doe' },
      profile_picture: { type: 'string', nullable: true, example: 'https://example.com/avatar.jpg' },
      is_active: { type: 'boolean', example: true },
    },
  },
  UpdateProfilePayload: {
    type: 'object',
    properties: {
      name: { type: 'string', example: 'John Doe' },
      profile_picture: { type: 'string', example: 'https://example.com/avatar.jpg' },
    },
  },
  UpdatePasswordPayload: {
    type: 'object',
    required: ['old_password', 'new_password'],
    properties: {
      old_password: { type: 'string', example: 'OldPass123' },
      new_password: { type: 'string', example: 'NewPass123' },
    },
  },
};

export const paths = {
  '/users/update-profile': {
    put: {
      tags: ['Users'],
      summary: 'Update user profile info (name & avatar)',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateProfilePayload' },
            examples: {
              updateProfile: { summary: 'Update profile', value: { name: 'John Doe', profile_picture: 'https://example.com/avatar.jpg' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Profile updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: { success: true, message: 'Profile updated successfully', data: { id: 1, name: 'John Doe', email: 'user@example.com' } },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/users/profile-role': {
    get: {
      tags: ['Users'],
      summary: 'Get user profile role & permissions context across companies',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Profile role details fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Profile role fetched successfully',
                data: {
                  id: 1,
                  name: 'John Doe',
                  email: 'user@example.com',
                  phone: '9876543210',
                  companies: [
                    { company_id: 1, company_name: 'Acme Corp', role: 'owner' },
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

  '/users/update-password': {
    put: {
      tags: ['Users'],
      summary: 'Update account password',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdatePasswordPayload' },
            examples: {
              updatePassword: { summary: 'Update password', value: { old_password: 'OldPass123', new_password: 'NewPass123' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Password updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Password updated successfully' },
            },
          },
        },
        400: { description: 'Invalid old password or weak new password', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/users/delete/request-otp': {
    post: {
      tags: ['Users'],
      summary: 'Request OTP to delete account',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Account deletion OTP sent',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'OTP sent for account deletion' },
            },
          },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/users/delete/confirm': {
    delete: {
      tags: ['Users'],
      summary: 'Confirm account deletion with OTP',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['otp'],
              properties: { otp: { type: 'string', example: '123456' } },
            },
            examples: {
              confirmDelete: { summary: 'Confirm deletion', value: { otp: '123456' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Account deleted successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Account deleted successfully' },
            },
          },
        },
        400: { description: 'Invalid or expired OTP', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/users/request-update-phone-otp': {
    post: {
      tags: ['Users'],
      summary: 'Request OTP to change mobile phone number',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['new_phone'],
              properties: { new_phone: { type: 'string', example: '9998887770' } },
            },
            examples: {
              requestPhoneOtp: { summary: 'Request phone OTP', value: { new_phone: '9998887770' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'OTP sent to new phone number',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'OTP sent to new phone number' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        409: { description: 'Phone number already in use', content: { 'application/json': { schema: { $ref: '#/components/schemas/ConflictResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/users/verify-update-phone-otp': {
    put: {
      tags: ['Users'],
      summary: 'Verify OTP and update mobile phone number',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['new_phone', 'otp'],
              properties: {
                new_phone: { type: 'string', example: '9998887770' },
                otp: { type: 'string', example: '123456' },
              },
            },
            examples: {
              verifyPhoneOtp: { summary: 'Verify phone OTP', value: { new_phone: '9998887770', otp: '123456' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Phone number updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Phone number updated successfully' },
            },
          },
        },
        400: { description: 'Invalid or expired OTP', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/users/request-update-email-otp': {
    post: {
      tags: ['Users'],
      summary: 'Request OTP to change email address',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['new_email'],
              properties: { new_email: { type: 'string', format: 'email', example: 'newemail@example.com' } },
            },
            examples: {
              requestEmailOtp: { summary: 'Request email OTP', value: { new_email: 'newemail@example.com' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'OTP sent to new email',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'OTP sent to new email' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        409: { description: 'Email address already in use', content: { 'application/json': { schema: { $ref: '#/components/schemas/ConflictResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/users/verify-update-email-otp': {
    put: {
      tags: ['Users'],
      summary: 'Verify OTP and update email address',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['new_email', 'otp'],
              properties: {
                new_email: { type: 'string', format: 'email', example: 'newemail@example.com' },
                otp: { type: 'string', example: '123456' },
              },
            },
            examples: {
              verifyEmailOtp: { summary: 'Verify email OTP', value: { new_email: 'newemail@example.com', otp: '123456' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Email address updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Email address updated successfully' },
            },
          },
        },
        400: { description: 'Invalid or expired OTP', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },
};

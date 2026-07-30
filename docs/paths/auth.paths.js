export const schemas = {
  AuthUser: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      email: { type: 'string', nullable: true, example: 'user@example.com' },
      phone: { type: 'string', nullable: true, example: '9876543210' },
      name: { type: 'string', nullable: true, example: 'John Doe' },
      profile_picture: { type: 'string', nullable: true, example: 'https://example.com/avatar.jpg' },
      is_active: { type: 'integer', example: 1 },
      is_system_admin: { type: 'integer', example: 0 },
    },
  },
  AuthSession: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 101 },
      session_token: { type: 'string', example: 'sess_abc123xyz' },
      ip_v4: { type: 'string', nullable: true, example: '127.0.0.1' },
      ip_v6: { type: 'string', nullable: true, example: '::1' },
      device_name: { type: 'string', nullable: true, example: 'Chrome on Windows' },
      platform: { type: 'string', example: 'web' },
      created_at: { type: 'string', format: 'date-time' },
      expires_at: { type: 'string', format: 'date-time' },
    },
  },
  LoginSuccessResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'Login successful' },
      data: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/AuthUser' },
          session_token: { type: 'string', example: 'sess_abc123xyz' },
        },
      },
    },
    required: ['success', 'message', 'data'],
  },
  SignupRequestOtpPayload: {
    type: 'object',
    required: ['signup_type'],
    properties: {
      signup_type: { type: 'string', enum: ['email', 'phone'], example: 'email' },
      email: { type: 'string', format: 'email', example: 'user@example.com' },
      phone: { type: 'string', example: '9876543210' },
    },
  },
  SignupVerifyOtpPayload: {
    type: 'object',
    required: ['signup_type', 'password', 'otp', 'platform'],
    properties: {
      signup_type: { type: 'string', enum: ['email', 'phone'], example: 'email' },
      email: { type: 'string', format: 'email', example: 'user@example.com' },
      phone: { type: 'string', example: '9876543210' },
      otp: { type: 'string', example: '123456' },
      password: { type: 'string', example: 'SecurePass123' },
      name: { type: 'string', example: 'John Doe' },
      platform: { type: 'string', enum: ['web', 'android', 'ios'], example: 'web' },
      latitude: { type: 'number', nullable: true, example: 28.6139 },
      longitude: { type: 'number', nullable: true, example: 77.209 },
    },
  },
  PasswordLoginPayload: {
    type: 'object',
    required: ['login_type', 'password', 'platform'],
    properties: {
      login_type: { type: 'string', enum: ['email', 'phone'], example: 'email' },
      email: { type: 'string', format: 'email', example: 'user@example.com' },
      phone: { type: 'string', example: '9876543210' },
      password: { type: 'string', example: 'SecurePass123' },
      platform: { type: 'string', enum: ['web', 'android', 'ios'], example: 'web' },
      latitude: { type: 'number', nullable: true },
      longitude: { type: 'number', nullable: true },
    },
  },
  OtpLoginRequestPayload: {
    type: 'object',
    required: ['login_type'],
    properties: {
      login_type: { type: 'string', enum: ['email', 'phone'], example: 'email' },
      email: { type: 'string', format: 'email', example: 'user@example.com' },
      phone: { type: 'string', example: '9876543210' },
    },
  },
  OtpLoginVerifyPayload: {
    type: 'object',
    required: ['login_type', 'otp', 'platform'],
    properties: {
      login_type: { type: 'string', enum: ['email', 'phone'], example: 'email' },
      email: { type: 'string', format: 'email', example: 'user@example.com' },
      phone: { type: 'string', example: '9876543210' },
      otp: { type: 'string', example: '123456' },
      platform: { type: 'string', enum: ['web', 'android', 'ios'], example: 'web' },
      latitude: { type: 'number', nullable: true },
      longitude: { type: 'number', nullable: true },
    },
  },
  GoogleLoginPayload: {
    type: 'object',
    required: ['id_token', 'platform'],
    properties: {
      id_token: { type: 'string', description: 'Google OAuth ID token' },
      platform: { type: 'string', enum: ['web', 'android', 'ios'], example: 'web' },
      latitude: { type: 'number', nullable: true },
      longitude: { type: 'number', nullable: true },
    },
  },
  FacebookLoginPayload: {
    type: 'object',
    required: ['access_token', 'platform'],
    properties: {
      access_token: { type: 'string', description: 'Facebook Graph API Access Token' },
      platform: { type: 'string', enum: ['web', 'android', 'ios'], example: 'web' },
      latitude: { type: 'number', nullable: true },
      longitude: { type: 'number', nullable: true },
    },
  },
  TruecallerLoginPayload: {
    type: 'object',
    required: ['code', 'code_verifier', 'platform'],
    properties: {
      code: { type: 'string', description: 'Truecaller OAuth authorization code' },
      code_verifier: { type: 'string', description: 'Truecaller PKCE code verifier' },
      platform: { type: 'string', enum: ['web', 'android', 'ios'], example: 'web' },
      latitude: { type: 'number', nullable: true },
      longitude: { type: 'number', nullable: true },
    },
  },
  ForgotPasswordRequestPayload: {
    type: 'object',
    required: ['forgot_type'],
    properties: {
      forgot_type: { type: 'string', enum: ['email', 'phone'], example: 'email' },
      email: { type: 'string', format: 'email', example: 'user@example.com' },
      phone: { type: 'string', example: '9876543210' },
    },
  },
  ForgotPasswordVerifyPayload: {
    type: 'object',
    required: ['forgot_type', 'otp'],
    properties: {
      forgot_type: { type: 'string', enum: ['email', 'phone'], example: 'email' },
      email: { type: 'string', format: 'email', example: 'user@example.com' },
      phone: { type: 'string', example: '9876543210' },
      otp: { type: 'string', example: '123456' },
    },
  },
  ResetPasswordPayload: {
    type: 'object',
    required: ['forgot_type', 'otp', 'new_password'],
    properties: {
      forgot_type: { type: 'string', enum: ['email', 'phone'], example: 'email' },
      email: { type: 'string', format: 'email', example: 'user@example.com' },
      phone: { type: 'string', example: '9876543210' },
      otp: { type: 'string', example: '123456' },
      new_password: { type: 'string', example: 'NewPass123' },
    },
  },
  ChangePasswordPayload: {
    type: 'object',
    required: ['old_password', 'new_password'],
    properties: {
      old_password: { type: 'string', example: 'OldPass123' },
      new_password: { type: 'string', example: 'NewPass123' },
    },
  },
};

export const paths = {
  '/auth/signup/request-otp': {
    post: {
      tags: ['Auth'],
      summary: 'Request signup OTP',
      description: 'Sends a signup OTP to the provided email or mobile number.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SignupRequestOtpPayload' },
          },
        },
      },
      responses: {
        200: {
          description: 'OTP sent successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'OTP sent to email' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        409: { description: 'User already registered', content: { 'application/json': { schema: { $ref: '#/components/schemas/ConflictResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/auth/signup/verify-otp': {
    post: {
      tags: ['Auth'],
      summary: 'Verify signup OTP & create account',
      description: 'Verifies the signup OTP, registers the new user, and creates an active session. TOKEN auto-saved to Scalar environment.',
      'x-post-response': `const res = pm.response.json();
if (res.success && res.data?.session_token) {
  pm.environment.set('TOKEN', res.data.session_token);
}`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SignupVerifyOtpPayload' },
          },
        },
      },
      responses: {
        200: {
          description: 'Account created and logged in',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginSuccessResponse' },
              example: {
                success: true,
                message: 'Account created and logged in successfully',
                data: {
                  user: { id: 1, email: 'user@example.com', phone: '9876543210', name: 'John Doe', profile_picture: null, is_active: 1, is_system_admin: 0 },
                  session_token: 'sess_abc123xyz',
                },
              },
            },
          },
        },
        400: { description: 'Invalid or expired OTP', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        409: { description: 'Email or phone already registered', content: { 'application/json': { schema: { $ref: '#/components/schemas/ConflictResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/auth/login/password': {
    post: {
      tags: ['Auth'],
      summary: 'Login with password',
      description: 'Authenticates user with email/phone and password. TOKEN auto-saved to Scalar environment.',
      'x-post-response': `const res = pm.response.json();
if (res.success && res.data?.session_token) {
  pm.environment.set('TOKEN', res.data.session_token);
}`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PasswordLoginPayload' },
          },
        },
      },
      responses: {
        200: {
          description: 'Login successful',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginSuccessResponse' },
              example: {
                success: true,
                message: 'Login successful',
                data: {
                  user: { id: 1, email: 'user@example.com', phone: '9876543210', name: 'John Doe', profile_picture: null, is_active: 1, is_system_admin: 0 },
                  session_token: 'sess_abc123xyz',
                },
              },
            },
          },
        },
        400: { description: 'Invalid input fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Invalid credentials or account inactive', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/auth/login/request-otp': {
    post: {
      tags: ['Auth'],
      summary: 'Request login OTP',
      description: 'Sends a login OTP to registered email or phone.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/OtpLoginRequestPayload' },
          },
        },
      },
      responses: {
        200: {
          description: 'Login OTP sent successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'OTP sent to mobile' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        404: { description: 'User not found or inactive', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/auth/login/verify-otp': {
    post: {
      tags: ['Auth'],
      summary: 'Verify login OTP',
      description: 'Verifies login OTP and returns session token. TOKEN auto-saved to Scalar environment.',
      'x-post-response': `const res = pm.response.json();
if (res.success && res.data?.session_token) {
  pm.environment.set('TOKEN', res.data.session_token);
}`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/OtpLoginVerifyPayload' },
          },
        },
      },
      responses: {
        200: {
          description: 'Login successful',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginSuccessResponse' },
              example: {
                success: true,
                message: 'Login successful',
                data: {
                  user: { id: 1, email: 'user@example.com', phone: '9876543210', name: 'John Doe', profile_picture: null, is_active: 1, is_system_admin: 0 },
                  session_token: 'sess_abc123xyz',
                },
              },
            },
          },
        },
        400: { description: 'Invalid or expired OTP', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/auth/google': {
    post: {
      tags: ['Auth'],
      summary: 'Google OAuth Single-Sign-On',
      description: 'Authenticates or registers user using Google ID token.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/GoogleLoginPayload' },
          },
        },
      },
      responses: {
        200: {
          description: 'Google SSO successful',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginSuccessResponse' },
              example: {
                success: true,
                message: 'Google login successful',
                data: {
                  user: { id: 1, email: 'user@example.com', phone: null, name: 'Google User', profile_picture: 'https://lh3.googleusercontent.com/a/abc', is_active: 1, is_system_admin: 0 },
                  session_token: 'sess_google123',
                },
              },
            },
          },
        },
        400: { description: 'Invalid Google token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/auth/facebook': {
    post: {
      tags: ['Auth'],
      summary: 'Facebook OAuth Login',
      description: 'Authenticates or registers user using Facebook Graph API Access Token.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/FacebookLoginPayload' },
          },
        },
      },
      responses: {
        200: {
          description: 'Facebook login successful',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginSuccessResponse' },
            },
          },
        },
        400: { description: 'Invalid Facebook token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/auth/truecaller': {
    post: {
      tags: ['Auth'],
      summary: 'Truecaller OAuth Login',
      description: 'Authenticates or registers user using Truecaller authorization code & PKCE verifier.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/TruecallerLoginPayload' },
          },
        },
      },
      responses: {
        200: {
          description: 'Truecaller login successful',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginSuccessResponse' },
            },
          },
        },
        400: { description: 'Invalid Truecaller token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/auth/forgot-password/request-otp': {
    post: {
      tags: ['Auth'],
      summary: 'Request forgot password OTP',
      description: 'Sends password reset OTP via email or phone.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ForgotPasswordRequestPayload' },
          },
        },
      },
      responses: {
        200: {
          description: 'Reset OTP sent successfully',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' } } },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/auth/forgot-password/verify-otp': {
    post: {
      tags: ['Auth'],
      summary: 'Verify forgot password OTP',
      description: 'Validates forgot password OTP code before password update.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ForgotPasswordVerifyPayload' },
          },
        },
      },
      responses: {
        200: {
          description: 'OTP verified successfully',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' } } },
        },
        400: { description: 'Invalid or expired OTP', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/auth/forgot-password/reset-password': {
    post: {
      tags: ['Auth'],
      summary: 'Reset password with verified OTP',
      description: 'Resets the account password using the verified OTP.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ResetPasswordPayload' },
          },
        },
      },
      responses: {
        200: {
          description: 'Password reset successfully',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' } } },
        },
        400: { description: 'Validation error or invalid OTP', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/auth/sessions': {
    get: {
      tags: ['Auth'],
      summary: 'List user active sessions',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
      ],
      responses: {
        200: {
          description: 'Active user sessions list',
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

  '/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Logout current session',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Logged out successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'Logged out successfully' },
            },
          },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/auth/logout-all': {
    post: {
      tags: ['Auth'],
      summary: 'Logout all other active sessions',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'All other sessions terminated',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageResponse' },
              example: { success: true, message: 'All other active sessions logged out successfully' },
            },
          },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/auth/change-password': {
    post: {
      tags: ['Auth'],
      summary: 'Change account password',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ChangePasswordPayload' },
          },
        },
      },
      responses: {
        200: {
          description: 'Password changed successfully',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' } } },
        },
        400: { description: 'Invalid old or new password', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },
};

export const schemas = {
  PunchInPayload: {
    type: 'object',
    required: ['method'],
    properties: {
      method: { type: 'string', enum: ['selfie', 'geofence', 'biometric', 'manual'], example: 'selfie' },
      latitude: { type: 'number', nullable: true, example: 12.9716 },
      longitude: { type: 'number', nullable: true, example: 77.5946 },
      selfie_url: { type: 'string', nullable: true, example: 'https://example.com/selfie.jpg' },
      device_id: { type: 'string', nullable: true, example: 'DEV-12345' },
      notes: { type: 'string', nullable: true, example: 'On-site punch' },
    },
  },
  PunchOutPayload: {
    type: 'object',
    required: ['method'],
    properties: {
      method: { type: 'string', enum: ['selfie', 'geofence', 'biometric', 'manual'], example: 'selfie' },
      latitude: { type: 'number', nullable: true, example: 12.9716 },
      longitude: { type: 'number', nullable: true, example: 77.5946 },
      selfie_url: { type: 'string', nullable: true, example: 'https://example.com/selfie_out.jpg' },
      notes: { type: 'string', nullable: true, example: 'End of shift' },
    },
  },
  BreakPayload: {
    type: 'object',
    properties: {
      break_type: { type: 'string', example: 'lunch' },
      latitude: { type: 'number', nullable: true, example: 12.9716 },
      longitude: { type: 'number', nullable: true, example: 77.5946 },
    },
  },
  FaceAttendancePayload: {
    type: 'object',
    required: ['image_url'],
    properties: {
      image_url: { type: 'string', example: 'https://example.com/face.jpg' },
      latitude: { type: 'number', nullable: true, example: 12.9716 },
      longitude: { type: 'number', nullable: true, example: 77.5946 },
    },
  },
  AttendanceApprovePayload: {
    type: 'object',
    required: ['attendance_id', 'status'],
    properties: {
      attendance_id: { type: 'integer', example: 50 },
      status: { type: 'string', enum: ['approved', 'rejected'], example: 'approved' },
      remark: { type: 'string', nullable: true, example: 'Verified location' },
    },
  },
  ManualAttendancePayload: {
    type: 'object',
    required: ['employee_id', 'date', 'status'],
    properties: {
      employee_id: { type: 'integer', example: 10 },
      date: { type: 'string', format: 'date', example: '2026-07-30' },
      status: { type: 'string', enum: ['present', 'absent', 'half_day', 'on_leave'], example: 'present' },
      check_in_time: { type: 'string', example: '09:00:00' },
      check_out_time: { type: 'string', example: '18:00:00' },
      remark: { type: 'string', nullable: true, example: 'Manual manager override' },
    },
  },
  AttendanceRecord: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 100 },
      employee_id: { type: 'integer', example: 10 },
      company_id: { type: 'integer', example: 1 },
      date: { type: 'string', format: 'date', example: '2026-07-30' },
      check_in: { type: 'string', nullable: true, example: '2026-07-30 09:00:00' },
      check_out: { type: 'string', nullable: true, example: '2026-07-30 18:00:00' },
      status: { type: 'string', example: 'present' },
      method: { type: 'string', example: 'selfie' },
      is_approved: { type: 'boolean', example: true },
      total_work_minutes: { type: 'integer', example: 540 },
    },
  },
};

export const paths = {
  '/attendance/punch-in': {
    post: {
      tags: ['Attendance'],
      summary: 'Punch-in for attendance',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PunchInPayload' },
            examples: {
              punchIn: { summary: 'Punch in', value: { method: 'selfie', latitude: 12.9716, longitude: 77.5946, selfie_url: 'https://example.com/selfie.jpg' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Punched in successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Punched in successfully',
                data: { id: 100, employee_id: 10, company_id: 1, date: '2026-07-30', check_in: '2026-07-30 09:00:00', status: 'present', method: 'selfie' },
              },
            },
          },
        },
        400: { description: 'Validation error / Out of geofence / Already punched in', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/attendance/punch-out': {
    post: {
      tags: ['Attendance'],
      summary: 'Punch-out for attendance',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PunchOutPayload' },
            examples: {
              punchOut: { summary: 'Punch out', value: { method: 'selfie', latitude: 12.9716, longitude: 77.5946, selfie_url: 'https://example.com/selfie_out.jpg' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Punched out successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: { success: true, message: 'Punched out successfully', data: { total_work_hours: 9 } },
            },
          },
        },
        400: { description: 'Validation error / No active punch-in found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/attendance/break-in': {
    post: {
      tags: ['Attendance'],
      summary: 'Start break duration',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/BreakPayload' },
            examples: {
              breakIn: { summary: 'Break in', value: { break_type: 'lunch', latitude: 12.9716, longitude: 77.5946 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Break started',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Break started' } } },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/attendance/break-out': {
    post: {
      tags: ['Attendance'],
      summary: 'End break duration',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/BreakPayload' },
            examples: {
              breakOut: { summary: 'Break out', value: { break_type: 'lunch', latitude: 12.9716, longitude: 77.5946 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Break ended',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Break ended' } } },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/attendance/face-attendance-check': {
    post: {
      tags: ['Attendance'],
      summary: 'Verify face match before marking attendance',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/FaceAttendancePayload' },
            examples: {
              faceCheck: { summary: 'Check face', value: { image_url: 'https://example.com/face.jpg', latitude: 12.9716, longitude: 77.5946 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Face matched successfully',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' }, example: { success: true, message: 'Face matched', data: { match_score: 0.98, employee_id: 10 } } } },
        },
        400: { description: 'Face match failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/attendance/face-attendance': {
    post: {
      tags: ['Attendance'],
      summary: 'Punch attendance via facial recognition',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/FaceAttendancePayload' },
            examples: {
              facePunch: { summary: 'Face attendance', value: { image_url: 'https://example.com/face.jpg', latitude: 12.9716, longitude: 77.5946 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Face attendance recorded',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Face attendance punched successfully' } } },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/attendance/approve': {
    put: {
      tags: ['Attendance'],
      summary: 'Approve or reject attendance entry (Manager/Admin)',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AttendanceApprovePayload' },
            examples: {
              approve: { summary: 'Approve attendance', value: { attendance_id: 50, status: 'approved', remark: 'Verified location' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Attendance approval updated',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Attendance status updated' } } },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        404: { description: 'Attendance record not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFoundResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/attendance/mark': {
    post: {
      tags: ['Attendance'],
      summary: 'Manually mark attendance for an employee (Manager/Admin)',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ManualAttendancePayload' },
            examples: {
              markManual: { summary: 'Mark manual attendance', value: { employee_id: 10, date: '2026-07-30', status: 'present', check_in_time: '09:00:00', check_out_time: '18:00:00' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Attendance marked manually',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' }, example: { success: true, message: 'Attendance marked manually' } } },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForbiddenResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/attendance/my/past-punches': {
    get: {
      tags: ['Attendance'],
      summary: 'Get employee past punch history',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 30 } },
      ],
      responses: {
        200: {
          description: 'Past punch logs fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Past punches fetched',
                data: [
                  { id: 100, date: '2026-07-30', check_in: '2026-07-30 09:00:00', check_out: '2026-07-30 18:00:00', status: 'present', method: 'selfie' },
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

  '/attendance/current-status': {
    get: {
      tags: ['Attendance'],
      summary: 'Get current employee attendance & punch state for today',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
      ],
      responses: {
        200: {
          description: 'Today attendance state fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Current status fetched',
                data: { is_punched_in: true, check_in_time: '2026-07-30 09:00:00', is_on_break: false },
              },
            },
          },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedResponse' } } } },
        500: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalServerErrorResponse' } } } },
      },
    },
  },

  '/attendance/logs': {
    get: {
      tags: ['Attendance'],
      summary: 'Get raw attendance punch logs',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'employee_id', in: 'query', schema: { type: 'integer' } },
        { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } },
      ],
      responses: {
        200: {
          description: 'Attendance punch logs fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Logs fetched',
                data: [
                  { id: 501, employee_id: 10, type: 'check_in', timestamp: '2026-07-30 09:00:00', method: 'selfie' },
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

  '/attendance/list': {
    get: {
      tags: ['Attendance'],
      summary: 'Get formatted attendance records list',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
        { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'employee_id', in: 'query', schema: { type: 'integer' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
      ],
      responses: {
        200: {
          description: 'Attendance records list',
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

  '/attendance/dashboard-summary': {
    get: {
      tags: ['Attendance'],
      summary: 'Get company attendance dashboard statistics summary for today',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'company', in: 'header', required: true, schema: { type: 'integer' }, example: 1 },
      ],
      responses: {
        200: {
          description: 'Dashboard attendance summary fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: {
                success: true,
                message: 'Summary fetched',
                data: { total_employees: 50, present_today: 42, absent_today: 5, on_leave: 3, late_arrivals: 2 },
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

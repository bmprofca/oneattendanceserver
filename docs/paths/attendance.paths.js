export const schemas = {
  // ======================== COMMON ========================
  ErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Error description' },
      errors: { type: 'object', nullable: true, description: 'Optional error details' },
    },
  },

  // ======================== PUNCH / BREAK REQUEST BODIES ========================
  PunchInRequest: {
    type: 'object',
    required: ['attendance_method'],
    properties: {
      attendance_method: {
        type: 'string',
        enum: ['gps', 'ip', 'manual'],
        description: 'Attendance method',
        example: 'gps',
      },
      latitude: {
        type: 'number',
        format: 'float',
        description: 'Required when method is gps',
        example: 28.6139,
        nullable: true,
      },
      longitude: {
        type: 'number',
        format: 'float',
        description: 'Required when method is gps',
        example: 77.2090,
        nullable: true,
      },
      // IP is extracted from request automatically
    },
  },

  PunchOutRequest: {
    $ref: '#/components/schemas/PunchInRequest',
  },

  BreakInRequest: {
    $ref: '#/components/schemas/PunchInRequest',
  },

  BreakOutRequest: {
    $ref: '#/components/schemas/PunchInRequest',
  },

  // ======================== FACE ATTENDANCE ========================
  FaceAttendanceCheckRequest: {
    type: 'object',
    required: ['type', 'image'],
    properties: {
      type: {
        type: 'string',
        enum: ['punch in', 'punch out', 'break start', 'break end'],
        description: 'Attendance action type',
        example: 'punch in',
      },
      image: {
        type: 'string',
        format: 'url',
        description: 'URL of the captured face image',
        example: 'https://storage.example.com/faces/capture.jpg',
      },
    },
  },

  FaceAttendanceRequest: {
    allOf: [
      { $ref: '#/components/schemas/FaceAttendanceCheckRequest' },
      {
        type: 'object',
        required: ['employee_id'],
        properties: {
          employee_id: {
            type: 'integer',
            description: 'ID of the employee to mark attendance for',
            example: 42,
          },
        },
      },
    ],
  },

  FaceCheckResponseData: {
    type: 'object',
    properties: {
      employee_id: { type: 'integer', example: 42 },
      type: { type: 'string', example: 'punch in' },
      allowed: { type: 'boolean', description: 'Whether the action is allowed at this moment' },
      // Additional fields from face service may appear
    },
  },

  FaceAttendanceResponseData: {
    type: 'object',
    properties: {
      type: { type: 'string', example: 'punch in' },
      employee_id: { type: 'integer', example: 42 },
      attendance_id: { type: 'integer', example: 1001 },
      attendance_date: { type: 'string', format: 'date', example: '2025-03-15' },
      time: { type: 'string', example: '09:15:30' },
      day_status: { type: 'string', example: 'present', description: 'Only for punch out' },
    },
  },

  // ======================== APPROVE / MARK ========================
  AttendanceApproveRequest: {
    type: 'object',
    required: ['attendance_date', 'mode'],
    properties: {
      employee_ids: {
        oneOf: [
          { type: 'string', enum: ['all'] },
          { type: 'array', items: { type: 'integer' } },
        ],
        description: 'Array of employee IDs or "all"',
        example: [1, 2, 3],
      },
      attendance_date: {
        type: 'string',
        format: 'date',
        description: 'Date of attendance to approve',
        example: '2025-03-15',
      },
      mode: {
        type: 'string',
        enum: ['actual', 'present', 'leave', 'absent', 'half_day'],
        description: 'Mode of attendance approval',
        example: 'present',
      },
      half_day_type: {
        type: 'string',
        enum: ['first_half', 'second_half'],
        description: 'Required if mode is half_day',
        example: 'first_half',
      },
      leave_type: {
        type: 'string',
        enum: ['paid', 'unpaid'],
        description: 'Required if mode is leave',
        example: 'paid',
      },
      leave_type_value: {
        type: 'string',
        description: 'Leave type code (required for paid leave)',
        example: 'sick',
      },
      notes: {
        type: 'string',
        nullable: true,
        description: 'Optional remark',
        example: 'Approved by manager',
      },
    },
  },

  AttendanceApproveResponseData: {
    type: 'object',
    properties: {
      attendance_type: { type: 'string', example: 'attendance' },
      mode: { type: 'string', example: 'present' },
      attendance_date: { type: 'string', format: 'date', example: '2025-03-15' },
      total_employees: { type: 'integer', example: 10 },
      approved: { type: 'integer', example: 9 },
      absent: { type: 'integer', example: 1 },
      absent_employee_ids: { type: 'array', items: { type: 'integer' }, nullable: true },
      payroll_errors: { type: 'array', items: { type: 'object' }, nullable: true },
    },
  },

  AttendanceMarkRequest: {
    type: 'object',
    required: ['employee_id', 'date'],
    properties: {
      employee_id: { type: 'integer', example: 42 },
      date: { type: 'string', format: 'date', example: '2025-03-15' },
      type: {
        type: 'string',
        enum: ['attendance', 'break'],
        default: 'attendance',
        example: 'attendance',
      },
      status: {
        type: 'string',
        enum: ['present', 'half_day', 'absent', 'leave'],
        default: 'present',
        example: 'present',
      },
      start_time: {
        type: 'string',
        format: 'HH:mm:ss',
        description: 'Start time (required for present/half_day)',
        example: '09:00:00',
      },
      end_time: {
        type: 'string',
        format: 'HH:mm:ss',
        description: 'End time (required for present/half_day)',
        example: '18:00:00',
      },
      is_deductible: { type: 'boolean', default: false, example: false },
      is_overtime: { type: 'boolean', default: false, example: false },
      half_day_type: {
        type: 'string',
        enum: ['first_half', 'second_half'],
        description: 'Required when status is half_day',
        example: 'first_half',
      },
      leave_type: {
        type: 'string',
        enum: ['paid', 'unpaid'],
        description: 'Required when status is leave',
        example: 'paid',
      },
      leave_type_value: {
        type: 'string',
        description: 'Leave code for paid leave (e.g., sick, casual)',
        example: 'sick',
      },
      leave_day_overtime: {
        type: 'number',
        description: 'Overtime minutes for leave day',
        example: 120,
        nullable: true,
      },
      notes: { type: 'string', nullable: true },
      attendance_id: {
        type: 'integer',
        description: 'If provided, updates that record instead of creating new',
        example: 500,
      },
    },
  },

  // ======================== RESPONSE WRAPPERS ========================
  SuccessResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string' },
    },
  },

  DataResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessResponse' },
      { type: 'object', properties: { data: { type: 'object' } } },
    ],
  },

  PastPunchesItem: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      employee_id: { type: 'integer' },
      name: { type: 'string' },
      employee_code: { type: 'string' },
      designation: { type: 'object' },
      email: { type: 'string' },
      phone: { type: 'string' },
      punch_date: { type: 'string', format: 'date' },
      record_type: { type: 'string', enum: ['attendance', 'break'] },
      status: { type: 'string', enum: ['approved', 'pending'] },
      day_status: { type: 'string' },
      remark: { type: 'string' },
      is_overtime: { type: 'integer' },
      is_deductible: { type: 'integer' },
      shift: {
        type: 'object',
        properties: {
          start_time: { type: 'string' },
          end_time: { type: 'string' },
          expected_work_minutes: { type: 'integer' },
          allowed_break_minutes: { type: 'integer' },
          grace_minutes: { type: 'integer' },
        },
      },
      calculations: {
        type: 'object',
        properties: {
          worked_minutes: { type: 'integer' },
          break_minutes: { type: 'integer' },
          extra_break_minutes: { type: 'integer' },
          late_minutes: { type: 'integer' },
          early_leave_minutes: { type: 'integer' },
          overtime_minutes: { type: 'integer' },
        },
      },
      punch_in: { $ref: '#/components/schemas/PunchLog' },
      punch_out: { $ref: '#/components/schemas/PunchLog' },
      break_start: { $ref: '#/components/schemas/PunchLog' },
      break_end: { $ref: '#/components/schemas/PunchLog' },
    },
  },

  PunchLog: {
    type: 'object',
    nullable: true,
    properties: {
      time: { type: 'string' },
      method: { type: 'string' },
      latitude: { type: 'number', nullable: true },
      longitude: { type: 'number', nullable: true },
      ip_address: { type: 'string', nullable: true },
    },
  },

  PastPunchesResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessResponse' },
      {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/PastPunchesItem' } },
          meta: { $ref: '#/components/schemas/PaginationMeta' },
        },
      },
    ],
  },

  PaginationMeta: {
    type: 'object',
    properties: {
      page: { type: 'integer', example: 1 },
      limit: { type: 'integer', example: 10 },
      total: { type: 'integer', example: 50 },
      total_pages: { type: 'integer', example: 5 },
      is_last_page: { type: 'boolean', example: false },
      filters: { type: 'object' },
    },
  },

  CurrentStatusResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessResponse' },
      {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'WORKING' },
              allowed_methods: { type: 'array', items: { type: 'string' } },
              auto_approved: { type: 'boolean' },
              allowed_actions: { type: 'array', items: { type: 'string' } },
              day_info: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  day_name: { type: 'string' },
                  is_weekend: { type: 'boolean' },
                  is_holiday: { type: 'boolean' },
                  holiday_name: { type: 'string', nullable: true },
                },
              },
              shift: {
                type: 'object',
                nullable: true,
                properties: {
                  start_time: { type: 'string' },
                  end_time: { type: 'string' },
                  expected_work_minutes: { type: 'integer' },
                  allowed_break_minutes: { type: 'integer' },
                  grace_minutes: { type: 'integer' },
                },
              },
              today_summary: {
                type: 'object',
                nullable: true,
                properties: {
                  total_work_minutes: { type: 'integer' },
                  total_break_minutes: { type: 'integer' },
                },
              },
              today_activities: {
                type: 'array',
                items: { $ref: '#/components/schemas/ActivityLog' },
              },
            },
          },
        },
      },
    ],
  },

  ActivityLog: {
    type: 'object',
    properties: {
      type: { type: 'string', example: 'PUNCH_IN' },
      time: { type: 'string', example: '9:00 AM' },
      attendance_method: { type: 'string', nullable: true },
      ip_address: { type: 'string', nullable: true },
      location: {
        type: 'object',
        nullable: true,
        properties: {
          latitude: { type: 'number' },
          longitude: { type: 'number' },
        },
      },
    },
  },

  LogsResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessResponse' },
      {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            properties: {
              logs: { type: 'array', items: { $ref: '#/components/schemas/LogItem' } },
              meta: { $ref: '#/components/schemas/PaginationMeta' },
              filters: { type: 'object' },
            },
          },
        },
      },
    ],
  },

  LogItem: {
    type: 'object',
    properties: {
      log_id: { type: 'integer' },
      log_type: { type: 'string' },
      method: { type: 'string' },
      time: { type: 'string' },
      created_by: { type: 'object', nullable: true },
      ip_address: { type: 'string', nullable: true },
      latitude: { type: 'number', nullable: true },
      longitude: { type: 'number', nullable: true },
    },
  },

  AttendanceListItem: {
    type: 'object',
    properties: {
      attendance_id: { type: 'integer' },
      type: { type: 'string', enum: ['attendance', 'break'] },
      attendance_date: { type: 'string', format: 'date' },
      day_status: { type: 'string' },
      half_day_session: { type: 'string', nullable: true },
      leave_type: { type: 'string', nullable: true },
      leave_sub_type: { type: 'string', nullable: true },
      is_verified: { type: 'boolean' },
      is_deductible: { type: 'boolean' },
      is_overtime: { type: 'boolean' },
      remark: { type: 'string', nullable: true },
      punch_in: { $ref: '#/components/schemas/PunchLog' },
      punch_out: { $ref: '#/components/schemas/PunchLog' },
      break_start: { $ref: '#/components/schemas/PunchLog' },
      break_end: { $ref: '#/components/schemas/PunchLog' },
      employee_id: { type: 'integer' },
      employee_code: { type: 'string' },
      designation: { type: 'object' },
      name: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string' },
      profile_picture: { type: 'string', nullable: true },
      status: { type: 'string' },
      joining_date: { type: 'string', format: 'date' },
      shift: {
        type: 'object',
        properties: {
          start_time: { type: 'string' },
          end_time: { type: 'string' },
          expected_work_minutes: { type: 'integer' },
          allowed_break_minutes: { type: 'integer' },
          grace_minutes: { type: 'integer' },
        },
      },
      calculations: {
        type: 'object',
        nullable: true,
        properties: {
          worked_minutes: { type: 'integer' },
          total_break_time: { type: 'integer' },
          overtime_minutes: { type: 'integer', nullable: true },
          deductible_minutes: { type: 'integer', nullable: true },
        },
      },
    },
  },

  ListResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessResponse' },
      {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/AttendanceListItem' } },
          meta: { $ref: '#/components/schemas/ListMeta' },
        },
      },
    ],
  },

  ListMeta: {
    allOf: [
      { $ref: '#/components/schemas/PaginationMeta' },
      {
        type: 'object',
        properties: {
          counts: {
            type: 'object',
            properties: {
              total_employees: { type: 'integer' },
              present: { type: 'integer' },
              absent: { type: 'integer' },
              leave: { type: 'integer' },
              half_day: { type: 'integer' },
              unmarked: { type: 'integer' },
              attendance_entries: { type: 'integer' },
              break_entries: { type: 'integer' },
              average_break_minutes_per_employee: { type: 'number', nullable: true },
            },
          },
        },
      },
    ],
  },

  DashboardSummaryResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessResponse' },
      {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            properties: {
              generated_at: { type: 'string', format: 'date-time' },
              today: { type: 'string', format: 'date' },
              current_month: {
                type: 'object',
                properties: {
                  start_date: { type: 'string' },
                  end_date: { type: 'string' },
                },
              },
              employees: {
                type: 'object',
                properties: {
                  total: { type: 'integer' },
                  active: { type: 'integer' },
                  inactive: { type: 'integer' },
                  face_enrolled: { type: 'integer' },
                  fingerprint_mapped: { type: 'integer' },
                },
              },
              attendance_today: {
                type: 'object',
                properties: {
                  present: { type: 'integer' },
                  absent: { type: 'integer' },
                  half_day: { type: 'integer' },
                  paid_leave: { type: 'integer' },
                  unmarked: { type: 'integer' },
                  verified: { type: 'integer' },
                  unverified: { type: 'integer' },
                  overtime_employees: { type: 'integer' },
                  attendance_entries: { type: 'integer' },
                  break_entries: { type: 'integer' },
                  attendance_percentage: { type: 'number' },
                },
              },
              shifts_today: {
                type: 'object',
                properties: {
                  total_shifts: { type: 'integer' },
                  total_worked_minutes: { type: 'integer' },
                  total_break_minutes: { type: 'integer' },
                  total_extra_break_minutes: { type: 'integer' },
                  total_overtime_minutes: { type: 'integer' },
                  total_late_minutes: { type: 'integer' },
                  total_early_leave_minutes: { type: 'integer' },
                  average_worked_minutes: { type: 'number' },
                },
              },
              leaves_this_month: {
                type: 'object',
                description: 'Leave stats grouped by status',
              },
              holidays: {
                type: 'object',
                properties: {
                  total: { type: 'integer' },
                  optional: { type: 'integer' },
                  mandatory: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    ],
  },
};

export const paths = {
  '/attendance/punch-in': {
    post: {
      tags: ['Attendance'],
      summary: 'Employee punch-in',
      description: 'Marks the start of the work day for the authenticated employee. Validates company, employee, holiday/leave, attendance method and location/IP.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PunchInRequest' },
          },
        },
      },
      responses: {
        201: {
          description: 'Punch-in successful',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: { success: true, message: 'Punch-in successful' },
            },
          },
        },
        400: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        401: { description: 'Unauthorized' },
        500: { description: 'Server error' },
      },
    },
  },

  '/attendance/punch-out': {
    post: {
      tags: ['Attendance'],
      summary: 'Employee punch-out',
      description: 'Ends the work day for the authenticated employee. Requires an active punch-in and no open break. Handles leave adjustments if applicable.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PunchOutRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Punch-out successful',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: { success: true, message: 'Punch-out successful' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        401: { description: 'Unauthorized' },
      },
    },
  },

  '/attendance/break-in': {
    post: {
      tags: ['Attendance'],
      summary: 'Start a break',
      description: 'Starts a break session for the authenticated employee. Requires an active punch-in and no existing open break.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/BreakInRequest' },
          },
        },
      },
      responses: {
        201: {
          description: 'Break started',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: { success: true, message: 'Break started successfully' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        401: { description: 'Unauthorized' },
      },
    },
  },

  '/attendance/break-out': {
    post: {
      tags: ['Attendance'],
      summary: 'End a break',
      description: 'Ends the active break for the authenticated employee.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/BreakOutRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Break ended',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: { success: true, message: 'Break ended successfully' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        401: { description: 'Unauthorized' },
      },
    },
  },

  '/attendance/face-attendance-check': {
    post: {
      tags: ['Face Attendance'],
      summary: 'Verify face and check eligibility',
      description: 'Verifies the face against the company\'s employee database and returns whether the requested attendance action (punch in/out, break start/end) is allowed at this moment. Does not record attendance.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/FaceAttendanceCheckRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Face matched and allowed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DataResponse' },
              example: {
                success: true,
                message: 'Face matched',
                data: {
                  employee_id: 42,
                  type: 'punch in',
                  allowed: true,
                },
              },
            },
          },
        },
        400: {
          description: 'Face not matched / action not allowed / validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'Punch-in is not allowed. Employee has already punched in today.' },
            },
          },
        },
        401: { description: 'Unauthorized' },
        404: { description: 'Employee not found' },
      },
    },
  },

  '/attendance/face-attendance': {
    post: {
      tags: ['Face Attendance'],
      summary: 'Record face attendance',
      description: 'Performs face verification and records the attendance action (punch in/out, break start/end) for the specified employee. Requires manager authentication.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/FaceAttendanceRequest' },
          },
        },
      },
      responses: {
        201: {
          description: 'Attendance recorded (punch-in / break start)',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DataResponse' },
              example: {
                success: true,
                message: 'Punch-in successful',
                data: {
                  type: 'punch in',
                  employee_id: 42,
                  attendance_id: 1005,
                  attendance_date: '2025-03-15',
                  time: '09:05:12',
                },
              },
            },
          },
        },
        200: {
          description: 'Attendance recorded (punch-out / break end)',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DataResponse' },
              example: {
                success: true,
                message: 'Punch-out successful',
                data: {
                  type: 'punch out',
                  employee_id: 42,
                  attendance_id: 1005,
                  attendance_date: '2025-03-15',
                  time: '18:02:45',
                  day_status: 'present',
                },
              },
            },
          },
        },
        400: { description: 'Validation error / action not allowed / face mismatch', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        401: { description: 'Unauthorized' },
        404: { description: 'Employee not found' },
      },
    },
  },

  '/attendance/approve': {
    put: {
      tags: ['Attendance'],
      summary: 'Approve attendance (bulk)',
      description: 'Approves attendance for a list of employees or all employees for a given date. Can set attendance mode (actual, present, leave, absent, half_day).',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AttendanceApproveRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Approval successful',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DataResponse' },
              example: {
                success: true,
                message: 'Attendance approved successfully',
                data: {
                  attendance_type: 'attendance',
                  mode: 'present',
                  attendance_date: '2025-03-15',
                  total_employees: 10,
                  approved: 9,
                  absent: 1,
                  absent_employee_ids: [7],
                  payroll_errors: [],
                },
              },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        401: { description: 'Unauthorized' },
        404: { description: 'No employees found' },
      },
    },
  },

  '/attendance/mark': {
    post: {
      tags: ['Attendance'],
      summary: 'Mark or update attendance/break manually',
      description: 'Creates or updates an attendance or break record for a specific employee. Supports all statuses including leave, half_day, absent, and break adjustments.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AttendanceMarkRequest' },
          },
        },
      },
      responses: {
        201: {
          description: 'Record created',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: { success: true, message: 'attendance created successfully' },
            },
          },
        },
        200: {
          description: 'Record updated',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
              example: { success: true, message: 'attendance updated successfully' },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        401: { description: 'Unauthorized' },
        404: { description: 'Employee not found' },
      },
    },
  },

  '/attendance/my/past-punches': {
    get: {
      tags: ['Attendance'],
      summary: 'Get past punches for employee',
      description: 'Fetches past attendance or break records for the authenticated employee (manager or self). Returns only records before today.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'type',
          in: 'query',
          required: true,
          schema: { type: 'string', enum: ['attendance', 'break'] },
          description: 'Type of records to fetch',
          example: 'attendance',
        },
        {
          name: 'date',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'Single date filter (cannot be used with from_date/to_date)',
        },
        {
          name: 'from_date',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'Start date for range',
        },
        {
          name: 'to_date',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'End date for range',
        },
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', default: 1 },
          example: 1,
        },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', default: 10 },
          example: 10,
        },
      ],
      responses: {
        200: {
          description: 'Past punches fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PastPunchesResponse' },
            },
          },
        },
        400: { description: 'Invalid parameters', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        401: { description: 'Unauthorized' },
        404: { description: 'Employee not found' },
      },
    },
  },

  '/attendance/current-status': {
    get: {
      tags: ['Attendance'],
      summary: 'Get current day attendance status',
      description: 'Returns the current attendance state for the authenticated user, including allowed actions, today\'s activities, work/break time, shift info, and leave/weekend/holiday detection.',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Current status',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CurrentStatusResponse' },
            },
          },
        },
        401: { description: 'Unauthorized' },
        404: { description: 'User/Employee not found' },
      },
    },
  },

  '/attendance/logs': {
    get: {
      tags: ['Attendance'],
      summary: 'Get attendance activity logs',
      description: 'Fetches all logs (punch in/out, break start/end, day status changes) for a specific attendance record.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'id',
          in: 'query',
          required: true,
          schema: { type: 'integer' },
          description: 'Attendance ID',
          example: 1005,
        },
        {
          name: 'log_type',
          in: 'query',
          schema: { type: 'string', enum: ['start', 'end', 'day_status'] },
          description: 'Filter by log type',
        },
        {
          name: 'search',
          in: 'query',
          schema: { type: 'string' },
          description: 'Search by method or user name/email',
        },
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', default: 1 },
        },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', default: 10 },
        },
      ],
      responses: {
        200: {
          description: 'Logs fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LogsResponse' },
            },
          },
        },
        400: { description: 'Invalid parameters', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        401: { description: 'Unauthorized' },
        404: { description: 'Attendance not found' },
      },
    },
  },

  '/attendance/list': {
    get: {
      tags: ['Attendance'],
      summary: 'List attendance/break records',
      description: 'Paginated list of attendance or break records for a given date range. Supports filtering by employee, day status, type, and search.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'from_date',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'Start date (defaults to today if not provided)',
          example: '2025-03-01',
        },
        {
          name: 'to_date',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'End date (defaults to today if not provided)',
          example: '2025-03-15',
        },
        {
          name: 'employee_id',
          in: 'query',
          schema: { type: 'integer' },
          description: 'Filter by specific employee',
        },
        {
          name: 'day_status',
          in: 'query',
          schema: { type: 'string', enum: ['present', 'absent', 'leave', 'half_day', 'unmarked'] },
          description: 'Filter by day status',
        },
        {
          name: 'type',
          in: 'query',
          schema: { type: 'string', enum: ['attendance', 'break'] },
          description: 'Type of records to fetch (default: attendance)',
          example: 'attendance',
        },
        {
          name: 'search',
          in: 'query',
          schema: { type: 'string' },
          description: 'Search by employee name, email, phone, code, designation',
        },
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', default: 1 },
        },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', default: 20 },
        },
      ],
      responses: {
        200: {
          description: 'Records fetched',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ListResponse' },
            },
          },
        },
        400: { description: 'Invalid parameters', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        401: { description: 'Unauthorized' },
      },
    },
  },

  '/attendance/dashboard-summary': {
    get: {
      tags: ['Attendance'],
      summary: 'Dashboard summary',
      description: 'Returns aggregated attendance, employee, shift, leave, and holiday statistics for the company dashboard.',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Summary data',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DashboardSummaryResponse' },
            },
          },
        },
        401: { description: 'Unauthorized' },
      },
    },
  },
};
export const schemas = {
  // ============================
  // COMMON / REUSABLE SCHEMAS
  // ============================
  ErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Error description' },
      errors: { type: 'object', nullable: true }
    }
  },

  SuccessMessage: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string' }
    }
  },

  PaginationMeta: {
    type: 'object',
    properties: {
      page: { type: 'integer', example: 1 },
      limit: { type: 'integer', example: 10 },
      total: { type: 'integer', example: 50 },
      total_pages: { type: 'integer', example: 5 },
      is_last_page: { type: 'boolean', example: false },
      filters: { type: 'object' }
    }
  },

  PunchLog: {
    type: 'object',
    nullable: true,
    properties: {
      time: { type: 'string', example: '09:15:30' },
      method: { type: 'string', example: 'gps' },
      latitude: { type: 'number', nullable: true },
      longitude: { type: 'number', nullable: true },
      ip_address: { type: 'string', nullable: true }
    }
  },

  ShiftInfo: {
    type: 'object',
    properties: {
      start_time: { type: 'string', nullable: true, example: '09:00:00' },
      end_time: { type: 'string', nullable: true, example: '18:00:00' },
      expected_work_minutes: { type: 'integer', example: 480 },
      allowed_break_minutes: { type: 'integer', example: 30 },
      grace_minutes: { type: 'integer', example: 15 }
    }
  },

  // ============================
  // REQUEST BODIES
  // ============================
  PunchRequest: {
    type: 'object',
    required: ['attendance_method'],
    properties: {
      attendance_method: {
        type: 'string',
        enum: ['gps', 'ip', 'manual'],
        description: 'Attendance method',
        example: 'gps'
      },
      latitude: {
        type: 'number',
        format: 'float',
        description: 'Required when method is gps',
        example: 28.6139,
        nullable: true
      },
      longitude: {
        type: 'number',
        format: 'float',
        description: 'Required when method is gps',
        example: 77.2090,
        nullable: true
      }
    }
  },

  FaceCheckRequest: {
    type: 'object',
    required: ['type', 'image'],
    properties: {
      type: {
        type: 'string',
        enum: ['punch in', 'punch out', 'break start', 'break end'],
        description: 'Attendance action to validate',
        example: 'punch in'
      },
      image: {
        type: 'string',
        format: 'url',
        description: 'URL of the captured face image',
        example: 'https://storage.example.com/faces/capture.jpg'
      }
    }
  },

  FaceAttendanceRequest: {
    allOf: [
      { $ref: '#/components/schemas/FaceCheckRequest' },
      {
        required: ['employee_id'],
        properties: {
          employee_id: {
            type: 'integer',
            description: 'ID of the employee to mark attendance for',
            example: 42
          }
        }
      }
    ]
  },

  ApproveAttendanceRequest: {
    type: 'object',
    required: ['attendance_date', 'mode'],
    properties: {
      employee_ids: {
        oneOf: [
          { type: 'string', enum: ['all'] },
          { type: 'array', items: { type: 'integer' } }
        ],
        description: 'Array of employee IDs or "all"',
        example: [1, 2, 3]
      },
      attendance_date: {
        type: 'string',
        format: 'date',
        description: 'Date of attendance to approve',
        example: '2025-03-15'
      },
      mode: {
        type: 'string',
        enum: ['actual', 'present', 'leave', 'absent', 'half_day'],
        description: 'Approval mode'
      },
      half_day_type: {
        type: 'string',
        enum: ['first_half', 'second_half'],
        description: 'Required when mode = half_day'
      },
      leave_type: {
        type: 'string',
        enum: ['paid', 'unpaid'],
        description: 'Required when mode = leave'
      },
      leave_type_value: {
        type: 'string',
        description: 'Required for paid leave (leave config code)',
        example: 'sick'
      },
      notes: {
        type: 'string',
        nullable: true,
        description: 'Optional remark'
      }
    }
  },

  MarkAttendanceRequest: {
    type: 'object',
    required: ['employee_id', 'date'],
    properties: {
      employee_id: { type: 'integer', example: 42 },
      date: { type: 'string', format: 'date', example: '2025-03-15' },
      type: {
        type: 'string',
        enum: ['attendance', 'break'],
        default: 'attendance'
      },
      status: {
        type: 'string',
        enum: ['present', 'half_day', 'absent', 'leave'],
        default: 'present',
        description: 'Required for attendance type'
      },
      start_time: {
        type: 'string',
        format: 'HH:mm:ss',
        description: 'Required for present/half_day/break'
      },
      end_time: {
        type: 'string',
        format: 'HH:mm:ss',
        description: 'Required for present/half_day/break'
      },
      is_deductible: { type: 'boolean', default: false },
      is_overtime: { type: 'boolean', default: false },
      half_day_type: {
        type: 'string',
        enum: ['first_half', 'second_half'],
        description: 'Required when status = half_day'
      },
      leave_type: {
        type: 'string',
        enum: ['paid', 'unpaid'],
        description: 'Required when status = leave'
      },
      leave_type_value: {
        type: 'string',
        description: 'Leave code for paid leave',
        example: 'sick'
      },
      leave_day_overtime: {
        type: 'number',
        description: 'Overtime minutes for a leave day',
        example: 120,
        nullable: true
      },
      notes: { type: 'string', nullable: true },
      attendance_id: {
        type: 'integer',
        description: 'If provided, updates that record instead of creating new'
      }
    }
  },

  // ============================
  // RESPONSE DATA SCHEMAS
  // ============================

  // --- punch/break response: just a message, no data ---
  PunchInOutResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'Punch-in successful' }
    }
  },

  // --- face-check response ---
  FaceCheckData: {
    type: 'object',
    properties: {
      employee_id: { type: 'integer', example: 42 },
      type: { type: 'string', example: 'punch in' },
      allowed: { type: 'boolean', example: true }
      // additional fields from face service may be present
    }
  },

  // --- face-attendance response ---
  FaceAttendanceData: {
    type: 'object',
    properties: {
      type: { type: 'string', example: 'punch in' },
      employee_id: { type: 'integer', example: 42 },
      attendance_id: { type: 'integer', example: 1005 },
      attendance_date: { type: 'string', format: 'date', example: '2025-03-15' },
      time: { type: 'string', example: '09:05:12' },
      day_status: {
        type: 'string',
        description: 'Only present when type = punch out',
        example: 'present'
      }
    }
  },

  // --- approve response ---
  ApproveData: {
    type: 'object',
    properties: {
      attendance_type: { type: 'string', example: 'attendance' },
      mode: { type: 'string', example: 'present' },
      attendance_date: { type: 'string', format: 'date', example: '2025-03-15' },
      total_employees: { type: 'integer', example: 10 },
      approved: { type: 'integer', example: 9 },
      absent: { type: 'integer', example: 1 },
      absent_employee_ids: {
        type: 'array',
        items: { type: 'integer' },
        nullable: true
      },
      payroll_errors: {
        type: 'array',
        items: { type: 'object' },
        nullable: true
      }
    }
  },

  // --- mark response: just a message (different http codes) ---
  MarkResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'attendance created successfully' }
    }
  },

  // --- past-punches item ---
  PastPunchItem: {
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
      is_overtime: { type: 'boolean' },
      is_deductible: { type: 'boolean' },
      shift: { $ref: '#/components/schemas/ShiftInfo' },
      calculations: {
        type: 'object',
        properties: {
          worked_minutes: { type: 'integer' },
          break_minutes: { type: 'integer' },
          extra_break_minutes: { type: 'integer' },
          late_minutes: { type: 'integer' },
          early_leave_minutes: { type: 'integer' },
          overtime_minutes: { type: 'integer' }
        }
      },
      // Only one pair will be present based on record_type
      punch_in: { $ref: '#/components/schemas/PunchLog' },
      punch_out: { $ref: '#/components/schemas/PunchLog' },
      break_start: { $ref: '#/components/schemas/PunchLog' },
      break_end: { $ref: '#/components/schemas/PunchLog' }
    }
  },

  // --- current-status response data (multiple variations) ---
  // Base common fields
  CurrentStatusBase: {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'WORKING' },
      allowed_methods: { type: 'array', items: { type: 'string' } },
      auto_approved: { type: 'boolean' },
      allowed_actions: { type: 'array', items: { type: 'string' } },
      day_info: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date' },
          day_name: { type: 'string' },
          is_weekend: { type: 'boolean' },
          is_holiday: { type: 'boolean' },
          holiday_name: { type: 'string', nullable: true }
        }
      }
    }
  },
  // Extended for active/working states
  CurrentStatusActive: {
    allOf: [
      { $ref: '#/components/schemas/CurrentStatusBase' },
      {
        type: 'object',
        properties: {
          shift: { $ref: '#/components/schemas/ShiftInfo' },
          today_summary: {
            type: 'object',
            properties: {
              total_work_minutes: { type: 'integer' },
              total_break_minutes: { type: 'integer' }
            }
          },
          today_activities: {
            type: 'array',
            items: {
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
                    longitude: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      }
    ]
  },

  // --- attendance logs response ---
  LogItem: {
    type: 'object',
    properties: {
      log_id: { type: 'integer' },
      log_type: { type: 'string', example: 'punch_in' },
      method: { type: 'string' },
      time: { type: 'string' },
      created_by: {
        type: 'object',
        nullable: true,
        properties: {
          name: { type: 'string' },
          role: { type: 'string' }
        }
      },
      ip_address: { type: 'string', nullable: true },
      latitude: { type: 'number', nullable: true },
      longitude: { type: 'number', nullable: true }
    }
  },

  // --- list response (attendance type) ---
  EmployeeAttendanceGroup: {
    type: 'object',
    properties: {
      employee_id: { type: 'integer' },
      employee_code: { type: 'string' },
      designation: { type: 'object' },
      employment_type: { type: 'object' },
      salary_type: { type: 'object' },
      name: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string' },
      profile_picture: { type: 'string', nullable: true },
      status: { type: 'string' },
      joining_date: { type: 'string', format: 'date', nullable: true },
      shift: { $ref: '#/components/schemas/ShiftInfo' },
      attendances: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            attendance_id: { type: 'integer' },
            type: { type: 'string', enum: ['attendance'] },
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
            punch_out: { $ref: '#/components/schemas/PunchLog' }
          }
        }
      },
      breaks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            attendance_id: { type: 'integer' },
            type: { type: 'string', enum: ['break'] },
            attendance_date: { type: 'string', format: 'date' },
            day_status: { type: 'string' },
            is_verified: { type: 'boolean' },
            is_deductible: { type: 'boolean', nullable: true },
            is_overtime: { type: 'boolean', nullable: true },
            remark: { type: 'string', nullable: true },
            break_start: { $ref: '#/components/schemas/PunchLog' },
            break_end: { $ref: '#/components/schemas/PunchLog' }
          }
        }
      },
      calculations: {
        type: 'object',
        properties: {
          worked_minutes: { type: 'integer' },
          total_break_time: { type: 'integer' }
        }
      }
    }
  },

  // --- list response (break type) ---
  BreakFlatItem: {
    type: 'object',
    properties: {
      attendance_id: { type: 'integer' },
      type: { type: 'string', enum: ['break'] },
      attendance_date: { type: 'string', format: 'date' },
      day_status: { type: 'string' },
      is_verified: { type: 'boolean' },
      remark: { type: 'string', nullable: true },
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
      joining_date: { type: 'string', format: 'date', nullable: true },
      allowed_break_minutes: { type: 'integer' }
    }
  },

  // --- list meta (includes counts) ---
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
              average_break_minutes_per_employee: {
                type: 'number',
                nullable: true,
                description: 'Present only when type=break'
              }
            }
          }
        }
      }
    ]
  },

  // --- dashboard summary ---
  DashboardSummaryData: {
    type: 'object',
    properties: {
      generated_at: { type: 'string', format: 'date-time' },
      today: { type: 'string', format: 'date' },
      current_month: {
        type: 'object',
        properties: {
          start_date: { type: 'string', format: 'date' },
          end_date: { type: 'string', format: 'date' }
        }
      },
      employees: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          active: { type: 'integer' },
          inactive: { type: 'integer' },
          face_enrolled: { type: 'integer' },
          fingerprint_mapped: { type: 'integer' }
        }
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
          attendance_percentage: { type: 'number' }
        }
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
          average_worked_minutes: { type: 'number' }
        }
      },
      leaves_this_month: {
        type: 'object',
        description: 'Leave stats grouped by status (pending, approved, rejected, cancelled)',
        properties: {
          pending: { type: 'object' },
          approved: { type: 'object' },
          rejected: { type: 'object' },
          cancelled: { type: 'object' }
        }
      },
      holidays: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          optional: { type: 'integer' },
          mandatory: { type: 'integer' }
        }
      }
    }
  }
};

export const paths = {
  '/attendance/punch-in': {
    post: {
      tags: ['Attendance'],
      summary: 'Employee punch-in',
      description:
        'Marks the start of the work day. Validates company, employee status, holiday/leave, weekends, and the chosen attendance method (GPS, IP, manual).',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PunchRequest' }
          }
        }
      },
      responses: {
        201: {
          description: 'Punch-in recorded',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PunchInOutResponse' },
              example: { success: true, message: 'Punch-in successful' }
            }
          }
        },
        400: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'Already punched in today' }
            }
          }
        },
        401: { description: 'Unauthorized' },
        500: { description: 'Server error' }
      }
    }
  },

  '/attendance/punch-out': {
    post: {
      tags: ['Attendance'],
      summary: 'Employee punch-out',
      description:
        'Ends the work day. Requires an active punch-in and no open break. Automatically handles leave adjustments if a leave existed for the day.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PunchRequest' }
          }
        }
      },
      responses: {
        200: {
          description: 'Punch-out successful',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PunchInOutResponse' },
              example: { success: true, message: 'Punch-out successful' }
            }
          }
        },
        400: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'No attendance found' }
            }
          }
        },
        401: { description: 'Unauthorized' }
      }
    }
  },

  '/attendance/break-in': {
    post: {
      tags: ['Attendance'],
      summary: 'Start a break',
      description:
        'Starts a break session. Requires an active punch-in and no existing open break.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PunchRequest' }
          }
        }
      },
      responses: {
        201: {
          description: 'Break started',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PunchInOutResponse' },
              example: { success: true, message: 'Break started successfully' }
            }
          }
        },
        400: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'Punch-in required before break' }
            }
          }
        },
        401: { description: 'Unauthorized' }
      }
    }
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
            schema: { $ref: '#/components/schemas/PunchRequest' }
          }
        }
      },
      responses: {
        200: {
          description: 'Break ended',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PunchInOutResponse' },
              example: { success: true, message: 'Break ended successfully' }
            }
          }
        },
        400: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'No active break found' }
            }
          }
        },
        401: { description: 'Unauthorized' }
      }
    }
  },

  '/attendance/face-attendance-check': {
    post: {
      tags: ['Attendance'],
      summary: 'Face verification & eligibility check',
      description:
        'Verifies the face against the company\'s employee database and returns whether the requested attendance action is currently allowed. Does NOT record attendance.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/FaceCheckRequest' }
          }
        }
      },
      responses: {
        200: {
          description: 'Face matched and action allowed',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Face matched' },
                  data: { $ref: '#/components/schemas/FaceCheckData' }
                }
              },
              example: {
                success: true,
                message: 'Face matched',
                data: {
                  employee_id: 42,
                  type: 'punch in',
                  allowed: true
                }
              }
            }
          }
        },
        400: {
          description: 'Action not allowed / face mismatch / validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              examples: {
                notAllowed: {
                  value: {
                    success: false,
                    message: 'Punch-in is not allowed. Employee has already punched in today.',
                    errors: { employee_id: 42, type: 'punch in', allowed: false }
                  }
                },
                faceMismatch: {
                  value: {
                    success: false,
                    message: 'Face does not match'
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        404: {
          description: 'Employee not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        }
      }
    }
  },

  '/attendance/face-attendance': {
    post: {
      tags: ['Attendance'],
      summary: 'Record attendance via face',
      description:
        'Verifies face and then records the requested attendance action (punch in/out, break start/end) for the given employee. Manager access required.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/FaceAttendanceRequest' }
          }
        }
      },
      responses: {
        201: {
          description: 'Punch-in or break start recorded',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { $ref: '#/components/schemas/FaceAttendanceData' }
                }
              },
              example: {
                success: true,
                message: 'Punch-in successful',
                data: {
                  type: 'punch in',
                  employee_id: 42,
                  attendance_id: 1005,
                  attendance_date: '2025-03-15',
                  time: '09:05:12'
                }
              }
            }
          }
        },
        200: {
          description: 'Punch-out or break end recorded',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { $ref: '#/components/schemas/FaceAttendanceData' }
                }
              },
              example: {
                success: true,
                message: 'Punch-out successful',
                data: {
                  type: 'punch out',
                  employee_id: 42,
                  attendance_id: 1005,
                  attendance_date: '2025-03-15',
                  time: '18:02:45',
                  day_status: 'present'
                }
              }
            }
          }
        },
        400: {
          description: 'Validation / face mismatch / action not allowed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        },
        401: { description: 'Unauthorized' },
        404: {
          description: 'Employee not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        }
      }
    }
  },

  '/attendance/approve': {
    put: {
      tags: ['Attendance'],
      summary: 'Bulk attendance approval',
      description:
        'Approves attendance for a list of employees (or all) on a given date. Supports multiple modes: actual, present, leave, absent, half_day. Handles leave cancellations and payroll recalculation.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApproveAttendanceRequest' }
          }
        }
      },
      responses: {
        200: {
          description: 'Approval completed',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Attendance approved successfully' },
                  data: { $ref: '#/components/schemas/ApproveData' }
                }
              },
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
                  payroll_errors: []
                }
              }
            }
          }
        },
        400: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'Required employee shift_start or shift_end is missing' }
            }
          }
        },
        401: { description: 'Unauthorized' },
        404: {
          description: 'No employees found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        }
      }
    }
  },

  '/attendance/mark': {
    post: {
      tags: ['Attendance'],
      summary: 'Manual mark / update attendance or break',
      description:
        'Creates a new attendance/break record or updates an existing one (by attendance_id). Supports all statuses and break adjustments. Overlapping breaks are prevented.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/MarkAttendanceRequest' }
          }
        }
      },
      responses: {
        201: {
          description: 'Record created',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MarkResponse' },
              example: { success: true, message: 'attendance created successfully' }
            }
          }
        },
        200: {
          description: 'Record updated',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MarkResponse' },
              example: { success: true, message: 'attendance updated successfully' }
            }
          }
        },
        400: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'Future attendance not allowed' }
            }
          }
        },
        401: { description: 'Unauthorized' },
        404: {
          description: 'Employee not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        }
      }
    }
  },

  '/attendance/my/past-punches': {
    get: {
      tags: ['Attendance'],
      summary: 'Past attendance/break punches',
      description:
        'Returns past attendance or break records (before today) for the authenticated user. Includes shift info and calculated minutes.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'type',
          in: 'query',
          required: true,
          schema: { type: 'string', enum: ['attendance', 'break'] },
          description: 'Record type',
          example: 'attendance'
        },
        {
          name: 'date',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'Single date (cannot be used with from_date/to_date)'
        },
        {
          name: 'from_date',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'Start of date range'
        },
        {
          name: 'to_date',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'End of date range'
        },
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', default: 1 }
        },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', default: 10 }
        }
      ],
      responses: {
        200: {
          description: 'Past punches fetched',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Past attendance punches fetched successfully' },
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/PastPunchItem' }
                  },
                  meta: { $ref: '#/components/schemas/PaginationMeta' }
                }
              }
            }
          }
        },
        400: {
          description: 'Invalid parameters',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        },
        401: { description: 'Unauthorized' },
        404: {
          description: 'Employee not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        }
      }
    }
  },

  '/attendance/current-status': {
    get: {
      tags: ['Attendance'],
      summary: 'Current day attendance status',
      description:
        'Returns the real-time attendance state for the authenticated user, including allowed actions, today\'s punch timeline, and shift details when applicable. The response structure varies based on the current situation (weekend, holiday, leave, working, etc.).',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Current status',
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  {
                    // Weekend / Holiday / Full-day Leave (no shift data)
                    allOf: [
                      { $ref: '#/components/schemas/CurrentStatusBase' },
                      {
                        example: {
                          success: true,
                          message: 'Current attendance status fetched successfully',
                          data: {
                            status: 'WEEKEND',
                            allowed_methods: ['gps', 'ip'],
                            auto_approved: false,
                            allowed_actions: [],
                            day_info: {
                              date: '2025-03-15',
                              day_name: 'Saturday',
                              is_weekend: true,
                              is_holiday: false
                            }
                          }
                        }
                      }
                    ]
                  },
                  {
                    // Not punched in (no active shift) - weekday, no leave/holiday
                    allOf: [
                      { $ref: '#/components/schemas/CurrentStatusBase' },
                      {
                        example: {
                          success: true,
                          message: 'Current attendance status fetched successfully',
                          data: {
                            status: 'NOT_PUNCHED_IN',
                            allowed_methods: ['gps', 'ip'],
                            auto_approved: true,
                            allowed_actions: ['PUNCH_IN'],
                            day_info: {
                              date: '2025-03-17',
                              day_name: 'Monday',
                              is_weekend: false,
                              is_holiday: false
                            }
                          }
                        }
                      }
                    ]
                  },
                  {
                    // Working / On Break / Completed / Half-day with shift info
                    allOf: [
                      { $ref: '#/components/schemas/CurrentStatusActive' },
                      {
                        example: {
                          success: true,
                          message: 'Current attendance status fetched successfully',
                          data: {
                            status: 'WORKING',
                            allowed_methods: ['gps'],
                            auto_approved: false,
                            allowed_actions: ['PUNCH_OUT', 'BREAK_START'],
                            day_info: {
                              date: '2025-03-17',
                              day_name: 'Monday',
                              is_weekend: false,
                              is_holiday: false
                            },
                            shift: {
                              start_time: '09:00:00',
                              end_time: '18:00:00',
                              expected_work_minutes: 480,
                              allowed_break_minutes: 30,
                              grace_minutes: 15
                            },
                            today_summary: {
                              total_work_minutes: 180,
                              total_break_minutes: 0
                            },
                            today_activities: [
                              {
                                type: 'PUNCH_IN',
                                time: '9:00 AM',
                                attendance_method: 'gps',
                                location: { latitude: 28.6139, longitude: 77.209 }
                              }
                            ]
                          }
                        }
                      }
                    ]
                  }
                ]
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        404: {
          description: 'User/Employee not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        }
      }
    }
  },

  '/attendance/logs': {
    get: {
      tags: ['Attendance'],
      summary: 'Attendance activity logs',
      description:
        'Fetches all activity logs (punch in/out, break start/end, day status changes) for a specific attendance record. Includes creator details.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'id',
          in: 'query',
          required: true,
          schema: { type: 'integer' },
          description: 'Attendance ID',
          example: 1005
        },
        {
          name: 'log_type',
          in: 'query',
          schema: { type: 'string', enum: ['start', 'end', 'day_status'] },
          description: 'Filter by log type'
        },
        {
          name: 'search',
          in: 'query',
          schema: { type: 'string' },
          description: 'Search by method or user name/email'
        },
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', default: 1 }
        },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', default: 10 }
        }
      ],
      responses: {
        200: {
          description: 'Logs fetched',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Attendance activity logs fetched successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      logs: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/LogItem' }
                      }
                    }
                  },
                  meta: { $ref: '#/components/schemas/PaginationMeta' }
                }
              }
            }
          }
        },
        400: {
          description: 'Invalid parameters',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        },
        401: { description: 'Unauthorized' },
        404: {
          description: 'Attendance not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        }
      }
    }
  },

  '/attendance/list': {
    get: {
      tags: ['Attendance'],
      summary: 'List attendance / break records',
      description:
        'Paginated list of employee attendance or break records over a date range. Supports filtering by employee, day status, and search. Response format differs for `type=attendance` (employee groups with nested attendances/breaks) and `type=break` (flat break list with employee info).',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'from_date',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'Start date (defaults to today)',
          example: '2025-03-01'
        },
        {
          name: 'to_date',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'End date (defaults to today)',
          example: '2025-03-15'
        },
        {
          name: 'employee_id',
          in: 'query',
          schema: { type: 'integer' },
          description: 'Filter by specific employee'
        },
        {
          name: 'day_status',
          in: 'query',
          schema: { type: 'string', enum: ['present', 'absent', 'leave', 'half_day', 'unmarked'] },
          description: 'Filter by day status'
        },
        {
          name: 'type',
          in: 'query',
          schema: { type: 'string', enum: ['attendance', 'break'], default: 'attendance' },
          description: 'Response format selector'
        },
        {
          name: 'search',
          in: 'query',
          schema: { type: 'string' },
          description: 'Search by employee name, email, phone, code, designation'
        },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: {
          description: 'Records fetched',
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  {
                    // type=attendance response
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      message: { type: 'string', example: 'Attendance fetched successfully' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/EmployeeAttendanceGroup' }
                      },
                      meta: { $ref: '#/components/schemas/ListMeta' }
                    }
                  },
                  {
                    // type=break response
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      message: { type: 'string', example: 'Attendance fetched successfully' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/BreakFlatItem' }
                      },
                      meta: { $ref: '#/components/schemas/ListMeta' }
                    }
                  }
                ]
              }
            }
          }
        },
        400: {
          description: 'Invalid parameters',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        },
        401: { description: 'Unauthorized' }
      }
    }
  },

  '/attendance/dashboard-summary': {
    get: {
      tags: ['Attendance'],
      summary: 'Dashboard summary',
      description:
        'Aggregated statistics for the company dashboard: employees, today\'s attendance, shifts, leaves this month, and yearly holidays.',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Summary data',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Dashboard summary fetched successfully' },
                  data: { $ref: '#/components/schemas/DashboardSummaryData' }
                }
              },
              example: {
                success: true,
                message: 'Dashboard summary fetched successfully',
                data: {
                  generated_at: '2025-03-17T10:30:00.000Z',
                  today: '2025-03-17',
                  current_month: {
                    start_date: '2025-03-01',
                    end_date: '2025-03-31'
                  },
                  employees: {
                    total: 50,
                    active: 48,
                    inactive: 2,
                    face_enrolled: 45,
                    fingerprint_mapped: 30
                  },
                  attendance_today: {
                    present: 42,
                    absent: 6,
                    half_day: 2,
                    paid_leave: 0,
                    unmarked: 0,
                    verified: 40,
                    unverified: 2,
                    overtime_employees: 5,
                    attendance_entries: 42,
                    break_entries: 15,
                    attendance_percentage: 84.0
                  },
                  shifts_today: {
                    total_shifts: 42,
                    total_worked_minutes: 19500,
                    total_break_minutes: 600,
                    total_extra_break_minutes: 120,
                    total_overtime_minutes: 300,
                    total_late_minutes: 45,
                    total_early_leave_minutes: 30,
                    average_worked_minutes: 464.3
                  },
                  leaves_this_month: {
                    pending: { requests: 3, employees: 3, leave_days: 5 },
                    approved: { requests: 12, employees: 10, leave_days: 18 },
                    rejected: { requests: 1, employees: 1, leave_days: 2 },
                    cancelled: { requests: 0, employees: 0, leave_days: 0 }
                  },
                  holidays: {
                    total: 2,
                    optional: 1,
                    mandatory: 1
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' }
      }
    }
  }
};
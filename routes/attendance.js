import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import { getEnumObject } from "../utils/constantsValidator.js";
import { DESIGNATIONS, EMPLOYMENT_TYPES, SALARY_TYPES } from "../constants/constants_values.js";
import getClientMeta from "../utils/ipHelper.js";
import {
  parseDate, isDateAfter, addMinutesToTime, getISTNow, getCurrentDate, getCurrentTime,
  parseDateTimeIST, weekendInfo, formatTime12Hour, getDayName, normalizeWeekends, diffMinutes,
  normalizeHalfDayType, diffMilliseconds, parseTime, eachDateBetween, formatIST, getYearFromDate
} from "../utils/time.js";
import { adjustEmployeeLeaveBalance } from "../utils/leaveBalanceUtils.js";
import { sendSuccess, sendError, safeNumber, buildMeta } from "../utils/sendResponse.js";
import { buildFileUrl } from "../utils/fileService.js";
import { createAttendanceLog } from "../utils/attendanceLogsUtil.js";
import { AT } from "../constants/permissions.js";
import { generateShift } from "../utils/ShiftUtils.js";
import { payrollExists, upsertPayroll } from "../utils/payrollUtils.js";
import axios from "axios";
import { runFaceCheck, FACE_SERVICE_URL } from "../utils/faceCheckUtil.js";
import { NODE_ENV } from "../config/config.js";

const FACE_ATTENDANCE_METHOD = "face";

const router = express.Router();

const isValidDate = (value) => !!parseDate(value);

function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = (deg) => (deg * Math.PI) / 180;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// =============================================================================
// REUSABLE SQL QUERY CONSTANTS
// =============================================================================

const ATTENDANCE_QUERY = {
  // --- Employee Queries ---
  GET_EMPLOYEE_PUNCH_IN: `
    SELECT
      e.id,
      e.weekends,
      e.attendance_methods,
      e.is_auto
    FROM employees e
    INNER JOIN companies c
      ON c.id = e.company_id
      AND c.is_active = 1
      AND c.is_deleted = 0
    WHERE e.user_id = ?
      AND e.company_id = ?
      AND e.is_deleted = 0
      AND e.is_active = 1
    LIMIT 1
  `,

  GET_EMPLOYEE_PUNCH_OUT: `
    SELECT
      e.id,
      e.weekends,
      e.shift_start,
      e.shift_end,
      e.expected_work_minutes,
      e.break_minutes,
      e.grace_minutes,
      e.attendance_methods AS emp_attendance_methods,
      e.is_auto,
      c.company_ips,
      c.latitude AS company_latitude,
      c.longitude AS company_longitude,
      c.attendance_methods,
      c.max_distance
    FROM employees e
    INNER JOIN companies c
      ON c.id = e.company_id
      AND c.is_active = 1
      AND c.is_deleted = 0
    WHERE e.user_id = ?
      AND e.company_id = ?
      AND e.is_active = 1
      AND e.is_deleted = 0
    LIMIT 1
  `,

  GET_EMPLOYEE_BREAK: `
    SELECT
      e.id,
      e.attendance_methods,
      e.is_auto,
      c.company_ips,
      c.latitude,
      c.longitude,
      c.max_distance
    FROM employees e
    INNER JOIN companies c
      ON c.id = e.company_id
      AND c.is_active = 1
      AND c.is_deleted = 0
    WHERE e.user_id = ?
      AND e.company_id = ?
      AND e.is_deleted = 0
      AND e.is_active = 1
    LIMIT 1
  `,

  GET_EMPLOYEE_FACE_ATTENDANCE: `
    SELECT
      e.id,
      e.user_id,
      e.weekends,
      e.shift_start,
      e.shift_end,
      e.grace_minutes
    FROM employees e
    INNER JOIN companies c
      ON c.id = e.company_id
      AND c.is_active = 1
      AND c.is_deleted = 0
    WHERE e.company_id = ?
      AND e.is_deleted = 0
      AND e.is_active = 1
      AND (e.user_id = ? OR e.id = ?)
    LIMIT 1
  `,

  GET_EMPLOYEE_FACE_DATA: `
    SELECT face_enrolled, face_data
    FROM employees
    WHERE id = ?
      AND company_id = ?
      AND is_deleted = 0
    LIMIT 1
  `,

  GET_EMPLOYEE_MARK: `
    SELECT id, company_id, shift_start, shift_end, expected_work_minutes, break_minutes, grace_minutes, weekends
    FROM employees
    WHERE id = ? AND company_id = ? AND is_deleted = 0 AND is_active = 1
    LIMIT 1 FOR UPDATE
  `,

  GET_EMPLOYEE_PAST_PUNCHES: `
    SELECT
      e.id,
      e.employee_code,
      e.designation,
      e.shift_start,
      e.shift_end,
      e.expected_work_minutes,
      e.break_minutes,
      e.grace_minutes,
      u.name,
      u.email,
      u.phone
    FROM employees e
    INNER JOIN users u
      ON u.id = e.user_id
      AND u.is_deleted = 0
      AND u.is_active = 1
    WHERE e.user_id = ?
      AND e.company_id = ?
      AND e.is_deleted = 0
      AND e.is_active = 1
    LIMIT 1
  `,

  GET_EMPLOYEE_CURRENT_STATUS: `
    SELECT
      e.id,
      e.weekends,
      e.shift_start,
      e.shift_end,
      e.expected_work_minutes,
      e.break_minutes,
      e.grace_minutes,
      e.designation,
      e.employee_code,
      e.attendance_methods AS emp_attendance_methods,
      e.is_auto,
      c.name AS company_name,
      c.attendance_methods
    FROM employees e
    INNER JOIN companies c
      ON c.id = e.company_id
    WHERE e.user_id = ?
      AND e.company_id = ?
      AND e.is_active = 1
      AND e.is_deleted = 0
      AND c.is_active = 1
      AND c.is_deleted = 0
    LIMIT 1
  `,

  // --- Company Queries ---
  GET_COMPANY_LOCATION: `
    SELECT
      latitude,
      longitude,
      company_ips,
      max_distance
    FROM companies
    WHERE id = ?
      AND is_deleted = 0
      AND is_active = 1
    LIMIT 1
  `,

  GET_COMPANY_OWNER: `SELECT owner_user_id FROM companies WHERE id = ?`,

  // --- Attendance Queries ---
  GET_EXISTING_ATTENDANCE_LOCK: `
    SELECT id
    FROM attendance
    WHERE employee_id = ?
      AND company_id = ?
      AND attendance_date = ?
      AND type = 'attendance'
    LIMIT 1
    FOR UPDATE
  `,

  GET_ACTIVE_BREAK_PUNCH_IN: `
    SELECT id
    FROM attendance
    WHERE employee_id = ?
      AND company_id = ?
      AND attendance_date = ?
      AND type = 'break'
      AND end_time IS NULL
    LIMIT 1
  `,

  GET_ACTIVE_BREAK_LOCK: `
    SELECT id
    FROM attendance
    WHERE employee_id = ?
      AND company_id = ?
      AND attendance_date = ?
      AND type = 'break'
      AND end_time IS NULL
    LIMIT 1
    FOR UPDATE
  `,

  GET_MAIN_ATTENDANCE_PUNCH_OUT_LOCK: `
    SELECT
      id,
      start_time,
      end_time,
      is_deductible,
      is_overtime,
      day_status,
      value1,
      value2
    FROM attendance
    WHERE employee_id = ?
      AND company_id = ?
      AND attendance_date = ?
      AND type = 'attendance'
    LIMIT 1
    FOR UPDATE
  `,

  GET_MAIN_ATTENDANCE_BREAK_OUT: `
    SELECT id, start_time, end_time
    FROM attendance
    WHERE employee_id = ?
      AND company_id = ?
      AND attendance_date = ?
      AND type = 'attendance'
    LIMIT 1
  `,

  GET_OPEN_BREAK_LOCK: `
    SELECT id, start_time
    FROM attendance
    WHERE employee_id = ?
      AND company_id = ?
      AND attendance_date = ?
      AND type = 'break'
      AND end_time IS NULL
    LIMIT 1
    FOR UPDATE
  `,

  GET_FACE_STATE_MAIN_ATTENDANCE: `
    SELECT id, start_time, end_time
    FROM attendance
    WHERE employee_id = ?
      AND company_id = ?
      AND attendance_date = ?
      AND type = 'attendance'
    ORDER BY id DESC
    LIMIT 1
  `,

  GET_FACE_STATE_ACTIVE_BREAK: `
    SELECT id, start_time, end_time
    FROM attendance
    WHERE employee_id = ?
      AND company_id = ?
      AND attendance_date = ?
      AND type = 'break'
      AND start_time IS NOT NULL
      AND end_time IS NULL
    ORDER BY id DESC
    LIMIT 1
  `,

  INSERT_ATTENDANCE_PUNCH_IN: `
    INSERT INTO attendance (
      employee_id,
      company_id,
      attendance_date,
      type,
      start_time,
      is_verified,
      verified_by,
      verify_date,
      day_status,
      created_by
    )
    VALUES (
      ?, ?, ?,
      'attendance',
      ?,
      ?,
      ?,
      ?,
      ?,
      ?
    )
  `,

  INSERT_FACE_PUNCH_IN: `
    INSERT INTO attendance (
      employee_id,
      company_id,
      attendance_date,
      type,
      start_time,
      is_verified,
      verified_by,
      verify_date,
      day_status,
      created_by
    )
    VALUES (?, ?, ?, 'attendance', ?, 0, NULL, NULL, 'present', ?)
  `,

  UPDATE_ATTENDANCE_PUNCH_OUT: `
    UPDATE attendance
    SET
      end_time = ?,
      day_status = ?,
      value1 = ?,
      is_verified = ?,
      verified_by = ?,
      verify_date = ?,
      is_overtime = ?
    WHERE id = ?
      AND end_time IS NULL
  `,

  INSERT_BREAK: `
    INSERT INTO attendance (
      employee_id,
      company_id,
      attendance_date,
      type,
      start_time,
      is_verified,
      verified_by,
      verify_date,
      is_deductible,
      is_overtime,
      day_status,
      value1,
      value2,
      created_by
    )
    VALUES (
      ?, ?, ?,
      'break',
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?
    )
  `,

  UPDATE_BREAK_END: `
    UPDATE attendance
    SET
      end_time = ?,
      is_verified = ?,
      verified_by = ?,
      verify_date = ?
    WHERE id = ?
  `,

  GET_ATTENDANCE_APPROVE_LOCK: `
    SELECT * FROM attendance
    WHERE company_id = ? AND attendance_date = ? AND employee_id IN (?)
      AND type = 'attendance'
    FOR UPDATE
  `,

  UPDATE_ATTENDANCE_APPROVE: `
    UPDATE attendance
    SET start_time = ?, end_time = ?, day_status = ?, value1 = ?, value2 = ?,
        is_verified = 1, verified_by = ?, verify_date = ?, remark = ?
    WHERE id = ?
  `,

  INSERT_ATTENDANCE_APPROVE: `
    INSERT INTO attendance (
      employee_id, company_id, attendance_date, type,
      start_time, end_time, day_status, value1, value2,
      is_verified, verified_by, verify_date, created_by, remark
    ) VALUES (?, ?, ?, 'attendance', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `,

  GET_ATTENDANCE_MARK_PARENT: `
    SELECT id, start_time, end_time, day_status
    FROM attendance
    WHERE employee_id = ? AND company_id = ? AND attendance_date = ? AND type = 'attendance'
    ORDER BY id DESC LIMIT 1 FOR UPDATE
  `,

  GET_ATTENDANCE_MARK_EXISTING_BY_ID: `
    SELECT * FROM attendance
    WHERE id = ? AND employee_id = ? AND company_id = ? AND attendance_date = ?
    FOR UPDATE
  `,

  GET_ATTENDANCE_MARK_EXISTING_MAIN: `
    SELECT * FROM attendance
    WHERE employee_id = ? AND company_id = ? AND attendance_date = ? AND type = 'attendance'
    ORDER BY id DESC LIMIT 1 FOR UPDATE
  `,

  GET_ATTENDANCE_MARK_EXISTING_BREAK_BY_START: `
    SELECT * FROM attendance
    WHERE employee_id = ? AND company_id = ? AND attendance_date = ? AND type = 'break' AND start_time = ?
    ORDER BY id DESC LIMIT 1 FOR UPDATE
  `,

  GET_ATTENDANCE_MARK_EXISTING_BREAK_OPEN: `
    SELECT * FROM attendance
    WHERE employee_id = ? AND company_id = ? AND attendance_date = ? AND type = 'break' AND end_time IS NULL
    ORDER BY id DESC LIMIT 1 FOR UPDATE
  `,

  GET_ATTENDANCE_MARK_OVERLAPPING_BREAK: `
    SELECT id FROM attendance
    WHERE employee_id = ? AND company_id = ? AND attendance_date = ? AND type = 'break'
      AND id != ?
      AND (start_time < ? AND COALESCE(end_time, '23:59:59') > ?)
    LIMIT 1
  `,

  INSERT_ATTENDANCE_MARK: `
    INSERT INTO attendance (
      employee_id, company_id, attendance_date,
      type, start_time, end_time,
      is_deductible, is_overtime,
      created_by,
      is_verified, verified_by, verify_date,
      day_status, value1, value2, value3,
      remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, UTC_TIMESTAMP(), ?, ?, ?, ?, ?)
  `,

  GET_LOG_ATTENDANCE: `
    SELECT id, type, attendance_date
    FROM attendance
    WHERE id = ? AND company_id = ?
    LIMIT 1
  `,

  GET_CURRENT_STATUS_ATTENDANCES: `
    SELECT
      a.id,
      a.start_time,
      a.end_time,
      a.is_overtime,
      a.is_verified,
      a.day_status,
      a.value1,
      a.value2,
      start_log.method       AS punch_in_method,
      start_log.ip_address   AS punch_in_ip,
      start_log.latitude     AS punch_in_latitude,
      start_log.longitude    AS punch_in_longitude,
      end_log.method         AS punch_out_method,
      end_log.ip_address     AS punch_out_ip,
      end_log.latitude       AS punch_out_latitude,
      end_log.longitude      AS punch_out_longitude

    FROM attendance a

    LEFT JOIN (
      SELECT
        al.attendance_id,
        al.method,
        al.ip_address,
        al.latitude,
        al.longitude

      FROM attendance_logs al

      INNER JOIN (
        SELECT
          attendance_id,
          MAX(id) AS max_id

        FROM attendance_logs

        WHERE log_type = 'start'

        GROUP BY attendance_id
      ) t
        ON t.max_id = al.id
    ) start_log
      ON start_log.attendance_id = a.id

    LEFT JOIN (
      SELECT
        al.attendance_id,
        al.method,
        al.ip_address,
        al.latitude,
        al.longitude

      FROM attendance_logs al

      INNER JOIN (
        SELECT
          attendance_id,
          MAX(id) AS max_id

        FROM attendance_logs

        WHERE log_type = 'end'

        GROUP BY attendance_id
      ) t
        ON t.max_id = al.id
    ) end_log
      ON end_log.attendance_id = a.id

    WHERE
      a.employee_id = ?
      AND a.company_id = ?
      AND a.attendance_date = ?
      AND a.type = 'attendance'

    ORDER BY a.start_time ASC
  `,

  GET_CURRENT_STATUS_BREAKS: `
    SELECT
      a.id,
      a.start_time,
      a.end_time,
      a.is_deductible,
      start_log.method       AS break_start_method,
      start_log.ip_address   AS break_start_ip,
      start_log.latitude     AS break_start_latitude,
      start_log.longitude    AS break_start_longitude,
      end_log.method         AS break_end_method,
      end_log.ip_address     AS break_end_ip,
      end_log.latitude       AS break_end_latitude,
      end_log.longitude      AS break_end_longitude

    FROM attendance a

    LEFT JOIN (
      SELECT
        al.attendance_id,
        al.method,
        al.ip_address,
        al.latitude,
        al.longitude

      FROM attendance_logs al

      INNER JOIN (
        SELECT
          attendance_id,
          MAX(id) AS max_id

        FROM attendance_logs

        WHERE log_type = 'start'

        GROUP BY attendance_id
      ) t
        ON t.max_id = al.id
    ) start_log
      ON start_log.attendance_id = a.id

    LEFT JOIN (
      SELECT
        al.attendance_id,
        al.method,
        al.ip_address,
        al.latitude,
        al.longitude

      FROM attendance_logs al

      INNER JOIN (
        SELECT
          attendance_id,
          MAX(id) AS max_id

        FROM attendance_logs

        WHERE log_type = 'end'

        GROUP BY attendance_id
      ) t
        ON t.max_id = al.id
    ) end_log
      ON end_log.attendance_id = a.id

    WHERE
      a.employee_id = ?
      AND a.company_id = ?
      AND a.attendance_date = ?
      AND a.type = 'break'

    ORDER BY a.start_time ASC
  `,

  // --- Day Status Check Queries ---
  GET_CHECK_COMPANY: `
    SELECT id
    FROM companies
    WHERE id = ?
      AND is_active = 1
      AND is_deleted = 0
    LIMIT 1
  `,

  GET_CHECK_EMPLOYEE: `
    SELECT id
    FROM employees
    WHERE id = ?
      AND company_id = ?
      AND is_active = 1
      AND is_deleted = 0
    LIMIT 1
  `,

  GET_CHECK_HOLIDAY: `
    SELECT id, name
    FROM holidays
    WHERE company_id = ?
      AND date = ?
      AND is_optional = 0
      AND is_active = 1
      AND is_deleted = 0
    LIMIT 1
  `,

  GET_CHECK_LEAVE: `
    SELECT id, is_half_day
    FROM employee_leaves
    WHERE employee_id = ?
      AND company_id = ?
      AND status = 'approved'
      AND is_active = 1
      AND is_deleted = 0
      AND ? BETWEEN start_date AND end_date
    LIMIT 1
  `,

  // --- Holiday Queries ---
  GET_HOLIDAY_BY_DATE: `
    SELECT
      id,
      name
    FROM holidays
    WHERE company_id = ?
      AND date = ?
      AND is_optional = 0
      AND is_deleted = 0
      AND is_active = 1
    LIMIT 1
  `,

  GET_HOLIDAY_SIMPLE: `
    SELECT id
    FROM holidays
    WHERE company_id = ?
      AND date = ?
      AND is_optional = 0
      AND is_deleted = 0
      AND is_active = 1
    LIMIT 1
  `,

  GET_HOLIDAY_CURRENT_STATUS: `
    SELECT
      id,
      name
    FROM holidays
    WHERE company_id = ?
      AND date = ?
      AND is_optional = 0
      AND is_active = 1
      AND is_deleted = 0
    LIMIT 1
  `,

  // --- Leave Queries ---
  GET_APPROVED_LEAVE: `
    SELECT
      el.id,
      el.employee_id,
      el.company_id,
      el.leave_config_id,
      el.start_date,
      el.end_date,
      el.total_days,
      el.is_half_day,
      el.half_day_type,
      lc.code,
      lc.is_paid
    FROM employee_leaves el
    INNER JOIN leave_configs lc
      ON lc.id = el.leave_config_id
    WHERE el.employee_id = ?
      AND el.company_id = ?
      AND el.status = 'approved'
      AND el.is_active = 1
      AND el.is_deleted = 0
      AND lc.is_deleted = 0
      AND ? BETWEEN el.start_date AND el.end_date
    LIMIT 1
    FOR UPDATE
  `,

  GET_APPROVED_LEAVE_READ: `
    SELECT
      el.id,
      el.employee_id,
      el.company_id,
      el.leave_config_id,
      el.start_date,
      el.end_date,
      el.total_days,
      el.is_half_day,
      el.half_day_type,
      lc.code,
      lc.is_paid
    FROM employee_leaves el
    INNER JOIN leave_configs lc
      ON lc.id = el.leave_config_id
    WHERE el.employee_id = ?
      AND el.company_id = ?
      AND el.status = 'approved'
      AND el.is_active = 1
      AND el.is_deleted = 0
      AND lc.is_deleted = 0
      AND ? BETWEEN el.start_date AND el.end_date
    LIMIT 1
  `,

  GET_PAID_LEAVE_CONFIG: `
    SELECT id FROM leave_configs
    WHERE company_id = ? AND code = ? AND is_paid = 1 AND is_active = 1 AND is_deleted = 0
    LIMIT 1
  `,

  // --- Dashboard Queries ---
  GET_DASHBOARD_EMPLOYEE_STATS: `
    SELECT
      COUNT(*) AS total_employees,
      SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) AS active_employees,
      SUM(CASE WHEN e.status != 'active' THEN 1 ELSE 0 END) AS inactive_employees,
      SUM(CASE WHEN e.face_enrolled = 1 THEN 1 ELSE 0 END) AS face_enrolled_count,
      SUM(CASE WHEN e.fingerprint_mapped = 1 THEN 1 ELSE 0 END) AS fingerprint_mapped_count
    FROM employees e
    INNER JOIN users u ON u.id = e.user_id
    WHERE e.company_id = ?
      AND e.is_deleted = 0
      AND e.is_active = 1
      AND e.is_active = 1
      AND u.is_deleted = 0
      AND u.is_active = 1
      AND (e.joining_date IS NULL OR e.joining_date <= ?)
  `,

  GET_DASHBOARD_ATTENDANCE_STATS: `
    SELECT
      COUNT(DISTINCT CASE WHEN a.day_status IN ('present', 'half_day') THEN a.employee_id END) AS present_count,
      COUNT(DISTINCT CASE WHEN a.day_status = 'absent' THEN a.employee_id END) AS absent_count,
      COUNT(DISTINCT CASE WHEN a.day_status = 'half_day' THEN a.employee_id END) AS half_day_count,
      COUNT(DISTINCT CASE WHEN a.day_status = 'paid_leave' THEN a.employee_id END) AS paid_leave_count,
      COUNT(DISTINCT CASE WHEN a.day_status = 'unmarked' THEN a.employee_id END) AS unmarked_count,
      COUNT(DISTINCT CASE WHEN a.is_verified = 1 THEN a.employee_id END) AS verified_attendance_count,
      COUNT(DISTINCT CASE WHEN a.is_verified = 0 THEN a.employee_id END) AS unverified_attendance_count,
      COUNT(DISTINCT CASE WHEN a.is_overtime = 1 THEN a.employee_id END) AS overtime_employee_count,
      COUNT(DISTINCT CASE WHEN a.type = 'attendance' THEN a.id END) AS attendance_entries,
      COUNT(DISTINCT CASE WHEN a.type = 'break' THEN a.id END) AS break_entries
    FROM attendance a
    INNER JOIN employees e ON e.id = a.employee_id
    INNER JOIN users u ON u.id = e.user_id
    WHERE a.company_id = ?
      AND a.attendance_date = ?
      AND e.is_deleted = 0
      AND e.is_active = 1
      AND u.is_deleted = 0
      AND u.is_active = 1
  `,

  GET_DASHBOARD_SHIFT_STATS: `
    SELECT
      COUNT(*) AS total_shifts,
      SUM(worked_minutes) AS total_worked_minutes,
      SUM(allowed_break_minutes) AS total_break_minutes,
      SUM(extra_break_minutes) AS total_extra_break_minutes,
      SUM(overtime_minutes) AS total_overtime_minutes,
      SUM(late_minutes) AS total_late_minutes,
      SUM(early_leave_minutes) AS total_early_leave_minutes,
      AVG(worked_minutes) AS avg_worked_minutes
    FROM shifts
    WHERE company_id = ?
      AND shift_date = ?
      AND is_deleted = 0
  `,

  GET_DASHBOARD_LEAVE_STATS: `
    SELECT
      status,
      COUNT(*) AS total_requests,
      COUNT(DISTINCT employee_id) AS total_employees,
      SUM(total_days) AS total_leave_days
    FROM employee_leaves
    WHERE company_id = ?
      AND is_deleted = 0
      AND is_active = 1
      AND start_date <= ?
      AND end_date >= ?
    GROUP BY status
  `,

  GET_DASHBOARD_HOLIDAY_STATS: `
    SELECT
      COUNT(*) AS total_holidays,
      SUM(CASE WHEN is_optional = 1 THEN 1 ELSE 0 END) AS optional_holidays,
      SUM(CASE WHEN is_optional = 0 THEN 1 ELSE 0 END) AS mandatory_holidays
    FROM holidays
    WHERE company_id = ?
      AND is_deleted = 0
      AND is_active = 1
      AND YEAR(date) = YEAR(?)
  `,

  // --- User Queries ---
  GET_CHECK_USER: `
    SELECT id
    FROM users
    WHERE id = ?
      AND is_active = 1
      AND is_deleted = 0
    LIMIT 1
  `,

  // --- Full Company Query ---
  GET_CHECK_COMPANY_FULL: `
    SELECT
      id,
      name,
      latitude,
      longitude,
      company_ips,
      attendance_methods,
      max_distance
    FROM companies
    WHERE id = ?
      AND is_active = 1
      AND is_deleted = 0
    LIMIT 1
  `,

  // --- Full Employee Query ---
  GET_CHECK_EMPLOYEE_FULL: `
    SELECT
      id,
      company_id,
      user_id,
      attendance_methods,
      is_auto,
      shift_start,
      shift_end,
      expected_work_minutes,
      break_minutes,
      grace_minutes,
      weekends
    FROM employees
    WHERE user_id = ?
      AND company_id = ?
      AND is_active = 1
      AND is_deleted = 0
    LIMIT 1
  `,

  // --- Leave Management Queries ---
  CANCEL_EMPLOYEE_LEAVE: `
    UPDATE employee_leaves
    SET status = 'cancelled', is_active = 0, cancelled_at = NOW(), updated_by = ?, updated_at = NOW()
    WHERE id = ?
  `,

  GET_EMPLOYEE_WEEKENDS: `
    SELECT weekends FROM employees WHERE id = ? AND company_id = ? LIMIT 1
  `,

  GET_RANGE_HOLIDAYS: `
    SELECT date FROM holidays WHERE company_id = ? AND is_optional = 0 AND is_active = 1 AND is_deleted = 0 AND date BETWEEN ? AND ?
  `,

  COPY_LEAVE_SEGMENT: `
    INSERT INTO employee_leaves (
      company_id, employee_id, leave_config_id, start_date, end_date, total_days,
      is_half_day, half_day_type, reason, status, approved_by, approved_at,
      approval_remarks, applied_at, is_active, created_at, created_by,
      updated_at, updated_by, is_deleted
    )
    SELECT
      company_id, employee_id, leave_config_id, ?, ?, ?,
      is_half_day, half_day_type, reason, status, approved_by, approved_at,
      approval_remarks, applied_at, 1, created_at, created_by,
      NOW(), ?, 0
    FROM employee_leaves
    WHERE id = ?
  `,

  COPY_LEAVE_ATTACHMENTS: `
    INSERT INTO employee_leave_attachments (
      leave_id, file_url, file_type, file_size, is_active, created_at, created_by,
      updated_at, updated_by, is_deleted
    )
    SELECT
      ?, file_url, file_type, file_size, is_active, created_at, created_by,
      NOW(), ?, 0
    FROM employee_leave_attachments
    WHERE leave_id = ? AND is_deleted = 0
  `
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Reusable common validation function for /punch-in, /punch-out, /break-in, /break-out routes.
 * Performs ordered validation steps:
 * 1. User existence & active check
 * 2. Company existence & active check
 * 3. Employee existence & active check
 * 4. Day status check (Company Holiday or Full-Day Leave check)
 * 5. Attendance Method permission check (allowed in both company & employee settings)
 * 6. Method dependent parameter validation (GPS coordinates/distance & IP whitelist)
 */
async function validateAttendanceCommon(conn, {
  user_id,
  company_id,
  attendance_date,
  attendance_method,
  latitude,
  longitude,
  ip_address
}) {
  const userId = Number(user_id);
  const compId = Number(company_id);

  // 1. Check user exist
  if (!userId) {
    throw new Error("User not found");
  }
  const [[user]] = await conn.query(ATTENDANCE_QUERY.GET_CHECK_USER, [userId]);
  if (!user) {
    throw new Error("User not found");
  }

  // 2. Check company exist & active
  if (!compId) {
    throw new Error("Company not found");
  }
  const [[company]] = await conn.query(ATTENDANCE_QUERY.GET_CHECK_COMPANY_FULL, [compId]);
  if (!company) {
    throw new Error("Company not found");
  }

  // 3. Check employee exist & active
  const [[employee]] = await conn.query(ATTENDANCE_QUERY.GET_CHECK_EMPLOYEE_FULL, [userId, compId]);
  if (!employee) {
    throw new Error("Employee not found");
  }

  // 4. Day status check (Holiday or Leave)
  const [[holiday]] = await conn.query(ATTENDANCE_QUERY.GET_CHECK_HOLIDAY, [compId, attendance_date]);
  if (holiday) {
    throw new Error("Today is a company holiday");
  }

  const [[leave]] = await conn.query(ATTENDANCE_QUERY.GET_CHECK_LEAVE, [employee.id, compId, attendance_date]);
  if (leave && Number(leave.is_half_day) !== 1) {
    throw new Error("Employee is on leave today");
  }

  // 4b. Weekend check
  const weekendStatus = weekendInfo(attendance_date, employee.weekends);
  if (weekendStatus?.is_weekend) {
    throw new Error("Today is employee's weekend");
  }

  // 5. Attendance method check (Company AND Employee must both allow it)
  const parsedMethod = String(attendance_method || "").trim().toLowerCase();
  if (!parsedMethod) {
    throw new Error("Attendance method is required");
  }

  const companyMethods = JSON.parse(company.attendance_methods || "[]").map((m) => String(m).trim().toLowerCase());
  if (!companyMethods.includes(parsedMethod)) {
    throw new Error("Attendance method not allowed by company");
  }

  const employeeMethods = JSON.parse(employee.attendance_methods || "[]").map((m) => String(m).trim().toLowerCase());
  if (!employeeMethods.includes(parsedMethod)) {
    throw new Error("Attendance method not allowed for employee");
  }

  // 6. Validate dependent fields (GPS, IP, Manual)
  const { parsedLatitude, parsedLongitude } = validateMethodAndLocation({
    parsedMethod,
    latitude,
    longitude,
    ip_address,
    maxDistance: company.max_distance,
    companyLatitude: company.latitude,
    companyLongitude: company.longitude,
    companyIps: company.company_ips,
    ipNotDetectedMsg: "IP address not found",
    ipNotAllowedMsg: "IP address not allowed"
  });

  return {
    user,
    company,
    employee,
    leave: leave || null,
    parsedMethod,
    parsedLatitude,
    parsedLongitude
  };
}

function validateMethodAndLocation({
  parsedMethod,
  latitude,
  longitude,
  ip_address,
  maxDistance,
  companyLatitude,
  companyLongitude,
  companyIps,
  ipNotDetectedMsg = "IP address not found",
  ipNotAllowedMsg = "IP address not allowed"
}) {
  const VALID_METHODS = ["gps", "ip", "manual"];

  if (!VALID_METHODS.includes(parsedMethod)) {
    throw new Error("Invalid attendance method");
  }

  let parsedLatitude = null;
  let parsedLongitude = null;

  if (parsedMethod === "gps") {
    parsedLatitude = Number(latitude);
    parsedLongitude = Number(longitude);

    if (Number.isNaN(parsedLatitude) || Number.isNaN(parsedLongitude)) {
      throw new Error("Invalid GPS coordinates");
    }

    if (parsedLatitude < -90 || parsedLatitude > 90) {
      throw new Error("Invalid latitude range");
    }

    if (parsedLongitude < -180 || parsedLongitude > 180) {
      throw new Error("Invalid longitude range");
    }

    if (companyLatitude === null || companyLongitude === null || companyLatitude == null || companyLongitude == null) {
      throw new Error("Company GPS not configured");
    }

    const distance = getDistanceInMeters(Number(companyLatitude), Number(companyLongitude), parsedLatitude, parsedLongitude);

    if (Number.isNaN(distance)) {
      throw new Error("Unable to validate GPS distance");
    }

    if (distance > maxDistance) {
      throw new Error("Outside allowed location");
    }
  }

  if (parsedMethod === "ip") {
    if (!ip_address) {
      throw new Error(ipNotDetectedMsg);
    }

    let allowedIps = [];

    try {
      allowedIps = companyIps ? JSON.parse(companyIps) : [];
    } catch (error) {
      throw new Error("Invalid company IP configuration");
    }

    if (!Array.isArray(allowedIps)) {
      throw new Error("Company IP configuration must be an array");
    }

    const normalizedIp = String(ip_address).trim();
    const isAllowedIp = allowedIps.some((item) => String(item).trim() === normalizedIp);

    if (!isAllowedIp) {
      throw new Error(ipNotAllowedMsg);
    }
  }

  return { parsedLatitude, parsedLongitude };
}

function parseEmployeeMethods(rawMethods) {
  return JSON.parse(rawMethods || "[]").map((m) => String(m).trim().toLowerCase());
}

const normalizeTime = (value) => {
  if (!value) return null;
  return parseTime(value, "HH:mm:ss") || null;
};

const timeToMinutes = (time) => {
  if (!time) return null;
  const parts = String(time).split(":").map(Number);
  return parts[0] * 60 + (parts[1] || 0);
};

const calculateMinutesBetween = (start, end) => {
  if (!start || !end) return 0;
  const startMins = timeToMinutes(start);
  const endMins = timeToMinutes(end);
  if (startMins === null || endMins === null) return 0;
  return Math.max(0, endMins - startMins);
};

const minutesToTime = (minutes) => {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = String(Math.floor(normalized / 60)).padStart(2, "0");
  const mins = String(normalized % 60).padStart(2, "0");
  return `${hours}:${mins}:00`;
};

const getShiftMidpoint = (shiftStart, shiftEnd) => {
  const startMinutes = timeToMinutes(shiftStart) || 0;
  let endMinutes = timeToMinutes(shiftEnd) || 0;
  if (endMinutes <= startMinutes) endMinutes += 1440;
  return minutesToTime(Math.floor((startMinutes + endMinutes) / 2));
};

const buildPunchObject = (time, method, latitude, longitude, ip_address) => {
  if (!time) return null;
  return {
    time,
    method: method || null,
    latitude: latitude !== null && latitude !== undefined ? Number(latitude) : null,
    longitude: longitude !== null && longitude !== undefined ? Number(longitude) : null,
    ip_address: ip_address || null,
  };
};

const normalizeDayStatus = (status) => {
  if (!status) return "unmarked";
  const normalized = String(status).trim().toLowerCase();
  if (normalized === "paid_leave") return "leave";
  return normalized;
};

const buildDayStatusPayload = ({ dayStatus, value1, value2 }) => {
  const normalizedStatus = normalizeDayStatus(dayStatus);
  if (normalizedStatus === "half_day") {
    return { half_day_session: value1 || null };
  }
  if (normalizedStatus === "leave") {
    const leaveType = value1 || null;
    const payload = { leave_type: leaveType };
    if (String(leaveType || "").trim().toLowerCase() === "paid") {
      payload.leave_sub_type = value2 || null;
    }
    return payload;
  }
  return {};
};

const removeNullFields = (obj = {}) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));

async function recalculateShiftAndPayroll(conn, companyId, employeeId, attendanceDate, createdBy) {
  await generateShift(conn, employeeId, companyId, attendanceDate, createdBy);
  const existingPayroll = await payrollExists({ conn, companyId, employeeId });
  if (existingPayroll) {
    await upsertPayroll({ conn, companyId, employeeId, createdBy });
  }
}

const normalizeFaceAttendanceType = (raw) => {
  const key = String(raw || "").trim().toLowerCase().replace(/_/g, " ").replace(/-/g, " ");

  const map = {
    "punch in": "punch_in",
    "punch out": "punch_out",
    "break start": "break_start",
    "break end": "break_end",
  };

  return map[key] || null;
};

const faceAttendanceTypeLabel = (punchType) => {
  const labels = {
    punch_in: "punch in",
    punch_out: "punch out",
    break_start: "break start",
    break_end: "break end",
  };
  return labels[punchType] || punchType;
};

const fetchTodayFaceAttendanceState = async (conn, company_id, employee_id) => {
  const attendance_date = getCurrentDate();

  const [[mainAttendance]] = await conn.query(ATTENDANCE_QUERY.GET_FACE_STATE_MAIN_ATTENDANCE, [employee_id, company_id, attendance_date]);
  const [[activeBreak]] = await conn.query(ATTENDANCE_QUERY.GET_FACE_STATE_ACTIVE_BREAK, [employee_id, company_id, attendance_date]);

  const hasPunchIn = Boolean(mainAttendance) && mainAttendance.start_time != null;
  const hasPunchOut = Boolean(mainAttendance) && mainAttendance.end_time != null;
  const hasActiveBreak = Boolean(activeBreak);

  return {
    attendance_date,
    mainAttendance: mainAttendance || null,
    activeBreak: activeBreak || null,
    hasPunchIn,
    hasPunchOut,
    hasActiveBreak,
  };
};

const validateFaceAttendanceType = async (conn, company_id, employee_id, weekends, punchType) => {
  const state = await fetchTodayFaceAttendanceState(conn, company_id, employee_id);
  const { attendance_date, hasPunchIn, hasPunchOut, hasActiveBreak } = state;

  if (punchType === "punch_in") {
    if (hasPunchIn) {
      if (hasPunchOut) {
        return {
          ok: false,
          message: "Punch-in is not allowed. Today's attendance is already completed (punch-in and punch-out are done).",
        };
      }

      if (hasActiveBreak) {
        return {
          ok: false,
          message: "Punch-in is not allowed. A break is in progress. Please end the break or punch out first.",
        };
      }

      return {
        ok: false,
        message: "Punch-in is not allowed. Employee has already punched in today. Please select punch out or break start.",
      };
    }

    if (hasActiveBreak) {
      return {
        ok: false,
        message: "Punch-in is not allowed. A break is in progress. Please end the break first.",
      };
    }

    const weekendStatus = weekendInfo(attendance_date, weekends);
    if (weekendStatus?.is_weekend) {
      return {
        ok: false,
        message: "Punch-in is not allowed. Today is marked as a weekend for this employee.",
      };
    }

    const [[holiday]] = await conn.query(ATTENDANCE_QUERY.GET_HOLIDAY_SIMPLE, [company_id, attendance_date]);

    if (holiday) {
      return {
        ok: false,
        message: "Punch-in is not allowed. Today is a company holiday.",
      };
    }

    return { ok: true };
  }

  if (punchType === "punch_out") {
    if (!hasPunchIn) {
      return {
        ok: false,
        message: "Punch-out is not allowed. Employee has not punched in today. Please punch in first.",
      };
    }

    if (hasPunchOut) {
      return {
        ok: false,
        message: "Punch-out is not allowed. Employee has already punched out for today.",
      };
    }

    if (hasActiveBreak) {
      return {
        ok: false,
        message: "Punch-out is not allowed. A break is still active. Please end the break before punching out.",
      };
    }

    return { ok: true };
  }

  if (punchType === "break_start") {
    if (!hasPunchIn) {
      return {
        ok: false,
        message: "Break start is not allowed. Employee has not punched in today. Please punch in first.",
      };
    }

    if (hasPunchOut) {
      return {
        ok: false,
        message: "Break start is not allowed. Employee has already punched out for today.",
      };
    }

    if (hasActiveBreak) {
      return {
        ok: false,
        message: "Break start is not allowed. A break is already in progress. Please end the current break first.",
      };
    }

    return { ok: true };
  }

  if (punchType === "break_end") {
    if (!hasPunchIn) {
      return {
        ok: false,
        message: "Break end is not allowed. Employee has not punched in today. Please punch in first.",
      };
    }

    if (hasPunchOut) {
      return {
        ok: false,
        message: "Break end is not allowed. Employee has already punched out for today.",
      };
    }

    if (!hasActiveBreak) {
      return {
        ok: false,
        message: "Break end is not allowed. No active break found. Please start a break first.",
      };
    }

    return { ok: true };
  }

  return {
    ok: false,
    message: "Invalid attendance type. Use punch in, punch out, break start, or break end.",
  };
};

const verifyEmployeeFaceMatch = async (companyId, imageUrl, faceEmployeeUserId) => {
  const { data } = await axios.post(`${FACE_SERVICE_URL}/check`, { company_id: companyId, image: imageUrl, employee_id: faceEmployeeUserId });

  if (!data?.success) {
    const err = new Error(data?.message || "Face does not match");
    err.statusCode = String(data?.message || "").toLowerCase().includes("not found") ? 404 : 400;
    throw err;
  }

  const matchedUserId = safeNumber(data?.employee_id, 0);
  if (matchedUserId !== faceEmployeeUserId) {
    const err = new Error("Face does not match the selected employee");
    err.statusCode = 400;
    throw err;
  }

  return data;
};

const fetchEmployeeForFaceAttendance = async (conn, company_id, employeeRef) => {
  const ref = safeNumber(employeeRef, 0);
  if (!ref) {
    return null;
  }

  const [rows] = await conn.query(ATTENDANCE_QUERY.GET_EMPLOYEE_FACE_ATTENDANCE, [company_id, ref, ref]);

  return rows?.[0] || null;
};

/**
 * Helper to validate approved half-day leave against actual punch/work times.
 */
async function validateHalfDayLeave(conn, {
  leave = null,
  company_id,
  employee_id,
  attendance_date,
  start_time = null,
  end_time = null,
  shift_start = null,
  shift_end = null,
  grace_minutes = 0,
  user_id = null
}) {
  let targetLeave = leave;

  if (!targetLeave) {
    const [[foundLeave]] = await conn.query(ATTENDANCE_QUERY.GET_APPROVED_LEAVE, [employee_id, company_id, attendance_date]);
    targetLeave = foundLeave || null;
  }

  if (!targetLeave) {
    return { valid: true, day_status: "present", half_day_type: null, leave: null };
  }

  if (Number(targetLeave.is_half_day) !== 1) {
    return { valid: true, day_status: "present", half_day_type: null, leave: targetLeave };
  }

  const sStart = parseTime(shift_start, "HH:mm:ss");
  const sEnd = parseTime(shift_end, "HH:mm:ss");

  if (!sStart || !sEnd) {
    return { valid: true, day_status: "half_day", half_day_type: targetLeave.half_day_type || null, leave: targetLeave };
  }

  const totalShiftMinutes = diffMinutes(sStart, sEnd);
  const halfShiftMinutes = Math.floor(totalShiftMinutes / 2);
  const shiftMidTime = addMinutesToTime(sStart, halfShiftMinutes);

  const grace = safeNumber(grace_minutes, 0);

  const pStart = start_time ? parseTime(start_time, "HH:mm:ss") : null;
  const pEnd = end_time ? parseTime(end_time, "HH:mm:ss") : null;

  let isValid = true;
  const halfDayType = targetLeave.half_day_type || "first_half";

  if (halfDayType === "first_half") {
    if (pStart) {
      const earliestAllowedStart = addMinutesToTime(shiftMidTime, -grace);
      if (pStart < earliestAllowedStart) {
        isValid = false;
      }
    }
  } else if (halfDayType === "second_half") {
    if (pStart && pStart >= shiftMidTime) {
      isValid = false;
    }
    if (pEnd) {
      const latestAllowedEnd = addMinutesToTime(shiftMidTime, grace);
      if (pEnd > latestAllowedEnd) {
        isValid = false;
      }
    }
  }

  if (isValid) {
    return { valid: true, day_status: "half_day", half_day_type: halfDayType, leave: targetLeave };
  }

  const leaveConfigId = targetLeave.leave_config_id;
  const origDays = Number(targetLeave.total_days || 0.5);
  const leaveYear = getYearFromDate(targetLeave.start_date) || new Date().getFullYear();

  if (leaveConfigId && origDays > 0) {
    await adjustEmployeeLeaveBalance({
      conn,
      company_id,
      employee_id,
      leave_config_id: leaveConfigId,
      year: leaveYear,
      days: origDays,
      mode: "restore",
      user_id
    });
  }

  await conn.query(ATTENDANCE_QUERY.CANCEL_EMPLOYEE_LEAVE, [user_id, targetLeave.id]);

  return { valid: false, day_status: "present", half_day_type: null, leave_cancelled: true, leave: targetLeave };
}

/**
 * Process approved leave splitting & balance restoration when employee punches out on a leave date.
 */
async function handleApprovedLeaveOnPunchOut(conn, {
  leave,
  employee_id,
  company_id,
  attendance_date,
  user_id,
  start_time = null,
  end_time = null,
  shift_start = null,
  shift_end = null,
  grace_minutes = 0
}) {
  if (!leave) return { day_status: "present", half_day_type: null };

  if (Number(leave.is_half_day) === 1) {
    return await validateHalfDayLeave(conn, {
      leave,
      company_id,
      employee_id,
      attendance_date,
      start_time,
      end_time,
      shift_start,
      shift_end,
      grace_minutes,
      user_id
    });
  }

  const origStartDate = formatIST(leave.start_date, "YYYY-MM-DD");
  const origEndDate = formatIST(leave.end_date, "YYYY-MM-DD");
  const attDate = formatIST(attendance_date, "YYYY-MM-DD");

  const origDays = Number(leave.total_days || 0);
  const leaveConfigId = leave.leave_config_id;
  const leaveYear = getYearFromDate(origStartDate);

  // 1. Restore original leave balance
  if (leaveConfigId && origDays > 0) {
    await adjustEmployeeLeaveBalance({
      conn,
      company_id,
      employee_id,
      leave_config_id: leaveConfigId,
      year: leaveYear,
      days: origDays,
      mode: "restore",
      user_id
    });
  }

  // 2. Cancel original leave
  await conn.query(ATTENDANCE_QUERY.CANCEL_EMPLOYEE_LEAVE, [user_id, leave.id]);

  const attDay = parseDate(attDate);
  const prevDateStr = attDay.subtract(1, "day").format("YYYY-MM-DD");
  const nextDateStr = attDay.add(1, "day").format("YYYY-MM-DD");

  const calculateSegmentDays = async (sDate, eDate) => {
    if (isDateAfter(sDate, eDate)) return 0;
    const [empRows] = await conn.query(ATTENDANCE_QUERY.GET_EMPLOYEE_WEEKENDS, [employee_id, company_id]);
    const weekends = empRows[0]?.weekends || null;

    const [holidayRows] = await conn.query(ATTENDANCE_QUERY.GET_RANGE_HOLIDAYS, [company_id, sDate, eDate]);
    const holidaySet = new Set(holidayRows.map((h) => formatIST(h.date, "YYYY-MM-DD")));

    let total = 0;
    eachDateBetween(sDate, eDate, (dStr) => {
      const isHoliday = holidaySet.has(dStr);
      const wInfo = weekendInfo(dStr, weekends);
      if (!isHoliday && !(wInfo?.is_weekend || wInfo?.isWeekend)) {
        total += 1;
      }
    });
    return Number(total.toFixed(2));
  };

  // 3. Segment 1: origStartDate -> prevDateStr
  if (!isDateAfter(origStartDate, prevDateStr)) {
    const seg1Days = await calculateSegmentDays(origStartDate, prevDateStr);
    if (seg1Days > 0) {
      const [insertRes1] = await conn.query(ATTENDANCE_QUERY.COPY_LEAVE_SEGMENT, [origStartDate, prevDateStr, seg1Days, user_id, leave.id]);

      const newLeaveId1 = insertRes1.insertId;

      await conn.query(ATTENDANCE_QUERY.COPY_LEAVE_ATTACHMENTS, [newLeaveId1, user_id, leave.id]);

      if (leaveConfigId) {
        await adjustEmployeeLeaveBalance({
          conn,
          company_id,
          employee_id,
          leave_config_id: leaveConfigId,
          year: getYearFromDate(origStartDate),
          days: seg1Days,
          mode: "deduct",
          user_id
        });
      }
    }
  }

  // 4. Segment 2: nextDateStr -> origEndDate
  if (!isDateAfter(nextDateStr, origEndDate)) {
    const seg2Days = await calculateSegmentDays(nextDateStr, origEndDate);
    if (seg2Days > 0) {
      const [insertRes2] = await conn.query(ATTENDANCE_QUERY.COPY_LEAVE_SEGMENT, [nextDateStr, origEndDate, seg2Days, user_id, leave.id]);

      const newLeaveId2 = insertRes2.insertId;

      await conn.query(ATTENDANCE_QUERY.COPY_LEAVE_ATTACHMENTS, [newLeaveId2, user_id, leave.id]);

      if (leaveConfigId) {
        await adjustEmployeeLeaveBalance({
          conn,
          company_id,
          employee_id,
          leave_config_id: leaveConfigId,
          year: getYearFromDate(nextDateStr),
          days: seg2Days,
          mode: "deduct",
          user_id
        });
      }
    }
  }

  return { day_status: "present", half_day_type: null };
}

// Core Attendance Transaction Handlers
async function executePunchOut(conn, {
  employee_id,
  company_id,
  attendance_date,
  end_time,
  user_id,
  is_verified,
  verified_by,
  verify_date,
  shift_start,
  shift_end,
  grace_minutes,
  method,
  ip_address = null,
  parsedLatitude = null,
  parsedLongitude = null
}) {
  const [[attendance]] = await conn.query(ATTENDANCE_QUERY.GET_MAIN_ATTENDANCE_PUNCH_OUT_LOCK, [employee_id, company_id, attendance_date]);
  if (!attendance) {
    throw new Error("No attendance found");
  }

  if (attendance.end_time) {
    throw new Error("Already punched out");
  }

  if (String(end_time) <= String(attendance.start_time)) {
    throw new Error("Punch-out time must be after punch-in");
  }

  const [[activeBreak]] = await conn.query(ATTENDANCE_QUERY.GET_ACTIVE_BREAK_LOCK, [employee_id, company_id, attendance_date]);
  if (activeBreak) {
    throw new Error("Break session still active");
  }

  let day_status = "present";
  let value1 = null;

  const [[leave]] = await conn.query(ATTENDANCE_QUERY.GET_APPROVED_LEAVE, [employee_id, company_id, attendance_date]);

  if (leave && leave.is_half_day === 1) {
    const leaveRes = await validateHalfDayLeave(conn, {
      leave,
      company_id,
      employee_id,
      attendance_date,
      start_time,
      end_time,
      shift_start,
      shift_end,
      grace_minutes,
      user_id
    });
    day_status = leaveRes.day_status;
    value1 = leaveRes.half_day_type;
  }

  const [updateResult] = await conn.query(ATTENDANCE_QUERY.UPDATE_ATTENDANCE_PUNCH_OUT, [
    end_time, day_status, value1, is_verified, verified_by, verify_date, 1, attendance.id
  ]);

  if (Number(updateResult.affectedRows) !== 1) {
    throw new Error("Failed to complete punch-out");
  }

  await createAttendanceLog(conn, {
    attendance_id: attendance.id,
    log_type: "end",
    method,
    time: end_time,
    ip_address: method === "ip" ? ip_address : null,
    latitude: method === "gps" ? parsedLatitude : null,
    longitude: method === "gps" ? parsedLongitude : null,
    status: 1,
    created_by: user_id,
    updated_by: user_id
  });

  await createAttendanceLog(conn, {
    attendance_id: attendance.id,
    log_type: "day_status",
    method: "emp_cre",
    time: end_time,
    extra_data: { day_status },
    status: 1,
    created_by: user_id,
    updated_by: user_id
  });

  await generateShift(conn, employee_id, company_id, attendance_date, user_id);

  if (is_verified) {
    const existingPayroll = await payrollExists({ conn, companyId: company_id, employeeId: employee_id });
    if (existingPayroll) {
      await upsertPayroll({ conn, companyId: company_id, employeeId: employee_id, createdBy: user_id });
    }
  }

  return { attendance_id: attendance.id, day_status };
}

async function executeBreakIn(conn, {
  employee_id,
  company_id,
  attendance_date,
  break_time,
  user_id,
  is_verified,
  verified_by,
  verify_date,
  method,
  ip_address = null,
  parsedLatitude = null,
  parsedLongitude = null
}) {
  const [[mainAttendance]] = await conn.query(ATTENDANCE_QUERY.GET_MAIN_ATTENDANCE_PUNCH_OUT_LOCK, [employee_id, company_id, attendance_date]);
  if (!mainAttendance) {
    throw new Error("Punch-in required before break");
  }

  if (mainAttendance.end_time) {
    throw new Error("Cannot start break after punch-out");
  }

  if (break_time <= mainAttendance.start_time) {
    throw new Error("Invalid break time");
  }

  const [[activeBreak]] = await conn.query(ATTENDANCE_QUERY.GET_ACTIVE_BREAK_LOCK, [employee_id, company_id, attendance_date]);
  if (activeBreak) {
    throw new Error("Break already active");
  }

  const [breakResult] = await conn.query(ATTENDANCE_QUERY.INSERT_BREAK, [
    employee_id,
    company_id,
    attendance_date,
    break_time,
    is_verified,
    verified_by,
    verify_date,
    Number(mainAttendance.is_deductible) || 0,
    Number(mainAttendance.is_overtime) || 0,
    mainAttendance.day_status,
    mainAttendance.value1 || null,
    mainAttendance.value2 || null,
    user_id
  ]);

  const attendance_id = Number(breakResult.insertId);

  await createAttendanceLog(conn, {
    attendance_id,
    log_type: "start",
    method,
    time: break_time,
    ip_address: method === "ip" ? ip_address : null,
    latitude: method === "gps" ? parsedLatitude : null,
    longitude: method === "gps" ? parsedLongitude : null,
    status: 1,
    created_by: user_id,
    updated_by: user_id
  });

  return { attendance_id };
}

async function executeBreakOut(conn, {
  employee_id,
  company_id,
  attendance_date,
  end_time,
  user_id,
  is_verified,
  verified_by,
  verify_date,
  method,
  ip_address = null,
  parsedLatitude = null,
  parsedLongitude = null
}) {
  const [[mainAttendance]] = await conn.query(ATTENDANCE_QUERY.GET_MAIN_ATTENDANCE_BREAK_OUT, [employee_id, company_id, attendance_date]);
  if (!mainAttendance) {
    throw new Error("Punch-in required before break-out");
  }

  if (mainAttendance.end_time) {
    throw new Error("Cannot end break after punch-out");
  }

  const [[openBreak]] = await conn.query(ATTENDANCE_QUERY.GET_OPEN_BREAK_LOCK, [employee_id, company_id, attendance_date]);
  if (!openBreak) {
    throw new Error("No active break found");
  }

  if (end_time <= openBreak.start_time) {
    throw new Error("Invalid break end time");
  }

  await conn.query(ATTENDANCE_QUERY.UPDATE_BREAK_END, [end_time, is_verified, verified_by, verify_date, openBreak.id]);

  await createAttendanceLog(conn, {
    attendance_id: openBreak.id,
    log_type: "end",
    method,
    time: end_time,
    ip_address: method === "ip" ? ip_address : null,
    latitude: method === "gps" ? parsedLatitude : null,
    longitude: method === "gps" ? parsedLongitude : null,
    status: 1,
    created_by: user_id,
    updated_by: user_id
  });

  return { attendance_id: openBreak.id };
}

// =============================================================================
// ENDPOINTS
// =============================================================================

// Route 1: POST /punch-in
router.post("/punch-in", auth(AT.EMP, { employee_only: true }), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const { attendance_method, latitude, longitude } = req.body;
    const user_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);
    const ip_address = getClientMeta(req)?.ip_v4?.trim() || null;

    const attendance_date = getCurrentDate();
    const start_time = getCurrentTime();

    const { employee, leave, parsedMethod, parsedLatitude, parsedLongitude } =
      await validateAttendanceCommon(conn, {
        user_id,
        company_id,
        attendance_date,
        attendance_method,
        latitude,
        longitude,
        ip_address
      });

    const employee_id = Number(employee.id);

    const [[existingAttendance]] = await conn.query(ATTENDANCE_QUERY.GET_EXISTING_ATTENDANCE_LOCK, [employee_id, company_id, attendance_date]);
    if (existingAttendance) {
      throw new Error("Already punched in today");
    }

    const is_verified = Number(employee.is_auto) === 1 ? 1 : 0;
    const verified_by = is_verified === 1 ? user_id : null;
    const verify_date = is_verified === 1 ? new Date() : null;

    let day_status = leave && Number(leave.is_half_day) === 1 ? "half_day" : "present";

    const [attendanceResult] = await conn.query(ATTENDANCE_QUERY.INSERT_ATTENDANCE_PUNCH_IN, [
      employee_id, company_id, attendance_date, start_time, is_verified, verified_by, verify_date, day_status, user_id
    ]);

    const attendance_id = Number(attendanceResult.insertId);

    await createAttendanceLog(conn, {
      attendance_id,
      log_type: "start",
      method: parsedMethod,
      time: start_time,
      ip_address: parsedMethod === "ip" ? ip_address : null,
      latitude: parsedMethod === "gps" ? parsedLatitude : null,
      longitude: parsedMethod === "gps" ? parsedLongitude : null,
      status: 1,
      created_by: user_id,
      updated_by: user_id
    });

    await conn.commit();

    return sendSuccess(res, 201, "Punch-in successful");
  } catch (error) {
    if (conn) {
      await conn.rollback();
    }

    console.error("Punch-in Error:", error);

    return sendError(res, 400, error.message || "Punch-in failed");
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

// Route 2: POST /punch-out
router.post("/punch-out", auth(AT.EMP, { employee_only: true }), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const { attendance_method, latitude, longitude } = req.body;
    const user_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);
    const ip_address = getClientMeta(req)?.ip_v4?.trim() || null;

    const attendance_date = getCurrentDate();
    const end_time = getCurrentTime();

    const { employee, parsedMethod, parsedLatitude, parsedLongitude } =
      await validateAttendanceCommon(conn, {
        user_id,
        company_id,
        attendance_date,
        attendance_method,
        latitude,
        longitude,
        ip_address
      });

    const employee_id = Number(employee.id);

    const is_verified = Number(employee.is_auto) === 1 ? 1 : 0;
    const verified_by = is_verified === 1 ? user_id : null;
    const verify_date = is_verified === 1 ? new Date() : null;

    await executePunchOut(conn, {
      employee_id,
      company_id,
      attendance_date,
      end_time,
      user_id,
      is_verified,
      verified_by,
      verify_date,
      shift_start: employee.shift_start,
      shift_end: employee.shift_end,
      grace_minutes: employee.grace_minutes,
      method: parsedMethod,
      ip_address,
      parsedLatitude,
      parsedLongitude
    });

    await conn.commit();

    return sendSuccess(res, 200, "Punch-out successful");
  } catch (error) {
    if (conn) {
      await conn.rollback();
    }

    console.error("Punch-out Error:", error);

    return sendError(res, 400, error.message || "Punch-out failed");
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

// Route 3: POST /break-in
router.post("/break-in", auth(AT.EMP, { employee_only: true }), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const { attendance_method, latitude, longitude } = req.body;
    const user_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);
    const ip_address = getClientMeta(req)?.ip_v4?.trim() || null;

    const attendance_date = getCurrentDate();
    const break_time = getCurrentTime();

    const { employee, parsedMethod, parsedLatitude, parsedLongitude } =
      await validateAttendanceCommon(conn, {
        user_id,
        company_id,
        attendance_date,
        attendance_method,
        latitude,
        longitude,
        ip_address
      });

    const employee_id = Number(employee.id);

    const is_verified = 1;
    const verified_by = is_verified === 1 ? user_id : null;
    const verify_date = is_verified === 1 ? new Date() : null;

    await executeBreakIn(conn, {
      employee_id,
      company_id,
      attendance_date,
      break_time,
      user_id,
      is_verified,
      verified_by,
      verify_date,
      method: parsedMethod,
      ip_address,
      parsedLatitude,
      parsedLongitude
    });

    await conn.commit();

    return sendSuccess(res, 201, "Break started successfully");
  } catch (error) {
    if (conn) {
      await conn.rollback();
    }

    console.error("Break-in Error:", error);

    return sendError(res, 400, error.message || "Break start failed");
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

// Route 4: POST /break-out
router.post("/break-out", auth(AT.EMP, { employee_only: true }), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const { attendance_method, latitude, longitude } = req.body;
    const user_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);
    const ip_address = getClientMeta(req)?.ip_v4?.trim() || null;

    const attendance_date = getCurrentDate();
    const end_time = getCurrentTime();

    const { employee, parsedMethod, parsedLatitude, parsedLongitude } =
      await validateAttendanceCommon(conn, {
        user_id,
        company_id,
        attendance_date,
        attendance_method,
        latitude,
        longitude,
        ip_address
      });

    const employee_id = Number(employee.id);

    const is_verified = 1;
    const verified_by = is_verified === 1 ? user_id : null;
    const verify_date = is_verified === 1 ? new Date() : null;

    await executeBreakOut(conn, {
      employee_id,
      company_id,
      attendance_date,
      end_time,
      user_id,
      is_verified,
      verified_by,
      verify_date,
      method: parsedMethod,
      ip_address,
      parsedLatitude,
      parsedLongitude
    });

    await conn.commit();

    return sendSuccess(res, 200, "Break ended successfully");
  } catch (error) {
    if (conn) {
      await conn.rollback();
    }

    console.error("Break-out Error:", error);

    return sendError(res, 400, error.message || "Break end failed");
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

// Route 5: POST /face-attendance-check
router.post("/face-attendance-check", auth(AT.MNG), async (req, res) => {
  let conn;

  try {
    const company_id = safeNumber(req.company?.id, 0);
    const punchType = normalizeFaceAttendanceType(req.body?.type);
    const imageUrl = String(req.body?.image || "").trim();
    const typeLabel = String(req.body?.type || "").trim();

    if (!company_id) {
      return sendError(res, 401, "Unauthorized");
    }

    if (!punchType) {
      return sendError(res, 400, 'Valid type required: "punch in", "punch out", "break start", or "break end"');
    }

    if (!imageUrl) {
      return sendError(res, 400, "Valid image URL required");
    }

    conn = await db.getConnection();

    const faceResult = await runFaceCheck(conn, { companyId: company_id, imageUrl, employeeId: 0 });

    if (!faceResult.success) {
      return sendError(res, faceResult.statusCode, faceResult.message, faceResult.responseData);
    }

    const employee = await fetchEmployeeForFaceAttendance(conn, company_id, faceResult.responseData.employee_id);

    if (!employee) {
      return sendError(res, 404, "Employee not found", faceResult.responseData);
    }
    const [[faceRow]] = await conn.query(ATTENDANCE_QUERY.GET_EMPLOYEE_FACE_DATA, [employee.id, company_id]);

    if (!faceRow || Number(faceRow.face_enrolled) !== 1 || !faceRow.face_data) {
      return sendError(res, 400, "Face enrollment is not set for this employee", faceResult.responseData);
    }

    const validation = await validateFaceAttendanceType(conn, company_id, employee.id, employee.weekends, punchType);

    const responseData = {
      ...faceResult.responseData,
      type: typeLabel || faceAttendanceTypeLabel(punchType),
      allowed: validation.ok,
    };

    if (!validation.ok) {
      return sendError(res, 400, validation.message, responseData);
    }

    return sendSuccess(res, 200, faceResult.message || "Face matched", responseData);
  } catch (error) {
    console.error("[FACE_ATTENDANCE_CHECK_ERROR]", error);
    const message = error?.response?.data?.message || error?.message || "Failed to check face attendance";
    return sendError(res, 400, message);
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

// Route 6: POST /face-attendance
router.post("/face-attendance", auth(AT.MNG), async (req, res) => {
  let conn;
  let transactionActive = false;

  const rollback = async () => {
    try {
      if (conn && transactionActive) {
        await conn.rollback();
        transactionActive = false;
      }
    } catch (error) {
      console.error("[FACE_ATTENDANCE_ROLLBACK_ERROR]", error);
    }
  };

  const fail = async (statusCode, message, errors = null) => {
    await rollback();
    return sendError(res, statusCode, message, errors);
  };

  try {
    const company_id = safeNumber(req.company?.id, 0);
    const manager_user_id = safeNumber(req.user?.id, 0);

    if (!company_id || !manager_user_id) {
      return sendError(res, 401, "Unauthorized");
    }

    const punchType = normalizeFaceAttendanceType(req.body?.type);
    const imageUrl = String(req.body?.image || "").trim();
    const employeeRef = safeNumber(req.body?.employee_id, 0);

    if (!punchType) {
      return sendError(res, 400, 'Valid type required: "punch in", "punch out", "break start", or "break end"');
    }

    if (!imageUrl) {
      return sendError(res, 400, "Valid image URL required");
    }

    if (!employeeRef || employeeRef <= 0) {
      return sendError(res, 400, "Valid employee_id required");
    }

    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    const employee = await fetchEmployeeForFaceAttendance(conn, company_id, employeeRef);

    if (!employee) {
      return await fail(404, "Employee not found");
    }

    const employee_id = safeNumber(employee.id, 0);
    const face_user_id = safeNumber(employee.user_id, 0);

    const [[faceRow]] = await conn.query(ATTENDANCE_QUERY.GET_EMPLOYEE_FACE_DATA, [employee_id, company_id]);

    if (!faceRow || Number(faceRow.face_enrolled) !== 1 || !faceRow.face_data) {
      return await fail(400, "Face enrollment is not set for this employee");
    }

    await verifyEmployeeFaceMatch(company_id, imageUrl, face_user_id);

    const typeValidation = await validateFaceAttendanceType(conn, company_id, employee_id, employee.weekends, punchType);

    if (!typeValidation.ok) {
      return await fail(400, typeValidation.message);
    }

    const attendance_date = getCurrentDate();
    const event_time = getCurrentTime();
    const verified_by = manager_user_id;
    const verify_date = new Date();

    if (punchType === "punch_in") {
      const [attendanceResult] = await conn.query(ATTENDANCE_QUERY.INSERT_FACE_PUNCH_IN, [employee_id, company_id, attendance_date, event_time, manager_user_id]);

      const attendance_id = Number(attendanceResult.insertId);

      await createAttendanceLog(conn, { attendance_id, log_type: "start", method: FACE_ATTENDANCE_METHOD, time: event_time, status: 1, created_by: manager_user_id, updated_by: manager_user_id });

      await conn.commit();
      transactionActive = false;

      return sendSuccess(res, 201, "Punch-in successful", { type: "punch in", employee_id: face_user_id, attendance_id, attendance_date, time: event_time });
    }

    if (punchType === "punch_out") {
      const { attendance_id, day_status } = await executePunchOut(conn, {
        employee_id,
        company_id,
        attendance_date,
        end_time: event_time,
        user_id: manager_user_id,
        is_verified: 1,
        verified_by,
        verify_date,
        shift_start: employee.shift_start,
        shift_end: employee.shift_end,
        grace_minutes: employee.grace_minutes,
        method: FACE_ATTENDANCE_METHOD
      });

      await conn.commit();
      transactionActive = false;

      return sendSuccess(res, 200, "Punch-out successful", { type: "punch out", employee_id: face_user_id, attendance_id, attendance_date, time: event_time, day_status });
    }

    if (punchType === "break_start") {
      const { attendance_id } = await executeBreakIn(conn, {
        employee_id,
        company_id,
        attendance_date,
        break_time: event_time,
        user_id: manager_user_id,
        is_verified: 1,
        verified_by,
        verify_date,
        method: FACE_ATTENDANCE_METHOD
      });

      await conn.commit();
      transactionActive = false;

      return sendSuccess(res, 201, "Break started successfully", { type: "break start", employee_id: face_user_id, attendance_id, attendance_date, time: event_time });
    }

    if (punchType === "break_end") {
      const { attendance_id } = await executeBreakOut(conn, {
        employee_id,
        company_id,
        attendance_date,
        end_time: event_time,
        user_id: manager_user_id,
        is_verified: 1,
        verified_by,
        verify_date,
        method: FACE_ATTENDANCE_METHOD
      });

      await conn.commit();
      transactionActive = false;

      return sendSuccess(res, 200, "Break ended successfully", {
        type: "break end",
        employee_id: face_user_id,
        attendance_id,
        attendance_date,
        time: event_time,
      });
    }

    return await fail(400, "Invalid attendance type");
  } catch (error) {
    await rollback();
    console.error("[FACE_ATTENDANCE_ERROR]", error);

    const status = error?.statusCode || (error?.response ? 400 : 500);
    const message = error?.response?.data?.message || error?.message || "Face attendance failed";

    return sendError(res, status, message);
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

// Route 7: PUT /approve
router.put("/approve", auth(AT.MNG), async (req, res) => {
  let conn;

  try {
    const user_id = req.user?.id;
    const company_id = req.company?.id;

    let { employee_ids = [], attendance_date, mode = "actual", half_day_type = null, leave_type = null, leave_type_value = null, notes = null } = req.body;

    if (employee_ids === "all") {
      employee_ids = [];
    } else {
      if (!Array.isArray(employee_ids) || employee_ids.some((id) => !Number.isInteger(Number(id)))) {
        return sendError(res, 400, "employee_ids must be an array of ids or the string 'all'");
      }
      employee_ids = employee_ids.map(Number);
    }

    const allowedModes = ["actual", "present", "leave", "absent", "half_day"];
    const allowedHalfDayTypes = ["first_half", "second_half"];
    const allowedLeaveTypes = ["paid", "unpaid"];
    const systemPaidLeaveValues = ["weekend", "holiday"];

    if (!attendance_date) {
      return sendError(res, 400, "attendance_date is required");
    }

    if (!allowedModes.includes(mode)) {
      return sendError(res, 400, "Invalid mode");
    }

    if (mode === "half_day" && !allowedHalfDayTypes.includes(half_day_type)) {
      return sendError(res, 400, "half_day_type must be first_half or second_half");
    }

    if (mode === "leave") {
      if (!allowedLeaveTypes.includes(leave_type)) {
        return sendError(res, 400, "leave_type must be paid or unpaid");
      }
      if (leave_type === "paid" && !leave_type_value) {
        return sendError(res, 400, "leave_type_value is required for paid leave");
      }
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    if (mode === "leave" && leave_type === "paid" && !systemPaidLeaveValues.includes(leave_type_value)) {
      const [leaveConfigs] = await conn.query(ATTENDANCE_QUERY.GET_PAID_LEAVE_CONFIG, [company_id, leave_type_value]);
      if (!leaveConfigs.length) {
        await conn.rollback();
        return sendError(res, 400, "Invalid paid leave_type_value");
      }
    }

    let employeeQuery = `
      SELECT
        e.id, e.company_id, e.shift_start, e.shift_end,
        e.break_minutes, e.expected_work_minutes, e.weekends, e.status
      FROM employees e
      WHERE e.company_id = ? AND e.is_deleted = 0 AND e.is_active = 1
    `;
    const queryParams = [company_id];
    if (employee_ids.length > 0) {
      employeeQuery += ` AND e.id IN (?)`;
      queryParams.push(employee_ids);
    }

    const [employees] = await conn.query(employeeQuery, queryParams);
    if (!employees.length) {
      await conn.rollback();
      return sendError(res, 404, "No employees found");
    }

    if (employee_ids.length > 0 && employees.length !== employee_ids.length) {
      await conn.rollback();
      return sendError(res, 400, "Some employee_ids are invalid");
    }

    const employeeIdList = employees.map((emp) => emp.id);

    const [attendanceRows] = await conn.query(ATTENDANCE_QUERY.GET_ATTENDANCE_APPROVE_LOCK, [company_id, attendance_date, employeeIdList]);

    const attendanceMap = new Map();
    for (const row of attendanceRows) {
      if (!attendanceMap.has(row.employee_id)) {
        attendanceMap.set(row.employee_id, row);
      }
    }

    const employeesWithoutShift = [];
    for (const emp of employees) {
      const shiftStart = normalizeTime(emp.shift_start);
      const shiftEnd = normalizeTime(emp.shift_end);
      const existingRow = attendanceMap.get(emp.id);

      const hasStart = existingRow && normalizeTime(existingRow.start_time);
      const hasEnd = existingRow && normalizeTime(existingRow.end_time);

      const needsShiftStart = mode === "half_day" || (mode === "present" && !hasStart);
      const needsShiftEnd = mode === "half_day" || (mode === "present" && !hasEnd) || (mode === "actual" && hasStart && !hasEnd);

      if ((needsShiftStart && !shiftStart) || (needsShiftEnd && !shiftEnd)) {
        employeesWithoutShift.push(emp.id);
      }
    }

    if (employeesWithoutShift.length > 0) {
      await conn.rollback();
      return sendError(res, 400, "Required employee shift_start or shift_end is missing", { employee_ids: employeesWithoutShift });
    }

    const now = getISTNow().format("YYYY-MM-DD HH:mm:ss");
    const logTime = now.slice(11, 19);
    const absentEmployeeIds = [];
    const processedIds = [];

    for (const emp of employees) {
      const existingRow = attendanceMap.get(emp.id);

      const shiftStart = normalizeTime(emp.shift_start);
      const shiftEnd = normalizeTime(emp.shift_end);

      let earliestStart = existingRow ? normalizeTime(existingRow.start_time) : null;
      let latestEnd = existingRow ? normalizeTime(existingRow.end_time) : null;

      let start_time = null;
      let end_time = null;
      let day_status = "present";
      let value1 = null;
      let value2 = null;

      if (mode === "actual") {
        if (earliestStart && latestEnd) {
          start_time = earliestStart;
          end_time = latestEnd;
        } else if (earliestStart && !latestEnd) {
          start_time = earliestStart;
          end_time = shiftEnd;
          notes = "system_given";
        } else {
          day_status = "absent";
          notes = "system_given";
          absentEmployeeIds.push(emp.id);
        }
      } else if (mode === "present") {
        if (earliestStart && latestEnd) {
          start_time = earliestStart;
          end_time = latestEnd;
        } else if (earliestStart && !latestEnd) {
          start_time = earliestStart;
          end_time = shiftEnd;
          notes = "system_given";
        } else {
          start_time = shiftStart;
          end_time = shiftEnd;
          notes = "system_given";
        }
      } else if (mode === "half_day") {
        const midpoint = getShiftMidpoint(shiftStart, shiftEnd);
        if (half_day_type === "first_half") {
          start_time = shiftStart;
          end_time = midpoint;
        } else {
          start_time = midpoint;
          end_time = shiftEnd;
        }
        day_status = "half_day";
        notes = "system_given";
        value1 = half_day_type;
      } else if (mode === "leave") {
        start_time = null;
        end_time = null;
        day_status = "leave";
        value1 = leave_type;
        value2 = leave_type === "paid" ? leave_type_value : null;
      } else if (mode === "absent") {
        start_time = null;
        end_time = null;
        day_status = "absent";
        notes = "system_given";
        absentEmployeeIds.push(emp.id);
      }

      if ((mode === "actual" || mode === "present") && day_status === "present" && start_time) {
        const [[leave]] = await conn.query(ATTENDANCE_QUERY.GET_APPROVED_LEAVE, [emp.id, company_id, attendance_date]);
        if (leave) {
          const leaveRes = await handleApprovedLeaveOnPunchOut(conn, {
            leave,
            employee_id: emp.id,
            company_id,
            attendance_date,
            user_id,
            start_time,
            end_time,
            shift_start: shiftStart,
            shift_end: shiftEnd,
            grace_minutes: emp.grace_minutes
          });
          const finalStatus = typeof leaveRes === "string" ? leaveRes : (leaveRes.day_status || "present");
          if (finalStatus === "half_day") {
            day_status = "half_day";
            value1 = (typeof leaveRes === "object" && leaveRes.half_day_type) || leave.half_day_type || null;
          }
        }
      }

      let attendanceId;
      if (existingRow) {
        await conn.query(ATTENDANCE_QUERY.UPDATE_ATTENDANCE_APPROVE, [start_time, end_time, day_status, value1, value2, user_id, now, notes, existingRow.id]);
        attendanceId = existingRow.id;
      } else {
        const [insertResult] = await conn.query(ATTENDANCE_QUERY.INSERT_ATTENDANCE_APPROVE, [
          emp.id, company_id, attendance_date, start_time, end_time, day_status, value1, value2, user_id, now, user_id, notes
        ]);
        attendanceId = insertResult.insertId;
      }

      const logMethod = "manual";
      if (start_time) {
        await createAttendanceLog(conn, { attendance_id: attendanceId, log_type: "start", method: logMethod, time: start_time, created_by: user_id, updated_by: user_id });
      }
      if (end_time) {
        await createAttendanceLog(conn, { attendance_id: attendanceId, log_type: "end", method: logMethod, time: end_time, created_by: user_id, updated_by: user_id });
      }
      await createAttendanceLog(conn, { attendance_id: attendanceId, log_type: "day_status", method: logMethod, time: logTime, created_by: user_id, updated_by: user_id });

      processedIds.push(emp.id);
    }

    const errors = [];

    for (const emp of employees) {
      try {
        await recalculateShiftAndPayroll(conn, company_id, emp.id, attendance_date, user_id);
      } catch (error) {
        errors.push({
          employee_id: emp.id,
          message: error.message,
        });
      }
    }

    await conn.commit();

    const uniqueAbsent = [...new Set(absentEmployeeIds)];
    return sendSuccess(res, 200, "Attendance approved successfully", {
      attendance_type: "attendance",
      mode,
      attendance_date,
      total_employees: employees.length,
      approved: processedIds.length,
      absent: uniqueAbsent.length,
      ...(uniqueAbsent.length > 0 && { absent_employee_ids: uniqueAbsent }),
      payroll_errors: errors,
    });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Attendance approve error:", err);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// Route 8: POST /mark
router.post("/mark", auth(AT.MNG), async (req, res) => {
  let conn;
  let transactionActive = false;

  const rollback = async () => {
    try {
      if (conn && transactionActive) {
        await conn.rollback();
        transactionActive = false;
      }
    } catch (error) {
      console.error("[ATTENDANCE_MARK_ROLLBACK_ERROR]", error);
    }
  };

  const fail = async (statusCode, message, errors = null) => {
    await rollback();
    return sendError(res, statusCode, message, errors);
  };

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    const company_id = safeNumber(req.company?.id, 0);
    const user_id = safeNumber(req.user?.id, 0);
    if (!company_id || !user_id) {
      return fail(401, "Unauthorized");
    }

    let {
      employee_id,
      date,
      type = "attendance",
      status = "present",
      start_time = null,
      end_time = null,
      is_deductible = false,
      is_overtime = false,
      half_day_type = null,
      leave_type = null,
      leave_type_value = null,
      leave_day_overtime = 0,
      notes = null,
      attendance_id = null,
    } = req.body;

    employee_id = safeNumber(employee_id, 0);
    date = String(date || "").trim();
    type = String(type || "").trim().toLowerCase();
    status = String(status || "").trim().toLowerCase();
    start_time = parseTime(start_time, "HH:mm:ss");
    end_time = parseTime(end_time, "HH:mm:ss");
    half_day_type = normalizeHalfDayType(half_day_type ? String(half_day_type).trim().toLowerCase() : null);
    leave_type = leave_type ? String(leave_type).trim().toLowerCase() : null;
    leave_type_value = leave_type_value ? String(leave_type_value).trim().toLowerCase() : null;
    notes = notes ? String(notes).trim() : null;
    if (typeof is_deductible !== "boolean") {
      return fail(400, "is_deductible must be a boolean (true/false)");
    }
    if (typeof is_overtime !== "boolean") {
      return fail(400, "is_overtime must be a boolean (true/false)");
    }

    const staticPaidLeaveValues = ["weekend", "holiday"];

    // Basic validations
    if (!employee_id || employee_id <= 0) return fail(400, "Valid employee_id required");
    if (!date) return fail(400, "date required");
    const parsedDate = parseDate(date);
    if (!parsedDate) return fail(400, "Invalid date");
    if (isDateAfter(date, getCurrentDate())) return fail(400, "Future attendance not allowed");
    if (!["attendance", "break"].includes(type)) return fail(400, "Invalid type");
    if (type === "attendance" && !["present", "half_day", "absent", "leave"].includes(status))
      return fail(400, "Invalid status");
    if (start_time && !parseTime(start_time)) return fail(400, "Invalid start_time");
    if (end_time && !parseTime(end_time)) return fail(400, "Invalid end_time");

    // Fetch employee (with lock)
    const [[employee]] = await conn.query(ATTENDANCE_QUERY.GET_EMPLOYEE_MARK, [employee_id, company_id]);
    if (!employee) return fail(404, "Employee not found");

    // Build DB columns based on type/status
    let db_day_status = "present";
    let db_value1 = null;
    let db_value2 = null;
    let db_value3 = null;

    if (type === "attendance") {
      if (status === "present") {
        if (!start_time || !end_time) return fail(400, "start_time and end_time required");
        if (diffMinutes(start_time, end_time) <= 0) return fail(400, "end_time must be greater than start_time");
        db_day_status = "present";
      } else if (status === "half_day") {
        if (!start_time || !end_time) return fail(400, "start_time and end_time required");
        if (diffMinutes(start_time, end_time) <= 0) return fail(400, "end_time must be greater than start_time");
        if (!["first_half", "second_half"].includes(half_day_type)) return fail(400, "Invalid half_day_type");

        db_day_status = "half_day";
        db_value1 = half_day_type;

        const shiftStart = parseTime(employee.shift_start, "HH:mm:ss");
        const shiftEnd = parseTime(employee.shift_end, "HH:mm:ss");
        if (shiftStart && shiftEnd) {
          const totalShiftMinutes = diffMinutes(shiftStart, shiftEnd);
          const halfShiftMinutes = Math.floor(totalShiftMinutes / 2);
          const shiftMidTime = addMinutesToTime(shiftStart, halfShiftMinutes);
          if (half_day_type === "first_half" && !is_overtime && end_time > shiftMidTime) {
            return fail(400, `For first_half, end_time must be before or equal to ${shiftMidTime} (unless overtime is set)`);
          }
          if (half_day_type === "second_half" && !is_overtime && start_time < shiftMidTime) {
            return fail(400, `For second_half, start_time must be after or equal to ${shiftMidTime} (unless overtime is set)`);
          }
        }
      } else if (status === "absent") {
        db_day_status = "absent";
      } else if (status === "leave") {
        db_day_status = "leave";
        if (!["paid", "unpaid"].includes(leave_type)) return fail(400, "leave_type must be paid or unpaid");
        db_value1 = leave_type;

        if (typeof leave_day_overtime !== "undefined" && !isNaN(leave_day_overtime) && leave_day_overtime !== null) {
          db_value3 = leave_day_overtime;
          is_overtime = true;
        }

        if (leave_type === "paid") {
          if (!staticPaidLeaveValues.includes(leave_type_value)) {
            const [leaveConfigs] = await conn.query(ATTENDANCE_QUERY.GET_PAID_LEAVE_CONFIG, [company_id, leave_type_value]);
            if (!leaveConfigs.length) {
              await conn.rollback();
              return sendError(res, 400, "Invalid paid leave_type_value");
            }
          }
          db_value2 = leave_type_value;
        }
      }
    }

    if (type === "attendance" && ["present", "half_day"].includes(status)) {
      const [[leave]] = await conn.query(ATTENDANCE_QUERY.GET_APPROVED_LEAVE, [employee_id, company_id, date]);
      if (leave) {
        const leaveRes = await handleApprovedLeaveOnPunchOut(conn, {
          leave,
          employee_id,
          company_id,
          attendance_date: date,
          user_id,
          start_time,
          end_time,
          shift_start: employee.shift_start,
          shift_end: employee.shift_end,
          grace_minutes: employee.grace_minutes
        });
        const finalStatus = typeof leaveRes === "string" ? leaveRes : (leaveRes.day_status || "present");
        if (finalStatus === "half_day") {
          db_day_status = "half_day";
          db_value1 = (typeof leaveRes === "object" && leaveRes.half_day_type) || leave.half_day_type || db_value1 || null;
        }
      }
    }

    if (type === "break") {
      status = null;
      is_deductible = false;
      is_overtime = false;
      db_value1 = null;
      db_value2 = null;
      db_value3 = null;

      if (!start_time && !end_time) return fail(400, "start_time or end_time required");
      if (start_time && end_time && diffMinutes(start_time, end_time) <= 0)
        return fail(400, "end_time must be greater than start_time");

      // Check for parent attendance
      const [[attendanceRow]] = await conn.query(ATTENDANCE_QUERY.GET_ATTENDANCE_MARK_PARENT, [employee_id, company_id, date]);
      if (!attendanceRow) return fail(400, "Attendance not found");
      if (!["present", "half_day"].includes(attendanceRow.day_status))
        return fail(400, "Break allowed only for present/half_day");

      db_day_status = attendanceRow.day_status;

      const attendanceStart = parseTime(attendanceRow.start_time, "HH:mm:ss");
      const attendanceEnd = parseTime(attendanceRow.end_time, "HH:mm:ss");

      if (start_time && attendanceStart && start_time < attendanceStart)
        return fail(400, "Break before attendance start");
      if (end_time && attendanceEnd && end_time > attendanceEnd)
        return fail(400, "Break exceeds attendance");
      if (start_time && attendanceEnd && start_time > attendanceEnd)
        return fail(400, "Break starts after attendance end");
    }

    // ---------------------- UPSERT LOGIC ----------------------
    let existing = null;

    if (attendance_id) {
      const [rows] = await conn.query(ATTENDANCE_QUERY.GET_ATTENDANCE_MARK_EXISTING_BY_ID, [attendance_id, employee_id, company_id, date]);
      existing = rows?.[0] || null;
      if (!existing) return fail(404, "Attendance/break record not found with given ID");
      if (existing.type !== type) return fail(400, `Record type mismatch: expected ${type}, found ${existing.type}`);
    }

    if (!existing) {
      if (type === "attendance") {
        const [rows] = await conn.query(ATTENDANCE_QUERY.GET_ATTENDANCE_MARK_EXISTING_MAIN, [employee_id, company_id, date]);
        existing = rows?.[0] || null;
      } else {
        if (start_time) {
          const [rows] = await conn.query(ATTENDANCE_QUERY.GET_ATTENDANCE_MARK_EXISTING_BREAK_BY_START, [employee_id, company_id, date, start_time]);
          existing = rows?.[0] || null;
        } else {
          const [rows] = await conn.query(ATTENDANCE_QUERY.GET_ATTENDANCE_MARK_EXISTING_BREAK_OPEN, [employee_id, company_id, date]);
          const openBreak = rows?.[0];
          if (!openBreak) return fail(400, "No open break found to update");
          existing = openBreak;
          start_time = parseTime(openBreak.start_time, "HH:mm:ss");
        }
      }
    }

    if (type === "break" && start_time) {
      const [overlapping] = await conn.query(ATTENDANCE_QUERY.GET_ATTENDANCE_MARK_OVERLAPPING_BREAK, [
        employee_id, company_id, date, existing?.id || 0, end_time || "23:59:59", start_time
      ]);
      if (overlapping.length) return fail(400, "Break overlaps existing break");
    }

    // ---------------------- INSERT / UPDATE ----------------------
    let attendance_id_final;
    if (existing) {
      attendance_id_final = existing.id;

      const updateFields = [
        "is_deductible = ?",
        "is_overtime = ?",
        "is_verified = 1",
        "verified_by = ?",
        "verify_date = UTC_TIMESTAMP()",
        "day_status = ?",
        "value1 = ?",
        "value2 = ?",
        "value3 = ?",
        "remark = ?"
      ];
      const updateValues = [is_deductible ? 1 : 0, is_overtime ? 1 : 0, user_id, db_day_status, db_value1, db_value2, db_value3, notes];

      if (type === "break" || ["present", "half_day"].includes(db_day_status)) {
        updateFields.unshift("start_time = ?", "end_time = ?");
        updateValues.unshift(start_time, end_time);
      }

      updateValues.push(attendance_id_final);

      await conn.query(
        `UPDATE attendance SET ${updateFields.join(",\n")} WHERE id = ?`,
        updateValues
      );
    } else {
      const [insertResult] = await conn.query(ATTENDANCE_QUERY.INSERT_ATTENDANCE_MARK, [
        employee_id, company_id, date, type, start_time, end_time, is_deductible ? 1 : 0, is_overtime ? 1 : 0, user_id, user_id, db_day_status, db_value1, db_value2, db_value3, notes
      ]);
      attendance_id_final = insertResult.insertId;
    }

    // Logging
    const old_start_time = parseTime(existing?.start_time, "HH:mm:ss");
    const old_end_time = parseTime(existing?.end_time, "HH:mm:ss");
    const old_day_status = existing?.day_status;

    if (start_time && start_time !== old_start_time) {
      await createAttendanceLog(conn, {
        attendance_id: attendance_id_final,
        log_type: "start",
        method: "manual",
        time: start_time,
        status: 1,
        created_by: user_id,
        updated_by: user_id
      });
    }
    if (end_time && end_time !== old_end_time) {
      await createAttendanceLog(conn, {
        attendance_id: attendance_id_final,
        log_type: "end",
        method: "manual",
        time: end_time,
        status: 1,
        created_by: user_id,
        updated_by: user_id
      });
    }

    const extra_data = { day_status: db_day_status };
    if (db_day_status === "half_day") extra_data.half_day_type = db_value1;
    if (db_day_status === "leave") {
      extra_data.leave_type = db_value1;
      if (db_value2) extra_data.leave_type_value = db_value2;
    }
    if (db_day_status && db_day_status !== old_day_status) {
      await createAttendanceLog(conn, {
        attendance_id: attendance_id_final,
        log_type: "day_status",
        method: "manual",
        time: end_time || start_time || "00:00:00",
        extra_data,
        status: 1,
        created_by: user_id,
        updated_by: user_id
      });
    }

    // Recalculate shift & payroll
    await recalculateShiftAndPayroll(conn, company_id, employee_id, date, user_id);

    await conn.commit();
    transactionActive = false;

    return sendSuccess(res, existing ? 200 : 201, existing ? `${type} updated successfully` : `${type} created successfully`);
  } catch (error) {
    await rollback();
    console.error("[ATTENDANCE_MARK_ERROR]", error);
    return sendError(res, 500, error.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// Route 9: GET /my/past-punches
router.get("/my/past-punches", auth(AT.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const user_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);

    if (!Number.isInteger(user_id) || user_id <= 0 || !Number.isInteger(company_id) || company_id <= 0) {
      return sendError(res, 401, "Unauthorized access");
    }

    const type = String(req.query.type || "").trim().toLowerCase();
    const from_date = req.query.from_date || null;
    const to_date = req.query.to_date || null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    if (!["attendance", "break"].includes(type)) {
      return sendError(res, 400, "Invalid type. Allowed: attendance, break");
    }

    const [[employee]] = await conn.query(ATTENDANCE_QUERY.GET_EMPLOYEE_PAST_PUNCHES, [user_id, company_id]);

    if (!employee) {
      return sendError(res, 404, "Employee not found");
    }

    let where = `
      WHERE a.employee_id = ?
        AND a.company_id = ?
        AND a.type = ?

        AND (
          a.remark IS NULL
          OR a.remark != '__deleted__'
        )

        -- ONLY PAST DATA
        AND a.attendance_date < CURDATE()
    `;

    const params = [employee.id, company_id, type];


    if (from_date) {
      where += ` AND a.attendance_date >= ? `;
      params.push(from_date);
    }
    if (to_date) {
      where += ` AND a.attendance_date <= ? `;
      params.push(to_date);
    }

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM attendance a
      ${where}
    `;

    const [[countRow]] = await conn.query(countQuery, params);
    const total = Number(countRow?.total || 0);

    const query = `
      SELECT
        a.id,
        a.employee_id,
        a.type,
        a.attendance_date,
        a.start_time,
        a.end_time,
        a.is_verified,
        a.verify_date,
        a.day_status,
        a.is_overtime,
        a.is_deductible,
        a.remark,
        s.id AS shift_id,
        s.worked_minutes,
        s.allowed_break_minutes AS actual_break_minutes,
        s.extra_break_minutes,
        s.late_minutes,
        s.early_leave_minutes,
        s.overtime_minutes,
        ls.method AS start_method,
        ls.ip_address AS start_ip,
        ls.latitude AS start_lat,
        ls.longitude AS start_lng,
        le.method AS end_method,
        le.ip_address AS end_ip,
        le.latitude AS end_lat,
        le.longitude AS end_lng

      FROM attendance a

      LEFT JOIN shifts s
        ON s.employee_id = a.employee_id
        AND s.company_id = a.company_id
        AND s.shift_date = a.attendance_date
        AND s.is_deleted = 0
        AND s.is_active = 1

      LEFT JOIN attendance_logs ls
        ON ls.id = (
          SELECT l1.id
          FROM attendance_logs l1
          WHERE l1.attendance_id = a.id
            AND l1.log_type = 'start'
            AND l1.status = 1
          ORDER BY l1.id DESC
          LIMIT 1
        )

      LEFT JOIN attendance_logs le
        ON le.id = (
          SELECT l2.id
          FROM attendance_logs l2
          WHERE l2.attendance_id = a.id
            AND l2.log_type = 'end'
            AND l2.status = 1
          ORDER BY l2.id DESC
          LIMIT 1
        )

      ${where}

      ORDER BY
        a.attendance_date DESC,
        a.id DESC

      LIMIT ?
      OFFSET ?
    `;

    const [rows] = await conn.query(query, [...params, limit, offset]);

    const data = rows.map((r) => {
      const isBreak = r.type === "break";

      const startPunch = buildPunchObject(r.start_time, r.start_method, r.start_lat, r.start_lng, r.start_ip);
      const endPunch = buildPunchObject(r.end_time, r.end_method, r.end_lat, r.end_lng, r.end_ip);

      let calculations = {
        worked_minutes: 0,
        break_minutes: 0,
        extra_break_minutes: 0,
        late_minutes: 0,
        early_leave_minutes: 0,
        overtime_minutes: 0,
      };

      if (r.shift_id) {
        calculations = {
          worked_minutes: Number(r.worked_minutes || 0),
          break_minutes: Number(r.actual_break_minutes || 0),
          extra_break_minutes: Number(r.extra_break_minutes || 0),
          late_minutes: Number(r.late_minutes || 0),
          early_leave_minutes: Number(r.early_leave_minutes || 0),
          overtime_minutes: Number(r.overtime_minutes || 0),
        };
      } else {
        const workedMinutes = calculateMinutesBetween(r.start_time, r.end_time);
        let lateMinutes = 0;
        if (employee.shift_start && r.start_time) {
          lateMinutes = Math.max(0, calculateMinutesBetween(employee.shift_start, r.start_time) - Number(employee.grace_minutes || 0));
        }
        let earlyLeaveMinutes = 0;
        if (employee.shift_end && r.end_time) {
          earlyLeaveMinutes = Math.max(0, calculateMinutesBetween(r.end_time, employee.shift_end));
        }
        let overtimeMinutes = 0;
        if (workedMinutes > Number(employee.expected_work_minutes || 0)) {
          overtimeMinutes = workedMinutes - Number(employee.expected_work_minutes || 0);
        }
        calculations = {
          worked_minutes: workedMinutes,
          break_minutes: Number(employee.break_minutes || 0),
          extra_break_minutes: 0,
          late_minutes: lateMinutes,
          early_leave_minutes: earlyLeaveMinutes,
          overtime_minutes: overtimeMinutes,
        };
      }

      const response = {
        id: r.id,
        employee_id: r.employee_id,
        name: employee.name || "",
        employee_code: employee.employee_code || "",
        designation: getEnumObject(DESIGNATIONS, employee.designation) || "",
        email: employee.email || "",
        phone: employee.phone || "",
        punch_date: r.attendance_date,
        record_type: r.type,
        status: Number(r.is_verified) === 1 ? "approved" : "pending",
        day_status: r.day_status,
        remark: r.remark || "",
        is_overtime: Number(r.is_overtime) === 1,
        is_deductible: Number(r.is_deductible) === 1,
        shift: {
          start_time: employee.shift_start || null,
          end_time: employee.shift_end || null,
          expected_work_minutes: Number(employee.expected_work_minutes || 0),
          allowed_break_minutes: Number(employee.break_minutes || 0),
          grace_minutes: Number(employee.grace_minutes || 0),
        },
        calculations,
      };

      if (!isBreak) {
        response.punch_in = startPunch;
        response.punch_out = endPunch;
      } else {
        response.break_start = startPunch;
        response.break_end = endPunch;
      }

      return response;
    });

    const meta = {
      ...buildMeta(page, limit, total, data.length),
      filters: { type, from_date, to_date },
    };

    return sendSuccess(
      res, 200,
      type === "attendance" ? "Past attendance punches fetched successfully" : "Past break punches fetched successfully",
      data, meta
    );
  } catch (err) {
    console.error("❌ /my/past-punches:", err);

    return sendError(res, 500, "Failed to fetch past punches");
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

// Route 10: GET /current-status
router.get("/current-status", auth(), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const user_id = Number(req.user?.id);
    const company_id = Number(req.company?.id);

    if (!Number.isInteger(user_id) || user_id <= 0 || !Number.isInteger(company_id) || company_id <= 0) {
      return sendError(res, 401, "Unauthorized access");
    }

    // 1. Validate user
    const [[userRow]] = await conn.query(ATTENDANCE_QUERY.GET_CHECK_USER, [user_id]);
    if (!userRow) {
      return sendError(res, 404, "User not found");
    }

    // 2. Validate company
    const [[companyRow]] = await conn.query(ATTENDANCE_QUERY.GET_CHECK_COMPANY, [company_id]);
    if (!companyRow) {
      return sendError(res, 404, "Company not found");
    }

    // 3. Check employee
    const [[employee]] = await conn.query(ATTENDANCE_QUERY.GET_EMPLOYEE_CURRENT_STATUS, [user_id, company_id]);
    if (!employee) {
      return sendError(res, 404, "Employee not found");
    }

    const employee_id = employee.id;
    const today = getCurrentDate();
    const now = getISTNow();
    const todayDayName = getDayName(today);

    const empMethodsRaw = parseEmployeeMethods(employee.emp_attendance_methods);
    const companyMethodsRaw = parseEmployeeMethods(employee.attendance_methods);
    const companyMethodsSet = new Set(companyMethodsRaw);

    let allowed_methods = [];
    let auto_approved = Number(employee.is_auto) === 1;

    for (const m of empMethodsRaw) {
      if (companyMethodsSet.has(m) && !allowed_methods.includes(m)) {
        allowed_methods.push(m);
      }
    }

    // 4. Fetch company holiday for today (is_optional=0)
    const [[holiday]] = await conn.query(ATTENDANCE_QUERY.GET_HOLIDAY_CURRENT_STATUS, [company_id, today]);

    // 5. Employee's weekend
    const employeeWeekends = normalizeWeekends(employee.weekends);
    const isWeekend = employeeWeekends.includes(todayDayName);

    // 6. Fetch employee's approved leave for today
    const [[approvedLeave]] = await conn.query(ATTENDANCE_QUERY.GET_APPROVED_LEAVE_READ, [employee_id, company_id, today]);

    // Fetch attendance and break rows
    const [attendanceRows] = await conn.query(ATTENDANCE_QUERY.GET_CURRENT_STATUS_ATTENDANCES, [employee_id, company_id, today]);
    const [breakRows] = await conn.query(ATTENDANCE_QUERY.GET_CURRENT_STATUS_BREAKS, [employee_id, company_id, today]);

    // --- Weekend check: if today is weekend, send weekend response ---
    if (isWeekend) {
      return sendSuccess(res, 200, "Current attendance status fetched successfully", {
        status: "WEEKEND",
        allowed_methods,
        auto_approved,
        allowed_actions: [],
        day_info: {
          date: today,
          day_name: todayDayName,
          is_weekend: true,
          is_holiday: !!holiday,
          ...(holiday && { holiday_name: holiday.name }),
        },
      });
    }

    // --- Full-day leave check (is_half_day != 1) ---
    const isFullDayLeave = approvedLeave && Number(approvedLeave.is_half_day) !== 1;
    if (isFullDayLeave && !attendanceRows.length) {
      return sendSuccess(res, 200, "Current attendance status fetched successfully", {
        status: "LEAVE",
        allowed_methods,
        auto_approved,
        allowed_actions: [],
        day_info: {
          date: today,
          day_name: todayDayName,
          is_weekend: false,
          is_holiday: !!holiday,
          ...(holiday && { holiday_name: holiday.name }),
        },
      });
    }

    // --- Half-day detection ---
    // Priority: 1) leave table half_day  2) attendance table value2 (manager-marked half_day)
    const leaveIsHalfDay = approvedLeave && Number(approvedLeave.is_half_day) === 1;

    const isRowHalfDay = (row) => {
      const ds = String(row.day_status || "").trim().toLowerCase();
      if (ds === "half_day") return true;
      const v1 = String(row.value1 || "").trim().toLowerCase();
      const v2 = String(row.value2 || "").trim().toLowerCase();
      return ["half_day", "first_half", "second_half"].includes(v1) ||
        ["half_day", "first_half", "second_half"].includes(v2);
    };

    const attendanceIsHalfDay = attendanceRows.some(isRowHalfDay);
    const isHalfDay = leaveIsHalfDay || attendanceIsHalfDay;

    // Resolve half_day_type: leave table always has first priority
    let resolvedHalfDayType = "first_half";
    if (leaveIsHalfDay && approvedLeave.half_day_type) {
      resolvedHalfDayType = approvedLeave.half_day_type;
    } else if (attendanceIsHalfDay) {
      const halfDayRow = attendanceRows.find(isRowHalfDay);
      if (halfDayRow) {
        // value1 stores the half_day_type (first_half / second_half) when day_status is half_day
        const v1 = String(halfDayRow.value1 || "").trim().toLowerCase();
        const v2 = String(halfDayRow.value2 || "").trim().toLowerCase();
        if (["first_half", "second_half"].includes(v1)) resolvedHalfDayType = v1;
        else if (["first_half", "second_half"].includes(v2)) resolvedHalfDayType = v2;
      }
    }

    // --- Restricted day status check (non-present, non-half_day statuses from attendance) ---
    const restrictedDayStatus = attendanceRows.find((row) => {
      const ds = String(row.day_status || "").trim().toLowerCase();
      if (["present", "half_day"].includes(ds)) return false;
      if (isRowHalfDay(row)) return false;
      return true;
    });
    const hasRestrictedDayStatus = !!restrictedDayStatus;

    // --- Calculate work and break time ---
    let total_work_ms = 0;
    let isWorking = false;

    for (const row of attendanceRows) {
      if (!row.start_time) {
        continue;
      }

      const start = parseDateTimeIST(today, row.start_time);
      let end = null;

      if (row.end_time) {
        end = parseDateTimeIST(today, row.end_time);
      } else {
        end = now;
        isWorking = true;
      }

      total_work_ms += diffMilliseconds(start, end);
    }

    let total_break_ms = 0;
    let isOnBreak = false;

    for (const row of breakRows) {
      if (!row.start_time) {
        continue;
      }

      const start = parseDateTimeIST(today, row.start_time);
      let end = null;

      if (row.end_time) {
        end = parseDateTimeIST(today, row.end_time);
      } else {
        end = now;
        isOnBreak = true;
      }

      total_break_ms += diffMilliseconds(start, end);
    }

    total_work_ms = Math.max(0, total_work_ms - total_break_ms);
    const total_work_minutes = Math.floor(total_work_ms / 60000);
    const total_break_minutes = Math.floor(total_break_ms / 60000);

    // --- Build activities timeline ---
    const activities = [];

    for (const row of attendanceRows) {
      activities.push({
        type: "PUNCH_IN",
        time: formatTime12Hour(row.start_time),
        attendance_method: row.punch_in_method || null,

        ...(row.punch_in_method === "ip" && {
          ip_address: row.punch_in_ip || null,
        }),

        ...(row.punch_in_method === "gps" && {
          location: {
            latitude: row.punch_in_latitude ? Number(row.punch_in_latitude) : null,
            longitude: row.punch_in_longitude ? Number(row.punch_in_longitude) : null,
          },
        }),
        sort_time: row.start_time,
      });

      if (row.end_time) {
        activities.push({
          type: "PUNCH_OUT",
          time: formatTime12Hour(row.end_time),
          attendance_method: row.punch_out_method || null,

          ...(row.punch_out_method === "ip" && {
            ip_address: row.punch_out_ip || null,
          }),

          ...(row.punch_out_method === "gps" && {
            location: {
              latitude: row.punch_out_latitude ? Number(row.punch_out_latitude) : null,
              longitude: row.punch_out_longitude ? Number(row.punch_out_longitude) : null,
            },
          }),
          sort_time: row.end_time,
        });
      }
    }

    for (const row of breakRows) {
      activities.push({
        type: "BREAK_START",
        time: formatTime12Hour(row.start_time),
        attendance_method: row.break_start_method || null,

        ...(row.break_start_method === "ip" && {
          ip_address: row.break_start_ip || null,
        }),

        ...(row.break_start_method === "gps" && {
          location: {
            latitude: row.break_start_latitude ? Number(row.break_start_latitude) : null,
            longitude: row.break_start_longitude ? Number(row.break_start_longitude) : null,
          },
        }),
        sort_time: row.start_time,
      });

      if (row.end_time) {
        activities.push({
          type: "BREAK_END",
          time: formatTime12Hour(row.end_time),
          attendance_method: row.break_end_method || null,

          ...(row.break_end_method === "ip" && {
            ip_address: row.break_end_ip || null,
          }),

          ...(row.break_end_method === "gps" && {
            location: {
              latitude: row.break_end_latitude ? Number(row.break_end_latitude) : null,
              longitude: row.break_end_longitude ? Number(row.break_end_longitude) : null,
            },
          }),
          sort_time: row.end_time,
        });
      }
    }

    activities.sort((a, b) => {
      return String(b.sort_time || "").localeCompare(String(a.sort_time || ""));
    });

    const today_activities = activities.map(({ sort_time, ...rest }) => rest);

    // --- Determine status and allowed_actions ---
    let status = "NOT_PUNCHED_IN";
    let allowed_actions = [];

    if (holiday) {
      status = "HOLIDAY";
      allowed_actions = [];
    } else if (hasRestrictedDayStatus) {
      status = String(restrictedDayStatus.day_status).trim().toUpperCase();
      allowed_actions = [];
    } else if (!attendanceRows.length) {
      if (isHalfDay) {
        status = "HALF_DAY";
        allowed_actions = ["PUNCH_IN"];
      } else {
        status = "NOT_PUNCHED_IN";
        allowed_actions = ["PUNCH_IN"];
      }
    } else {
      const activeAttendance = attendanceRows.find((row) => !row.end_time);

      if (activeAttendance) {
        if (isOnBreak) {
          status = "ON_BREAK";
          allowed_actions = ["BREAK_END"];
        } else {
          status = "WORKING";
          allowed_actions = ["PUNCH_OUT", "BREAK_START"];
        }
      } else {
        status = "COMPLETED";
        allowed_actions = [];
      }
    }

    const responseData = {
      status,
      allowed_methods,
      auto_approved,
      allowed_actions,
      day_info: {
        date: today,
        day_name: todayDayName,
        is_weekend: isWeekend,
        is_holiday: !!holiday,

        ...(holiday && {
          holiday_name: holiday.name,
        }),
      },
    };

    if (!["HOLIDAY", "WEEKEND", "NOT_PUNCHED_IN", "LEAVE"].includes(status) || status === "HALF_DAY") {
      let shiftStart = employee.shift_start;
      let shiftEnd = employee.shift_end;
      let expectedWorkMinutes = Number(employee.expected_work_minutes || 0);

      if (isHalfDay) {
        const sStart = parseTime(employee.shift_start, "HH:mm:ss");
        const sEnd = parseTime(employee.shift_end, "HH:mm:ss");
        if (sStart && sEnd) {
          const totalShiftMins = diffMinutes(sStart, sEnd);
          const halfShiftMins = Math.floor(totalShiftMins / 2);
          const midpoint = addMinutesToTime(sStart, halfShiftMins);

          // first_half leave = employee works SECOND half (midpoint → shift_end)
          // second_half leave = employee works FIRST half (shift_start → midpoint)
          if (resolvedHalfDayType === "first_half") {
            shiftStart = midpoint;
            shiftEnd = employee.shift_end;
          } else {
            shiftStart = employee.shift_start;
            shiftEnd = midpoint;
          }
        }
        expectedWorkMinutes = Math.floor(expectedWorkMinutes / 2);
      }

      responseData.shift = {
        start_time: shiftStart,
        end_time: shiftEnd,
        expected_work_minutes: expectedWorkMinutes,
        allowed_break_minutes: Number(employee.break_minutes || 0),
        grace_minutes: Number(employee.grace_minutes || 0),
      };

      responseData.today_summary = {
        total_work_minutes,
        total_break_minutes,
      };

      responseData.today_activities = today_activities;
    }

    return sendSuccess(res, 200, "Current attendance status fetched successfully", responseData);
  } catch (err) {
    console.error("❌ current-status error:", err);
    return sendError(res, 500, "Failed to fetch current attendance status");
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

// Route 11: GET /logs
router.get("/logs", auth(), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const companyId = Number(req.company?.id);
    const attendanceId = Number(req.query.id);

    const logType = String(req.query.log_type || "").trim().toLowerCase();
    const search = String(req.query.search || "").trim();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    if (!companyId) {
      return sendError(res, 401, "Unauthorized company access");
    }

    if (!Number.isInteger(attendanceId) || attendanceId <= 0) {
      return sendError(res, 400, "Invalid attendance_id");
    }

    if (logType && !["start", "end", "day_status"].includes(logType)) {
      return sendError(res, 400, "log_type must be start, end or day_status");
    }

    const [[attendance]] = await conn.query(ATTENDANCE_QUERY.GET_LOG_ATTENDANCE, [attendanceId, companyId]);

    if (!attendance) {
      return sendError(res, 404, "Attendance not found");
    }

    let where = `WHERE al.attendance_id = ?`;
    const params = [attendanceId];

    if (logType) {
      where += ` AND al.log_type = ?`;
      params.push(logType);
    }

    if (search) {
      where += `
        AND (
          al.method LIKE ?
          OR uc.name LIKE ?
          OR uc.email LIKE ?
          OR uu.name LIKE ?
          OR uu.email LIKE ?
        )
      `;
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM attendance_logs al
       LEFT JOIN users uc ON uc.id = al.created_by
       LEFT JOIN users uu ON uu.id = al.updated_by
       ${where}`,
      params,
    );

    const [rows] = await conn.query(
      `SELECT
         al.id,
         al.log_type,
         al.method,
         al.time,
         al.ip_address,
         al.latitude,
         al.longitude,
         al.created_at,
         al.updated_at,
         al.created_by,
         al.updated_by
       FROM attendance_logs al
       ${where}
       ORDER BY al.created_at DESC, al.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const userIdsToFetch = new Set();
    for (const row of rows) {
      if (row.created_by) userIdsToFetch.add(row.created_by);
      if (row.updated_by) userIdsToFetch.add(row.updated_by);
    }
    userIdsToFetch.delete(null);
    userIdsToFetch.delete(0);
    userIdsToFetch.delete(undefined);

    const userMap = new Map();

    if (userIdsToFetch.size > 0) {
      const uniqueIds = Array.from(userIdsToFetch);

      const [userRows] = await conn.query(`SELECT id, name FROM users WHERE id IN (?)`, [uniqueIds]);

      const [[company]] = await conn.query(ATTENDANCE_QUERY.GET_COMPANY_OWNER, [companyId]);
      const ownerUserId = company ? company.owner_user_id : null;

      const [empRows] = await conn.query(
        `SELECT user_id FROM employees
         WHERE company_id = ? AND user_id IN (?)
           AND is_active = 1 AND is_deleted = 0`,
        [companyId, uniqueIds],
      );
      const employeeUserIds = new Set(empRows.map((r) => r.user_id));

      for (const u of userRows) {
        let role = "employee";
        if (u.id === ownerUserId) role = "company_owner";
        else if (employeeUserIds.has(u.id)) role = "employee";
        userMap.set(u.id, { name: u.name, role });
      }
    }

    const logs = rows.map((row) => {
      let type;
      if (attendance.type === "break") {
        if (row.log_type === "start") type = "break_start";
        else if (row.log_type === "end") type = "break_end";
        else type = row.log_type;
      } else {
        if (row.log_type === "start") type = "punch_in";
        else if (row.log_type === "end") type = "punch_out";
        else type = row.log_type;
      }

      const logItem = {
        log_id: row.id,
        log_type: type,
        method: row.method,
        time: row.time,
        created_by: row.created_by ? userMap.get(row.created_by) || null : null,
      };

      if (row.ip_address !== null && row.ip_address !== undefined) {
        logItem.ip_address = row.ip_address;
      }
      if (row.latitude !== null && row.latitude !== undefined) {
        logItem.latitude = row.latitude;
      }
      if (row.longitude !== null && row.longitude !== undefined) {
        logItem.longitude = row.longitude;
      }

      return logItem;
    });

    const meta = {
      ...buildMeta(page, limit, total, logs.length),
      filters: {
        attendance_id: attendanceId,
        log_type: logType || null,
        search: search || null,
      },
    };

    return sendSuccess(res, 200, "Attendance activity logs fetched successfully", { logs }, meta);
  } catch (err) {
    console.error("❌ GET /logs", err);
    return sendError(res, 500, "Failed to fetch logs");
  } finally {
    if (conn) conn.release();
  }
});

// Route 12: GET /list
router.get("/list", auth(AT.MNG), async (req, res) => {
  let conn;

  const allowedTypes = ["attendance", "break"];
  const allowedDayStatuses = ["present", "absent", "leave", "half_day", "unmarked"];

  try {
    conn = await db.getConnection();

    const company_id = safeNumber(req.company?.id, 0);
    if (!company_id || company_id <= 0) {
      return sendError(res, 401, "Unauthorized company");
    }

    let { from_date, to_date, employee_id, day_status, type = "attendance", search = "", page = 1, limit = 20 } = req.query;

    page = safeNumber(page, 1);
    limit = Math.min(Math.max(safeNumber(limit, 20), 1), 100);
    const offset = (page - 1) * limit;

    type = String(type).trim().toLowerCase();
    if (!allowedTypes.includes(type)) {
      return sendError(res, 400, "Invalid attendance type");
    }

    let parsedDayStatus = null;
    if (day_status !== undefined && day_status !== null && String(day_status).trim()) {
      parsedDayStatus = normalizeDayStatus(day_status);
      if (!allowedDayStatuses.includes(parsedDayStatus)) {
        return sendError(res, 400, "Invalid day_status");
      }
    }

    const today = getCurrentDate();
    const effectiveFromDate = from_date || today;
    const effectiveToDate = to_date || today;

    if (!isValidDate(effectiveFromDate) || !isValidDate(effectiveToDate)) {
      return sendError(res, 400, "Invalid date range");
    }

    if (isDateAfter(effectiveFromDate, today) || isDateAfter(effectiveToDate, today)) {
      return sendError(res, 400, "Dates cannot be in future");
    }

    if (isDateAfter(effectiveFromDate, effectiveToDate)) {
      return sendError(res, 400, "from_date cannot be greater than to_date");
    }

    let parsedEmployeeId = null;
    if (employee_id !== undefined && employee_id !== null && employee_id !== "") {
      parsedEmployeeId = safeNumber(employee_id, 0);
      if (!parsedEmployeeId || parsedEmployeeId <= 0) {
        return sendError(res, 400, "Invalid employee_id");
      }
    }

    let whereEmployee = "";
    const employeeParams = [company_id, effectiveToDate];
    search = String(search || "").trim();
    if (search) {
      const keyword = `%${search}%`;
      whereEmployee += `
        AND (
          u.name LIKE ?
          OR u.email LIKE ?
          OR u.phone LIKE ?
          OR e.employee_code LIKE ?
          OR e.designation LIKE ?
        )
      `;
      employeeParams.push(keyword, keyword, keyword, keyword, keyword);
    }
    if (parsedEmployeeId) {
      whereEmployee += ` AND e.id = ?`;
      employeeParams.push(parsedEmployeeId);
    }

    const [[countRow]] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM employees e
       INNER JOIN users u ON u.id = e.user_id
       WHERE e.company_id = ?
         AND e.is_deleted = 0
         AND e.is_active = 1
         AND u.is_deleted = 0
         AND u.is_active = 1
         AND (e.joining_date IS NULL OR e.joining_date <= ?)
         ${whereEmployee}`,
      employeeParams,
    );
    const total = safeNumber(countRow?.total, 0);

    const [employees] = await conn.query(
      `SELECT
         e.id, e.employee_code, e.designation, e.salary_type,
         e.employment_type, e.status, e.joining_date,
         e.shift_start, e.shift_end,
         e.expected_work_minutes, e.break_minutes, e.grace_minutes,
         u.name, u.email, u.profile_picture, u.phone
       FROM employees e
       INNER JOIN users u ON u.id = e.user_id
       WHERE e.company_id = ?
         AND e.is_deleted = 0
         AND e.is_active = 1
         AND u.is_deleted = 0
         AND u.is_active = 1
         AND (e.joining_date IS NULL OR e.joining_date <= ?)
         ${whereEmployee}
       ORDER BY u.name ASC
       LIMIT ? OFFSET ?`,
      [...employeeParams, limit, offset],
    );

    const emptyCounts = {
      total_employees: 0,
      present: 0,
      absent: 0,
      leave: 0,
      half_day: 0,
      unmarked: 0,
      attendance_entries: 0,
      break_entries: 0,
    };
    if (!employees.length) {
      const meta = {
        ...buildMeta(page, limit, total, 0),
        filters: {
          from_date: effectiveFromDate,
          to_date: effectiveToDate,
          employee_id: parsedEmployeeId,
          day_status: parsedDayStatus,
          type,
          search,
        },
        counts: emptyCounts,
      };

      if (type === "break") {
        meta.counts.average_break_minutes_per_employee = 0;
      }
      return sendSuccess(res, 200, "Attendance fetched successfully", [], meta);
    }

    const employeeIds = employees.map((e) => e.id);

    let whereAttendance = "";
    const attendanceParams = [company_id, employeeIds, type, effectiveFromDate, effectiveToDate];
    if (parsedDayStatus && parsedDayStatus !== "unmarked") {
      whereAttendance += ` AND COALESCE(a.day_status, 'unmarked') = ?`;
      attendanceParams.push(parsedDayStatus);
    }

    const [attendanceRows] = await conn.query(
      `SELECT
         a.id, a.employee_id, a.company_id,
         a.attendance_date, a.type,
         a.start_time, a.end_time,
         a.day_status, a.value1, a.value2, a.value3,
         a.is_verified, a.is_deductible, a.is_overtime,
         a.remark,
         pin.method AS start_method,
         pin.time AS start_log_time,
         pin.ip_address AS start_ip,
         pin.latitude AS start_latitude,
         pin.longitude AS start_longitude,
         pout.method AS end_method,
         pout.time AS end_log_time,
         pout.ip_address AS end_ip,
         pout.latitude AS end_latitude,
         pout.longitude AS end_longitude
       FROM attendance a
       LEFT JOIN attendance_logs pin
         ON pin.id = (
           SELECT al1.id
           FROM attendance_logs al1
           WHERE al1.attendance_id = a.id
             AND al1.status = 1
             AND al1.log_type = 'start'
           ORDER BY al1.time ASC, al1.id DESC
           LIMIT 1
         )
       LEFT JOIN attendance_logs pout
         ON pout.id = (
           SELECT al2.id
           FROM attendance_logs al2
           WHERE al2.attendance_id = a.id
             AND al2.status = 1
             AND al2.log_type = 'end'
           ORDER BY al2.time DESC, al2.id DESC
           LIMIT 1
         )
       WHERE a.company_id = ?
         AND a.employee_id IN (?)
         AND a.type = ?
         AND a.attendance_date BETWEEN ? AND ?
         ${whereAttendance}
       ORDER BY
         a.attendance_date DESC,
         a.employee_id ASC,
         a.created_at DESC,
         a.id DESC`,
      attendanceParams,
    );

    const employeeDateMap = new Map();
    for (const row of attendanceRows) {
      const eid = row.employee_id;
      if (!employeeDateMap.has(eid)) employeeDateMap.set(eid, new Map());
      const dateMap = employeeDateMap.get(eid);
      const date = row.attendance_date;
      if (!dateMap.has(date)) dateMap.set(date, { attendanceRow: null, breakRows: [] });
      const group = dateMap.get(date);
      if (row.type === "attendance") {
        group.attendanceRow = row;
      } else if (row.type === "break") {
        group.breakRows.push(row);
      }
    }

    const counts = {
      total_employees: employees.length,
      present: 0,
      absent: 0,
      leave: 0,
      half_day: 0,
      unmarked: 0,
      attendance_entries: 0,
      break_entries: 0,
    };
    const uniqueDayStatusSet = new Set();

    const employeeAttendanceMap = new Map();
    for (const employee of employees) {
      employeeAttendanceMap.set(employee.id, {
        employee_id: employee.id,
        employee_code: employee.employee_code,
        designation: getEnumObject(DESIGNATIONS, employee.designation),
        employment_type: getEnumObject(EMPLOYMENT_TYPES, employee.employment_type),
        salary_type: getEnumObject(SALARY_TYPES, employee.salary_type),
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
        profile_picture: buildFileUrl(employee.profile_picture),
        status: employee.status,
        joining_date: employee.joining_date,
        shift: {
          start_time: employee.shift_start,
          end_time: employee.shift_end,
          expected_work_minutes: safeNumber(employee.expected_work_minutes),
          allowed_break_minutes: safeNumber(employee.break_minutes),
          grace_minutes: safeNumber(employee.grace_minutes),
        },
        attendances: [],
        breaks: [],
        _totalWorkedMinutes: 0,
      });
    }

    for (const [employeeId, dateMap] of employeeDateMap.entries()) {
      const employeeData = employeeAttendanceMap.get(employeeId);
      if (!employeeData) continue;

      const employeeObj = employees.find((e) => e.id === employeeId);
      const expectedWorkMinutes = safeNumber(employeeObj?.expected_work_minutes);
      const allowedBreakMinutes = safeNumber(employeeObj?.break_minutes);
      const graceMinutes = safeNumber(employeeObj?.grace_minutes);

      for (const [date, group] of dateMap.entries()) {
        const { attendanceRow, breakRows } = group;

        breakRows.sort((a, b) => {
          const ta = a.start_log_time || a.start_time || "00:00";
          const tb = b.start_log_time || b.start_time || "00:00";
          return tb.localeCompare(ta);
        });

        for (const breakRow of breakRows) {
          const startPayload = removeNullFields({
            time: breakRow.start_log_time || breakRow.start_time || null,
            method: breakRow.start_method || null,
            latitude: breakRow.start_latitude != null ? Number(breakRow.start_latitude) : null,
            longitude: breakRow.start_longitude != null ? Number(breakRow.start_longitude) : null,
            ip_address: breakRow.start_ip || null,
          });
          const endPayload = removeNullFields({
            time: breakRow.end_log_time || breakRow.end_time || null,
            method: breakRow.end_method || null,
            latitude: breakRow.end_latitude != null ? Number(breakRow.end_latitude) : null,
            longitude: breakRow.end_longitude != null ? Number(breakRow.end_longitude) : null,
            ip_address: breakRow.end_ip || null,
          });

          employeeData.breaks.push({
            attendance_id: breakRow.id,
            type: "break",
            attendance_date: breakRow.attendance_date,
            day_status: normalizeDayStatus(breakRow.day_status || "unmarked"),
            is_verified: Number(breakRow.is_verified) === 1,
            is_deductible: false,
            is_overtime: false,
            remark: breakRow.remark || null,
            break_end: endPayload,
            break_start: startPayload,
          });
        }

        if (attendanceRow) {
          const finalDayStatus = normalizeDayStatus(attendanceRow.day_status || "unmarked");
          const finalValue1 = attendanceRow.value1 || null;
          const finalValue2 = attendanceRow.value2 || null;

          const uniqueKey = `${employeeId}_${date}_${finalDayStatus}`;
          if (!uniqueDayStatusSet.has(uniqueKey)) {
            uniqueDayStatusSet.add(uniqueKey);
            if (Object.prototype.hasOwnProperty.call(counts, finalDayStatus)) {
              counts[finalDayStatus]++;
            }
          }

          const startPayload = removeNullFields({
            time: attendanceRow.start_log_time || attendanceRow.start_time || null,
            method: attendanceRow.start_method || null,
            latitude: attendanceRow.start_latitude != null ? Number(attendanceRow.start_latitude) : null,
            longitude: attendanceRow.start_longitude != null ? Number(attendanceRow.start_longitude) : null,
            ip_address: attendanceRow.start_ip || null,
          });
          const endPayload = removeNullFields({
            time: attendanceRow.end_log_time || attendanceRow.end_time || null,
            method: attendanceRow.end_method || null,
            latitude: attendanceRow.end_latitude != null ? Number(attendanceRow.end_latitude) : null,
            longitude: attendanceRow.end_longitude != null ? Number(attendanceRow.end_longitude) : null,
            ip_address: attendanceRow.end_ip || null,
          });

          const attendanceDuration = diffMinutes(attendanceRow.start_time, attendanceRow.end_time);

          let calculations = { worked_minutes: attendanceDuration };

          if (finalDayStatus === "present") {
            let totalBreakMinutes = 0;
            for (const br of breakRows) {
              totalBreakMinutes += diffMinutes(br.start_time, br.end_time);
            }
            const extraBreakMinutes = Math.max(0, totalBreakMinutes - allowedBreakMinutes);
            const effectiveWorkMinutes = Math.max(0, attendanceDuration - extraBreakMinutes);

            if (Number(attendanceRow.is_overtime) === 1) {
              const overtimeThreshold = expectedWorkMinutes + graceMinutes;
              if (effectiveWorkMinutes > overtimeThreshold) {
                calculations.overtime_minutes = effectiveWorkMinutes - expectedWorkMinutes;
              } else {
                calculations.overtime_minutes = 0;
              }
            }

            if (Number(attendanceRow.is_deductible) === 1) {
              const shortfall = expectedWorkMinutes - effectiveWorkMinutes;
              if (shortfall > 0) {
                calculations.deductible_minutes = shortfall;
              }
            }
          } else if (finalDayStatus === "half_day") {
            const halfExpected = Math.floor(expectedWorkMinutes / 2);
            let totalBreakMinutes = 0;
            for (const br of breakRows) {
              totalBreakMinutes += diffMinutes(br.start_time, br.end_time);
            }
            const extraBreakMinutes = Math.max(0, totalBreakMinutes - allowedBreakMinutes);
            const effectiveWorkMinutes = Math.max(0, attendanceDuration - extraBreakMinutes);

            if (Number(attendanceRow.is_overtime) === 1) {
              const overtimeThreshold = halfExpected + graceMinutes;
              if (effectiveWorkMinutes > overtimeThreshold) {
                calculations.overtime_minutes = effectiveWorkMinutes - halfExpected;
              } else {
                calculations.overtime_minutes = 0;
              }
            }

            if (Number(attendanceRow.is_deductible) === 1) {
              const shortfall = halfExpected - effectiveWorkMinutes;
              if (shortfall > 0) {
                calculations.deductible_minutes = shortfall;
              }
            }

            calculations.worked_minutes = effectiveWorkMinutes;
          } else if (finalDayStatus === "leave") {
            if (Number(attendanceRow.is_overtime) === 1 && attendanceRow.value3 != null) {
              const numericOT = safeNumber(attendanceRow.value3, null);
              if (numericOT !== null && numericOT > 0) {
                calculations.overtime_minutes = numericOT;
              }
            }
          }

          const showPunch = finalDayStatus === "present" || finalDayStatus === "half_day";
          const finalStartPayload = showPunch ? startPayload : null;
          const finalEndPayload = showPunch ? endPayload : null;
          const finalCalculations = finalDayStatus === "absent" ? {} : calculations;

          if (finalCalculations.worked_minutes) {
            employeeData._totalWorkedMinutes += finalCalculations.worked_minutes;
          }

          employeeData.attendances.push({
            attendance_id: attendanceRow.id,
            type: "attendance",
            attendance_date: attendanceRow.attendance_date,
            day_status: finalDayStatus,
            ...buildDayStatusPayload({
              dayStatus: finalDayStatus,
              value1: finalValue1,
              value2: finalValue2,
            }),
            is_verified: Number(attendanceRow.is_verified) === 1,
            is_deductible: Number(attendanceRow.is_deductible) === 1,
            is_overtime: Number(attendanceRow.is_overtime) === 1,
            remark: attendanceRow.remark || null,
            punch_out: finalEndPayload,
            punch_in: finalStartPayload,
          });

          counts.attendance_entries++;
        }
      }
    }

    for (const employeeData of employeeAttendanceMap.values()) {
      let totalBreakTime = 0;

      for (const br of employeeData.breaks) {
        totalBreakTime += diffMinutes(br.break_start?.time, br.break_end?.time);
      }

      employeeData.calculations = {
        worked_minutes: employeeData._totalWorkedMinutes || 0,
        total_break_time: totalBreakTime,
      };

      delete employeeData._totalWorkedMinutes;
    }

    counts.break_entries = (() => {
      let total = 0;
      for (const [, dateMap] of employeeDateMap) {
        for (const [, group] of dateMap) {
          total += group.breakRows.length;
        }
      }
      return total;
    })();

    let data;
    let averageBreakMinutes = 0;

    if (type === "break") {
      const flatBreaks = [];
      const employeeBreakTotals = [];

      for (const employeeData of employeeAttendanceMap.values()) {
        if (employeeData.breaks.length === 0) continue;

        const empTotalBreak = employeeData.calculations.total_break_time;
        employeeBreakTotals.push(empTotalBreak);

        for (const br of employeeData.breaks) {
          if (parsedDayStatus && br.day_status !== parsedDayStatus) continue;

          flatBreaks.push({
            attendance_id: br.attendance_id,
            type: "break",
            attendance_date: br.attendance_date,
            day_status: br.day_status,
            is_verified: br.is_verified,
            remark: br.remark,
            break_start: br.break_start,
            break_end: br.break_end,
            employee_id: employeeData.employee_id,
            employee_code: employeeData.employee_code,
            designation: getEnumObject(DESIGNATIONS, employeeData.designation),
            name: employeeData.name,
            email: employeeData.email,
            phone: employeeData.phone,
            profile_picture: employeeData.profile_picture,
            status: employeeData.status,
            joining_date: employeeData.joining_date,
            allowed_break_minutes: employeeData.shift.allowed_break_minutes,
          });
        }
      }

      if (employeeBreakTotals.length > 0) {
        const sum = employeeBreakTotals.reduce((a, b) => a + b, 0);
        averageBreakMinutes = parseFloat((sum / employeeBreakTotals.length).toFixed(2));
      }

      data = flatBreaks;
    } else {
      data = Array.from(employeeAttendanceMap.values()).filter((employee) => {
        if (parsedDayStatus === "unmarked") {
          return employee.attendances.length === 0;
        }

        if (parsedDayStatus) {
          return employee.attendances.some((a) => normalizeDayStatus(a.day_status) === parsedDayStatus);
        }

        return true;
      });
    }

    const meta = {
      ...buildMeta(page, limit, data.length, data.length),
      filters: {
        from_date: effectiveFromDate,
        to_date: effectiveToDate,
        employee_id: parsedEmployeeId,
        day_status: parsedDayStatus,
        type,
        search,
      },
      counts,
    };

    if (type === "break") {
      meta.counts.average_break_minutes_per_employee = averageBreakMinutes;
    }

    return sendSuccess(res, 200, "Attendance fetched successfully", data, meta);
  } catch (error) {
    console.error("GET /attendance/list ERROR:", error);
    return sendError(res, 500, error.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// Route 13: GET /dashboard-summary
router.get("/dashboard-summary", auth(), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const company_id = Number(req.company?.id);

    if (!Number.isInteger(company_id) || company_id <= 0) {
      return sendError(res, 401, "Unauthorized company");
    }

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthStart = new Date(currentYear, currentMonth, 1).toISOString().split("T")[0];
    const monthEnd = new Date(currentYear, currentMonth + 1, 0).toISOString().split("T")[0];

    const [[employeeStats]] = await conn.query(ATTENDANCE_QUERY.GET_DASHBOARD_EMPLOYEE_STATS, [company_id, today]);
    const [[attendanceStats]] = await conn.query(ATTENDANCE_QUERY.GET_DASHBOARD_ATTENDANCE_STATS, [company_id, today]);
    const [[shiftStats]] = await conn.query(ATTENDANCE_QUERY.GET_DASHBOARD_SHIFT_STATS, [company_id, today]);
    const [leaveStatsRows] = await conn.query(ATTENDANCE_QUERY.GET_DASHBOARD_LEAVE_STATS, [company_id, monthEnd, monthStart]);

    const leaveStats = {
      pending: {
        requests: 0,
        employees: 0,
        leave_days: 0,
      },
      approved: {
        requests: 0,
        employees: 0,
        leave_days: 0,
      },
      rejected: {
        requests: 0,
        employees: 0,
        leave_days: 0,
      },
      cancelled: {
        requests: 0,
        employees: 0,
        leave_days: 0,
      },
    };

    for (const row of leaveStatsRows) {
      if (leaveStats[row.status]) {
        leaveStats[row.status] = {
          requests: Number(row.total_requests || 0),
          employees: Number(row.total_employees || 0),
          leave_days: Number(row.total_leave_days || 0),
        };
      }
    }

    const [[holidayStats]] = await conn.query(ATTENDANCE_QUERY.GET_DASHBOARD_HOLIDAY_STATS, [company_id, today]);

    const totalEmployees = Number(employeeStats?.total_employees || 0);
    const totalPresent = Number(attendanceStats?.present_count || 0);
    const calculatedAbsent = Math.max(0, totalEmployees - totalPresent);

    return sendSuccess(res, 200, "Dashboard summary fetched successfully", {
      generated_at: new Date(),
      today,
      current_month: {
        start_date: monthStart,
        end_date: monthEnd,
      },
      employees: {
        total: totalEmployees,
        active: Number(employeeStats?.active_employees || 0),
        inactive: Number(employeeStats?.inactive_employees || 0),
        face_enrolled: Number(employeeStats?.face_enrolled_count || 0),
        fingerprint_mapped: Number(employeeStats?.fingerprint_mapped_count || 0),
      },
      attendance_today: {
        present: totalPresent,
        absent: calculatedAbsent,
        half_day: Number(attendanceStats?.half_day_count || 0),
        paid_leave: Number(attendanceStats?.paid_leave_count || 0),
        unmarked: Number(attendanceStats?.unmarked_count || 0),
        verified: Number(attendanceStats?.verified_attendance_count || 0),
        unverified: Number(attendanceStats?.unverified_attendance_count || 0),
        overtime_employees: Number(attendanceStats?.overtime_employee_count || 0),
        attendance_entries: Number(attendanceStats?.attendance_entries || 0),
        break_entries: Number(attendanceStats?.break_entries || 0),
        attendance_percentage: totalEmployees > 0 ? Number(((totalPresent / totalEmployees) * 100).toFixed(2)) : 0,
      },
      shifts_today: {
        total_shifts: Number(shiftStats?.total_shifts || 0),
        total_worked_minutes: Number(shiftStats?.total_worked_minutes || 0),
        total_break_minutes: Number(shiftStats?.total_break_minutes || 0),
        total_extra_break_minutes: Number(shiftStats?.total_extra_break_minutes || 0),
        total_overtime_minutes: Number(shiftStats?.total_overtime_minutes || 0),
        total_late_minutes: Number(shiftStats?.total_late_minutes || 0),
        total_early_leave_minutes: Number(shiftStats?.total_early_leave_minutes || 0),
        average_worked_minutes: Number(Number(shiftStats?.avg_worked_minutes || 0).toFixed(2)),
      },
      leaves_this_month: leaveStats,
      holidays: {
        total: Number(holidayStats?.total_holidays || 0),
        optional: Number(holidayStats?.optional_holidays || 0),
        mandatory: Number(holidayStats?.mandatory_holidays || 0),
      },
    });
  } catch (error) {
    console.error("GET /dashboard-summary ERROR:", error);

    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

export default router;
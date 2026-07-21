import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import {
  toISTString, convertToISTFields, getYearFromDate, getDaysInMonth, eachDateBetween,
  buildMonthDateRange, formatMinutes, formatToDate, normalizeWeekends, isWeekendDate, isDateAfter, isBeforeJoining,
  isSameDate, getDayName, getCurrentDate, getISTNow, isDateBefore, formatTime12Hour,
} from "../utils/time.js";
import { sendSuccess, sendError, safeNumber, toBoolean, buildMeta } from "../utils/sendResponse.js";
import { buildFileUrl } from "../utils/fileService.js";
import { getEnumObject } from "../utils/constantsValidator.js";
import { DESIGNATIONS, EMPLOYMENT_TYPES, SALARY_TYPES } from "../constants/constants_values.js";
import { SHIFT } from "../constants/permissions.js";

const router = express.Router();

router.get("/my-calendar", auth(SHIFT.EMP), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const companyId = safeNumber(req.company?.id, 0);
    const userId = safeNumber(req.user?.id, 0);

    if (!Number.isInteger(companyId) || companyId <= 0 || !Number.isInteger(userId) || userId <= 0) {
      return sendError(res, 400, "Invalid auth context");
    }

    const currentDate = getCurrentDate();
    const currentYear = getYearFromDate(currentDate);
    const currentMonth = safeNumber(currentDate.slice(5, 7), 1);

    const year = safeNumber(req.query.year, currentYear);
    const month = safeNumber(req.query.month, currentMonth);

    if (!Number.isInteger(year) || year < 2000 || year > currentYear + 5) {
      return sendError(res, 400, "Invalid year");
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return sendError(res, 400, "Invalid month");
    }

    const { start_date: startDate, end_date: endDate, total_days: totalDays } = buildMonthDateRange(year, month);

    const hasEmployeeIdInQuery =
      req.query.employee_id !== undefined &&
      req.query.employee_id !== null &&
      String(req.query.employee_id).trim() !== "";

    let employeeId = null;

    if (hasEmployeeIdInQuery) {
      employeeId = safeNumber(req.query.employee_id, 0);
      if (!Number.isInteger(employeeId) || employeeId <= 0) {
        return sendError(res, 400, "Valid employee_id required");
      }
    } else {
      const [[loggedInEmployee]] = await conn.query(
        `SELECT id FROM employees
         WHERE user_id = ? AND company_id = ? AND is_deleted = 0 AND is_active = 1
         LIMIT 1`,
        [userId, companyId]
      );

      if (!loggedInEmployee) {
        return sendError(res, 404, "Employee not found");
      }

      employeeId = safeNumber(loggedInEmployee.id, 0);
    }

    const [[employee]] = await conn.query(
      `SELECT id, joining_date, weekends, shift_start, shift_end,
              break_minutes, expected_work_minutes
       FROM employees
       WHERE id = ? AND company_id = ? AND is_deleted = 0 AND is_active = 1
       LIMIT 1`,
      [employeeId, companyId]
    );

    if (!employee) {
      return sendError(res, 404, "Employee not found");
    }

    const joiningDate = employee.joining_date ? formatToDate(employee.joining_date) : null;
    const weekends = normalizeWeekends(employee.weekends);

    const [
      attendanceResult,
      holidayResult,
      leaveResult,
      logsResult
    ] = await Promise.all([
      conn.query(
        `SELECT id, attendance_date, type, start_time, end_time,
                is_deductible, is_verified, day_status,
                created_by, verified_by,
                ROUND(CASE WHEN start_time IS NOT NULL AND end_time IS NOT NULL
                      THEN TIME_TO_SEC(TIMEDIFF(end_time, start_time)) / 60
                      ELSE 0 END, 2) AS total_minutes
         FROM attendance
         WHERE employee_id = ? AND company_id = ?
           AND attendance_date BETWEEN ? AND ?
         ORDER BY attendance_date ASC, id ASC`,
        [employeeId, companyId, startDate, endDate]
      ),
      conn.query(
        `SELECT date, name, is_optional
         FROM holidays
         WHERE company_id = ? AND is_deleted = 0 AND is_active = 1
           AND date BETWEEN ? AND ?`,
        [companyId, startDate, endDate]
      ),
      conn.query(
        `SELECT el.start_date, el.end_date, el.is_half_day,
                el.half_day_type, lc.code, lc.name
         FROM employee_leaves el
         INNER JOIN leave_configs lc ON lc.id = el.leave_config_id
         WHERE el.employee_id = ? AND el.company_id = ?
           AND el.status = 'approved' AND el.is_deleted = 0 AND el.is_active = 1
           AND NOT (el.end_date < ? OR el.start_date > ?)`,
        [employeeId, companyId, startDate, endDate]
      ),
      conn.query(
        `SELECT a.attendance_date, a.type AS attendance_type,
                al.log_type, al.method, al.time, al.extra_data,
                al.created_by
         FROM attendance_logs al
         INNER JOIN attendance a ON a.id = al.attendance_id
         WHERE a.employee_id = ? AND a.company_id = ?
           AND a.attendance_date BETWEEN ? AND ?
         ORDER BY a.attendance_date ASC, al.time DESC, al.id DESC`,
        [employeeId, companyId, startDate, endDate]
      )
    ]);

    const attendanceRows = attendanceResult[0];
    const holidayRows = holidayResult[0];
    const leaveRows = leaveResult[0];
    const logsRows = logsResult[0];

    const formatTime = (time) => {
      if (!time) return null;
      const [h, m] = String(time).split(":");
      const hour = Number(h);
      const suffix = hour >= 12 ? "PM" : "AM";
      const formattedHour = hour % 12 || 12;
      return `${String(formattedHour).padStart(2, "0")}:${m} ${suffix}`;
    };

    const mapLogType = ({ attendanceType, logType }) => {
      if (attendanceType === "attendance") {
        if (logType === "start") return "PUNCH_IN";
        if (logType === "end") return "PUNCH_OUT";
      }
      if (attendanceType === "break") {
        if (logType === "start") return "BREAK_START";
        if (logType === "end") return "BREAK_END";
      }
      return logType;
    };

    const holidayMap = new Map();
    holidayRows.forEach((row) => {
      holidayMap.set(formatToDate(row.date), {
        name: row.name,
        is_optional: toBoolean(row.is_optional)
      });
    });

    const leaveMap = new Map();
    leaveRows.forEach((row) => {
      eachDateBetween(
        formatToDate(row.start_date),
        formatToDate(row.end_date),
        (date) => {
          leaveMap.set(date, {
            code: row.code,
            name: row.name,
            type: toBoolean(row.is_half_day) ? "half_day" : "full_day",
            half_day_type: row.half_day_type || null
          });
        }
      );
    });

    const attendanceMap = new Map();
    const logEntries = [];

    attendanceRows.forEach((row) => {
      const date = formatToDate(row.attendance_date);

      if (!attendanceMap.has(date)) {
        attendanceMap.set(date, {
          day_status: row.day_status,
          is_approved: toBoolean(row.is_verified),
          verified_by: row.verified_by,
          activities: [],
          breaks: [],
          logs: [],
          worked_minutes: 0,
          break_minutes: 0
        });
      }

      const day = attendanceMap.get(date);

      const activity =
        row.type === "attendance"
          ? [
            {
              type: "PUNCH_IN",
              time: formatTime(row.start_time),
              attendance_method: "manual",
              created_by: row.created_by
            },
            {
              type: "PUNCH_OUT",
              time: formatTime(row.end_time),
              attendance_method: "manual",
              created_by: row.created_by
            }
          ]
          : [
            {
              type: "BREAK_START",
              time: formatTime(row.start_time),
              attendance_method: "manual",
              created_by: row.created_by
            },
            {
              type: "BREAK_END",
              time: formatTime(row.end_time),
              attendance_method: "manual",
              created_by: row.created_by
            }
          ];

      if (row.type === "attendance") {
        day.activities.push(...activity);
        day.worked_minutes += safeNumber(row.total_minutes);
      } else {
        day.breaks.push(...activity);
        if (toBoolean(row.is_deductible)) {
          day.break_minutes += safeNumber(row.total_minutes);
        }
      }
    });

    logsRows.forEach((row) => {
      const date = formatToDate(row.attendance_date);
      const day = attendanceMap.get(date);
      if (!day) return;

      const log = {
        log_type:
          row.log_type === "day_status"
            ? "day_status"
            : mapLogType({ attendanceType: row.attendance_type, logType: row.log_type }),
        time: formatTime(row.time),
        created_by: row.created_by
      };

      if (row.log_type !== "day_status") {
        log.attendance_method = row.method;
      }

      if (row.extra_data) {
        try {
          const extra = JSON.parse(row.extra_data);
          if (extra.day_status) log.day_status = extra.day_status;
        } catch (_) { }
      }

      day.logs.push(log);
      logEntries.push(log);
    });

    const userIdsToFetch = new Set();

    for (const [, day] of attendanceMap) {
      if (day.verified_by) userIdsToFetch.add(day.verified_by);
      for (const punch of day.activities) {
        if (punch.created_by) userIdsToFetch.add(punch.created_by);
      }
      for (const breakEvent of day.breaks) {
        if (breakEvent.created_by) userIdsToFetch.add(breakEvent.created_by);
      }
    }

    for (const log of logEntries) {
      if (log.created_by) userIdsToFetch.add(log.created_by);
    }

    userIdsToFetch.delete(null);
    userIdsToFetch.delete(0);
    userIdsToFetch.delete(undefined);

    const userMap = new Map();

    if (userIdsToFetch.size > 0) {
      const uniqueIds = Array.from(userIdsToFetch);

      const [userRows] = await conn.query(
        `SELECT id, name FROM users WHERE id IN (?)`,
        [uniqueIds]
      );

      const [[company]] = await conn.query(
        `SELECT owner_user_id FROM companies WHERE id = ?`,
        [companyId]
      );
      const ownerUserId = company ? company.owner_user_id : null;

      const [empRows] = await conn.query(
        `SELECT user_id FROM employees
         WHERE company_id = ? AND user_id IN (?)
           AND is_active = 1 AND is_deleted = 0`,
        [companyId, uniqueIds]
      );
      const employeeUserIds = new Set(empRows.map(r => r.user_id));

      for (const u of userRows) {
        let role = "employee";
        if (u.id === ownerUserId) {
          role = "company_owner";
        } else if (employeeUserIds.has(u.id)) {
          role = "employee";
        }
        userMap.set(u.id, { name: u.name, role });
      }
    }

    for (const [, day] of attendanceMap) {
      day.verified_by = day.verified_by ? (userMap.get(day.verified_by) || null) : null;

      for (const punch of day.activities) {
        punch.created_by = punch.created_by ? (userMap.get(punch.created_by) || null) : null;
      }

      for (const breakEvent of day.breaks) {
        breakEvent.created_by = breakEvent.created_by ? (userMap.get(breakEvent.created_by) || null) : null;
      }

      for (const log of day.logs) {
        log.created_by = log.created_by ? (userMap.get(log.created_by) || null) : null;
      }
    }

    const days = {};
    let presentCount = 0, absentCount = 0, leaveCount = 0, holidayCount = 0;
    let weekendCount = 0, halfDayCount = 0, notJoinedCount = 0, upcomingCount = 0;
    let totalWorkedMinutes = 0, totalBreakMinutes = 0;
    let totalExpectedMinutes = 0, totalExpectedBreakMinutes = 0, totalOvertimeMinutes = 0;

    for (let day = 1; day <= totalDays; day++) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      const attendance = attendanceMap.get(date);
      const holiday = holidayMap.get(date);
      const leave = leaveMap.get(date);

      const isFuture = isDateAfter(date, currentDate);
      const isBeforeJoiningDate = isBeforeJoining(date, joiningDate);
      const isWeekend = isWeekendDate({ date, weekends });

      const obj = {};

      if (isBeforeJoiningDate) {
        obj.day_status = "not_joined";
        notJoinedCount++;
        days[date] = obj;
        continue;
      }

      if (isFuture) {

        if (holiday) {
          obj.is_holiday = {
            name: holiday.name,
            is_optional: holiday.is_optional
          };
        }

        if (leave) {
          obj.is_leave = {
            code: leave.code,
            name: leave.name,
            type: leave.type,
            half_day_type: leave.half_day_type
          };
        }

        if (holiday) {
          obj.day_status = "holiday";
          holidayCount++;
        }

        else if (leave) {
          obj.day_status = "leave";
          leaveCount++;
        }

        else if (isWeekend) {
          obj.day_status = "weekend";
          weekendCount++;
        }

        else {
          obj.day_status = "upcoming";
          upcomingCount++;
        }

        days[date] = obj;
        continue;
      }
      if (!holiday && !isWeekend) {
        totalExpectedMinutes += safeNumber(employee.expected_work_minutes);
        totalExpectedBreakMinutes += safeNumber(employee.break_minutes);
      }

      if (holiday) obj.is_holiday = { name: holiday.name, is_optional: holiday.is_optional };
      if (leave) obj.is_leave = { code: leave.code, name: leave.name, type: leave.type, half_day_type: leave.half_day_type };

      if (attendance) {
        const workedMinutes = Math.max(0, attendance.worked_minutes - attendance.break_minutes);
        const overtimeMinutes = Math.max(0, workedMinutes - safeNumber(employee.expected_work_minutes));

        totalWorkedMinutes += workedMinutes;
        totalBreakMinutes += attendance.break_minutes;
        totalOvertimeMinutes += overtimeMinutes;

        obj.day_status = attendance.day_status;
        obj.is_approved = attendance.is_approved;
        obj.verified_by = attendance.verified_by;
        obj.is_deductible = attendance.break_minutes > 0;
        obj.is_overtime = overtimeMinutes > 0;

        if (attendance.activities.length > 0) obj.activities = attendance.activities;
        if (attendance.breaks.length > 0) obj.breaks = attendance.breaks;
        if (attendance.logs.length > 0) obj.logs = attendance.logs;
      } else if (leave) {
        obj.day_status = "leave";
      } else if (holiday) {
        obj.day_status = "holiday";
      } else if (isWeekend) {
        obj.day_status = "weekend";
      } else {
        obj.day_status = "absent";
        obj.logs = [];
      }

      switch (obj.day_status) {
        case "present": presentCount++; break;
        case "absent": absentCount++; break;
        case "leave": leaveCount++; break;
        case "holiday": holidayCount++; break;
        case "weekend": weekendCount++; break;
        case "half_day": halfDayCount++; break;
      }

      days[date] = obj;
    }

    return sendSuccess(res, 200, "Calendar fetched successfully", {
      shift: {
        start_time: formatTime(employee.shift_start),
        end_time: formatTime(employee.shift_end),
        expected_work_minutes: safeNumber(employee.expected_work_minutes),
        break_minutes: safeNumber(employee.break_minutes)
      },
      days,
      statistics: {
        expected_work_minutes: totalExpectedMinutes,
        worked_minutes: totalWorkedMinutes,
        expected_break_minutes: totalExpectedBreakMinutes,
        break_minutes: totalBreakMinutes,
        overtime_minutes: totalOvertimeMinutes
      }
    }, {
      year, month, total_days: totalDays,
      present: presentCount, absent: absentCount, leave: leaveCount,
      holiday: holidayCount, weekend: weekendCount, half_day: halfDayCount,
      not_joined: notJoinedCount, upcoming: upcomingCount
    });

  } catch (error) {
    console.error("MY_CALENDAR_ERROR:", error);
    return sendError(res, 500, "Failed to fetch calendar");
  } finally {
    if (conn) conn.release();
  }
});

const createEmptyMonthlySummary = () => ({
  present_days: 0,
  absent_days: 0,
  leave_days: 0,
  holiday_days: 0,
  weekend_days: 0,
  worked_minutes: 0,
  break_minutes: 0,
  overtime_minutes: 0
});

const createEmptyShiftCounts = () => ({
  employees: 0,
  present_days: 0,
  absent_days: 0,
  leave_days: 0,
  holiday_days: 0,
  weekend_days: 0,
  worked_minutes: 0,
  break_minutes: 0,
  overtime_minutes: 0
});

function computeEmployeeMonthlySummary({
  employeeId,
  weekends,
  joiningDateRaw,
  year,
  month,
  totalDays,
  today,
  shiftMap,
  holidayMap,
  leaveMap
}) {
  const joiningDate = joiningDateRaw
    ? formatToDate(joiningDateRaw)
    : null;

  if (!joiningDate) {
    return null;
  }

  const monthlySummary = createEmptyMonthlySummary();

  for (let day = 1; day <= totalDays; day++) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    if (isDateBefore(date, joiningDate)) {
      continue;
    }

    const key = `${employeeId}_${date}`;
    const shift = shiftMap.get(key);
    const holiday = holidayMap.get(date);
    const leave = leaveMap.get(key);
    const isWeekend = isWeekendDate({ date, weekends });
    const isFuture = isDateAfter(date, today);

    let status = "absent";

    if (isFuture) {
      status = "upcoming";
    } else if (holiday) {
      status = "holiday";
    } else if (leave) {
      status = leave.is_half_day ? "half_day_leave" : "leave";
    } else if (isWeekend) {
      status = "weekend";
    } else if (shift && safeNumber(shift.worked_minutes) > 0) {
      status = "present";
    }

    if (!isFuture) {
      switch (status) {
        case "present":
          monthlySummary.present_days++;
          break;
        case "absent":
          monthlySummary.absent_days++;
          break;
        case "leave":
        case "half_day_leave":
          monthlySummary.leave_days++;
          break;
        case "holiday":
          monthlySummary.holiday_days++;
          break;
        case "weekend":
          monthlySummary.weekend_days++;
          break;
      }
    }

    const workedMinutes = safeNumber(shift?.worked_minutes);
    const breakMinutes = safeNumber(shift?.allowed_break_minutes);
    const overtimeMinutes = safeNumber(shift?.overtime_minutes);

    monthlySummary.worked_minutes += workedMinutes;
    monthlySummary.break_minutes += breakMinutes;
    monthlySummary.overtime_minutes += overtimeMinutes;
  }

  return monthlySummary;
}

function accumulateShiftCounts(counts, summary) {
  counts.employees++;
  counts.present_days += summary.present_days;
  counts.absent_days += summary.absent_days;
  counts.leave_days += summary.leave_days;
  counts.holiday_days += summary.holiday_days;
  counts.weekend_days += summary.weekend_days;
  counts.worked_minutes += summary.worked_minutes;
  counts.break_minutes += summary.break_minutes;
  counts.overtime_minutes += summary.overtime_minutes;
}

router.get("/employees-shifts", auth(SHIFT.MNG), async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const companyId = safeNumber(req.company?.id);

    if (!companyId) {
      return sendError(res, 400, "Company context missing");
    }

    const page = Math.max(1, safeNumber(req.query.page, 1));
    const limit = Math.min(
      100,
      Math.max(1, safeNumber(req.query.limit, 10))
    );
    const offset = (page - 1) * limit;

    const search = String(req.query.search || "").trim();
    const searchLike = search ? `%${search}%` : null;

    const today = getCurrentDate();
    const now = getISTNow();
    const year = safeNumber(req.query.year, now.year());
    const month = safeNumber(req.query.month, now.month() + 1);

    if (month < 1 || month > 12) {
      return sendError(res, 400, "Invalid month");
    }

    const {
      start_date: startDate,
      end_date: endDate,
      total_days: totalDays
    } = buildMonthDateRange(year, month);

    const selectedYearMonth = `${year}-${String(month).padStart(2, "0")}`;

    const employeeWhere = `
        e.company_id = ?
        AND e.is_deleted = 0
        AND u.is_deleted = 0
        AND e.joining_date IS NOT NULL
        AND DATE_FORMAT(e.joining_date, '%Y-%m') <= ?

        ${searchLike
        ? `
            AND (
              u.name LIKE ?
              OR u.email LIKE ?
              OR e.employee_code LIKE ?
            )
          `
        : ""
      }
      `;

    const employeeParams = [companyId, selectedYearMonth];

    if (searchLike) {
      employeeParams.push(searchLike, searchLike, searchLike);
    }

    const [[{ total }]] = await conn.query(
      `
          SELECT
            COUNT(*) AS total

          FROM employees e

          INNER JOIN users u
            ON u.id = e.user_id

          WHERE ${employeeWhere}
          `,
      employeeParams
    );

    const emptyCounts = createEmptyShiftCounts();
    const responseMeta = {
      filters: {
        year,
        month,
        search: search || null
      },
      counts: emptyCounts
    };

    if (!total) {
      return sendSuccess(
        res,
        200,
        "No employees found",
        [],
        {
          ...buildMeta(page, limit, 0, 0),
          ...responseMeta
        }
      );
    }

    const [allEmployeesForStats] = await conn.query(
      `
          SELECT
            e.id AS employee_id,
            e.weekends,
            e.joining_date

          FROM employees e

          INNER JOIN users u
            ON u.id = e.user_id

          WHERE ${employeeWhere}

          ORDER BY u.name ASC
          `,
      employeeParams
    );

    const allEmployeeIds = allEmployeesForStats.map((e) => e.employee_id);

    const [shiftRows] = await conn.query(
      `
          SELECT
            employee_id,
            shift_date,
            worked_minutes,
            allowed_break_minutes,
            overtime_minutes

          FROM shifts

          WHERE company_id = ?
            AND is_deleted = 0
            AND employee_id IN (?)
            AND shift_date BETWEEN ? AND ?
          `,
      [
        companyId,
        allEmployeeIds,
        startDate,
        endDate
      ]
    );

    const [holidayRows] = await conn.query(
      `
          SELECT
            date,
            name

          FROM holidays

          WHERE company_id = ?
            AND is_deleted = 0
            AND is_active = 1
            AND date BETWEEN ? AND ?
          `,
      [
        companyId,
        startDate,
        endDate
      ]
    );

    const [leaveRows] = await conn.query(
      `
          SELECT
            employee_id,
            start_date,
            end_date,
            is_half_day

          FROM employee_leaves

          WHERE company_id = ?
            AND status = 'approved'
            AND is_deleted = 0
            AND employee_id IN (?)
            AND NOT (
              end_date < ?
              OR start_date > ?
            )
          `,
      [
        companyId,
        allEmployeeIds,
        startDate,
        endDate
      ]
    );

    const shiftMap = new Map();
    for (const row of shiftRows) {
      shiftMap.set(`${row.employee_id}_${row.shift_date}`, row);
    }

    const holidayMap = new Map();
    for (const row of holidayRows) {
      holidayMap.set(row.date, row);
    }

    const leaveMap = new Map();
    for (const leave of leaveRows) {
      eachDateBetween(leave.start_date, leave.end_date, (date) => {
        leaveMap.set(`${leave.employee_id}_${date}`, leave);
      });
    }

    const summaryContext = {
      year,
      month,
      totalDays,
      today,
      shiftMap,
      holidayMap,
      leaveMap
    };

    const counts = createEmptyShiftCounts();

    for (const emp of allEmployeesForStats) {
      const monthlySummary = computeEmployeeMonthlySummary({
        employeeId: emp.employee_id,
        weekends: emp.weekends,
        joiningDateRaw: emp.joining_date,
        ...summaryContext
      });

      if (monthlySummary) {
        accumulateShiftCounts(counts, monthlySummary);
      }
    }

    const [employees] = await conn.query(
      `
          SELECT
            e.id AS employee_id,
            e.employee_code,
            e.designation,
            e.employment_type,
            e.salary_type,
            e.weekends,
            e.expected_work_minutes,
            e.break_minutes AS expected_break_minutes,
            e.grace_minutes,
            e.joining_date,
            e.status,
            e.is_active,

            u.name,
            u.email,
            u.phone,
            u.profile_picture

          FROM employees e

          INNER JOIN users u
            ON u.id = e.user_id

          WHERE ${employeeWhere}

          ORDER BY u.name ASC

          LIMIT ? OFFSET ?
          `,
      [
        ...employeeParams,
        limit,
        offset
      ]
    );

    const data = [];

    for (const emp of employees) {
      const joiningDate = emp.joining_date
        ? formatToDate(emp.joining_date)
        : null;

      if (!joiningDate) {
        continue;
      }

      const monthlySummary = computeEmployeeMonthlySummary({
        employeeId: emp.employee_id,
        weekends: emp.weekends,
        joiningDateRaw: emp.joining_date,
        ...summaryContext
      });

      if (!monthlySummary) {
        continue;
      }

      const employeeObj = {
        employee_id: emp.employee_id,
        employee_code: emp.employee_code,
        name: emp.name,
        designation: getEnumObject(DESIGNATIONS, emp.designation),
        employment_type: getEnumObject(EMPLOYMENT_TYPES, emp.employment_type),
        salary_type: getEnumObject(SALARY_TYPES, emp.salary_type),
        status: toBoolean(emp.is_active) && String(emp.status).toLowerCase() === "active",
        joining_date: joiningDate,
        email: emp.email,
        phone: emp.phone,
        expected_work_minutes: safeNumber(emp.expected_work_minutes),
        expected_break_minutes: safeNumber(emp.expected_break_minutes),
        grace_minutes: safeNumber(emp.grace_minutes),
        weekends: normalizeWeekends(emp.weekends),
        monthly_summary: monthlySummary
      };

      if (emp.profile_picture) {
        employeeObj.profile_picture = buildFileUrl(emp.profile_picture);
      }

      data.push(employeeObj);
    }

    return sendSuccess(
      res,
      200,
      "Employee monthly shift calendar fetched successfully",
      data,
      {
        ...buildMeta(page, limit, total, data.length),
        filters: {
          year,
          month,
          search: search || null
        },
        counts
      }
    );
  } catch (error) {
    console.error("EMPLOYEE_SHIFT_MONTHLY_API_ERROR", error);
    return sendError(
      res,
      500,
      "Failed to fetch employee monthly shift calendar"
    );
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

export default router;
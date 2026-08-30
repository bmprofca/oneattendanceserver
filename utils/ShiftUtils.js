import {
    parseDate, normalizeHalfDayType, parseOvertimeValue, alignTimeToShift, shiftNextDayIfBefore,
    diffMinutesBetween, formatDatetime, earliestDt, latestDt, buildShiftAnchor, buildMonthDateRange
} from "./time.js";


const EMPLOYEE_SHIFT_QUERY = `
    SELECT
        e.id,
        e.company_id,
        e.shift_start,
        e.shift_end,
        e.expected_work_minutes,
        e.break_minutes,
        e.grace_minutes,
        e.enable_overtime,
        e.enable_deduction
    FROM employees e
    WHERE
        e.id = ?
        AND e.company_id = ?
        AND e.is_active = 1
        AND e.is_deleted = 0
    LIMIT 1
    FOR UPDATE
`;

const ATTENDANCE_QUERY = `
    SELECT
        a.id,
        a.type,
        a.start_time,
        a.end_time,
        a.is_deductible,
        a.is_overtime,
        a.day_status,
        a.value1,
        a.value2,
        a.value3
    FROM attendance a
    WHERE
        a.employee_id = ?
        AND a.company_id = ?
        AND a.attendance_date = ?
    ORDER BY a.id ASC
    FOR UPDATE
`;

const SHIFT_STATS_QUERY = `
    SELECT
        COUNT(*) AS total_days,
        SUM(CASE
                WHEN a.day_status = 'present' THEN 1
                WHEN a.day_status = 'half_day' THEN 1
                WHEN a.day_status = 'leave' AND a.value1 = 'paid' THEN 1
                ELSE 0
            END) AS payable_days,

        SUM(CASE WHEN a.day_status = 'present' THEN 1 ELSE 0 END) AS present_days,
        SUM(CASE WHEN a.day_status = 'half_day' THEN 1 ELSE 0 END) AS half_days,
        SUM(CASE WHEN a.day_status = 'absent' THEN 1 ELSE 0 END) AS absent_days,
        SUM(CASE WHEN a.day_status = 'leave' AND a.value1 = 'paid' THEN 1 ELSE 0 END) AS paid_leave_days,
        SUM(CASE WHEN a.day_status = 'leave' AND a.value1 = 'unpaid' THEN 1 ELSE 0 END) AS unpaid_leave_days,
        SUM(CASE WHEN a.value2 = 'weekend' THEN 1 ELSE 0 END) AS weekend_days,
        SUM(CASE WHEN a.value2 = 'holiday' THEN 1 ELSE 0 END) AS holiday_days,

        SUM(COALESCE(e.expected_work_minutes, 0)) AS expected_work_minutes,

        SUM(CASE
                WHEN a.type = 'attendance' AND a.start_time IS NOT NULL AND a.end_time IS NOT NULL THEN
                    GREATEST(
                        0,
                        TIMESTAMPDIFF(
                            MINUTE,
                            CONCAT(a.attendance_date, ' ', a.start_time),
                            CONCAT(a.attendance_date, ' ', a.end_time)
                        ) + CASE WHEN a.end_time < a.start_time THEN 1440 ELSE 0 END
                    )
                ELSE 0
            END) AS worked_minutes,

        SUM(CASE
                WHEN a.type = 'attendance' AND a.start_time IS NOT NULL AND a.end_time IS NOT NULL THEN
                    GREATEST(
                        0,
                        TIMESTAMPDIFF(
                            MINUTE,
                            CONCAT(a.attendance_date, ' ', e.shift_start),
                            CONCAT(a.attendance_date, ' ', a.start_time)
                        )
                    )
                ELSE 0
            END) AS late_minutes,

        SUM(CASE
                WHEN a.type = 'attendance' AND a.start_time IS NOT NULL AND a.end_time IS NOT NULL THEN
                    GREATEST(
                        0,
                        TIMESTAMPDIFF(
                            MINUTE,
                            CONCAT(a.attendance_date, ' ', a.end_time),
                            CONCAT(a.attendance_date, ' ', e.shift_end)
                        )
                    )
                ELSE 0
            END) AS early_leave_minutes,

        SUM(CASE
                WHEN a.type = 'attendance' AND a.is_deductible = 1 AND a.start_time IS NOT NULL AND a.end_time IS NOT NULL THEN
                    GREATEST(
                        0,
                        CAST(e.expected_work_minutes AS SIGNED) - (
                            TIMESTAMPDIFF(
                                MINUTE,
                                CONCAT(a.attendance_date, ' ', a.start_time),
                                CONCAT(a.attendance_date, ' ', a.end_time)
                            ) + CASE WHEN a.end_time < a.start_time THEN 1440 ELSE 0 END
                        )
                    )
                ELSE 0
            END) AS deductible_minutes,

        SUM(CASE
                WHEN a.type = 'attendance' AND a.is_overtime = 1 AND a.start_time IS NOT NULL AND a.end_time IS NOT NULL THEN
                    GREATEST(
                        0,
                        (
                            TIMESTAMPDIFF(
                                MINUTE,
                                CONCAT(a.attendance_date, ' ', a.start_time),
                                CONCAT(a.attendance_date, ' ', a.end_time)
                            ) + CASE WHEN a.end_time < a.start_time THEN 1440 ELSE 0 END
                        ) - CAST(e.expected_work_minutes AS SIGNED)
                        + CASE WHEN a.value3 REGEXP '^[0-9]+$' THEN CAST(a.value3 AS SIGNED) ELSE 0 END
                    )
                ELSE 0
            END) AS overtime_minutes,

        SUM(CASE WHEN a.is_deductible = 1 THEN 1 ELSE 0 END) AS deductible_days,
        SUM(CASE WHEN a.is_overtime = 1 THEN 1 ELSE 0 END) AS overtime_days,

        SUM(CASE
                WHEN a.day_status = 'present' THEN CAST(e.expected_work_minutes AS SIGNED)
                WHEN a.day_status = 'half_day' THEN CAST(e.expected_work_minutes AS SIGNED) / 2
                WHEN a.day_status = 'leave' AND a.value1 = 'paid' THEN CAST(e.expected_work_minutes AS SIGNED)
                ELSE 0
            END) AS payable_work_minutes

    FROM attendance a
    INNER JOIN employees e
        ON e.id = a.employee_id
        AND e.company_id = a.company_id
    WHERE a.company_id = ?
        AND a.employee_id = ?
        AND a.attendance_date BETWEEN ? AND ?
        AND a.type = 'attendance'
        AND e.is_deleted = 0
        AND e.is_active = 1
`;

export const getShiftStats = async ({ conn, companyId, employeeId, fromDate, toDate }) => {
    const [year, month] = String(fromDate).split("-").map(Number);
    const { total_days: month_total_days } = buildMonthDateRange(year, month);

    const [[stats]] = await conn.query(
        SHIFT_STATS_QUERY,
        [companyId, employeeId, fromDate, toDate]
    );

    const expectedWorkMinutes = Number(stats?.expected_work_minutes || 0);
    const workedMinutes = Number(stats?.worked_minutes || 0);
    const deductibleMinutes = Number(stats?.deductible_minutes || 0);
    const overtimeMinutes = Number(stats?.overtime_minutes || 0);
    const payableDays = Number(stats?.payable_days || 0);
    const payableWorkMinutes = Number(stats?.payable_work_minutes || 0);
    const attendancePercentage = expectedWorkMinutes > 0 ? Number(((workedMinutes / expectedWorkMinutes) * 100).toFixed(2)) : 0;

    return {
        month_total_days,
        total_days: Number(stats?.total_days || 0),
        payable_days: payableDays,
        present_days: Number(stats?.present_days || 0),
        half_days: Number(stats?.half_days || 0),
        absent_days: Number(stats?.absent_days || 0),
        paid_leave_days: Number(stats?.paid_leave_days || 0),
        unpaid_leave_days: Number(stats?.unpaid_leave_days || 0),
        weekend_days: Number(stats?.weekend_days || 0),
        holiday_days: Number(stats?.holiday_days || 0),
        expected_work_minutes: expectedWorkMinutes,
        payable_work_minutes: payableWorkMinutes,
        worked_minutes: workedMinutes,
        allowed_break_minutes: Number(stats?.allowed_break_minutes || 0),
        extra_break_minutes: Number(stats?.extra_break_minutes || 0),
        early_leave_minutes: Number(stats?.early_leave_minutes || 0),
        late_minutes: Number(stats?.late_minutes || 0),
        deductible_minutes: deductibleMinutes,
        overtime_minutes: overtimeMinutes,
        deductible_days: Number(stats?.deductible_days || 0),
        overtime_days: Number(stats?.overtime_days || 0),
        attendance_percentage: attendancePercentage
    };
};


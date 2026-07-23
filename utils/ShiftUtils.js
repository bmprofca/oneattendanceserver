import {
    isValidDate, normalizeHalfDayType, parseOvertimeValue, alignTimeToShift, shiftNextDayIfBefore,
    diffMinutesBetween, formatDatetime, earliestDt, latestDt, buildShiftAnchor, buildMonthDateRange
} from "./time.js";


export const getShiftStats = async ({ conn, companyId, employeeId, fromDate, toDate }) => {
    const [year, month] = String(fromDate).split("-").map(Number);
    const { total_days: month_total_days } = buildMonthDateRange(year, month);

    const [[stats]] = await conn.query(
        `
    SELECT
    COUNT(*) AS total_days,
        SUM( CASE 
                WHEN day_status = 'present' THEN 1 
                WHEN day_status = 'half_day' THEN 1 
                WHEN day_status = 'leave' AND value1 = 'paid' THEN 1 ELSE 0 END
            ) AS payable_days,

        SUM( CASE 
                WHEN day_status = 'present' THEN 1 ELSE 0 END
            ) AS present_days,

        SUM( CASE 
                WHEN day_status = 'half_day' THEN 1 ELSE 0 END
            ) AS half_days,

        SUM( CASE
                WHEN day_status = 'absent' THEN 1 ELSE 0 END
            ) AS absent_days,

        SUM( CASE 
                WHEN day_status = 'leave' AND value1 = 'paid' THEN 1 ELSE 0 END
            ) AS paid_leave_days,

        SUM( CASE 
                WHEN day_status = 'leave' AND value1 = 'unpaid' THEN 1 ELSE 0 END
            ) AS unpaid_leave_days,

        SUM( CASE 
                WHEN value2 = 'weekend' THEN 1 ELSE 0 END
            ) AS weekend_days,

        SUM( CASE 
                WHEN value2 = 'holiday' THEN 1 ELSE 0 END
            ) AS holiday_days,

        SUM(COALESCE(expected_work_minutes, 0)) AS expected_work_minutes,

        SUM(COALESCE(worked_minutes, 0)) AS worked_minutes,

        SUM(COALESCE(allowed_break_minutes, 0)) AS allowed_break_minutes,

        SUM(COALESCE(extra_break_minutes, 0)) AS extra_break_minutes,

        SUM(COALESCE(early_leave_minutes, 0)) AS early_leave_minutes,

        SUM(COALESCE(late_minutes, 0)) AS late_minutes,

        SUM( CASE 
                WHEN is_deductible = 1 THEN COALESCE(deductible_minutes, 0) ELSE 0 END
            ) AS deductible_minutes,
             
        SUM( CASE 
                WHEN is_overtime = 1 THEN COALESCE(overtime_minutes, 0) ELSE 0 END
            ) AS overtime_minutes,

        SUM( CASE 
                WHEN is_deductible = 1 THEN 1 ELSE 0 END
            ) AS deductible_days,

        SUM( CASE 
                WHEN is_overtime = 1 THEN 1 ELSE 0 END
            ) AS overtime_days,

        SUM(
            CASE
                WHEN day_status = 'present'
                    THEN COALESCE(expected_work_minutes, 0)

                WHEN day_status = 'half_day'
                    THEN (COALESCE(expected_work_minutes, 0) / 2)

                WHEN day_status = 'leave'
                    AND value1 = 'paid'
                    THEN COALESCE(expected_work_minutes, 0)

                ELSE 0
            END
        ) AS payable_work_minutes

    FROM shifts

    WHERE 
    company_id = ? 
    AND employee_id = ? 
    AND shift_date BETWEEN ? AND ? 
    AND is_deleted = 0
    `,
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

export async function generateShift(conn, employee_id, company_id, date, modified_by) {

    if (!conn) {
        throw new Error("Database connection is required");
    }

    const eid = Number(employee_id);
    const cid = Number(company_id);
    const modBy = Number(modified_by);

    if (!Number.isInteger(eid) || eid <= 0) {
        throw new Error("Invalid employee_id");
    }

    if (!Number.isInteger(cid) || cid <= 0) {
        throw new Error("Invalid company_id");
    }

    if (!Number.isInteger(modBy) || modBy <= 0) {
        throw new Error("Invalid modified_by");
    }

    if (!isValidDate(date)) {
        throw new Error("Invalid date");
    }

    const [[employee]] = await conn.query(
        `SELECT
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
     FOR UPDATE`,
        [eid, cid]
    );

    if (!employee) {
        throw new Error("Employee not found");
    }

    const [attendanceRows] = await conn.query(
        `SELECT
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
     FOR UPDATE`,
        [eid, cid, date]
    );

    const attendanceRow = attendanceRows.find(r => r.type === "attendance") || null;

    const breakRows = attendanceRows.filter(r => r.type === "break");

    const expectedWorkMinutes = Number(employee.expected_work_minutes) || 0;

    const allowedBreakMinutes = Number(employee.break_minutes) || 0;

    const graceMinutes = Number(employee.grace_minutes) || 0;

    let workedMinutes = 0;
    let breakMinutes = 0;
    let extraBreakMinutes = 0;
    let earlyLeaveMinutes = 0;
    let lateMinutes = 0;
    let overtimeMinutes = 0;
    let deductibleMinutes = 0;

    let startTime = null;
    let endTime = null;

    let dayStatus = "absent";
    let value1 = null;
    let value2 = null;

    let isDeductible = 0;
    let isOvertime = 0;

    if (attendanceRow) {

        dayStatus = attendanceRow.day_status || "present";

        value1 = attendanceRow.value1 || null;

        value2 = attendanceRow.value2 || null;

        isDeductible = Number(attendanceRow.is_deductible) || 0;

        isOvertime = Number(attendanceRow.is_overtime) || 0;

        const enableOvertime = Number(employee.enable_overtime) === 1;
        const enableDeduction = Number(employee.enable_deduction) === 1;

        if (!enableOvertime) {
            isOvertime = 0;
        }

        if (!enableDeduction) {
            isDeductible = 0;
        }

        const shiftStartDt = buildShiftAnchor(date, employee.shift_start);

        let shiftEndDt = buildShiftAnchor(date, employee.shift_end);

        shiftEndDt = shiftNextDayIfBefore(shiftEndDt, shiftStartDt);

        const attendanceStartDt = alignTimeToShift(date, attendanceRow.start_time, shiftStartDt);

        let attendanceEndDt = alignTimeToShift(date, attendanceRow.end_time, shiftStartDt);

        attendanceEndDt = shiftNextDayIfBefore(attendanceEndDt, attendanceStartDt);

        startTime = formatDatetime(attendanceStartDt);

        endTime = formatDatetime(attendanceEndDt);

        for (const br of breakRows) {

            const breakStartDt = alignTimeToShift(date, br.start_time, shiftStartDt);

            let breakEndDt = alignTimeToShift(date, br.end_time, shiftStartDt);

            breakEndDt = shiftNextDayIfBefore(breakEndDt, breakStartDt);

            breakMinutes += diffMinutesBetween(breakStartDt, breakEndDt);

        }

        if (attendanceStartDt && attendanceEndDt && dayStatus !== "absent" && dayStatus !== "leave") {

            const actualStart = earliestDt([attendanceStartDt]);

            const actualEnd = latestDt([attendanceEndDt]);

            const presenceMinutes = diffMinutesBetween(actualStart, actualEnd);

            const rawWorkedMinutes = Math.max(0, presenceMinutes - breakMinutes);

            const paidBreakMinutes = Math.min(breakMinutes, allowedBreakMinutes);

            const effectiveWorkedMinutes = rawWorkedMinutes + paidBreakMinutes;
            extraBreakMinutes = Math.max(0, breakMinutes - allowedBreakMinutes);

            if (actualStart && shiftStartDt) {
                lateMinutes = Math.max(0, actualStart.diff(shiftStartDt, "minute"));
            }

            if (actualEnd && shiftEndDt) {
                earlyLeaveMinutes = Math.max(0, shiftEndDt.diff(actualEnd, "minute"));
            }

            let requiredMinutes = expectedWorkMinutes;

            let overtimeThreshold = expectedWorkMinutes + graceMinutes;

            if (dayStatus === "half_day") {

                requiredMinutes = Math.floor(expectedWorkMinutes / 2);
                overtimeThreshold = requiredMinutes + graceMinutes;

                value1 = normalizeHalfDayType(value1);
                value2 = null;
            }

            workedMinutes = Math.min(effectiveWorkedMinutes, requiredMinutes);

            if (isOvertime && enableOvertime && effectiveWorkedMinutes > overtimeThreshold) {
                overtimeMinutes = effectiveWorkedMinutes - requiredMinutes;
            } else {
                overtimeMinutes = 0;
            }

            if (isDeductible && enableDeduction) {
                deductibleMinutes = extraBreakMinutes + lateMinutes + earlyLeaveMinutes;
            } else {
                deductibleMinutes = 0;
            }
        }

        if (dayStatus === "leave") {

            workedMinutes = 0;
            breakMinutes = 0;
            extraBreakMinutes = 0;
            earlyLeaveMinutes = 0;
            lateMinutes = 0;
            deductibleMinutes = 0;

            startTime = null;
            endTime = null;

            if (value1 === "paid" && isOvertime && enableOvertime) {
                overtimeMinutes = parseOvertimeValue(attendanceRow.value3);
            } else {
                overtimeMinutes = 0;
            }
        }

        if (dayStatus === "absent") {
            workedMinutes = 0;
            breakMinutes = 0;
            extraBreakMinutes = 0;
            earlyLeaveMinutes = 0;
            lateMinutes = 0;
            overtimeMinutes = 0;
            deductibleMinutes = 0;

            startTime = null;
            endTime = null;

            value1 = null;
            value2 = null;
        }
    }

    await conn.query(
        `INSERT INTO shifts (
        company_id,
        employee_id,
        shift_date,
        start_time,
        end_time,
        expected_work_minutes,
        worked_minutes,
        allowed_break_minutes,
        extra_break_minutes,
        early_leave_minutes,
        late_minutes,
        overtime_minutes,
        deductible_minutes,
        is_deductible,
        is_overtime,
        day_status,
        value1,
        value2,
        created_by,
        updated_by
     ) VALUES (
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?
     )
     ON DUPLICATE KEY UPDATE
        start_time = VALUES(start_time),
        end_time = VALUES(end_time),
        expected_work_minutes = VALUES(expected_work_minutes),
        worked_minutes = VALUES(worked_minutes),
        allowed_break_minutes = VALUES(allowed_break_minutes),
        extra_break_minutes = VALUES(extra_break_minutes),
        early_leave_minutes = VALUES(early_leave_minutes),
        late_minutes = VALUES(late_minutes),
        overtime_minutes = VALUES(overtime_minutes),
        deductible_minutes = VALUES(deductible_minutes),
        is_deductible = VALUES(is_deductible),
        is_overtime = VALUES(is_overtime),
        day_status = VALUES(day_status),
        value1 = VALUES(value1),
        value2 = VALUES(value2),
        updated_by = VALUES(updated_by),
        updated_at = CURRENT_TIMESTAMP`,
        [
            cid,
            eid,
            date,
            startTime,
            endTime,
            expectedWorkMinutes,
            workedMinutes,
            allowedBreakMinutes,
            extraBreakMinutes,
            earlyLeaveMinutes,
            lateMinutes,
            overtimeMinutes,
            deductibleMinutes,
            isDeductible,
            isOvertime,
            dayStatus,
            value1,
            value2,
            modBy,
            modBy
        ]
    );

    return {
        success: true,
        employee_id: eid,
        company_id: cid,
        shift_date: date,
        calculations: {
            worked_minutes: workedMinutes,
            break_minutes: breakMinutes,
            extra_break_minutes: extraBreakMinutes,
            early_leave_minutes: earlyLeaveMinutes,
            late_minutes: lateMinutes,
            overtime_minutes: overtimeMinutes,
            deductible_minutes: deductibleMinutes
        }
    };

}

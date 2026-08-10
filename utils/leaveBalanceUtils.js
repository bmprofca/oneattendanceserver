import { parseDate, getYearFromDate, eachDateBetween, formatIST, weekendInfo } from "./time.js";

export const adjustEmployeeLeaveBalance = async ({
  conn,
  company_id,
  employee_id,
  leave_config_id,
  year = null,
  days = null,
  start_date = null,
  end_date = null,
  is_half_day = 0,
  half_day_type = null,
  mode = "deduct",
  user_id = null
}) => {
  if (!conn) throw new Error("Database connection required");
  if (!company_id || !employee_id || !leave_config_id) {
    throw new Error("Missing required fields");
  }

  let resolvedYear = year;
  if (!resolvedYear && start_date) {
    resolvedYear = getYearFromDate(start_date);
  }
  if (!resolvedYear) {
    resolvedYear = new Date().getFullYear();
  }

  let parsedDays = 0;

  if (days !== null && days !== undefined && !isNaN(Number(days))) {
    parsedDays = Number(days);
  } else if (start_date && end_date) {
    const parsedStart = parseDate(start_date);
    const parsedEnd = parseDate(end_date);

    if (!parsedStart || !parsedEnd) {
      throw new Error("Invalid start_date or end_date format");
    }

    if (parsedStart.isAfter(parsedEnd, "day")) {
      throw new Error("start_date cannot be after end_date");
    }

    const [empRows] = await conn.query(
      `SELECT weekends FROM employees WHERE id = ? AND company_id = ? LIMIT 1`,
      [employee_id, company_id]
    );
    const weekends = empRows[0]?.weekends || null;

    const [holidayRows] = await conn.query(
      `SELECT date FROM holidays WHERE company_id = ? AND is_optional = 0 AND is_active = 1 AND is_deleted = 0 AND date BETWEEN ? AND ?`,
      [company_id, formatIST(start_date, "YYYY-MM-DD"), formatIST(end_date, "YYYY-MM-DD")]
    );

    const holidaySet = new Set(
      holidayRows.map((h) => formatIST(h.date, "YYYY-MM-DD"))
    );

    let totalDays = 0;
    const isHalf = Boolean(is_half_day === 1 || is_half_day === true || is_half_day === "1" || is_half_day === "true");

    eachDateBetween(start_date, end_date, (dateStr) => {
      const isHoliday = holidaySet.has(dateStr);
      const wInfo = weekendInfo(dateStr, weekends);
      const isWeekend = wInfo?.is_weekend || wInfo?.isWeekend;

      if (!isHoliday && !isWeekend) {
        totalDays += isHalf ? 0.5 : 1.0;
      }
    });

    parsedDays = Number(totalDays.toFixed(2));
  } else {
    throw new Error("Invalid leave days or date range");
  }

  if (isNaN(parsedDays) || parsedDays < 0) {
    throw new Error("Invalid leave days");
  }

  if (parsedDays === 0) {
    const [balances] = await conn.query(
      `SELECT * FROM employee_leave_balances WHERE company_id = ? AND employee_id = ? AND leave_config_id = ? AND year = ? AND is_deleted = 0 LIMIT 1 FOR UPDATE`,
      [company_id, employee_id, leave_config_id, resolvedYear]
    );

    const balance = balances[0] || { total_allocated: 0, used: 0, remaining: 0 };
    return {
      success: true,
      company_id,
      employee_id,
      leave_config_id,
      year: resolvedYear,
      mode,
      requested_days: 0,
      deducted_from_balance: 0,
      restored_to_balance: 0,
      balance: {
        total_allocated: Number(balance.total_allocated || 0),
        used: Number(balance.used || 0),
        remaining: Number(balance.remaining || 0)
      }
    };
  }

  const [balances] = await conn.query(
    `SELECT * FROM employee_leave_balances WHERE company_id = ? AND employee_id = ? AND leave_config_id = ? AND year = ? AND is_deleted = 0 LIMIT 1 FOR UPDATE`,
    [company_id, employee_id, leave_config_id, resolvedYear]
  );

  let balance;
  if (!balances.length) {
    const [insertResult] = await conn.query(
      `INSERT INTO employee_leave_balances (
        company_id, employee_id, leave_config_id, year,
        total_allocated, used, remaining, created_by, updated_by
      ) VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?)`,
      [company_id, employee_id, leave_config_id, resolvedYear, user_id, user_id]
    );
    balance = {
      id: insertResult.insertId,
      total_allocated: 0,
      used: 0,
      remaining: 0
    };
  } else {
    balance = balances[0];
  }

  let total_allocated = Number(balance.total_allocated || 0);
  let used = Number(balance.used || 0);
  let remaining = Number(balance.remaining || 0);
  let actualDeducted = 0;
  let actualRestore = 0;

  switch (mode) {
    case "add":
      total_allocated += parsedDays;
      remaining += parsedDays;
      break;
    case "deduct": {
      const safeRemaining = Math.max(0, remaining);
      actualDeducted = Math.min(parsedDays, safeRemaining);
      used += actualDeducted;
      remaining = safeRemaining - actualDeducted;
      break;
    }
    case "restore": {
      const safeUsed = Math.max(0, used);
      actualRestore = Math.min(parsedDays, safeUsed);
      used = safeUsed - actualRestore;
      remaining += actualRestore;
      break;
    }
    default:
      throw new Error("Invalid adjustment mode");
  }

  total_allocated = Math.max(0, total_allocated);
  used = Math.max(0, used);
  remaining = Math.max(0, remaining);

  await conn.query(
    `UPDATE employee_leave_balances
     SET total_allocated = ?, used = ?, remaining = ?, updated_by = ?, updated_at = NOW()
     WHERE id = ?`,
    [total_allocated, used, remaining, user_id, balance.id]
  );

  return {
    success: true,
    company_id,
    employee_id,
    leave_config_id,
    year: resolvedYear,
    mode,
    requested_days: parsedDays,
    deducted_from_balance: mode === "deduct" ? actualDeducted : 0,
    restored_to_balance: mode === "restore" ? actualRestore : 0,
    balance: { total_allocated, used, remaining }
  };
};
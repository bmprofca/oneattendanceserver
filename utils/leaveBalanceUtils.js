export const adjustEmployeeLeaveBalance = async ({
  conn,
  company_id,
  employee_id,
  leave_config_id,
  year,
  days,
  mode = "deduct",
  user_id = null
}) => {
  if (!conn) throw new Error("Database connection required");
  if (!company_id || !employee_id || !leave_config_id || !year) throw new Error("Missing required fields");

  const parsedDays = Number(days);
  if (isNaN(parsedDays) || parsedDays <= 0) throw new Error("Invalid leave days");

  const [balances] = await conn.query(`
    SELECT *
    FROM employee_leave_balances
    WHERE company_id = ?
      AND employee_id = ?
      AND leave_config_id = ?
      AND year = ?
      AND is_deleted = 0
    LIMIT 1
  `, [company_id, employee_id, leave_config_id, year]);

  let balance;
  if (!balances.length) {
    const [insertResult] = await conn.query(`
      INSERT INTO employee_leave_balances (
        company_id, employee_id, leave_config_id, year,
        total_allocated, used, remaining, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?)
    `, [company_id, employee_id, leave_config_id, year, user_id, user_id]);
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

  await conn.query(`
    UPDATE employee_leave_balances
    SET
      total_allocated = ?,
      used = ?,
      remaining = ?,
      updated_by = ?,
      updated_at = NOW()
    WHERE id = ?
  `, [total_allocated, used, remaining, user_id, balance.id]);

  return {
    success: true,
    company_id,
    employee_id,
    leave_config_id,
    year,
    mode,
    requested_days: parsedDays,
    deducted_from_balance: mode === "deduct" ? actualDeducted : 0,
    restored_to_balance: mode === "restore" ? actualRestore : 0,
    balance: { total_allocated, used, remaining }
  };
};
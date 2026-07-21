import { getCurrentDate, buildMonthDateRange, eachDateBetween, getDaysInMonth, parseDate, } from "./time.js";
import { getShiftStats } from "./ShiftUtils.js";
import { generateTransactionId } from "../utils/auth.js";
import { buildFileUrl } from "../utils/fileService.js";
import { DESIGNATIONS, EMPLOYMENT_TYPES } from "../constants/constants_values.js";
import { getEnumObject } from "./constantsValidator.js";


export const payrollExists = async ({ conn, companyId, employeeId }) => {

  const [rows] = await conn.query(
    `
      SELECT
        id
      FROM payroll_entries
      WHERE
        company_id = ?
        AND employee_id = ?
        AND YEAR(payroll_period) = YEAR(CURDATE())
        AND MONTH(payroll_period) = MONTH(CURDATE())
        AND is_deleted = 0
      LIMIT 1
    `,
    [companyId, employeeId]
  );

  return rows[0] || null;
};

export const upsertPayroll = async ({ conn, companyId, employeeId, companyAccountId = null, employeeAccountId = null, upsertPeriod = null, createdBy = null }) => {

  const payrollPeriod = upsertPeriod || getCurrentDate();
  const [year, month] = payrollPeriod.split("-").map(Number);
  const { start_date, end_date, total_days } = buildMonthDateRange(year, month);

  const [[employee]] = await conn.query(
    `
    SELECT
      e.id,
      e.employee_code,
      e.designation,
      e.employment_type,
      e.salary_type,
      e.expected_work_minutes,
      e.joining_date
    FROM employees e
    WHERE
      e.company_id = ?
      AND e.id = ?
      AND e.is_deleted = 0
    LIMIT 1
    `,
    [companyId, employeeId]
  );

  if (!employee) {
    throw new Error("Employee not found");
  }

  const joiningDate = employee.joining_date ? new Date(employee.joining_date) : null;
  const payrollStartDate = joiningDate && joiningDate > new Date(start_date) ? employee.joining_date : start_date;
  const payrollEndDate = end_date;

  if (employee.joining_date && new Date(employee.joining_date) > new Date(end_date)) {
    throw new Error(
      `Employee ${employee.employee_code} has not joined yet`
    );
  }

  const [[salary]] = await conn.query(
    `
    SELECT
      id,
      base_amount
    FROM salary_structures
    WHERE
      company_id = ?
      AND employee_id = ?
      AND effective_from <= ?
      AND (
        effective_to IS NULL
        OR effective_to >= ?
      )
      AND is_deleted = 0
    ORDER BY effective_from DESC
    LIMIT 1
    `,
    [companyId, employeeId, end_date, start_date]
  );

  if (!salary) {
    throw new Error("Salary structure not found");
  }

  const [components] = await conn.query(
    `
    SELECT
      sc.id AS component_id,
      sc.code,
      sc.name,
      sc.type,
      esc.calc_type,
      esc.calc_value
    FROM employee_salary_component esc

    INNER JOIN salary_components sc
      ON sc.id = esc.component_id

    WHERE
      esc.company_id = ?
      AND esc.employee_id = ?
      AND esc.salary_id = ?
      AND esc.is_deleted = 0
      AND sc.is_deleted = 0
    `,
    [companyId, employeeId, salary.id]
  );

  const [adjustments] = await conn.query(
    `
    SELECT
      adjustment_type,
      amount
    FROM payroll_adjustments
    WHERE
      company_id = ?
      AND employee_id = ?
      AND usage_type = 'payroll'
      AND adjustment_period BETWEEN ? AND ?
      AND is_deleted = 0
    `,
    [companyId, employeeId, start_date, end_date]
  );

  const shiftStats = await getShiftStats({
    conn,
    companyId,
    employeeId,
    fromDate: payrollStartDate,
    toDate: payrollEndDate
  });

  const dailyWorkMinutes = Number(employee.expected_work_minutes) || 480;

  const totalCalendarMinutes = total_days * dailyWorkMinutes;

  if (totalCalendarMinutes <= 0) {
    throw new Error("Invalid total calendar minutes for pay calculation");
  }

  const baseAmount = Number(salary.base_amount || 0);
  const payPerMinute = baseAmount / totalCalendarMinutes;
  const overtimeAmount = Number((Number(shiftStats.overtime_minutes || 0) * payPerMinute));
  const deductibleAmount = Number((Number(shiftStats.deductible_minutes || 0) * payPerMinute));
  let totalEarnings = shiftStats.payable_work_minutes * payPerMinute;
  let totalDeductions = shiftStats.deductible_minutes * payPerMinute;

  const componentRows = [];

  for (const component of components) {
    let amount = 0;

    if (component.calc_type === "fixed") {
      amount = Number(component.calc_value);
    }

    if (component.calc_type === "percentage") {
      amount = (baseAmount * Number(component.calc_value)) / 100;
    }

    amount = Number(amount.toFixed(2));
    componentRows.push({
      componentId: component.component_id,
      componentCode: component.code,
      componentName: component.name,
      componentType: component.type,
      amount
    });

    if (component.type === "earning") {
      totalEarnings += amount;
    }

    if (component.type === "deduction") {
      totalDeductions += amount;
    }
  }

  totalEarnings += overtimeAmount;
  totalDeductions += deductibleAmount;

  for (const adjustment of adjustments) {
    const amount = Number(adjustment.amount || 0);
    if (adjustment.adjustment_type === "bonus") {
      totalEarnings += amount;
    }

    if (adjustment.adjustment_type === "fine") {
      totalDeductions += amount;
    }
  }

  totalEarnings = Number(totalEarnings.toFixed(2));
  totalDeductions = Number(totalDeductions.toFixed(2));
  const netSalary = Number((totalEarnings - totalDeductions).toFixed(2));

  const [[existingPayroll]] = await conn.query(
    `
    SELECT id
    FROM payroll_entries
    WHERE
      company_id = ?
      AND employee_id = ?
      AND YEAR(payroll_period) = ?
      AND MONTH(payroll_period) = ?
      AND is_deleted = 0
      AND is_active = 1
    LIMIT 1
    `,
    [companyId, employeeId, year, month]
  );

  let payrollEntryId;

  if (existingPayroll) {

    payrollEntryId = existingPayroll.id;

    await conn.query(
      `
      UPDATE payroll_entries
      SET
        salary_id = ?,
        snapshot_employee_code = ?,
        snapshot_designation = ?,
        snapshot_employment_type = ?,
        snapshot_salary_type = ?,
        snapshot_base_amount = ?,
        working_days = ?,
        present_days = ?,
        absent_days = ?,
        paid_leave_days = ?,
        unpaid_leave_days = ?,
        overtime_minutes = ?,
        worked_minutes = ?,
        deduction_minutes = ?,
        total_earnings = ?,
        total_deductions = ?,
        net_salary = ?,
        updated_by = ?
      WHERE id = ?
      `,
      [
        salary.id,
        employee.employee_code,
        employee.designation,
        employee.employment_type,
        employee.salary_type,
        baseAmount,
        total_days,
        shiftStats.present_days,
        shiftStats.absent_days,
        shiftStats.paid_leave_days,
        shiftStats.unpaid_leave_days,
        shiftStats.overtime_minutes,
        shiftStats.worked_minutes,
        shiftStats.deductible_minutes,
        totalEarnings,
        totalDeductions,
        netSalary,
        createdBy,
        payrollEntryId
      ]
    );

    await conn.query(
      `
      DELETE FROM payroll_entry_components
      WHERE entry_id = ?
      `,
      [payrollEntryId]
    );

    await conn.query(
      `
      DELETE FROM transactions
      WHERE
        company_id = ?
        AND employee_id = ?
        AND transaction_type = 'salary'
        AND transaction_date BETWEEN ? AND ?
        AND is_deleted = 0
      `,
      [companyId, employeeId, start_date, end_date]
    );

  }

  else {

    const [insertPayroll] = await conn.query(
      `
      INSERT INTO payroll_entries (
        company_id,
        employee_id,
        salary_id,
        payroll_period,
        snapshot_employee_code,
        snapshot_designation,
        snapshot_employment_type,
        snapshot_salary_type,
        snapshot_base_amount,
        working_days,
        present_days,
        absent_days,
        paid_leave_days,
        unpaid_leave_days,
        overtime_minutes,
        worked_minutes,
        deduction_minutes,
        total_earnings,
        total_deductions,
        net_salary,
        created_by
      )
      VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )
      `,
      [
        companyId,
        employeeId,
        salary.id,
        payrollPeriod,
        employee.employee_code,
        employee.designation,
        employee.employment_type,
        employee.salary_type,
        baseAmount,
        total_days,
        shiftStats.present_days,
        shiftStats.absent_days,
        shiftStats.paid_leave_days,
        shiftStats.unpaid_leave_days,
        shiftStats.overtime_minutes,
        shiftStats.worked_minutes,
        shiftStats.deductible_minutes,
        totalEarnings,
        totalDeductions,
        netSalary,
        createdBy
      ]
    );

    payrollEntryId = insertPayroll.insertId;
  }

  for (const component of componentRows) {

    await conn.query(
      `
      INSERT INTO payroll_entry_components (
        entry_id,
        component_id,
        component_code,
        component_name,
        component_type,
        amount,
        created_by
      )
      VALUES ( ?, ?, ?, ?, ?, ?, ? )
      `,
      [
        payrollEntryId,
        component.componentId,
        component.componentCode,
        component.componentName,
        component.componentType,
        component.amount,
        createdBy
      ]
    );

  }

  const transactionId = generateTransactionId();

  await conn.query(
    `
    INSERT INTO transactions (
      transaction_id,
      company_id,
      employee_id,
      transaction_date,
      transaction_type,
      entry_type,
      amount,
      company_account,
      employee_account,
      create_by
    )
    VALUES ( ?, ?, ?, ?, 'salary', 'debit', ?, ?, ?, ? )
    `,
    [
      transactionId,
      companyId,
      employeeId,
      payrollPeriod,
      netSalary,
      companyAccountId,
      employeeAccountId,
      createdBy
    ]
  );

  return {
    payroll_entry_id: payrollEntryId,
    pay_per_minute: Number(payPerMinute),
    overtime_amount: overtimeAmount,
    deductible_amount: deductibleAmount,
    net_salary: netSalary,
    total_earnings: totalEarnings,
    total_deductions: totalDeductions,
    shift_stats: shiftStats
  };
};

export const calculatePayroll = async ({ conn, companyId, employeeId, upsertPeriod = null }) => {

  const payrollPeriod = upsertPeriod || getCurrentDate();

  const [year, month] = payrollPeriod.split("-").map(Number);

  const { start_date, end_date, total_days } = buildMonthDateRange(year, month);

  const [[employee]] = await conn.query(
    `
    SELECT
      e.id,
      e.employee_code,
      e.designation,
      e.employment_type,
      e.salary_type,
      e.expected_work_minutes,
      e.joining_date,
      u.name
    FROM employees e
    INNER JOIN users u
      ON u.id = e.user_id
    WHERE
      e.company_id = ?
      AND e.id = ?
      AND e.is_deleted = 0
    LIMIT 1
    `,
    [companyId, employeeId]
  );

  if (!employee) {
    throw new Error("Employee not found");
  }

  if (employee.joining_date && new Date(employee.joining_date) > new Date(end_date)) {
    throw new Error(
      `Employee ${employee.employee_code} has not joined yet`
    );
  }

  const payrollStartDate =
    employee.joining_date &&
    new Date(employee.joining_date) > new Date(start_date)
      ? employee.joining_date
      : start_date;

  const payrollEndDate = end_date;

  const [[salary]] = await conn.query(
    `
    SELECT
      id,
      base_amount
    FROM salary_structures
    WHERE
      company_id = ?
      AND employee_id = ?
      AND effective_from <= ?
      AND (
        effective_to IS NULL
        OR effective_to >= ?
      )
      AND is_deleted = 0
    ORDER BY effective_from DESC
    LIMIT 1
    `,
    [
      companyId,
      employeeId,
      payrollEndDate,
      payrollStartDate
    ]
  );

  if (!salary) {
    return null;
  }

  const [components] = await conn.query(
    `
    SELECT
      sc.id AS component_id,
      sc.code,
      sc.name,
      sc.type,
      esc.calc_type,
      esc.calc_value
    FROM employee_salary_component esc
    INNER JOIN salary_components sc
      ON sc.id = esc.component_id
    WHERE
      esc.company_id = ?
      AND esc.employee_id = ?
      AND esc.salary_id = ?
      AND esc.is_deleted = 0
      AND sc.is_deleted = 0
    `,
    [companyId, employeeId, salary.id]
  );

  const [adjustments] = await conn.query(
    `
    SELECT
      adjustment_type,
      amount
    FROM payroll_adjustments
    WHERE
      company_id = ?
      AND employee_id = ?
      AND usage_type = 'payroll'
      AND adjustment_period BETWEEN ? AND ?
      AND is_deleted = 0
    `,
    [
      companyId,
      employeeId,
      start_date,
      end_date
    ]
  );

  const shiftStats = await getShiftStats({
    conn,
    companyId,
    employeeId,
    fromDate: payrollStartDate,
    toDate: payrollEndDate
  });

  const dailyWorkMinutes = Number(employee.expected_work_minutes) || 480;

  const totalCalendarMinutes = total_days * dailyWorkMinutes;

  if (totalCalendarMinutes <= 0) {
    throw new Error(
      "Invalid total calendar minutes for pay calculation"
    );
  }

  const baseAmount = Number(salary.base_amount || 0);

  const payPerMinute = baseAmount / totalCalendarMinutes;

  const overtimeAmount = Number(
    (
      Number(shiftStats.overtime_minutes || 0) *
      payPerMinute
    ).toFixed(2)
  );

  const deductibleAmount = Number(
    (
      Number(shiftStats.deductible_minutes || 0) *
      payPerMinute
    ).toFixed(2)
  );

  let totalEarnings = shiftStats.payable_work_minutes * payPerMinute;
  let totalDeductions = shiftStats.deductible_minutes * payPerMinute;

  const componentRows = [];

  for (const component of components) {
    let amount = 0;

    if (component.calc_type === "fixed") {
      amount = Number(component.calc_value);
    }

    if (component.calc_type === "percentage") {
      amount =
        (baseAmount * Number(component.calc_value)) /
        100;
    }

    amount = Number(amount.toFixed(2));

    componentRows.push({
      componentId: component.component_id,
      componentCode: component.code,
      componentName: component.name,
      componentType: component.type,
      amount
    });

    if (component.type === "earning") {
      totalEarnings += amount;
    }

    if (component.type === "deduction") {
      totalDeductions += amount;
    }
  }

  totalEarnings += overtimeAmount;
  totalDeductions += deductibleAmount;

  for (const adjustment of adjustments) {
    const amount = Number(adjustment.amount || 0);

    if (adjustment.adjustment_type === "bonus") {
      totalEarnings += amount;
    }

    if (adjustment.adjustment_type === "fine") {
      totalDeductions += amount;
    }
  }

  totalEarnings = Number(totalEarnings.toFixed(2));
  totalDeductions = Number(totalDeductions.toFixed(2));

  const netSalary = Number(
    (totalEarnings - totalDeductions).toFixed(2)
  );

  return {
    payroll_period: payrollPeriod,

    employee,
    salary,

    components: componentRows,
    adjustments,

    pay_per_minute: Number(payPerMinute.toFixed(4)),

    overtime_amount: overtimeAmount,

    deductible_amount: deductibleAmount,

    total_earnings: totalEarnings,

    total_deductions: totalDeductions,

    net_salary: netSalary,

    shift_stats: shiftStats
  };
};

export const getPayslipData = async ({ conn, payrollEntryId, companyId, type = "summary" }) => {

  if (!["summary", "detailed"].includes(type)) {
    throw new Error("Invalid payslip type");
  }

  const [rows] = await conn.execute(
    `
    SELECT
      pe.id,
      pe.company_id,
      pe.employee_id,
      pe.salary_id,
      pe.payroll_period,

      pe.snapshot_employee_code,
      pe.snapshot_designation,
      pe.snapshot_employment_type,
      pe.snapshot_salary_type,
      pe.snapshot_base_amount,

      pe.working_days,
      pe.present_days,
      pe.absent_days,
      pe.paid_leave_days,
      pe.unpaid_leave_days,

      pe.overtime_minutes,
      pe.worked_minutes,
      pe.deduction_minutes,

      pe.total_earnings,
      pe.total_deductions,
      pe.net_salary,

      c.name AS company_name,
      c.logo_url AS company_logo,
      c.address_line1,
      c.address_line2,
      c.city,
      c.state,
      c.postal_code,
      c.country,
      c.transaction_currency,

      u.name AS employee_name,
      u.email AS employee_email,
      u.phone AS employee_phone,

      e.employee_code,
      e.designation,
      e.salary_type,
      e.employment_type,
      e.joining_date,
      e.expected_work_minutes,
      COALESCE(e.break_minutes,0) AS allowed_break_minutes,

      ss.base_amount

    FROM payroll_entries pe

    INNER JOIN employees e
      ON e.id = pe.employee_id
      AND e.is_deleted = 0

    INNER JOIN users u
      ON u.id = e.user_id
      AND u.is_deleted = 0

    INNER JOIN companies c
      ON c.id = pe.company_id
      AND c.is_deleted = 0

    LEFT JOIN salary_structures ss
      ON ss.id = pe.salary_id
      AND ss.is_deleted = 0

    WHERE pe.id = ?
      AND pe.company_id = ?
      AND pe.is_deleted = 0

    LIMIT 1
    `,
    [
      payrollEntryId,
      companyId
    ]
  );

  if (!rows.length) {
    throw new Error("Payroll entry not found");
  }

  const payroll = rows[0];

  const payrollDate = parseDate(payroll.payroll_period);
  const { start_date, end_date, total_days } = buildMonthDateRange(
    payrollDate.year(), payrollDate.month() + 1
  );

  const [components] = await conn.execute(
    `
    SELECT
      component_id,
      component_code,
      component_name AS name,
      component_type,
      amount
    FROM payroll_entry_components
    WHERE entry_id = ?
      AND is_active = 1
    ORDER BY component_type, component_name
    `,
    [payrollEntryId]
  );

  const [adjustments] = await conn.execute(
    `
    SELECT
      id,
      adjustment_type,
      name,
      remark,
      amount
    FROM payroll_adjustments
    WHERE employee_id = ?
      AND company_id = ?
      AND DATE_FORMAT(adjustment_period,'%Y-%m')
          = DATE_FORMAT(?,'%Y-%m')
      AND is_deleted = 0
    ORDER BY id
    `,
    [
      payroll.employee_id,
      companyId,
      payroll.payroll_period
    ]
  );

  const [attendanceRows] = await conn.execute(
    `
    SELECT
      shift_date,
      start_time,
      end_time,
      worked_minutes,
      extra_break_minutes,
      early_leave_minutes,
      late_minutes,
      is_overtime,
      is_deductible,
      overtime_minutes,
      deductible_minutes,
      day_status,
      value1,
      value2
    FROM shifts
    WHERE employee_id = ?
      AND company_id = ?
      AND shift_date BETWEEN ? AND ?
      AND is_deleted = 0
      AND is_active = 1
    ORDER BY shift_date
    `,
    [
      payroll.employee_id,
      companyId,
      start_date,
      end_date
    ]
  );

  const attendanceSummary =
    attendanceRows.reduce(
      (acc, row) => {
        acc.worked_minutes += Number(row.worked_minutes || 0);
        if (Number(row.is_overtime) === 1) {
          acc.overtime_minutes += Number(row.overtime_minutes || 0);
        }

        if (Number(row.is_deductible) === 1) {
          acc.deduction_minutes += Number(row.deductible_minutes || 0);
        }

        return acc;
      },
      {
        worked_minutes: 0,
        overtime_minutes: 0,
        deduction_minutes: 0
      }
    );

  const dailyWorkMinutes = Number(payroll.expected_work_minutes) || 480;

  const totalCalendarMinutes = total_days * dailyWorkMinutes;

  const baseAmount = Number(payroll.snapshot_base_amount || 0);

  const payPerMinute = totalCalendarMinutes > 0 ? baseAmount / totalCalendarMinutes : 0;

  const overtimePay = Number((attendanceSummary.overtime_minutes * payPerMinute));

  const deductionPay = Number((attendanceSummary.deduction_minutes * payPerMinute));

  const componentEarnings = components
    .filter(c => c.component_type === "earning")
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);

  const componentDeductions = components
    .filter(c => c.component_type === "deduction")
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);

  const bonusAdjustments = adjustments
    .filter(a => a.adjustment_type === "bonus")
    .reduce((sum, a) => sum + Number(a.amount || 0), 0);

  const fineAdjustments = adjustments
    .filter(a => a.adjustment_type === "fine")
    .reduce((sum, a) => sum + Number(a.amount || 0), 0);

  const attendanceNetPay =
    Number(payroll.total_earnings || 0)
    - componentEarnings
    - bonusAdjustments;

  const response = {
    payroll: {
      employee_id: payroll.employee_id,

      company_name: payroll.company_name,
      company_logo: buildFileUrl(payroll.company_logo),

      address_line1: payroll.address_line1,
      address_line2: payroll.address_line2,
      city: payroll.city,
      state: payroll.state,
      postal_code: payroll.postal_code,
      country: payroll.country,

      employee_name: payroll.employee_name,
      employee_email: payroll.employee_email,
      employee_phone: payroll.employee_phone,

      employee_code: payroll.snapshot_employee_code || payroll.employee_code,

      designation: getEnumObject(DESIGNATIONS, payroll.snapshot_designation)?.label
        || getEnumObject(DESIGNATIONS, payroll.designation)?.label,

      employment_type: getEnumObject(EMPLOYMENT_TYPES, payroll.snapshot_employment_type)?.label
        || getEnumObject(EMPLOYMENT_TYPES, payroll.employment_type)?.label,

      payroll_period: payroll.payroll_period,

      transaction_currency: payroll.transaction_currency || "INR",

      working_days: payroll.working_days,

      present_days: payroll.present_days,

      absent_days: payroll.absent_days,

      paid_leave_days: payroll.paid_leave_days,

      unpaid_leave_days: payroll.unpaid_leave_days,

      worked_minutes: attendanceSummary.worked_minutes,

      overtime_minutes: attendanceSummary.overtime_minutes,

      deduction_minutes: attendanceSummary.deduction_minutes,

      overtime_pay: overtimePay,

      deduction_pay: deductionPay,

      gross_salary: payroll.total_earnings,

      total_earnings: payroll.total_earnings,

      total_deductions: payroll.total_deductions,

      net_salary: payroll.net_salary,

      base_salary: payroll.snapshot_base_amount,
      attendance_pay: Number(attendanceNetPay.toFixed(2)),

      component_earnings: Number(componentEarnings.toFixed(2)),
      component_deductions: Number(componentDeductions.toFixed(2)),

      bonus_adjustments: Number(bonusAdjustments.toFixed(2)),
      fine_adjustments: Number(fineAdjustments.toFixed(2)),
    },

    components,
    adjustments
  };

  if (type === "summary") {
    return response;
  }

  response.details = {
    employee: {
      employee_id: payroll.employee_id,
      company_id: companyId,
      expected_work_minutes: payroll.expected_work_minutes,
      allowed_break_minutes: payroll.allowed_break_minutes
    },

    days: attendanceRows.map(
      (row) => {

        const attendance_meta = {};

        if (row.day_status === "half_day") {
          attendance_meta.half_day_type = row.value1 || null;
        }

        if (row.day_status === "leave") {
          attendance_meta.leave_type = row.value1 || null;
          attendance_meta.leave_type_value = row.value2 || null;
        }

        const overtimeMinutes = Number(row.is_overtime) === 1 ? Number(row.overtime_minutes || 0) : 0;
        const deductibleMinutes = Number(row.is_deductible) === 1 ? Number(row.deductible_minutes || 0) : 0;
        const expectedWorkMinutes = Number(payroll.expected_work_minutes) || 480;

        let payableMinutes = 0;

        if (row.day_status === "present") {
          payableMinutes = expectedWorkMinutes;
        }

        else if (row.day_status === "half_day") {
          payableMinutes = expectedWorkMinutes / 2;
        }

        else if (row.day_status === "leave" && row.value1 === "paid") {
          payableMinutes = expectedWorkMinutes;
        }

        const attendancePay = Number((payableMinutes * payPerMinute));
        const overtimePay = Number((overtimeMinutes * payPerMinute));
        const deductionPay = Number((deductibleMinutes * payPerMinute));

        return {
          date: row.shift_date,
          start_time: row.start_time,
          end_time: row.end_time,
          worked_minutes: Number(row.worked_minutes || 0),
          extra_break_minutes: Number(row.extra_break_minutes || 0),
          early_leave_minutes: Number(row.early_leave_minutes || 0),
          late_minutes: Number(row.late_minutes || 0),
          overtime_minutes: overtimeMinutes,
          deductible_minutes: deductibleMinutes,
          day_status: row.day_status,
          attendance_meta,
          attendance_pay: attendancePay,
          overtime_pay: overtimePay,
          deductible_pay: deductionPay,
          total_pay: Number((attendancePay + overtimePay - deductionPay).toFixed(2))
        };
      }
    )
  };

  return response;
};
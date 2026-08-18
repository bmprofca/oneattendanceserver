import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import {
  validateFields,
  salaryValidation,
  paymentMethodValidation,
  payrollStatusValidation,
  getEnumObject
} from "../utils/constantsValidator.js";
import {
  SALARY_TYPES,
  PAYMENT_METHODS,
  PAY_ROLL_STATUSES,
  EMPLOYMENT_TYPES,
  DESIGNATIONS,
} from "../constants/constants_values.js";
import { buildFileUrl } from "../utils/fileService.js";
import { PAY, PAY_ADJ } from "../constants/permissions.js";
import {
  payrollExists,
  upsertPayroll,
  getPayslipData,
  calculatePayroll
} from "../utils/payrollUtils.js";
import { sendError, sendSuccess, buildMeta } from "../utils/sendResponse.js";
import { queuePayrollEmail } from "../email/services/email.processor.js";
import { generatePayslipPdf } from "../utils/generatePayslipPdf.js";
import { formatIST, formatUTCToIST } from "../utils/time.js";
import { EMAIL_USER } from "../config/config.js";

const router = express.Router();

// --------------- SQL FIELD CONSTANTS ---------------
const PAYROLL_ENTRY_FIELDS = `
  pe.id,
  pe.payroll_period,
  pe.net_salary,
  pe.total_earnings,
  pe.total_deductions,
  pe.working_days,
  pe.present_days,
  pe.absent_days,
  pe.paid_leave_days,
  pe.unpaid_leave_days,
  pe.overtime_minutes,
  pe.worked_minutes,
  pe.deduction_minutes,
  pe.snapshot_employee_code,
  pe.snapshot_designation,
  pe.snapshot_employment_type,
  pe.snapshot_salary_type,
  pe.snapshot_base_amount
`;

const ADJUSTMENT_FIELDS = `
  pa.id,
  pa.employee_id,
  pa.adjustment_type,
  pa.name,
  pa.remark,
  pa.amount,
  pa.adjustment_period,
  pa.created_at
`;

// --------------- FORMAT HELPERS ---------------
function formatPayrollEntry(row) {
  return {
    id: row.id,
    payroll_period: row.payroll_period,
    net_salary: row.net_salary,
    total_earnings: row.total_earnings,
    total_deductions: row.total_deductions,
    working_days: row.working_days,
    present_days: row.present_days,
    absent_days: row.absent_days,
    paid_leave_days: row.paid_leave_days,
    unpaid_leave_days: row.unpaid_leave_days,
    overtime_minutes: row.overtime_minutes,
    worked_minutes: row.worked_minutes,
    deduction_minutes: row.deduction_minutes,
    snapshot_employee_code: row.snapshot_employee_code,
    snapshot_designation: getEnumObject(DESIGNATIONS, row.snapshot_designation),
    snapshot_employment_type: getEnumObject(EMPLOYMENT_TYPES, row.snapshot_employment_type),
    snapshot_salary_type: getEnumObject(SALARY_TYPES, row.snapshot_salary_type),
    snapshot_base_amount: row.snapshot_base_amount,
  };
}

function formatAdjustment(row) {
  return {
    id: row.id,
    employee_id: row.employee_id,
    adjustment_type: row.adjustment_type,
    name: row.name,
    remark: row.remark,
    amount: row.amount,
    adjustment_period: row.adjustment_period,
    created_at: formatUTCToIST(row.created_at),
    employee_code: row.employee_code,
    employee_name: row.employee_name,
    employee_profile_picture: row.employee_profile_picture ? buildFileUrl(row.employee_profile_picture) : null,
  };
}

function getPayrollPeriodRange(month, year) {
  const payrollPeriod = `${year}-${String(month).padStart(2, "0")}`;
  const payrollStartDate = new Date(year, month - 1, 1);
  const payrollEndDate = new Date(year, month, 0);
  return { payrollPeriod, payrollStartDate, payrollEndDate };
}

async function checkEmployeeExists(conn, companyId, employeeId) {
  const [employees] = await conn.query(
    `SELECT id FROM employees WHERE id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1`,
    [employeeId, companyId]
  );
  return employees.length > 0;
}

async function recalcPayrollIfExists(conn, companyId, employeeId, userId) {
  const existingPayroll = await payrollExists({ conn, companyId, employeeId });
  if (existingPayroll) {
    await upsertPayroll({ conn, companyId, employeeId, createdBy: userId });
  }
}

function formatEmployeeBasic(employee) {
  return {
    id: employee.id,
    name: employee.name,
    email: employee.email,
    profile_picture: buildFileUrl(employee.profile_picture),
    employee_code: employee.employee_code,
    designation: getEnumObject(DESIGNATIONS, employee.designation),
    employment_type: getEnumObject(EMPLOYMENT_TYPES, employee.employment_type),
    salary_type: getEnumObject(SALARY_TYPES, employee.salary_type),
  };
}

async function fetchPayrollComponentsMap(conn, entryIds) {
  if (!entryIds?.length) return {};
  const [rows] = await conn.query(
    `SELECT entry_id, component_id, component_name, component_type, amount
     FROM payroll_entry_components
     WHERE entry_id IN (?) AND is_active = 1`,
    [entryIds]
  );
  return rows.reduce((acc, row) => {
    if (!acc[row.entry_id]) acc[row.entry_id] = { earnings: [], deductions: [] };
    const comp = { name: row.component_name, amount: row.amount };
    if (row.component_type === "earning") acc[row.entry_id].earnings.push(comp);
    if (row.component_type === "deduction") acc[row.entry_id].deductions.push(comp);
    return acc;
  }, {});
}

async function fetchPayrollAdjustmentsMap(conn, companyId, employeeIds, startDate, endDate) {
  const [adjustments] = await conn.query(
    `SELECT * FROM payroll_adjustments
     WHERE company_id = ? AND employee_id IN (?) AND adjustment_period BETWEEN ? AND ? AND is_deleted = 0`,
    [companyId, employeeIds, startDate, endDate]
  );
  return adjustments.reduce((acc, row) => {
    if (!acc[row.employee_id]) acc[row.employee_id] = [];
    acc[row.employee_id].push(row);
    return acc;
  }, {});
}

async function sendPayrollEmailForEntry({ conn, companyId, payrollEntryId, employeeId, replyTo }) {
  try {
    const payslipDetails = await getPayslipData({ conn, payrollEntryId, companyId });
    if (!payslipDetails) {
      return { failed: { payroll_entry_id: payrollEntryId, employee_id: employeeId, error: "Payslip not found" } };
    }
    const { payroll } = payslipDetails;
    const receiverEmail = payroll?.employee_email?.trim();
    if (!receiverEmail) {
      return { failed: { payroll_entry_id: payrollEntryId, employee_id: employeeId, employee_name: payroll?.employee_name, error: "Employee email not found" } };
    }
    await queuePayrollEmail({
      to: receiverEmail,
      subject: `Salary Slip - ${payroll.company_name || "OneAttendance"}`,
      fromEmail: EMAIL_USER,
      fromName: payroll.company_name || "OneAttendance",
      replyTo,
      payroll,
      components: payslipDetails.components,
      adjustments: payslipDetails.adjustments,
    });
    return { sent: { payroll_entry_id: payrollEntryId, employee_id: employeeId, employee_name: payroll.employee_name, email: receiverEmail } };
  } catch (error) {
    console.error(`[PAYROLL_EMAIL_ERROR][${payrollEntryId}]`, error);
    return { failed: { payroll_entry_id: payrollEntryId, employee_id: employeeId, error: error.message } };
  }
}

// --------------- ROUTES ---------------

// 1. Generate Payroll
router.post("/generate-payroll", auth(PAY.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const companyId = req.company?.id;
    const createdBy = req.user?.id;
    if (!companyId || !createdBy) return sendError(res, 401, "Unauthorized access");

    let { employee_id = [], all_employees = false, send_pdf = false } = req.body;
    let employeeIds = [];

    if (all_employees) {
      const [employees] = await conn.query(
        `SELECT id FROM employees WHERE company_id = ? AND is_active = 1 AND is_deleted = 0`,
        [companyId]
      );
      employeeIds = employees.map(emp => Number(emp.id));
    } else {
      if (!Array.isArray(employee_id)) employee_id = [employee_id];
      employeeIds = employee_id.map(Number).filter(id => Number.isInteger(id) && id > 0);
      if (!employeeIds.length) return sendError(res, 400, "Please select employees");

      const [employees] = await conn.query(
        `SELECT id FROM employees WHERE company_id = ? AND id IN (?) AND is_active = 1 AND is_deleted = 0`,
        [companyId, employeeIds]
      );
      if (employees.length !== employeeIds.length) return sendError(res, 400, "Some employee IDs are invalid");
    }

    const payrolls = [];
    for (const employeeId of employeeIds) {
      const [[employee]] = await conn.query(
        `SELECT e.id, e.employee_code, u.name, u.email
         FROM employees e INNER JOIN users u ON u.id = e.user_id AND u.is_deleted = 0
         WHERE e.id = ? AND e.is_deleted = 0 LIMIT 1`,
        [employeeId]
      );
      try {
        const payroll = await upsertPayroll({ conn, companyId, employeeId, createdBy });
        payrolls.push({
          payroll_entry_id: payroll.payroll_entry_id,
          employee_id: employeeId,
          employee_name: employee?.name,
          employee_code: employee?.employee_code,
          employee_email: employee?.email,
          net_salary: payroll.net_salary,
          total_earnings: payroll.total_earnings,
          total_deductions: payroll.total_deductions,
        });
      } catch (error) {
        throw new Error(
          `Payroll generation failed for ${employee?.name || "Unknown Employee"} (${employee?.employee_code || employeeId}): ${error.message}`
        );
      }
    }

    await conn.commit();

    const emailSent = [];
    const emailFailed = [];
    if (send_pdf && payrolls.length > 0) {
      for (const info of payrolls) {
        const result = await sendPayrollEmailForEntry({
          conn,
          companyId,
          payrollEntryId: info.payroll_entry_id,
          employeeId: info.employee_id,
          replyTo: req.user?.email || EMAIL_USER,
        });
        if (result.sent) emailSent.push(result.sent);
        if (result.failed) emailFailed.push(result.failed);
      }
    }

    return sendSuccess(res, 200, "Payroll processed successfully", {
      payrolls,
      email_summary: send_pdf ? { sent: emailSent.length, failed: emailFailed.length, sent_list: emailSent, failed_list: emailFailed } : null,
      meta: { processed_count: payrolls.length, email_sent_count: emailSent.length, email_failed_count: emailFailed.length }
    });
  } catch (error) {
    if (conn) await conn.rollback();
    console.error("[GENERATE_PAYROLL_ERROR]", error);
    return sendError(res, 500, error.message || "Failed to generate payroll");
  } finally {
    if (conn) conn.release();
  }
});

// 2. Payroll List (generated + preview)
router.get("/list", auth(PAY.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const companyId = req.company?.id;

    let { month, year, employee_id, page = 1, limit = 10 } = req.query;
    month = Number(month);
    year = Number(year);
    page = Number(page) || 1;
    limit = Math.min(Number(limit) || 10, 100);
    const offset = (page - 1) * limit;

    if (!companyId) return sendError(res, 400, "Invalid company");
    if (!month || !year || month < 1 || month > 12) return sendError(res, 400, "Valid month & year required");

    const { payrollPeriod, payrollStartDate, payrollEndDate } = getPayrollPeriodRange(month, year);

    let whereClause = `e.company_id = ? AND e.is_deleted = 0 AND e.is_active = 1 AND e.joining_date IS NOT NULL AND e.joining_date <= ?`;
    const whereParams = [companyId, payrollEndDate];
    if (employee_id) { whereClause += ` AND e.id = ?`; whereParams.push(Number(employee_id)); }

    const [[{ total }]] = await conn.query(`SELECT COUNT(*) total FROM employees e WHERE ${whereClause}`, whereParams);

    const [employees] = await conn.query(
      `SELECT e.id, e.employee_code, e.designation, e.employment_type, e.salary_type, e.joining_date, u.name, u.email, u.profile_picture
       FROM employees e INNER JOIN users u ON u.id = e.user_id WHERE ${whereClause} ORDER BY e.id DESC LIMIT ? OFFSET ?`,
      [...whereParams, limit, offset]
    );
    if (!employees.length) {
      return sendSuccess(res, 200, "Payroll list fetched successfully", { generated_payrolls: [], preview_payrolls: [] }, buildMeta(page, limit, total, 0));
    }

    const employeeIds = employees.map(emp => emp.id);
    const [payrollRows] = await conn.query(
      `SELECT * FROM payroll_entries WHERE company_id = ? AND employee_id IN (?) AND payroll_period BETWEEN ? AND ? AND is_deleted = 0`,
      [companyId, employeeIds, payrollStartDate, payrollEndDate]
    );
    const payrollMap = payrollRows.reduce((acc, row) => { acc[row.employee_id] = row; return acc; }, {});

    const payrollEntryIds = payrollRows.map(r => r.id);
    const componentMap = await fetchPayrollComponentsMap(conn, payrollEntryIds);
    const adjustmentMap = await fetchPayrollAdjustmentsMap(conn, companyId, employeeIds, payrollStartDate, payrollEndDate);

    const generatedPayrolls = [];
    for (const employee of employees) {
      const payrollEntry = payrollMap[employee.id];
      if (!payrollEntry) continue;

      generatedPayrolls.push({
        employee: formatEmployeeBasic(employee),
        payroll: {
          ...formatPayrollEntry(payrollEntry),
          components_breakdown: componentMap[payrollEntry.id] || { earnings: [], deductions: [] },
          adjustments: (adjustmentMap[employee.id] || []).map(adj => ({
            type: adj.adjustment_type,
            name: adj.name,
            amount: adj.amount,
            remark: adj.remark,
          })),
        },
      });
    }

    const generatedEmployeeIds = new Set(generatedPayrolls.map(p => p.employee.id));
    const previewEmployees = employees.filter(emp => !generatedEmployeeIds.has(emp.id));
    const previewResults = (
      await Promise.all(
        previewEmployees.map(async employee => {
          const payroll = await calculatePayroll({ conn, companyId, employeeId: employee.id, upsertPeriod: payrollPeriod });
          if (!payroll) return null;
          return {
            employee: formatEmployeeBasic(employee),
            payroll: {
              month,
              year,
              net_salary: payroll.net_salary,
              total_earnings: payroll.total_earnings,
              total_deductions: payroll.total_deductions,
              attendance: {
                working_days: payroll.total_days || 0,
                present_days: payroll.shift_stats?.present_days || 0,
                absent_days: payroll.shift_stats?.absent_days || 0,
                paid_leave_days: payroll.shift_stats?.paid_leave_days || 0,
                unpaid_leave_days: payroll.shift_stats?.unpaid_leave_days || 0,
              },
              work: {
                worked_minutes: payroll.shift_stats?.worked_minutes || 0,
                overtime_minutes: payroll.shift_stats?.overtime_minutes || 0,
                deduction_minutes: payroll.shift_stats?.deductible_minutes || 0,
              },
              components_breakdown: {
                earnings: payroll.components?.filter(c => c.componentType === "earning").map(c => ({ name: c.componentName, amount: c.amount })) || [],
                deductions: payroll.components?.filter(c => c.componentType === "deduction").map(c => ({ name: c.componentName, amount: c.amount })) || [],
              },
              adjustments: payroll.adjustments?.map(a => ({ type: a.adjustment_type, name: a.name, amount: a.amount, remark: a.remark })) || [],
            },
          };
        })
      )
    ).filter(Boolean);

    return sendSuccess(res, 200, "Payroll list fetched successfully", { generated_payrolls: generatedPayrolls, preview_payrolls: previewResults }, buildMeta(page, limit, total, employees.length));
  } catch (err) {
    console.error("Payroll LIST API Error:", err);
    return sendError(res, err.statusCode || 500, err.message || "Server error");
  } finally {
    if (conn) conn.release();
  }
});

// 3. My Payroll
router.get("/my", auth(PAY.EMP), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const user_id = req.user?.id;
    const company_id = req.company?.id;

    let { year, page = 1, limit = 10 } = req.query;
    page = Number(page) || 1;
    limit = Math.min(Number(limit) || 10, 100);
    const offset = (page - 1) * limit;
    if (!user_id || !company_id) return sendError(res, 400, "Invalid user/company");

    const [[employee]] = await conn.query(
      `SELECT id, employee_code, designation, employment_type, salary_type FROM employees WHERE user_id = ? AND company_id = ? AND is_deleted = 0 AND is_active = 1`,
      [user_id, company_id]
    );
    if (!employee) return sendError(res, 404, "Employee not found");

    let whereClause = `pe.employee_id = ? AND pe.company_id = ? AND pe.is_deleted = 0`;
    const params = [employee.id, company_id];
    if (year) { whereClause += ` AND YEAR(pe.payroll_period) = ?`; params.push(year); }

    const [[{ total }]] = await conn.query(`SELECT COUNT(*) as total FROM payroll_entries pe WHERE ${whereClause}`, params);

    const [rows] = await conn.query(
      `SELECT ${PAYROLL_ENTRY_FIELDS} FROM payroll_entries pe WHERE ${whereClause} ORDER BY pe.payroll_period DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const payrollPeriods = rows.map(r => r.payroll_period);
    let adjustmentsMap = {};
    if (payrollPeriods.length) {
      const [adjustments] = await conn.query(
        `SELECT * FROM payroll_adjustments WHERE employee_id = ? AND company_id = ? AND is_deleted = 0 AND adjustment_period IN (?)`,
        [employee.id, company_id, payrollPeriods]
      );
      adjustmentsMap = adjustments.reduce((acc, adj) => {
        const key = adj.adjustment_period;
        if (!acc[key]) acc[key] = [];
        acc[key].push(adj);
        return acc;
      }, {});
    }

    const data = rows.map(r => {
      const date = new Date(r.payroll_period);
      return {
        payroll: {
          id: r.id,
          month: date.getMonth() + 1,
          year: date.getFullYear(),
          net_salary: r.net_salary,
          total_earnings: r.total_earnings,
          total_deductions: r.total_deductions,
          attendance: {
            working_days: r.working_days,
            present_days: r.present_days,
            absent_days: r.absent_days,
            paid_leave_days: r.paid_leave_days,
            unpaid_leave_days: r.unpaid_leave_days,
          },
          deductions: {
            deduction_minutes: r.deduction_minutes,
          },
          work: {
            worked_hours: Number(r.worked_minutes) / 60,
            overtime_hours: Number(r.overtime_minutes) / 60,
          },
          salary_snapshot: {
            employee_code: r.snapshot_employee_code,
            designation: getEnumObject(DESIGNATIONS, r.snapshot_designation),
            employment_type: getEnumObject(EMPLOYMENT_TYPES, r.snapshot_employment_type),
            salary_type: getEnumObject(SALARY_TYPES, r.snapshot_salary_type),
            base_amount: r.snapshot_base_amount,
          },
          adjustments: (adjustmentsMap[r.payroll_period] || []).map(a => ({
            id: a.id,
            type: a.adjustment_type,
            name: a.name,
            amount: a.amount,
            remark: a.remark,
          })),
        },
      };
    });

    return sendSuccess(res, 200, "My payroll fetched successfully", data, buildMeta(page, limit, total, data.length));
  } catch (err) {
    console.error("Payroll MY API Error:", err);
    return sendError(res, 500, "Server error");
  } finally {
    if (conn) conn.release();
  }
});

// 4. Create Adjustment
router.post("/adjustments", auth(PAY_ADJ.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const company_id = req.company?.id;
    const user_id = req.user?.id;

    let { employee_id, adjustment_type, usage_type, name, remark, amount, adjustment_period } = req.body;
    employee_id = Number(employee_id);
    amount = Number(amount);

    if (!employee_id || !adjustment_type || !usage_type || !name || !amount || !adjustment_period) {
      return sendError(res, 400, "Missing required fields");
    }
    if (!["bonus", "fine"].includes(adjustment_type)) return sendError(res, 400, "Invalid adjustment_type");
    if (!["payroll", "ledger"].includes(usage_type)) return sendError(res, 400, "Invalid usage_type");
    if (!Number.isFinite(amount) || amount <= 0) return sendError(res, 400, "Amount must be positive");

    const periodDate = new Date(adjustment_period);
    if (isNaN(periodDate.getTime())) return sendError(res, 400, "Invalid adjustment_period");

    const employeeExists = await checkEmployeeExists(conn, company_id, employee_id);
    if (!employeeExists) return sendError(res, 404, "Employee not found");

    if (usage_type === "payroll") {
      const transaction_id = `TXN-${Date.now()}`;
      const [payroll] = await conn.query(
        `INSERT INTO payroll_adjustments (company_id, employee_id, adjustment_type, usage_type, name, remark, amount, adjustment_period, created_by) VALUES (?,?,?,?,?,?,?,?,?)`,
        [company_id, employee_id, adjustment_type, usage_type, name.trim(), remark?.trim() || null, amount, adjustment_period, user_id]
      );
      await conn.query(
        `INSERT INTO transactions (transaction_id, create_by, amount, employee_id, company_id, transaction_date, transaction_type, remark, value1) VALUES (?,?,?,?,?,?,?,?,?)`,
        [transaction_id, user_id, amount, employee_id, company_id, adjustment_period, adjustment_type, remark?.trim() || name.trim(), payroll.insertId]
      );

      await recalcPayrollIfExists(conn, company_id, employee_id, user_id);

      return sendSuccess(res, 201, "Payroll adjustment created successfully");
    }

    if (usage_type === "ledger") {
      const transaction_id = `TXN-${Date.now()}`;
      const [transaction] = await conn.query(
        `INSERT INTO transactions (transaction_id, create_by, amount, employee_id, company_id, transaction_date, transaction_type, remark) VALUES (?,?,?,?,?,?,?,?)`,
        [transaction_id, user_id, amount, employee_id, company_id, adjustment_period, adjustment_type, remark?.trim() || name.trim()]
      );
      await conn.query(
        `INSERT INTO payroll_adjustments (company_id, employee_id, adjustment_type, usage_type, name, remark, amount, adjustment_period, created_by, value1) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [company_id, employee_id, adjustment_type, usage_type, name.trim(), remark?.trim() || null, amount, adjustment_period, user_id, transaction.insertId]
      );
      return sendSuccess(res, 201, "Ledger transaction created successfully");
    }

    return sendError(res, 400, "Invalid usage_type");
  } catch (error) {
    console.error("Create Adjustment Error:", error);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// 5. List Adjustments
router.get("/adjustments/list", auth(PAY_ADJ.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const company_id = req.company?.id;
    if (!company_id) return sendError(res, 401, "Unauthorized");

    let { employee_id, adjustment_type, month, year, page = 1, limit = 10 } = req.query;
    page = parseInt(page) || 1;
    limit = Math.min(parseInt(limit) || 10, 100);
    const offset = (page - 1) * limit;

    let conditions = [`pa.company_id = ?`, `pa.is_deleted = 0`];
    let values = [company_id];
    if (employee_id) { conditions.push(`pa.employee_id = ?`); values.push(employee_id); }
    if (adjustment_type) { conditions.push(`pa.adjustment_type = ?`); values.push(adjustment_type); }
    if (month && year) {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = `${year}-${String(month).padStart(2, "0")}-31`;
      conditions.push(`pa.adjustment_period BETWEEN ? AND ?`); values.push(start, end);
    }
    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const [countResult] = await conn.query(`SELECT COUNT(*) as total FROM payroll_adjustments pa ${whereClause}`, values);
    const total = countResult[0].total;

    const [summaryRows] = await conn.query(
      `SELECT adjustment_type, SUM(amount) as total_amount FROM payroll_adjustments pa ${whereClause} GROUP BY adjustment_type`,
      values
    );
    const summary = { bonus: 0, fine: 0 };
    summaryRows.forEach(r => { if (r.adjustment_type === "bonus") summary.bonus = r.total_amount; if (r.adjustment_type === "fine") summary.fine = r.total_amount; });

    const [rows] = await conn.query(
      `SELECT ${ADJUSTMENT_FIELDS}, e.employee_code, u.name as employee_name, u.profile_picture as employee_profile_picture
       FROM payroll_adjustments pa JOIN employees e ON e.id = pa.employee_id JOIN users u ON u.id = e.user_id
       ${whereClause} ORDER BY pa.adjustment_period DESC, pa.id DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    const data = rows.map(formatAdjustment);
    return sendSuccess(res, 200, "Payroll adjustment list fetched successfully", data, { ...buildMeta(page, limit, total, data.length), summary });
  } catch (error) {
    console.error("List Payroll Adjustments Error:", error);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// 6. Update Adjustment
router.put("/adjustments/update", auth(PAY_ADJ.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const company_id = req.company?.id;
    const user_id = req.user?.id;
    let { id, adjustment_type, name, remark, amount, adjustment_period } = req.body;

    if (!company_id || !user_id || !id) return sendError(res, 400, "Invalid request");

    const [existing] = await conn.query(
      `SELECT * FROM payroll_adjustments WHERE id = ? AND company_id = ? AND is_deleted = 0`, [id, company_id]
    );
    if (!existing.length) return sendError(res, 404, "Adjustment not found");

    const employee_id = existing[0].employee_id;
    if (employee_id) {
      const employeeExists = await checkEmployeeExists(conn, company_id, employee_id);
      if (!employeeExists) return sendError(res, 404, "Employee not found");
    }

    let updates = [], values = [];
    if (employee_id) { updates.push("employee_id = ?"); values.push(employee_id); }
    if (adjustment_type) {
      if (!["bonus", "fine"].includes(adjustment_type)) return sendError(res, 400, "Invalid adjustment_type");
      updates.push("adjustment_type = ?"); values.push(adjustment_type);
    }
    if (name) { updates.push("name = ?"); values.push(name.trim()); }
    if (remark !== undefined) { updates.push("remark = ?"); values.push(remark || null); }
    if (amount !== undefined) {
      amount = parseFloat(amount);
      if (isNaN(amount) || amount <= 0) return sendError(res, 400, "Invalid amount");
      updates.push("amount = ?"); values.push(amount);
    }
    if (adjustment_period) {
      if (isNaN(new Date(adjustment_period))) return sendError(res, 400, "Invalid date");
      updates.push("adjustment_period = ?"); values.push(adjustment_period);
    }
    if (!updates.length) return sendError(res, 400, "No fields to update");

    updates.push("updated_by = ?"); values.push(user_id);
    await conn.query(`UPDATE payroll_adjustments SET ${updates.join(", ")} WHERE id = ? AND company_id = ?`, [...values, id, company_id]);

    await recalcPayrollIfExists(conn, company_id, employee_id, user_id);

    return sendSuccess(res, 200, "Adjustment updated successfully");
  } catch (error) {
    console.error("Update Adjustment Error:", error);
    return sendError(res, 500, "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// 7. Delete Adjustments (bulk)
router.delete("/adjustments/delete", auth(PAY_ADJ.MNG), withTransaction(async (conn, req, res) => {
  const company_id = req.company?.id;
  const user_id = req.user?.id;

  let { id, ids } = req.body;

  if (!company_id) {
    throw {
      status: 400,
      message: "Valid company_id is required",
    };
  }

  let adjustmentIds = [];

  if (id !== undefined && ids === undefined) {
    const parsedId = parseInt(id, 10);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      throw {
        status: 400,
        message: "Valid adjustment id is required",
      };
    }

    adjustmentIds = [parsedId];
  }

  else if (ids !== undefined) {
    if (ids === "all") {
      const [rows] = await conn.query(
        `
            SELECT id
            FROM payroll_adjustments
            WHERE company_id = ?
              AND is_deleted = 0
          `,
        [company_id]
      );

      adjustmentIds = rows.map((row) => row.id);
    }

    else if (Array.isArray(ids)) {
      adjustmentIds = [
        ...new Set(
          ids
            .map((value) => parseInt(value, 10))
            .filter(
              (value) =>
                Number.isInteger(value) && value > 0
            )
        ),
      ];

      if (adjustmentIds.length === 0) {
        throw {
          status: 400,
          message: "Valid adjustment ids are required",
        };
      }
    } else {
      throw {
        status: 400,
        message: "ids must be an array or 'all'",
      };
    }
  }

  // Neither id nor ids supplied
  else {
    throw {
      status: 400,
      message: "id or ids is required",
    };
  }

  if (adjustmentIds.length === 0) {
    return sendSuccess(
      res,
      200,
      "No payroll adjustments to delete",
      {
        deleted_count: 0,
        ids: [],
      }
    );
  }

  const placeholders = adjustmentIds
    .map(() => "?")
    .join(", ");

  const [adjustments] = await conn.query(
    `
        SELECT
          id,
          employee_id
        FROM payroll_adjustments
        WHERE company_id = ?
          AND id IN (${placeholders})
          AND is_deleted = 0
      `,
    [company_id, ...adjustmentIds]
  );

  const existingIds = new Set(
    adjustments.map((row) => row.id)
  );

  const missingIds = adjustmentIds.filter(
    (adjustmentId) => !existingIds.has(adjustmentId)
  );

  if (missingIds.length > 0) {
    throw {
      status: 404,
      message:
        "One or more payroll adjustments not found or already deleted",
      data: {
        ids: missingIds,
      },
    };
  }

  const employeeIds = [
    ...new Set(
      adjustments
        .map((adjustment) => adjustment.employee_id)
        .filter(
          (employeeId) =>
            employeeId !== null &&
            employeeId !== undefined
        )
    ),
  ];

  const [result] = await conn.query(
    `
        UPDATE payroll_adjustments
        SET
          is_deleted = 1,
          deleted_at = NOW(),
          deleted_by = ?
        WHERE company_id = ?
          AND id IN (${placeholders})
          AND is_deleted = 0
      `,
    [
      user_id || null,
      company_id,
      ...adjustmentIds,
    ]
  );

  for (const employeeId of employeeIds) {
    await recalcPayrollIfExists(
      conn,
      company_id,
      employeeId,
      user_id
    );
  }

  return sendSuccess(
    res,
    200,
    adjustmentIds.length === 1
      ? "Payroll adjustment deleted successfully"
      : "Payroll adjustments deleted successfully",
    {
      deleted_count: result.affectedRows,
      ids: adjustmentIds,
    }
  );
})
);


// 8. Send Payroll Email
router.post("/send-email", auth(PAY.MNG), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const companyId = req.company?.id;
    const userId = req.user?.id;
    const { payroll_entry_id, email, type } = req.body || {};

    if (!companyId || !userId) return sendError(res, 401, "Unauthorized access");
    if (!payroll_entry_id) return sendError(res, 400, "Payroll entry id is required");

    const payrollIds = Array.isArray(payroll_entry_id) ? payroll_entry_id : [payroll_entry_id];
    const validPayrollIds = payrollIds.map(Number).filter(id => Number.isInteger(id) && id > 0);
    if (!validPayrollIds.length) return sendError(res, 400, "No valid payroll entry ids provided");
    if (type && !["summary", "detailed"].includes(type)) return sendError(res, 400, "Invalid email type");

    const sent = [], failed = [];
    for (const payrollId of validPayrollIds) {
      try {
        const payslipDetails = await getPayslipData({ conn, payrollEntryId: payrollId, companyId, type: type || "summary" });
        if (!payslipDetails) {
          failed.push({ payroll_entry_id: payrollId, error: "Payroll entry not found" });
          continue;
        }
        const { payroll, components = [], adjustments = [], details = null } = payslipDetails;
        const receiverEmail = email?.trim() || payroll.employee_email?.trim();
        if (!receiverEmail) {
          failed.push({ payroll_entry_id: payrollId, employee_name: payroll.employee_name, error: "Employee email not found" });
          continue;
        }
        await queuePayrollEmail({
          to: receiverEmail,
          subject: `Salary Slip - ${payroll.company_name || "OneAttendance"}`,
          fromEmail: EMAIL_USER,
          fromName: payroll.company_name || "OneAttendance",
          replyTo: req.user?.email || EMAIL_USER,
          payroll,
          components,
          adjustments,
          details,
          type: type || "summary"
        });
        sent.push({ payroll_entry_id: payrollId, employee_name: payroll.employee_name, email: receiverEmail });
      } catch (error) {
        console.error(`PAYROLL EMAIL ERROR [${payrollId}]`, error);
        failed.push({ payroll_entry_id: payrollId, error: error.message });
      }
    }

    return sendSuccess(res, 200, `${sent.length} payroll email(s) queued successfully`, { summary: { total: validPayrollIds.length, sent: sent.length, failed: failed.length }, data: { sent, failed } });
  } catch (error) {
    console.error("SEND PAYROLL EMAIL ERROR:", error);
    return sendError(res, 500, error.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

// 9. Download Payslip
router.post("/download", auth(), async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const companyId = req.company?.id;
    const userId = req.user?.id;
    const { payroll_entry_id, type } = req.body || {};

    if (!companyId || !userId) return sendError(res, 401, "Unauthorized access");
    if (!payroll_entry_id) return sendError(res, 400, "Payroll entry id is required");
    if (type && !["summary", "detailed"].includes(type)) return sendError(res, 400, "Invalid email type");

    const payslipDetails = await getPayslipData({ conn, payrollEntryId: payroll_entry_id, companyId, type: type || "summary" });
    if (!payslipDetails) return sendError(res, 404, "Payroll entry not found");

    const { payroll, components = [], adjustments = [], details = null } = payslipDetails;
    const paySlipPdf = await generatePayslipPdf({ payroll, components, adjustments, details, type });

    const fileName = `payslip_${payroll_entry_id}_${Date.now()}.pdf`;
    const file = new Blob([paySlipPdf], { type: "application/pdf" });
    const formData = new FormData();
    formData.append("file", file, fileName);

    const uploadResponse = await fetch("https://upload.onesaas.in/api/upload", {
      method: "POST",
      headers: { key: "onedevelopers" },
      body: formData,
    });
    if (!uploadResponse.ok) throw new Error(`Upload API failed with status ${uploadResponse.status}`);
    const uploadResult = await uploadResponse.json();
    if (!uploadResult?.success || !uploadResult?.url) throw new Error(uploadResult?.message || "Failed to upload payslip PDF");

    return sendSuccess(res, 200, "Payslip generated successfully", { url: uploadResult.url, file_name: fileName });
  } catch (error) {
    console.error("DOWNLOAD PAYROLL PDF ERROR:", error);
    return sendError(res, 500, error.message || "Internal server error");
  } finally {
    if (conn) conn.release();
  }
});

export default router;
import { generatePdfFromHtml } from "./pdfGenerator.js";
import { parseISTDateTime, formatTime12Hour, formatTime } from "../utils/time.js";

const formatPeriod = (value) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(new Date(value));
};

export async function generatePayslipPdf(data = {}) {
  const {
    payroll = {},
    components = [],
    adjustments = [],
    details = null
  } = data;

  const days = Array.isArray(details?.days) ? details.days : [];
  const isDetailed = days.length > 0;
  const currency = payroll.transaction_currency || "INR";

  // ---- helpers ----
  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const fmt = (value) =>
    Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  const mins = (value) => Number(value || 0);
  const hrs = (value) => (Number(value || 0) / 60).toFixed(2);

  const formatDate = (date) => {
    if (!date) return "-";
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  };

  const formatAttendanceDisplayTime = (dateTime, use12Hour = true) => {
    if (!dateTime) return "-";
    const parsed = parseISTDateTime(dateTime);
    if (!parsed || !parsed.isValid()) return "-";
    const time24 = parsed.format("HH:mm:ss");
    if (!use12Hour) return time24;
    return formatTime12Hour(time24) || parsed.format("hh:mm A");
  };

  const period = payroll.payroll_period ? formatPeriod(payroll.payroll_period) : "-";

  // Separate components
  const earnings = components.filter(item => item.component_type === "earning");
  const deductions = components.filter(item => item.component_type === "deduction");
  const rowCount = Math.max(earnings.length, deductions.length, 1);

  const padRows = (rows) => {
    const copy = [...rows];
    while (copy.length < rowCount) { copy.push(null); } return copy;
  }; const earnRows = padRows(earnings); const
    deductRows = padRows(deductions);
  const addressParts = [payroll.address_line1,
  payroll.address_line2, [payroll.city, payroll.state].filter(Boolean).join(", "),
  [payroll.postal_code, payroll.country].filter(Boolean).join(" , ")].filter(Boolean);

  const address = addressParts
    .map(escapeHtml)
    .join(" <br>");

  // Totals for daily breakdown
  const totalDayPay = days.reduce((sum, row) => sum + Number(row.attendance_pay || 0), 0);
  const totalOtPay = days.reduce((sum, row) => sum + Number(row.overtime_pay || 0), 0);
  const totalDeductPay = days.reduce((sum, row) => sum + Number(row.deductible_pay || 0), 0);

  // ---------- HTML template ----------
  const html = `
  <!DOCTYPE html>
  <html>

  <head>
    <meta charset="utf-8">
    <style>
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      body {
        font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        font-size: 11px;
        color: #1e293b;
        padding: 24px 28px 16px 28px;
        line-height: 1.4;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 18px;
        padding-bottom: 12px;
        border-bottom: 2px solid #e2e8f0;
      }

      .logo-name {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .logo {
        width: 56px;
        height: 56px;
        object-fit: contain;
        border-radius: 6px;
      }

      .company h2 {
        font-size: 18px;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 2px;
      }

      .company .address {
        font-size: 9px;
        color: #64748b;
        line-height: 1.3;
      }

      .payslip-title {
        text-align: right;
      }

      .payslip-title h1 {
        font-size: 22px;
        font-weight: 800;
        color: #4f46e5;
        letter-spacing: -0.5px;
      }

      .payslip-title .period {
        font-size: 11px;
        color: #475569;
        margin-top: 4px;
      }

      .info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px 24px;
        margin-bottom: 18px;
        padding: 14px 16px;
        background: #f8fafc;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
      }

      .info-item {
        display: flex;
        flex-direction: column;
      }

      .info-item .label {
        font-size: 9px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 2px;
      }

      .info-item .value {
        font-weight: 600;
        color: #0f172a;
        font-size: 11px;
      }

      .stats-row {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        margin-bottom: 16px;
      }

      .stat-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 10px 12px;
        text-align: center;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
      }

      .stat-card .stat-label {
        font-size: 9px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        margin-bottom: 4px;
      }

      .stat-card .stat-value {
        font-size: 16px;
        font-weight: 700;
        color: #0f172a;
      }

      .stat-card .stat-sub {
        font-size: 9px;
        color: #94a3b8;
        margin-top: 2px;
      }

      .section {
        margin-bottom: 16px;
      }

      .section-title {
        font-size: 12px;
        font-weight: 700;
        color: #4f46e5;
        margin-bottom: 10px;
        padding-bottom: 4px;
        border-bottom: 1px solid #e2e8f0;
      }

      .table {
        width: 100%;
        border-collapse: collapse;
      }

      .table th {
        background: #f1f5f9;
        padding: 7px 8px;
        border: 1px solid #e2e8f0;
        text-align: left;
        font-weight: 600;
        font-size: 10px;
        color: #334155;
      }

      .table td {
        padding: 7px 8px;
        border: 1px solid #e2e8f0;
      }

      .text-right {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      .salary-table td {
        width: 25%;
      }

      .summary-box {
        background: #eef2ff;
        border: 1px solid #c7d2fe;
        border-radius: 8px;
        padding: 10px 14px;
        margin-top: 10px;
      }

      .summary-line {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        font-size: 11px;
      }

      .summary-line.net {
        font-weight: 700;
        color: #4338ca;
        font-size: 13px;
        border-top: 1px solid #c7d2fe;
        margin-top: 6px;
        padding-top: 8px;
      }

      .daily-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 8.5px;
        table-layout: fixed;
      }

      .daily-table th {
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        padding: 5px 3px;
        font-weight: 600;
        text-align: center;
      }

      .daily-table td {
        border: 1px solid #e2e8f0;
        padding: 5px 3px;
        text-align: center;
        word-wrap: break-word;
      }

      .daily-table tr:nth-child(even) td {
        background: #f8fafc;
      }

      .footer {
        margin-top: 18px;
        font-size: 8.5px;
        color: #94a3b8;
        text-align: center;
        border-top: 1px solid #e2e8f0;
        padding-top: 8px;
      }

      .avoid-break {
        page-break-inside: avoid;
      }

      @media print {
        body {
          padding: 16px;
        }
      }
    </style>
  </head>

  <body>

    <!-- HEADER -->
    <div class="header">
      <div class="logo-name">
        ${payroll.company_logo ? `<img src="${payroll.company_logo}" class="logo" />` : ""}
        <div class="company">
          <h2>${escapeHtml(payroll.company_name)}</h2>
          <div class="address">${address}</div>
        </div>
      </div>
      <div class="payslip-title">
        <h1>Payslip</h1>
        <div class="period">${escapeHtml(period)}</div>
      </div>
    </div>

    <!-- EMPLOYEE INFORMATION -->
    <div class="info-grid">
      <div class="info-item">
        <span class="label">Employee</span>
        <span class="value">${escapeHtml(payroll.employee_name || "-")}</span>
      </div>
      <div class="info-item">
        <span class="label">Code</span>
        <span class="value">${escapeHtml(payroll.employee_code || "-")}</span>
      </div>
      <div class="info-item">
        <span class="label">Designation</span>
        <span class="value">${escapeHtml(payroll.designation || "-")}</span>
      </div>
      <div class="info-item">
        <span class="label">Employment Type</span>
        <span class="value">${escapeHtml(payroll.employment_type || "-")}</span>
      </div>
      <div class="info-item">
        <span class="label">Email</span>
        <span class="value">${escapeHtml(payroll.employee_email || "-")}</span>
      </div>
      <div class="info-item">
        <span class="label">Phone</span>
        <span class="value">${escapeHtml(payroll.employee_phone || "-")}</span>
      </div>
      <div class="info-item">
        <span class="label">Pay Period</span>
        <span class="value">${escapeHtml(period)}</span>
      </div>
      <div class="info-item">
        <span class="label">Currency</span>
        <span class="value">${escapeHtml(currency)}</span>
      </div>
    </div>

    <!-- ATTENDANCE SUMMARY – SEPARATE CARD VIEW -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">Working Days</div>
        <div class="stat-value">${payroll.working_days ?? 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Present</div>
        <div class="stat-value">${payroll.present_days ?? 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Paid Leave Days</div>
        <div class="stat-value">${payroll.paid_leave_days ?? 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Unpaid Leave Days</div>
        <div class="stat-value">${payroll.unpaid_leave_days ?? 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Absent Days</div>
        <div class="stat-value">${payroll.absent_days ?? 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Worked Hrs</div>
        <div class="stat-value">${hrs(payroll.worked_minutes)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Overtime Hrs</div>
        <div class="stat-value">${hrs(payroll.overtime_minutes)}</div>
      </div>
    </div>

    <!-- ADJUSTMENTS (if any) -->
    ${adjustments.length ? `
    <div class="section avoid-break">
      <div class="section-title">Adjustments</div>
      <table class="table">
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Remark</th>
          <th class="text-right">Amount</th>
        </tr>
        ${adjustments.map(a => `
        <tr>
          <td>${escapeHtml(a.name)}</td>
          <td>${escapeHtml(a.adjustment_type)}</td>
          <td>${escapeHtml(a.remark || "-")}</td>
          <td class="text-right">${fmt(a.amount)}</td>
        </tr>
        `).join("")}
      </table>
    </div>
    ` : ""}

    <!-- SALARY COMPONENTS -->
    <div class="section avoid-break">
      <div class="section-title">Salary Details</div>
      <table class="table salary-table">
        <tr>
          <th>Earnings</th>
          <th class="text-right">Amount</th>
          <th>Deductions</th>
          <th class="text-right">Amount</th>
        </tr>
        ${earnRows.map((_, idx) => `
        <tr>
          <td>${escapeHtml(earnRows[idx]?.name || "")}</td>
          <td class="text-right">${earnRows[idx] ? fmt(earnRows[idx].amount) : ""}</td>
          <td>${escapeHtml(deductRows[idx]?.name || "")}</td>
          <td class="text-right">${deductRows[idx] ? fmt(deductRows[idx].amount) : ""}</td>
        </tr>
        `).join("")}
      </table>

      ${!isDetailed ? `
      <div class="summary-box">
        <div class="summary-line">
          <span>Total Earnings</span>
          <span>
            ${fmt(payroll.total_earnings)}
            ${Number(payroll.total_earnings) > 0
        ? ` (${[
          Number(payroll.component_earnings) > 0
            ? fmt(payroll.component_earnings)
            : null,
          Number(payroll.attendance_pay) > 0
            ? fmt(payroll.attendance_pay)
            : null,
          Number(payroll.bonus_adjustments) > 0
            ? fmt(payroll.bonus_adjustments)
            : null
        ].filter(Boolean).join(" + ")})`
        : ""}
          </span>
        </div>

        <div class="summary-line">
          <span>Total Deductions</span>
          <span>
            ${fmt(payroll.total_deductions)}
            ${Number(payroll.total_deductions) > 0
        ? ` (${[
          Number(payroll.fine_adjustments) > 0
            ? fmt(payroll.fine_adjustments)
            : null,
          Number(payroll.component_deductions) > 0
            ? fmt(payroll.component_deductions)
            : null
        ].filter(Boolean).join(" + ")})`
        : ""}
          </span>
        </div>
        <div class="summary-line net">
          <span>Net Salary</span>
          <span>${fmt(payroll.net_salary)}</span>
        </div>
      </div>
      ` : ""}
    </div>

    <!-- DAILY BREAKDOWN (only when detailed) -->
    ${isDetailed ? `
    <div class="section avoid-break">
      <div class="section-title">Daily Attendance Breakdown</div>
      <table class="daily-table">
        <tr>
          <th>Date</th>
          <th>In</th>
          <th>Out</th>
          <th>Status</th>
          <th>Worked (min)</th>
          <th>OT (min)</th>
          <th>Deduct (min)</th>
          <th>Day Pay</th>
          <th>OT Pay</th>
          <th>Deduct Pay</th>
          <th>Total</th>
        </tr>
        ${days.map(day => {
          const status = day.day_status === "leave"
            ? `${day.day_status} (${day.attendance_meta?.leave_type || ""})`
            : day.day_status === "half_day"
              ? `${day.day_status} (${day.attendance_meta?.half_day_type || ""})`
              : day.day_status;
          return `
        <tr>
          <td>${formatDate(day.date)}</td>
          <td>${formatAttendanceDisplayTime(day.start_time)}</td>
          <td>${formatAttendanceDisplayTime(day.end_time)}</td>
          <td>${escapeHtml(status || "-")}</td>
          <td>${mins(day.worked_minutes)}</td>
          <td>${mins(day.overtime_minutes)}</td>
          <td>${mins(day.deductible_minutes)}</td>
          <td>${fmt(day.attendance_pay)}</td>
          <td>${fmt(day.overtime_pay)}</td>
          <td>${fmt(day.deductible_pay)}</td>
          <td><strong>${fmt(day.total_pay)}</strong></td>
        </tr>`;
        }).join("")}
      </table>

      <div class="summary-box">
        <div class="summary-line">
          <span>Attendance Pay (gross)</span>
          <span>${fmt(totalDayPay)}</span>
        </div>
        <div class="summary-line">
          <span>Total Overtime Pay</span>
          <span>${fmt(totalOtPay)}</span>
        </div>
        <div class="summary-line">
          <span>Total Deduction Pay</span>
          <span>${fmt(totalDeductPay)}</span>
        </div>
        <div class="summary-line" style="font-weight:600;">
          <span>Attendance Net</span>
          <span>${fmt(totalDayPay + totalOtPay - totalDeductPay)}</span>
        </div>
      </div>
    </div>

    <!-- FINAL SUMMARY WITH BREAKDOWN (FIXED) -->
    <div class="summary-box" style="margin-top:12px;">
      <div class="summary-line">
        <span>Total Earnings</span>
        <span>
          ${fmt(payroll.total_earnings)}
          ${Number(payroll.total_earnings) > 0
        ? ` (${[
          Number(payroll.component_earnings) > 0
            ? fmt(payroll.component_earnings)
            : null,
          Number(payroll.attendance_pay) > 0
            ? fmt(payroll.attendance_pay)
            : null,
          Number(payroll.bonus_adjustments) > 0
            ? fmt(payroll.bonus_adjustments)
            : null
        ]
          .filter(Boolean)
          .join(" + ")})`
        : ""}
        </span>
      </div>
      <div class="summary-line">
        <span>Total Deductions</span>
        <span>
          ${fmt(payroll.total_deductions)}
          ${Number(payroll.total_deductions) > 0
        ? ` (${[
          Number(payroll.fine_adjustments) > 0
            ? fmt(payroll.fine_adjustments)
            : null,
          Number(payroll.component_deductions) > 0
            ? fmt(payroll.component_deductions)
            : null
        ]
          .filter(Boolean)
          .join(" + ")})`
        : ""}
        </span>
      </div>
      <div class="summary-line net">
        <span>Net Salary</span>
        <span>${fmt(payroll.net_salary)}</span>
      </div>
    </div>
    ` : ""}

    <div class="footer">
      Generated by OneAttendance • ${new Date().toLocaleDateString("en-IN")}
    </div>

  </body>

  </html>`;

  return generatePdfFromHtml(html);
}
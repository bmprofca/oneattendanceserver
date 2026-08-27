import { generatePdfFromHtml } from "./pdfGenerator.js";

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const formatPeriod = (month, year) => new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
}).format(new Date(year, month - 1, 1));

export function buildShiftPdfHtml({ employeeName, employeeCode, month, year, statistics, shift, days }) {
  const period = formatPeriod(month, year);
  const dayRows = Object.entries(days || {}).map(([date, day]) => {
    const status = day?.day_status || "upcoming";
    const activities = day?.activities || [];
    const punchIn = activities.find((activity) => activity.type === "PUNCH_IN")?.time || "-";
    const punchOut = activities.find((activity) => activity.type === "PUNCH_OUT")?.time || "-";

    return `<tr>
      <td>${escapeHtml(date)}</td>
      <td>${escapeHtml(status.replace(/_/g, " "))}</td>
      <td>${escapeHtml(punchIn)}</td>
      <td>${escapeHtml(punchOut)}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Shift Schedule - ${escapeHtml(employeeName)} - ${escapeHtml(period)}</title>
  <style>
    body { font-family: Helvetica, Arial, sans-serif; color: #1e293b; padding: 20px; font-size: 12px; }
    .header { border-bottom: 2px solid #4f46e5; padding-bottom: 14px; margin-bottom: 18px; }
    .title { font-size: 20px; font-weight: bold; color: #312e81; }
    .meta { color: #64748b; margin-top: 5px; }
    .stats { display: flex; gap: 12px; margin-bottom: 18px; }
    .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 12px; border-radius: 6px; flex: 1; }
    .stat-label { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #64748b; }
    .stat-value { font-size: 15px; font-weight: bold; color: #0f172a; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f1f5f9; text-align: left; padding: 8px; font-size: 10px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
    td { padding: 8px; border-bottom: 1px solid #e2e8f0; text-transform: capitalize; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">Shift Schedule and Attendance Log</div>
    <div class="meta">Employee: <strong>${escapeHtml(employeeName || "Employee")}</strong> (${escapeHtml(employeeCode || "N/A")}) | Period: <strong>${escapeHtml(period)}</strong></div>
  </div>
  <div class="stats">
    <div class="stat-card"><div class="stat-label">Shift Timing</div><div class="stat-value">${escapeHtml(shift?.start_time || "-")} - ${escapeHtml(shift?.end_time || "-")}</div></div>
    <div class="stat-card"><div class="stat-label">Target Minutes</div><div class="stat-value">${Number(statistics?.expected_work_minutes || 0)}m</div></div>
    <div class="stat-card"><div class="stat-label">Worked Minutes</div><div class="stat-value">${Number(statistics?.worked_minutes || 0)}m</div></div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Status</th><th>Punch In</th><th>Punch Out</th></tr></thead>
    <tbody>${dayRows}</tbody>
  </table>
</body>
</html>`;
}

export async function generateShiftPdf(data = {}) {
  return generatePdfFromHtml(buildShiftPdfHtml(data));
}
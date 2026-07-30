import { transporter, getSender } from "../../config/mail.config.js";
import { getBaseEmailTemplate } from "./base_template.js";
import { generatePayslipPdf } from "../../utils/generatePayslipPdf.js";
import { EMAIL_USER } from "../../config/config.js";

const formatPeriod = (value) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(new Date(value));
};

export const sendPayrollEmail = async ({
  to,
  subject,
  fromEmail = EMAIL_USER,
  fromName = "OneAttendance",
  replyTo,
  payroll = {},
  components = [],
  adjustments = [],
  details = null,
  type = "summary"
}) => {
  if (!to) throw new Error("Payroll email requires a recipient email address.");

  const currency = payroll.transaction_currency || "INR";
  const formattedPeriod = formatPeriod(payroll.payroll_period);
  const finalSubject =
    subject || `Salary Slip - ${payroll.company_name || "OneAttendance"}`;

  // ── Email body HTML ──────────────────────────────────────────────────────────
  const html = getBaseEmailTemplate({
    title: `Salary Slip - ${formattedPeriod}`,
    headerColor: "#0f172a",
    headerHtml: `
      <div style="text-align:center;">
        <div style="display:inline-block;background:rgba(255,255,255,.12);padding:8px 18px;border-radius:999px;margin-bottom:16px;">
          <span style="color:#ffffff;font-size:13px;font-weight:600;letter-spacing:.3px;">💼 PAYROLL PROCESSED</span>
        </div>
        <h1 style="margin:0;color:#ffffff;font-size:32px;font-weight:800;line-height:1.2;">Salary Slip Ready</h1>
        <p style="margin:12px 0 0;color:#cbd5e1;font-size:15px;">Payroll Period: ${formattedPeriod}</p>
      </div>
    `,
    contentHtml: `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:24px;margin-bottom:24px;">
        <p style="margin:0 0 14px;color:#0f172a;font-size:16px;">
          Dear <strong>${payroll.employee_name || "Employee"}</strong>,
        </p>
        <p style="margin:0;color:#475569;line-height:1.7;font-size:15px;">
          Your salary for <strong>${formattedPeriod}</strong> has been processed successfully.
          The detailed salary slip is attached to this email as a PDF document.
        </p>
      </div>
      <div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:18px;padding:32px;text-align:center;margin-bottom:28px;">
        <div style="color:#94a3b8;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">Net Salary</div>
        <div style="color:#ffffff;font-size:42px;font-weight:800;line-height:1;">
          ${currency} ${Number(payroll.net_salary || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </div>
        <div style="color:#cbd5e1;margin-top:12px;font-size:14px;">Payable Amount for ${formattedPeriod}</div>
      </div>
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;margin-bottom:28px;">
        <div style="background:#f8fafc;padding:16px 20px;border-bottom:1px solid #e2e8f0;font-size:16px;font-weight:700;color:#0f172a;">Payroll Summary</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:14px 20px;color:#64748b;">Employee Name</td><td style="padding:14px 20px;font-weight:600;color:#0f172a;text-align:right;">${payroll.employee_name || "-"}</td></tr>
          <tr><td style="padding:14px 20px;color:#64748b;border-top:1px solid #f1f5f9;">Employee Code</td><td style="padding:14px 20px;font-weight:600;color:#0f172a;border-top:1px solid #f1f5f9;text-align:right;">${payroll.employee_code || "-"}</td></tr>
          <tr><td style="padding:14px 20px;color:#64748b;border-top:1px solid #f1f5f9;">Designation</td><td style="padding:14px 20px;font-weight:600;color:#0f172a;border-top:1px solid #f1f5f9;text-align:right;">${payroll.designation || "-"}</td></tr>
          <tr><td style="padding:14px 20px;color:#64748b;border-top:1px solid #f1f5f9;">Company</td><td style="padding:14px 20px;font-weight:600;color:#0f172a;border-top:1px solid #f1f5f9;text-align:right;">${payroll.company_name || "-"}</td></tr>
          <tr><td style="padding:14px 20px;color:#64748b;border-top:1px solid #f1f5f9;">Payroll Period</td><td style="padding:14px 20px;font-weight:600;color:#0f172a;border-top:1px solid #f1f5f9;text-align:right;">${formattedPeriod}</td></tr>
          <tr><td style="padding:14px 20px;color:#64748b;border-top:1px solid #f1f5f9;">Total Earnings</td><td style="padding:14px 20px;font-weight:600;color:#15803d;border-top:1px solid #f1f5f9;text-align:right;">${currency} ${Number(payroll.total_earnings || 0).toFixed(2)}</td></tr>
          <tr><td style="padding:14px 20px;color:#64748b;border-top:1px solid #f1f5f9;">Total Deductions</td><td style="padding:14px 20px;font-weight:600;color:#dc2626;border-top:1px solid #f1f5f9;text-align:right;">${currency} ${Number(payroll.total_deductions || 0).toFixed(2)}</td></tr>
        </table>
      </div>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:20px;margin-bottom:24px;">
        <div style="color:#1e40af;font-size:14px;font-weight:700;margin-bottom:8px;">📎 Salary Slip Attached</div>
        <div style="color:#475569;line-height:1.7;font-size:14px;">Your detailed salary slip is attached as a PDF — including full earnings breakdown, deductions, adjustments, and attendance summary.</div>
      </div>
      <div style="text-align:center;color:#94a3b8;font-size:13px;line-height:1.8;">
        This is an automated payroll notification from <strong>${payroll.company_name || "OneAttendance"}</strong>.<br>
        Please contact your HR or payroll administrator if you have any questions.
      </div>
    `,
  });

  // ── Generate PDF & send ──────────────────────────────────────────────────────
  const pdfBuffer = await generatePayslipPdf({
    payroll,
    components,
    adjustments,
    details,
    type
  });

  await transporter.sendMail({
    from: getSender(fromName, fromEmail),
    replyTo: replyTo || fromEmail,
    to,
    subject: finalSubject,
    text: `Dear ${payroll.employee_name || "Employee"},\n\nYour salary for ${formattedPeriod} has been processed.\n\nNet Salary: ${currency} ${Number(payroll.net_salary || 0).toFixed(2)}\n\nPlease find the detailed salary slip attached.\n\nRegards,\n${payroll.company_name || "OneAttendance"}`,
    html,
    attachments: [
      {
        filename: `Salary-Slip-${formattedPeriod}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
};
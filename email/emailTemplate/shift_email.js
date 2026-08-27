import { transporter, getSender } from "../../config/mail.config.js";
import { getBaseEmailTemplate } from "./base_template.js";
import { generateShiftPdf } from "../../utils/generateShiftPdf.js";
import { EMAIL_USER } from "../../config/config.js";

export const sendShiftEmail = async ({
  to,
  subject,
  fromEmail = EMAIL_USER,
  fromName = "OneAttendance",
  replyTo,
  shiftData = {}
}) => {
  if (!to) throw new Error("Shift email requires a recipient email address.");

  const employee = shiftData.employee || {};
  const month = Number(shiftData.month);
  const year = Number(shiftData.year);
  const period = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" })
    .format(new Date(year, month - 1, 1));
  const employeeName = employee.name || "Employee";
  const companyName = shiftData.companyName || "OneAttendance";
  const pdfBuffer = await generateShiftPdf({ ...shiftData, employeeName, employeeCode: employee.employee_code });

  const html = getBaseEmailTemplate({
    title: `Shift Schedule - ${period}`,
    headerColor: "#312e81",
    headerHtml: `<h1 style="margin:0;color:#ffffff;font-size:30px;">Shift Schedule Ready</h1><p style="margin:10px 0 0;color:#e0e7ff;font-size:15px;">${period}</p>`,
    contentHtml: `<p style="margin:0 0 14px;color:#0f172a;font-size:16px;">Dear <strong>${employeeName}</strong>,</p><p style="margin:0;color:#475569;line-height:1.7;font-size:15px;">Your shift schedule and attendance log for <strong>${period}</strong> is attached as a PDF.</p><p style="margin:24px 0 0;color:#64748b;font-size:13px;">This is an automated notification from <strong>${companyName}</strong>.</p>`
  });

  await transporter.sendMail({
    from: getSender(fromName || companyName, fromEmail || EMAIL_USER),
    replyTo: replyTo || fromEmail || EMAIL_USER,
    to,
    subject: subject || `Shift Schedule - ${period}`,
    text: `Dear ${employeeName},\n\nYour shift schedule and attendance log for ${period} is attached as a PDF.\n\nRegards,\n${companyName}`,
    html,
    attachments: [{ filename: `Shift-Schedule-${period}.pdf`, content: pdfBuffer, contentType: "application/pdf" }]
  });
};
import { transporter, getSender } from "../../config/mail.config.js";
import { getBaseEmailTemplate } from "./base_template.js";
import { EMAIL_USER } from "../../config/config.js";

const formatDate = (value) => {
    if (!value) return "-";
    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(new Date(value));
};

const valueOrDash = (value) => value ?? "-";

export const sendLeaveRequestEmail = async ({
    to,
    subject,
    fromEmail = EMAIL_USER,
    fromName = "OneAttendance Leave Desk",
    replyTo,
    requester = {},
    employee = {},
    company = {},
    leave = {},
    leaveConfig = {},
    leaveBalance = {},
    attachments = [],
    adminName = "Admin",
}) => {
    if (!to) throw new Error("Leave request email requires at least one admin recipient.");

    const adminRecipients = Array.isArray(to) ? to.join(",") : to;
    const employeeName = requester.name || employee.name || "Employee";
    const employeeEmail = requester.email || employee.email || replyTo || "";
    const finalSubject =
        subject ||
        `Leave request from ${employeeName} - ${formatDate(leave.start_date)} to ${formatDate(leave.end_date)}`;

    const attachmentRows = attachments.length
        ? attachments
              .map(
                  (attachment) => `
                    <tr>
                      <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Attachment</td>
                      <td style="padding: 12px 0; text-align: right; border-bottom: 1px solid #e5e7eb;">
                        <a href="${attachment.file_url}" style="color: #2563eb; text-decoration: none; font-weight: 500;">${attachment.file_type || "View file"}</a>
                      </td>
                    </tr>`
              )
              .join("")
        : "";

    const html = getBaseEmailTemplate({
        title: "New Leave Application",
        headerColor: "#0f766e",
        headerHtml: `
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">New Leave Application</h1>
            <p style="color: #ccfbf1; margin: 8px 0 0 0; font-size: 15px;">${valueOrDash(company.name)}</p>
        `,
        contentHtml: `
            <p style="margin: 0 0 16px; font-size: 16px; color: #1f2937;">Hello <strong>${adminName}</strong>,</p>
            <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.5;">
                <strong>${employeeName}</strong> has submitted a leave application and is waiting for approval.
            </p>

            <table style="width: 100%; border-collapse: collapse; font-size: 15px; margin-bottom: 24px;">
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb; width: 45%;">Employee</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 600; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${employeeName}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Email</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${valueOrDash(employeeEmail)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Employee Code</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${valueOrDash(employee.employee_code)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Designation</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${valueOrDash(employee.designation)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Leave Type</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${leaveConfig.name || leaveConfig.code || "-"}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Leave Dates</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${formatDate(leave.start_date)} to ${formatDate(leave.end_date)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Total Days</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${valueOrDash(leave.total_days)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Half Day</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${leave.is_half_day ? leave.half_day_type || "Yes" : "No"}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Available Balance</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${valueOrDash(leaveBalance.remaining)}</td>
                </tr>
                ${attachmentRows}
            </table>

            <div style="background-color: #f8fafc; border-left: 4px solid #0f766e; padding: 16px; border-radius: 4px;">
                <p style="margin: 0 0 4px; font-size: 13px; color: #475569; font-weight: 600;">Reason</p>
                <p style="margin: 0; font-size: 14px; color: #1f2937; line-height: 1.5;">${valueOrDash(leave.reason)}</p>
            </div>
        `,
        footerHtml: `
            <p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">
                Reply to this email to contact ${employeeName}.
            </p>
            <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                &copy; ${new Date().getFullYear()} OneAttendance. All rights reserved.
            </p>
        `,
    });

    const text = `${employeeName} requested ${leave.total_days || "-"} day(s) leave from ${formatDate(
        leave.start_date
    )} to ${formatDate(leave.end_date)}. Reason: ${leave.reason || "-"}`;

    await transporter.sendMail({
        from: getSender(fromName, fromEmail),
        replyTo: replyTo || employeeEmail || fromEmail,
        to: adminRecipients,
        subject: finalSubject,
        text,
        html,
    });
};


import { transporter, getSender } from "../../config/mail.config.js";
import { getBaseEmailTemplate, valueOrDash, formatEnumValue } from "./base_template.js";
import { EMAIL_USER } from "../../config/config.js";

const formatDate = (value) => {
    if (!value) return "-";
    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(new Date(value));
};

export const sendLeaveAcceptanceEmail = async ({
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
    approver = {},
    leaveBalance = {},
}) => {
    if (!to) throw new Error("Leave acceptance email requires the employee recipient email.");

    const senderEmail = fromEmail || EMAIL_USER;
    const senderName = fromName || "OneAttendance Leave Desk";
    const employeeName = requester?.name || employee?.name || "Employee";
    const approverName = approver?.name || "Admin";
    const finalSubject =
        subject ||
        `Leave approved - ${formatDate(leave?.start_date)} to ${formatDate(leave?.end_date)}`;

    const html = getBaseEmailTemplate({
        title: "Leave Approved",
        headerColor: "#16a34a",
        headerHtml: `
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Leave Approved</h1>
            <p style="color: #dcfce7; margin: 8px 0 0 0; font-size: 15px;">${valueOrDash(company?.name)}</p>
        `,
        contentHtml: `
            <p style="margin: 0 0 16px; font-size: 16px; color: #1f2937;">Hello <strong>${employeeName}</strong>,</p>
            <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.5;">
                Your leave application has been approved. The confirmation details are below.
            </p>

            <table style="width: 100%; border-collapse: collapse; font-size: 15px; margin-bottom: 24px;">
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb; width: 45%;">Status</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 600; color: #15803d; border-bottom: 1px solid #e5e7eb;">Approved</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Leave Type</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${leaveConfig?.name ? leaveConfig.name : valueOrDash(leaveConfig?.code || leaveConfig)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Leave Dates</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${formatDate(leave?.start_date)} to ${formatDate(leave?.end_date)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Total Days</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${valueOrDash(leave?.total_days)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Half Day</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${leave?.is_half_day ? (formatEnumValue(leave?.half_day_type) !== "-" ? formatEnumValue(leave?.half_day_type) : "Half Day") : "No"}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Approved By</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${approverName}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Approved At</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${formatDate(leave?.approved_at)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Remaining Balance</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${valueOrDash(leaveBalance?.remaining)}</td>
                </tr>
            </table>

            <div style="background-color: #f8fafc; border-left: 4px solid #16a34a; padding: 16px; border-radius: 4px;">
                <p style="margin: 0 0 4px; font-size: 13px; color: #475569; font-weight: 600;">Approval Remarks</p>
                <p style="margin: 0; font-size: 14px; color: #1f2937; line-height: 1.5;">${valueOrDash(leave?.approval_remarks)}</p>
            </div>
        `,
        footerHtml: `
            <p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">
                Reply to this email to contact ${approverName}.
            </p>
            <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                &copy; ${new Date().getFullYear()} OneAttendance. All rights reserved.
            </p>
        `,
    });

    const text = `Your leave from ${formatDate(leave?.start_date)} to ${formatDate(
        leave?.end_date
    )} has been approved by ${approverName}. Total days: ${leave?.total_days || "-"}.`;

    await transporter.sendMail({
        from: getSender(senderName, senderEmail),
        replyTo: replyTo || approver?.email || senderEmail,
        to,
        subject: finalSubject,
        text,
        html,
    });
};


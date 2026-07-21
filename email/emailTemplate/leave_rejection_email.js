import { transporter, getSender } from "../../config/mail.config.js";
import { getBaseEmailTemplate } from "./base_template.js";

const formatDate = (value) => {
    if (!value) return "-";
    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(new Date(value));
};

const valueOrDash = (value) => value ?? "-";

export const sendLeaveRejectionEmail = async ({
    to,
    subject,
    fromEmail = process.env.EMAIL_USER,
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
    if (!to) throw new Error("Leave rejection email requires the employee recipient email.");

    const employeeName = requester.name || employee.name || "Employee";
    const approverName = approver.name || "Admin";
    const finalSubject =
        subject ||
        `Leave rejected - ${formatDate(leave.start_date)} to ${formatDate(leave.end_date)}`;

    const html = getBaseEmailTemplate({
        title: "Leave Rejected",
        headerColor: "#dc2626", 
        headerHtml: `
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Leave Declined</h1>
            <p style="color: #fecaca; margin: 8px 0 0 0; font-size: 15px;">${valueOrDash(company.name)}</p>
        `,
        contentHtml: `
            <p style="margin: 0 0 16px; font-size: 16px; color: #1f2937;">Hello <strong>${employeeName}</strong>,</p>
            <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.5;">
                Your leave application has been reviewed and <span style="color: #dc2626; font-weight: 600;">declined</span>. Please see the details below.
            </p>

            <table style="width: 100%; border-collapse: collapse; font-size: 15px; margin-bottom: 24px;">
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb; width: 45%;">Status</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 600; color: #b91c1c; border-bottom: 1px solid #e5e7eb;">Rejected</td>
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
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Reviewed By</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${approverName}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Reviewed At</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${formatDate(leave.approved_at || leave.updated_at)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Current Balance</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${valueOrDash(leaveBalance.remaining)}</td>
                </tr>
            </table>

            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px;">
                <p style="margin: 0 0 4px; font-size: 13px; color: #991b1b; font-weight: 600;">Rejection Reason</p>
                <p style="margin: 0; font-size: 14px; color: #1f2937; line-height: 1.5;">${valueOrDash(leave.approval_remarks || leave.rejection_reason)}</p>
            </div>
        `,
        footerHtml: `
            <p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">
                Reply to this email to contact ${approverName} if you have any questions.
            </p>
            <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                &copy; ${new Date().getFullYear()} OneAttendance. All rights reserved.
            </p>
        `,
    });

    const text = `Your leave from ${formatDate(leave.start_date)} to ${formatDate(
        leave.end_date
    )} has been declined by ${approverName}. Reason: ${leave.approval_remarks || leave.rejection_reason || "-"}`;

    await transporter.sendMail({
        from: getSender(fromName, fromEmail),
        replyTo: replyTo || approver.email || fromEmail,
        to,
        subject: finalSubject,
        text,
        html,
    });
};

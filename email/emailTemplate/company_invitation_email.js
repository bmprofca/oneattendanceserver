import { transporter, getSender } from "../../config/mail.config.js";
import { getBaseEmailTemplate } from "./base_template.js";
import { EMAIL_USER } from "../../config/config.js";
import { formatIST, formatTime12Hour } from "../../utils/time.js";


const valueOrDash = (value) => value ?? "-";

const formatDate = (value) => {
    if (!value) return "-";
    // formatIST returns null for invalid dates; fallback to "-"
    return formatIST(value, "DD MMM YYYY") || "-";
};

const formatMinutes = (minutes) => {
    if (minutes === null || minutes === undefined || minutes === "") return "-";
    const total = Number(minutes);
    if (Number.isNaN(total)) return minutes; // fallback to raw value

    const hours = Math.floor(total / 60);
    const mins = total % 60;

    if (hours === 0) {
        return `${mins} min`;
    }
    if (mins === 0) {
        return `${hours} hr`;
    }
    return `${hours} hr ${mins} min`;
};

const formatTime12h = (timeStr) => {
    if (!timeStr) return "-";
    // time.js formatTime12Hour returns null when parsing fails
    const formatted = formatTime12Hour(timeStr);
    return formatted ?? timeStr; // fallback to raw value if invalid
};

const formatWeekends = (weekends) => {
    if (!weekends) return "-";
    try {
        const parsed = typeof weekends === "string" ? JSON.parse(weekends) : weekends;
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed
                .map((day) => String(day).charAt(0).toUpperCase() + String(day).slice(1).toLowerCase())
                .join(", ");
        }
        
        if (parsed && typeof parsed === "object") {
            return Object.entries(parsed)
                .map(([day, type]) => `${day}: ${type}`)
                .join(", ");
        }
    } catch {
        return "-";
    }
    return "-";
};

const formatAttendanceMethods = (attendanceMethods = []) => {
    if (!Array.isArray(attendanceMethods) || attendanceMethods.length === 0) return "-";
    return attendanceMethods
        .map((item) => {
            const method = typeof item === "string" ? item : item.method;
            const isAuto = typeof item === "object" && item?.is_auto ? "Auto" : "Manual";
            return method ? `${method} (${isAuto})` : null;
        })
        .filter(Boolean)
        .join(", ");
};

const buildAcceptUrl = ({ acceptUrl, appUrl, inviteToken }) => {
    if (acceptUrl) return acceptUrl;
    if (!appUrl || !inviteToken) return null;
    const baseUrl = appUrl.endsWith("/") ? appUrl.slice(0, -1) : appUrl;
    return `${baseUrl}/accept-invite?token=${encodeURIComponent(inviteToken)}`;
};

export const sendCompanyInvitationEmail = async ({
    to,
    subject,
    fromEmail = EMAIL_USER,
    fromName = "OneAttendance Invite Desk",
    replyTo,
    appUrl,
    acceptUrl,
    inviteToken,
    invitedUser = {},
    invitedBy = {},
    company = {},
    invite = {},
    attendanceMethods = [],
}) => {
    if (!to) throw new Error("Company invitation email requires the employee recipient email.");
    if (!inviteToken && !invite.invite_token) {
        throw new Error("Company invitation email requires inviteToken.");
    }

    const token = inviteToken || invite.invite_token;
    const employeeName = invitedUser.name || "Employee";
    const companyName = company.name || company.legal_name || "the company";
    const inviterName = invitedBy.name || "Admin";
    const quickAcceptUrl = buildAcceptUrl({ acceptUrl, appUrl, inviteToken: token });
    const finalSubject = subject || `Invitation to join ${companyName} on OneAttendance`;
    const methodsText = formatAttendanceMethods(attendanceMethods);
    const weekendsText = formatWeekends(invite.weekends);

    const acceptButton = quickAcceptUrl
        ? `
        <div style="text-align: center; margin: 32px 0;">
          <a href="${quickAcceptUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">
            Accept Invitation
          </a>
        </div>`
        : "";

    const html = getBaseEmailTemplate({
        title: "Company Invitation",
        headerColor: "#2563eb",
        headerHtml: `
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Company Invitation</h1>
            <p style="color: #bfdbfe; margin: 8px 0 0 0; font-size: 15px;">${companyName}</p>
        `,
        contentHtml: `
            <p style="margin: 0 0 16px; font-size: 16px; color: #1f2937;">Hello <strong>${employeeName}</strong>,</p>
            <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.5;">
                <strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> as an employee.
            </p>

            ${acceptButton}

            <table style="width: 100%; border-collapse: collapse; font-size: 15px; margin-bottom: 24px;">
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb; width: 45%;">Designation</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${valueOrDash(invite.designation)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Employment Type</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${valueOrDash(invite.employment_type)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Salary Type</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${valueOrDash(invite.salary_type)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Work Shift</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${formatTime12h(invite.shift_start)} - ${formatTime12h(invite.shift_end)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Break Duration</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${formatMinutes(invite.break_minutes)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Grace Period</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${formatMinutes(invite.grace_minutes)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Weekly Offs</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${weekendsText}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Attendance Methods</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${methodsText}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Expires On</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${formatDate(invite.expires_at)}</td>
                </tr>
            </table>

            <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; border-radius: 4px;">
                <p style="margin: 0 0 4px; font-size: 13px; color: #166534; font-weight: 600;">One-time Invite Token</p>
                <p style="margin: 0; font-size: 18px; font-weight: 700; color: #14532d; word-break: break-all; letter-spacing: 1px;">${token}</p>
            </div>
        `,
        footerHtml: `
            <p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">
                If you have any questions, reply to this email to contact ${inviterName}.
            </p>
            <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                &copy; ${new Date().getFullYear()} OneAttendance. All rights reserved.
            </p>
        `,
    });

    const text = `Hello ${employeeName},\n\n${inviterName} has invited you to join ${companyName} as an employee.\n\nYour invite token: ${token}\n${quickAcceptUrl ? `Accept now: ${quickAcceptUrl}\n` : "Use this token inside the app to accept.\n"}This invitation expires on ${formatDate(invite.expires_at)}.\n\nShift: ${formatTime12h(invite.shift_start)} – ${formatTime12h(invite.shift_end)}\nDesignation: ${valueOrDash(invite.designation)}`;

    await transporter.sendMail({
        from: getSender(fromName, fromEmail),
        replyTo: replyTo || invitedBy.email || fromEmail,
        to,
        subject: finalSubject,
        text,
        html,
    });
};
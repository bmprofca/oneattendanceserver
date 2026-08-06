import { transporter, getSender } from "../../config/mail.config.js";
import { getBaseEmailTemplate } from "./base_template.js";
import { EMAIL_USER } from "../../config/config.js";

const valueOrDash = (value) => value ?? "-";


const getLocationLink = (lat, lng) => {
    if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) {
        return `https://maps.google.com/?q=${lat},${lng}`;
    }
    return null;
};


export const sendLoginAlertEmail = async ({
    to,
    userName = "User",
    session = {},
    loginTime = new Date(),
    dashboardUrl = "#",
    subject,
    fromEmail = EMAIL_USER,
    fromName = "OneAttendance Security",
    replyTo,
}) => {
    if (!to) throw new Error("Login alert requires a recipient email address.");

    const senderEmail = fromEmail || EMAIL_USER;
    const senderName = fromName || "OneAttendance Security";
    const finalSubject = subject || "New sign-in to your OneAttendance account";
    const sess = session || {};
    const ip = sess.ip_v4 || sess.ip_v6 || sess.ip || "Unknown IP";
    const device = sess.device_name || sess.deviceName || "Unknown device";
    const userAgent = sess.user_agent || sess.userAgent || "";
    const latitude = sess.latitude;
    const longitude = sess.longitude;
    const locationLink = getLocationLink(latitude, longitude);
    const locationDisplay = locationLink
        ? `<a href="${locationLink}" style="color: #2563eb; text-decoration: none;">View on map (${Number(latitude).toFixed(4)}, ${Number(longitude).toFixed(4)})</a>`
        : "Not available";

    const formattedTime = new Intl.DateTimeFormat("en-IN", {
        dateStyle: "full",
        timeStyle: "long",
    }).format(new Date(loginTime));

    const html = getBaseEmailTemplate({
        title: "Login Alert",
        headerColor: "#ea580c",
        headerHtml: `
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">New Sign-in Alert</h1>
            <p style="color: #ffedd5; margin: 8px 0 0 0; font-size: 15px;">OneAttendance Security</p>
        `,
        contentHtml: `
            <p style="margin: 0 0 16px; font-size: 16px; color: #1f2937;">Hello <strong>${userName}</strong>,</p>
            <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.5;">
                We noticed a new sign-in to your OneAttendance account. If this was you, no action is needed. If you don't recognise this activity, please secure your account immediately.
            </p>

            <table style="width: 100%; border-collapse: collapse; font-size: 15px; margin-bottom: 32px;">
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb; width: 35%;">Time</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${formattedTime}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">IP Address</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${ip}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Device</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${device}${userAgent ? `<br><span style="font-size:12px;color:#9ca3af;font-weight:normal;">${userAgent}</span>` : ""}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Location</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; color: #1f2937; border-bottom: 1px solid #e5e7eb;">${locationDisplay}</td>
                </tr>
            </table>

            <div style="text-align: center; margin-bottom: 24px;">
                <a href="${dashboardUrl}" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(220, 38, 38, 0.2);">
                    Review Account Activity
                </a>
            </div>

            <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
                If you did not sign in, we recommend you change your password immediately and enable two-factor authentication if available.
            </p>
        `,
        footerHtml: `
            <p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">
                This is an automated security alert. Reply to this email if you need help.
            </p>
            <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                &copy; ${new Date().getFullYear()} OneAttendance. All rights reserved.
            </p>
        `,
    });

    const text = `New sign-in to your OneAttendance account\n\nTime: ${formattedTime}\nIP: ${ip}\nDevice: ${device}\nLocation: ${latitude && longitude ? `https://maps.google.com/?q=${latitude},${longitude}` : "Not available"}\n\nIf this was you, no action is needed. If not, please secure your account: ${dashboardUrl}`;

    await transporter.sendMail({
        from: getSender(senderName, senderEmail),
        replyTo: replyTo || senderEmail,
        to,
        subject: finalSubject,
        text,
        html,
    });
};
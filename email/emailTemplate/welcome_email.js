import { transporter, getSender } from "../../config/mail.config.js";
import { getBaseEmailTemplate } from "./base_template.js";
import { EMAIL_USER } from "../../config/config.js";

export const sendWelcomeEmail = async ({
    to,
    subject,
    userName = "there",
    dashboardUrl = "#",
    fromEmail = EMAIL_USER,
    fromName = "OneAttendance",
    replyTo,
}) => {
    if (!to) throw new Error("Welcome email requires a recipient email address.");

    const senderEmail = fromEmail || EMAIL_USER;
    const senderName = fromName || "OneAttendance";
    const finalSubject = subject || `Welcome to OneAttendance, ${userName}!`;

    const html = getBaseEmailTemplate({
        title: "Welcome to OneAttendance",
        headerColor: "#0ea5e9",
        headerHtml: `
            <div style="display: inline-block; background-color: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 20px; margin-bottom: 16px;">
                <span style="color: #ffffff; font-size: 14px; font-weight: 600; letter-spacing: 0.5px;">✨ Account Created</span>
            </div>
            <h1 style="color: #ffffff; margin: 0 0 8px 0; font-size: 28px; font-weight: 800;">Welcome to OneAttendance</h1>
            <p style="color: #e0f2fe; margin: 0; font-size: 16px; font-weight: 500;">Your smart attendance journey begins now.</p>
        `,
        contentHtml: `
            <div style="background-color: #f8fafc; border-left: 4px solid #0ea5e9; padding: 20px; border-radius: 6px; margin-bottom: 32px;">
                <p style="margin: 0 0 12px; font-size: 16px; color: #1f2937;">Hi <strong>${userName}</strong>,</p>
                <p style="margin: 0 0 12px; font-size: 16px; color: #4b5563; line-height: 1.6;">
                    Your account has been created successfully.
                </p>
                <p style="margin: 0 0 8px; font-size: 15px; color: #4b5563; line-height: 1.6;">
                    📌 Track your attendance, manage shifts, and stay on top of your work schedule – all in one place.
                </p>
                <p style="margin: 0; font-size: 15px; color: #4b5563; line-height: 1.6;">
                    🔐 Your data is secure and ready.
                </p>
            </div>

            <div style="text-align: center; margin-bottom: 16px;">
                <a href="${dashboardUrl}" style="display: inline-block; background-color: #0ea5e9; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(14, 165, 233, 0.2);">
                    Go to Dashboard
                </a>
            </div>
        `,
        footerHtml: `
            <p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">
                Need help? Just reply to this email.
            </p>
            <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                &copy; ${new Date().getFullYear()} OneAttendance. All rights reserved.
            </p>
        `,
    });

    const text = `Hi ${userName},\n\nWelcome to OneAttendance! Your account has been created successfully.\nYou can now track your attendance, manage shifts, and more.\n\nGet started: ${dashboardUrl}\n\nBest regards,\nThe OneAttendance Team`;

    await transporter.sendMail({
        from: getSender(senderName, senderEmail),
        replyTo: replyTo || senderEmail,
        to,
        subject: finalSubject,
        text,
        html,
    });
};
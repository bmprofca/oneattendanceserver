import { getTransporter, getSender } from "../../config/mail.config.js";
import { getBaseEmailTemplate } from "./base_template.js";
import { EMAIL_USER } from "../../config/config.js";


const sendOTPEmail = async ({
    to,
    userName = "User",
    otp,
    subject,
    heading,
    introText,
    extraContentHtml = "",
    fromEmail = EMAIL_USER,
    fromName = "OneAttendance",
    replyTo,
}) => {
    if (!to) throw new Error("OTP email requires a recipient email address.");
    if (!otp) throw new Error("OTP email requires an OTP value.");

    const html = getBaseEmailTemplate({
        title: heading,
        headerColor: "#4f46e5",
        headerHtml: `
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">${heading}</h1>
            <p style="color: #e0e7ff; margin: 8px 0 0 0; font-size: 15px;">OneAttendance Verification</p>
        `,
        contentHtml: `
            <p style="margin: 0 0 16px; font-size: 16px; color: #1f2937;">Hello <strong>${userName}</strong>,</p>
            <p style="margin: 0 0 32px; font-size: 16px; color: #4b5563; line-height: 1.5;">
                ${introText}
            </p>
            ${extraContentHtml}

            <div style="text-align: center; margin-bottom: 32px;">
                <div style="display: inline-block; background-color: #eef2ff; border: 2px dashed #a5b4fc; border-radius: 8px; padding: 16px 32px;">
                    <span style="font-size: 32px; letter-spacing: 8px; font-weight: 800; color: #4338ca; margin-right: -8px;">
                        ${otp}
                    </span>
                </div>
            </div>

            <p style="margin: 0 0 16px; font-size: 15px; color: #4b5563; text-align: center;">
                This OTP is valid for <strong>5 minutes</strong>.
            </p>
            <p style="margin: 0; font-size: 14px; color: #6b7280; text-align: center;">
                If you did not request this, please ignore this email or contact support.
            </p>
        `,
    });

    const senderEmail = fromEmail || EMAIL_USER;
    const senderName = fromName || "OneAttendance";

    await getTransporter().sendMail({
        from: getSender(senderName, senderEmail),
        replyTo: replyTo || senderEmail,
        to,
        subject,
        text,
        html,
    });
};

export const sendLoginOTPEmail = async ({ to, userName = "User", otp, subject, ...rest }) => {
    await sendOTPEmail({
        to,
        userName,
        otp,
        subject: subject || "Your OneAttendance Login Verification Code",
        heading: "Login Verification",
        introText: "A sign-in attempt requires further verification. To complete the login, please use the OTP below:",
        ...rest,
    });
};

export const sendSignupOTPEmail = async ({ to, userName = "User", otp, subject, ...rest }) => {
    await sendOTPEmail({
        to,
        userName,
        otp,
        subject: subject || "Verify your OneAttendance account",
        heading: "Email Verification",
        introText: "Thank you for signing up for OneAttendance! Please use the following OTP to verify your email address:",
        ...rest,
    });
};

export const sendForgotPasswordOTPEmail = async ({ to, userName = "User", otp, subject, ...rest }) => {
    await sendOTPEmail({
        to,
        userName,
        otp,
        subject: subject || "Reset your OneAttendance password",
        heading: "Password Reset",
        introText: "You have requested to reset your password. Use the OTP below to proceed. If you did not make this request, you can safely ignore this email.",
        ...rest,
    });
};


export const sendDeleteAccountOTPEmail = async ({ to, userName = "User", otp, subject, ...rest }) => {
    await sendOTPEmail({
        to,
        userName,
        otp,
        subject: subject || "Confirm Account Deletion - OneAttendance",
        heading: "Delete Account",
        introText: "We received a request to permanently delete your OneAttendance account. This action is irreversible. Please use the OTP below to confirm deletion:",
        ...rest,
    });
};

export const sendPhoneUpdateOTPEmail = async ({
    to,
    userName = "User",
    otp,
    phone = null,
    subject,
    ...rest
}) => {
    const maskedPhone =
        phone && String(phone).length >= 4
            ? `${String(phone).slice(0, -4).replace(/\d/g, "•")}${String(phone).slice(-4)}`
            : null;

    const extraContentHtml = maskedPhone
        ? `<p style="margin: 0 0 24px; padding: 12px 16px; background: #f9fafb; border-left: 4px solid #4f46e5; color: #374151; font-size: 14px;">
                New phone number: <strong>${maskedPhone}</strong>
           </p>`
        : "";

    await sendOTPEmail({
        to,
        userName,
        otp,
        subject: subject || "Verify your phone number update - OneAttendance",
        heading: "Phone number update",
        introText:
            "We received a request to update the phone number on your OneAttendance profile. To confirm this change, enter the verification code below.",
        extraContentHtml,
        ...rest,
    });
};
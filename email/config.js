import path from "path";

export const ROOT_QUEUE_DIR = path.join(process.cwd(), "email","queues");

export const QUEUE_PATHS = {
    pending: {
        high: path.join(ROOT_QUEUE_DIR, "pending/high"),
        medium: path.join(ROOT_QUEUE_DIR, "pending/medium"),
        low: path.join(ROOT_QUEUE_DIR, "pending/low")
    },

    processing: {
        high: path.join(ROOT_QUEUE_DIR, "processing/high"),
        medium: path.join(ROOT_QUEUE_DIR, "processing/medium"),
        low: path.join(ROOT_QUEUE_DIR, "processing/low")
    },

    failed: {
        high: path.join(ROOT_QUEUE_DIR, "failed/high"),
        medium: path.join(ROOT_QUEUE_DIR, "failed/medium"),
        low: path.join(ROOT_QUEUE_DIR, "failed/low")
    }
};

export const EMAIL_TEMPLATES = {
    signup_otp: "email/emailTemplate/otp_email.js",
    login_otp: "email/emailTemplate/otp_email.js",
    phone_update_otp: "email/emailTemplate/otp_email.js",
    delete_account_otp: "email/emailTemplate/otp_email.js",

    login_alert: "email/emailTemplate/login_alert_email.js",
    welcome:"email/emailTemplate/welcome_email.js",
    invitation: "email/emailTemplate/company_invitation_email.js",

    leave_request: "email/emailTemplate/leave_request_email.js",
    leave_accept: "email/emailTemplate/leave_acceptance_email.js",
    leave_reject: "email/emailTemplate/leave_rejection_email.js",
    payroll: "email/emailTemplate/payroll_email.js",
    shift: "email/emailTemplate/shift_email.js"
}

export const EMAIL_PRIORITIES = {

    signup_otp: "high",
    login_otp: "high",
    phone_update_otp: "high",
    delete_account_otp: "high",

    welcome:"medium",
    login_alert: "medium",
    invitation: "medium",
    payroll: "medium",
    shift: "medium",

    leave_request: "low",
    leave_accept: "low",
    leave_reject: "low",
};
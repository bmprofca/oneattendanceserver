import {
  sendLoginOTPEmail,
  sendSignupOTPEmail,
  sendPhoneUpdateOTPEmail,
  sendDeleteAccountOTPEmail,
} from "../emailTemplate/otp_email.js";

export { sendDeleteAccountOTPEmail };
import { sendCompanyInvitationEmail } from "../emailTemplate/company_invitation_email.js";
import { sendLeaveRequestEmail } from "../emailTemplate/leave_request_email.js";
import { sendLeaveAcceptanceEmail } from "../emailTemplate/leave_acceptance_email.js";
import { sendLeaveRejectionEmail } from "../emailTemplate/leave_rejection_email.js";
import { sendLoginAlertEmail } from "../emailTemplate/login_alert_email.js";
import { sendWelcomeEmail } from "../emailTemplate/welcome_email.js";
import { queueEmail } from "../services/email.queue.js"
import { sendPayrollEmail } from "../emailTemplate/payroll_email.js";
import { sendShiftEmail } from "../emailTemplate/shift_email.js";



export async function queueSignupOTPEmail({
  to,
  userName,
  otp,
  subject,
  fromEmail,
  fromName,
  replyTo,
  maxAttempts = 3
}) {

  return queueEmail({
    type: "signup_otp",
    maxAttempts,
    payload: {
      to,
      userName,
      otp,
      subject,
      fromEmail,
      fromName,
      replyTo
    }
  });

}

export async function queueLoginOTPEmail({
  to,
  userName,
  otp,
  subject,
  fromEmail,
  fromName,
  replyTo,
  maxAttempts = 3
}) {

  return queueEmail({
    type: "login_otp",
    maxAttempts,
    payload: {
      to,
      userName,
      otp,
      subject,
      fromEmail,
      fromName,
      replyTo
    }
  });

}


export async function queuePhoneUpdateOTPEmail({
  to,
  userName,
  otp,
  phone,
  subject,
  fromEmail,
  fromName,
  replyTo,
  maxAttempts = 3,
}) {
  return queueEmail({
    type: "phone_update_otp",
    maxAttempts,
    payload: {
      to,
      userName,
      otp,
      phone,
      subject,
      fromEmail,
      fromName,
      replyTo,
    },
  });
}

export async function sendPhoneUpdateOTP({
  email,
  otp,
  userName = "User",
  phone = null,
  subject,
  fromEmail,
  fromName,
  replyTo,
}) {
  return sendPhoneUpdateOTPEmail({
    to: email,
    userName,
    otp,
    phone,
    subject,
    fromEmail,
    fromName,
    replyTo,
  });
}

export async function queuePayrollEmail({
  to,
  subject,
  fromEmail,
  fromName,
  replyTo,
  payroll,
  components = [],
  adjustments = [],
  details = null,
  type = "summary",
  maxAttempts = 3
}) {
  return queueEmail({
    type: "payroll",
    maxAttempts,
    payload: {
      to,
      subject,
      fromEmail,
      fromName,
      replyTo,
      payroll,
      components,
      adjustments,
      details,
      type
    }
  });
}

export async function queueShiftEmail({
  to,
  subject,
  fromEmail,
  fromName,
  replyTo,
  shiftData,
  maxAttempts = 3
}) {
  return queueEmail({
    type: "shift",
    maxAttempts,
    payload: { to, subject, fromEmail, fromName, replyTo, shiftData }
  });
}

export async function queueDeleteAccountOTPEmail({
  to,
  userName,
  otp,
  subject,
  fromEmail,
  fromName,
  replyTo,
  maxAttempts = 3,
}) {
  return queueEmail({
    type: "delete_account_otp",
    maxAttempts,
    payload: {
      to,
      userName,
      otp,
      subject,
      fromEmail,
      fromName,
      replyTo,
    },
  });
}

export async function queueLoginAlertEmail({
  to,
  userName,
  session,
  loginTime,
  dashboardUrl,
  subject,
  fromEmail,
  fromName,
  replyTo,
  maxAttempts = 3
}) {

  return queueEmail({
    type: "login_alert",
    maxAttempts,
    payload: {
      to,
      userName,
      session,
      loginTime,
      dashboardUrl,
      subject,
      fromEmail,
      fromName,
      replyTo
    }
  });

}

export async function queueCompanyInvitationEmail({
  to,
  subject,
  fromEmail,
  fromName,
  replyTo,
  appUrl,
  acceptUrl,
  inviteToken,
  invitedUser,
  invitedBy,
  company,
  invite,
  attendanceMethods,
  maxAttempts = 3
}) {

  return queueEmail({
    type: "invitation",
    maxAttempts,
    payload: {
      to,
      subject,
      fromEmail,
      fromName,
      replyTo,
      appUrl,
      acceptUrl,
      inviteToken,
      invitedUser,
      invitedBy,
      company,
      invite,
      attendanceMethods
    }
  });

}

export async function queueLeaveRequestEmail({
  to,
  subject,
  fromEmail,
  fromName,
  replyTo,
  requester,
  employee,
  company,
  leave,
  leaveConfig,
  leaveBalance,
  attachments,
  adminName,
  maxAttempts = 3
}) {

  return queueEmail({
    type: "leave_request",
    maxAttempts,
    payload: {
      to,
      subject,
      fromEmail,
      fromName,
      replyTo,
      requester,
      employee,
      company,
      leave,
      leaveConfig,
      leaveBalance,
      attachments,
      adminName
    }
  });

}

export async function queueLeaveAcceptanceEmail({
  to,
  subject,
  fromEmail,
  fromName,
  replyTo,
  requester,
  employee,
  company,
  leave,
  leaveConfig,
  approver,
  leaveBalance,
  maxAttempts = 3
}) {

  return queueEmail({
    type: "leave_accept",
    maxAttempts,
    payload: {
      to,
      subject,
      fromEmail,
      fromName,
      replyTo,
      requester,
      employee,
      company,
      leave,
      leaveConfig,
      approver,
      leaveBalance
    }
  });

}

export async function queueLeaveRejectionEmail({
  to,
  subject,
  fromEmail,
  fromName,
  replyTo,
  requester,
  employee,
  company,
  leave,
  leaveConfig,
  approver,
  leaveBalance,
  maxAttempts = 3
}) {

  return queueEmail({
    type: "leave_reject",
    maxAttempts,
    payload: {
      to,
      subject,
      fromEmail,
      fromName,
      replyTo,
      requester,
      employee,
      company,
      leave,
      leaveConfig,
      approver,
      leaveBalance
    }
  });

}

export async function sendQueuedWelcomeEmail({
  to,
  subject,
  userName,
  dashboardUrl,
  fromEmail,
  fromName,
  replyTo,
  maxAttempts = 3
}) {

  return queueEmail({
    type: "welcome",
    maxAttempts,
    payload: {
      to,
      subject,
      userName,
      dashboardUrl,
      fromEmail,
      fromName,
      replyTo
    }
  });

}


export const EMAIL_SENDERS = Object.freeze({

  signup_otp: sendSignupOTPEmail,
  login_otp: sendLoginOTPEmail,
  phone_update_otp: sendPhoneUpdateOTPEmail,
  delete_account_otp: sendDeleteAccountOTPEmail,

  welcome: sendWelcomeEmail,
  login_alert: sendLoginAlertEmail,
  invitation: sendCompanyInvitationEmail,

  leave_request: sendLeaveRequestEmail,
  leave_accept: sendLeaveAcceptanceEmail,
  leave_reject: sendLeaveRejectionEmail,

  payroll: sendPayrollEmail,
  shift: sendShiftEmail

});
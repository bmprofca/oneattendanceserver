import { sendOtpSms, isSmsConfigured } from './sms.js';
import { NODE_ENV } from './config.js';

export { sendOtpSms, isSmsConfigured };

export const sendEmailUpdateOTP = async ({
  phone,
  otp,
  userName = "User",
}) => {
  if (!phone) {
    throw new Error("Email update OTP SMS requires a recipient phone number.");
  }

  if (!otp) {
    throw new Error("Email update OTP SMS requires an OTP value.");
  }

  if (NODE_ENV !== "production" && !isSmsConfigured()) {
    console.log(`[SMS] Email update OTP to ${phone}: ${otp}`);
    return { success: true, dev: true };
  }

  return sendOtpSms(phone, otp);
};

export default sendEmailUpdateOTP;

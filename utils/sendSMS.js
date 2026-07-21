import axios from "axios";

const buildEmailUpdateSmsMessage = (otp, userName = "User") =>
  `Hello ${userName}, your OneAttendance email update verification code is ${otp}. Valid for 5 minutes. Do not share this code.`;

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

  const message = buildEmailUpdateSmsMessage(otp, userName);
  const {
    SMS_API_URL,
    SMS_API_KEY,
    SMS_SENDER_ID,
    NODE_ENV,
  } = process.env;

  if (NODE_ENV !== "production") {
    console.log(`[SMS] Email update OTP to ${phone}: ${message}`);
    return { success: true, dev: true };
  }

  if (!SMS_API_URL || !SMS_API_KEY) {
    console.error(
      "SMS_API_URL and SMS_API_KEY are required in production to send email update OTP"
    );
    throw new Error("SMS service is not configured");
  }

  const response = await axios.post(
    SMS_API_URL,
    {
      to: phone,
      message,
      sender_id: SMS_SENDER_ID || "ONEATT",
      type: "transactional",
    },
    {
      headers: {
        Authorization: `Bearer ${SMS_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );

  return response.data;
};

export default sendEmailUpdateOTP;

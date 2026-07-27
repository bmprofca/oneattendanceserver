import nodemailer from "nodemailer";
import { SMTP_HOST, SMTP_PORT, EMAIL_USER, EMAIL_PASS } from "./config.js";

let transporterInstance = null;

export const getTransporter = () => {
  if (transporterInstance) {
    return transporterInstance;
  }

  const host = SMTP_HOST;
  const port = Number(SMTP_PORT);
  const user = EMAIL_USER;
  const pass = EMAIL_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, EMAIL_USER, and EMAIL_PASS in central config"
    );
  }

  transporterInstance = nodemailer.createTransport({
    host,
    port: port || 465,
    secure: port === 465,
    auth: { user, pass },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  return transporterInstance;
};

export const transporter = {
  sendMail: (...args) => getTransporter().sendMail(...args),
  verify: (...args) => getTransporter().verify(...args),
};

export const getSender = (
  fromName = "OneAttendance",
  fromEmail = EMAIL_USER
) => `"${fromName}" <${fromEmail}>`;

export const verifySmtpConnection = async () => {
  await getTransporter().verify();
};

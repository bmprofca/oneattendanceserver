import bcrypt from "bcryptjs";
import crypto from "crypto";
import db from "../config/db.js";

const otpFailures = new Map();
const MAX_OTP_ATTEMPTS = 5;

export const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

export const comparePassword = async (password, hash) => {
  if (!password || !hash) {
    return false;
  }

  return await bcrypt.compare(String(password), String(hash));
};

export const verifyOtpHash = async (otp, hash) => {
  if (otp === undefined || otp === null || otp === "" || !hash) {
    return false;
  }

  return comparePassword(String(otp), hash);
};

export async function assessOtp(recordId, otp, hash) {
  const valid = await verifyOtpHash(otp, hash);
  if (valid) {
    otpFailures.delete(recordId);
    return null;
  }

  const count = (otpFailures.get(recordId) || 0) + 1;
  if (count >= MAX_OTP_ATTEMPTS) {
    otpFailures.delete(recordId);
    await db.query("UPDATE otps SET used_at = NOW() WHERE id = ?", [recordId]);
    return "Too many incorrect attempts. Request a new OTP";
  }

  otpFailures.set(recordId, count);
  return "Invalid OTP";
}

export const generateSessionToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

export const generateOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

export function generateRandomToken({ size = 32, encoding = "hex", uppercase = false } = {}) {

  let token = crypto
    .randomBytes(size)
    .toString(encoding);

  if (uppercase) {
    token = token.toUpperCase();
  }

  return token;
}

export const generateRandomPassword = (length = 12) => {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";

  const allChars = uppercase + lowercase + numbers + symbols;

  let password = [
    uppercase[Math.floor(Math.random() * uppercase.length)],
    lowercase[Math.floor(Math.random() * lowercase.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];

  const randomBytes = crypto.randomBytes(length - password.length);

  for (let i = 0; i < randomBytes.length; i++) {
    password.push(allChars[randomBytes[i] % allChars.length]);
  }

  password = password.sort(() => Math.random() - 0.5);

  return password.join("");
};

export const generateTransactionId = () => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();

  return `TXN-${timestamp}-${random}`;
};
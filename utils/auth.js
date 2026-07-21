import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

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

export const generateSessionToken = () => {
  return uuidv4();
};

export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

export const generateTransactionId=() =>{
  const timestamp = Date.now();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();

  return `TXN-${timestamp}-${random}`;
};
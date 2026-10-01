import express from "express";
import crypto from "crypto";
import db from "../config/db.js";
import { sendSuccess, sendError } from "../utils/sendResponse.js";
import { normalizeIndianMobile } from "../utils/mobile.js";
import getClientMeta from "../utils/ipHelper.js";
import { transporter, getSender } from "../config/mail.config.js";

const router = express.Router();

const CAPTCHA_TTL_MS = 10 * 60 * 1000;
const CAPTCHA_LENGTH = 5;
const MAX_CAPTCHA_ATTEMPTS = 5;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SUPPORT_EMAIL = "support@onesaas.in";

const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01111, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b01111],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01111, 0b10000, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  2: [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110],
  6: [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
};

const submitWindow = new Map();

let tablesReady = null;

const ensureTables = async () => {
  if (!tablesReady) {
    tablesReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS captcha_challenges (
          id CHAR(36) NOT NULL,
          answer_hash CHAR(64) NOT NULL,
          attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
          expires_at DATETIME NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_captcha_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS data_deletion_requests (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          mobile VARCHAR(20) NOT NULL,
          email VARCHAR(255) NULL,
          remark TEXT NULL,
          ip_address VARCHAR(64) NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_data_deletion_mobile (mobile),
          KEY idx_data_deletion_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  return tablesReady;
};

const randomCode = () => Array.from(crypto.randomBytes(CAPTCHA_LENGTH), (byte) => ALPHABET[byte % ALPHABET.length]).join("");

const hashAnswer = (id, code) => crypto.createHash("sha256").update(`${id}:${String(code).trim().toUpperCase()}`).digest("hex");

const renderCaptcha = (code) => {
  const scale = 4;
  const glyphWidth = 5 * scale;
  const gap = 10;
  const width = 18 + code.length * (glyphWidth + gap);
  const height = 58;
  const pixels = code.split("").map((char, index) => {
    const glyph = GLYPHS[char];
    const originX = 12 + index * (glyphWidth + gap) + crypto.randomInt(-1, 2);
    const originY = 12 + crypto.randomInt(-2, 3);
    return glyph.map((row, rowIndex) => {
      const cells = [];
      for (let bit = 0; bit < 5; bit += 1) {
        if ((row & (1 << (4 - bit))) === 0) continue;
        const x = originX + bit * scale;
        const y = originY + rowIndex * scale;
        cells.push(`<rect x="${x}" y="${y}" width="${scale - 1}" height="${scale - 1}" fill="#1e3a8a"/>`);
      }
      return cells.join("");
    }).join("");
  }).join("");

  const noise = Array.from({ length: 6 }, () => {
    const x1 = crypto.randomInt(0, width);
    const y1 = crypto.randomInt(0, height);
    const x2 = crypto.randomInt(0, width);
    const y2 = crypto.randomInt(0, height);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#93c5fd" stroke-width="1"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Captcha"><rect width="100%" height="100%" fill="#eff6ff"/>${noise}${pixels}</svg>`;
};

const clientIp = (req) => {
  const meta = getClientMeta(req);
  return meta?.ip_v4 || meta?.ip_v6 || req.ip || "unknown";
};

const allowRequest = (ip) => {
  const now = Date.now();
  const recent = (submitWindow.get(ip) || []).filter((time) => now - time < 15 * 60 * 1000);
  if (recent.length >= 8) {
    submitWindow.set(ip, recent);
    return false;
  }
  recent.push(now);
  submitWindow.set(ip, recent);
  return true;
};

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

router.get("/captcha", async (req, res) => {
  try {
    await ensureTables();
    const id = crypto.randomUUID();
    const code = randomCode();
    const expiresAt = new Date(Date.now() + CAPTCHA_TTL_MS);
    await db.query(
      "INSERT INTO captcha_challenges (id, answer_hash, expires_at) VALUES (?, ?, ?)",
      [id, hashAnswer(id, code), expiresAt],
    );
    await db.query("DELETE FROM captcha_challenges WHERE expires_at < NOW()");
    return sendSuccess(res, 200, "Captcha created", {
      captcha_id: id,
      image: renderCaptcha(code),
    });
  } catch (error) {
    console.error("Data deletion captcha error:", error.message);
    return sendError(res, 500, "Unable to create captcha");
  }
});

router.post("/request", async (req, res) => {
  const ip = clientIp(req);
  if (!allowRequest(ip)) {
    return sendError(res, 429, "Too many deletion requests. Try again later.");
  }

  const mobileInput = String(req.body?.mobile || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const remark = String(req.body?.remark || "").trim();
  const captchaId = String(req.body?.captcha_id || "").trim();
  const captchaCode = String(req.body?.captcha_code || "").trim();

  if (!mobileInput) return sendError(res, 400, "Mobile number is required");
  let mobile;
  try {
    mobile = normalizeIndianMobile(mobileInput);
  } catch {
    return sendError(res, 400, "Enter a valid mobile number");
  }
  if (email && !isValidEmail(email)) return sendError(res, 400, "Enter a valid email address");
  if (!remark) return sendError(res, 400, "Description is required");
  if (remark.length > 1000) return sendError(res, 400, "Description must be 1000 characters or less");
  if (!captchaId || !captchaCode) return sendError(res, 400, "Captcha is required");

  let conn;
  try {
    await ensureTables();
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT id, answer_hash, attempts, expires_at FROM captcha_challenges WHERE id = ? FOR UPDATE",
      [captchaId],
    );
    const challenge = rows[0];
    if (!challenge || new Date(challenge.expires_at).getTime() < Date.now() || challenge.attempts >= MAX_CAPTCHA_ATTEMPTS) {
      await conn.query("DELETE FROM captcha_challenges WHERE id = ?", [captchaId]);
      await conn.commit();
      return sendError(res, 400, "Captcha expired. Request a new one.");
    }

    const provided = hashAnswer(captchaId, captchaCode);
    const matches = crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(challenge.answer_hash));
    if (!matches) {
      await conn.query("UPDATE captcha_challenges SET attempts = attempts + 1 WHERE id = ?", [captchaId]);
      await conn.commit();
      return sendError(res, 400, "Captcha does not match");
    }

    await conn.query("DELETE FROM captcha_challenges WHERE id = ?", [captchaId]);
    await conn.query(
      "INSERT INTO data_deletion_requests (mobile, email, remark, ip_address) VALUES (?, ?, ?, ?)",
      [mobile, email || null, remark || null, ip],
    );
    await conn.commit();
  } catch (error) {
    if (conn) await conn.rollback();
    console.error("Data deletion request error:", error.message);
    return sendError(res, 500, "Unable to submit the deletion request");
  } finally {
    if (conn) conn.release();
  }

  try {
    await transporter.sendMail({
      from: getSender(),
      to: SUPPORT_EMAIL,
      replyTo: email || undefined,
      subject: "OneAttendance data deletion request",
      text: [
        "A public data deletion request was submitted.",
        "",
        `Mobile: ${mobile}`,
        `Email: ${email || "-"}`,
        `Remark: ${remark || "-"}`,
      ].join("\n"),
    });
  } catch (error) {
    console.error("Data deletion notification email failed:", error.message);
  }

  return sendSuccess(res, 201, "Data deletion request submitted");
});

export default router;

import crypto from 'crypto';
import db from './db.js';
import { applyRuntimeSettings } from './config.js';
import { SETTINGS_CATALOG } from './settingsCatalog.js';
import { resetMailTransport } from './mail.config.js';
import { resetB2Cache } from '../utils/b2Storage.js';
import { setFaceMatchThreshold } from '../utils/faceEmbedding.js';

const SMTP_KEYS = new Set(['SMTP_HOST', 'SMTP_PORT', 'EMAIL_USER', 'EMAIL_PASS']);
const B2_KEYS = new Set([
  'B2_ENDPOINT',
  'B2_REGION',
  'B2_BUCKET',
  'B2_ACCESS_KEY',
  'B2_SECRET_KEY',
  'B2_DOWNLOAD_AUTH_TTL_SECONDS',
]);

let ready = false;

export async function ensureSettingsLoaded() {
  const conn = await db.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        setting_key VARCHAR(100) NOT NULL,
        setting_value TEXT NULL,
        group_name VARCHAR(80) NOT NULL,
        label VARCHAR(150) NOT NULL,
        value_type ENUM('string','number','secret') NOT NULL DEFAULT 'string',
        description VARCHAR(255) NULL,
        requires_restart TINYINT(1) NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_settings_key (setting_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    for (const item of SETTINGS_CATALOG) {
      const seeded = process.env[item.key];
      const value = seeded === undefined || seeded === ''
        ? String(item.fallback ?? '')
        : String(seeded);
      await conn.query(
        `INSERT INTO settings
          (setting_key, setting_value, group_name, label, value_type, description, requires_restart)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          group_name = VALUES(group_name),
          label = VALUES(label),
          value_type = VALUES(value_type),
          description = VALUES(description),
          requires_restart = VALUES(requires_restart)`,
        [
          item.key,
          value,
          item.group,
          item.label,
          item.valueType,
          item.description || null,
          item.requiresRestart ? 1 : 0,
        ],
      );
    }

    await conn.query(
      `DELETE FROM settings WHERE setting_key NOT IN (${SETTINGS_CATALOG.map(() => '?').join(',')})`,
      SETTINGS_CATALOG.map((item) => item.key),
    );

    const [[mediaSecret]] = await conn.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'MEDIA_URL_SECRET' LIMIT 1",
    );
    if (mediaSecret && !String(mediaSecret.setting_value || '').trim()) {
      await conn.query(
        "UPDATE settings SET setting_value = ? WHERE setting_key = 'MEDIA_URL_SECRET'",
        [crypto.randomBytes(32).toString('hex')],
      );
    }

    const [rows] = await conn.query(
      `SELECT setting_key, setting_value, group_name, label, value_type, description, requires_restart, updated_at
       FROM settings
       ORDER BY group_name ASC, label ASC`,
    );
    applyRuntimeSettings(rows);
    const threshold = rows.find((row) => row.setting_key === 'FACE_MATCH_THRESHOLD');
    if (threshold) setFaceMatchThreshold(Number(threshold.setting_value));
    ready = true;
    return rows;
  } finally {
    conn.release();
  }
}

export async function listSettings() {
  if (!ready) await ensureSettingsLoaded();
  const [rows] = await db.query(
    `SELECT setting_key, setting_value, group_name, label, value_type, description, requires_restart, updated_at
     FROM settings
     ORDER BY group_name ASC, label ASC`,
  );
  return rows;
}

export async function updateSettings(updates) {
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new Error('No settings were provided');
  }

  const allowed = new Map(SETTINGS_CATALOG.map((item) => [item.key, item]));
  const conn = await db.getConnection();
  const changedKeys = [];
  try {
    await conn.beginTransaction();
    for (const update of updates) {
      const key = String(update?.key || '').trim();
      const definition = allowed.get(key);
      if (!definition) {
        throw new Error(`Unknown setting: ${key}`);
      }
      const value = update?.value === undefined || update?.value === null ? '' : String(update.value);
      if (definition.valueType === 'number' && value !== '' && !Number.isFinite(Number(value))) {
        throw new Error(`${definition.label} must be a number`);
      }
      await conn.query(
        `UPDATE settings SET setting_value = ? WHERE setting_key = ?`,
        [value, key],
      );
      changedKeys.push(key);
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  const rows = await listSettings();
  applyRuntimeSettings(rows);
  if (changedKeys.includes('FACE_MATCH_THRESHOLD')) {
    const threshold = rows.find((row) => row.setting_key === 'FACE_MATCH_THRESHOLD');
    setFaceMatchThreshold(Number(threshold?.setting_value));
  }
  if (changedKeys.some((key) => SMTP_KEYS.has(key))) resetMailTransport();
  if (changedKeys.some((key) => B2_KEYS.has(key))) resetB2Cache();

  return {
    settings: rows,
    restartRequired: changedKeys.some((key) => allowed.get(key)?.requiresRestart),
  };
}

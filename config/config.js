/**
 * Application configuration.
 * Starts from the server .env file, then the admin settings table overrides it.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SETTINGS_BY_KEY } from './settingsCatalog.js';

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'),
});

const env = (key, fallback = '') => {
  const value = process.env[key];
  if (value === undefined || value === '') return fallback;
  return value;
};

const envNumber = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
};

const initial = (key) => {
  const definition = SETTINGS_BY_KEY[key];
  if (!definition) return env(key);
  if (definition.valueType === 'number') return envNumber(key, definition.fallback);
  return env(key, definition.fallback ?? '');
};

export let PORT = envNumber('PORT', 7736);
export let NODE_ENV = env('NODE_ENV', 'development');
export let MEDIA_URL_SECRET = initial('MEDIA_URL_SECRET');
export let SERVER_BASE_URL = initial('SERVER_BASE_URL');
export let FRONTEND_URL = initial('FRONTEND_URL');

export let DB_HOST = env('DB_HOST');
export let DB_PORT = envNumber('DB_PORT', 3306);
export let DB_USER = env('DB_USER');
export let DB_PASSWORD = env('DB_PASSWORD');
export let DB_NAME = env('DB_NAME');

export let DATABASE_HOST = DB_HOST;
export let DATABASE_PORT = DB_PORT;
export let DATABASE_USER = DB_USER;
export let DATABASE_PASSWORD = DB_PASSWORD;
export let DATABASE_NAME = DB_NAME;

export let EMAIL_USER = initial('EMAIL_USER');
export let EMAIL_PASS = initial('EMAIL_PASS');
export let SMTP_HOST = initial('SMTP_HOST');
export let SMTP_PORT = initial('SMTP_PORT');

export let WEB_GOOGLE_CLIENT_ID = initial('WEB_GOOGLE_CLIENT_ID');
export let APP_GOOGLE_CLIENT_ID = initial('APP_GOOGLE_CLIENT_ID');
export let TRUECALLER_CLIENT_ID = initial('TRUECALLER_CLIENT_ID');
export let FACEBOOK_APP_ID = initial('FACEBOOK_APP_ID');
export let FACEBOOK_APP_SECRET = initial('FACEBOOK_APP_SECRET');

export let LEDGER_MAX_LIMIT = initial('LEDGER_MAX_LIMIT');

export let FACE_SERVICE_URL = initial('FACE_SERVICE_URL');
export let FACE_SERVICE_TIMEOUT_MS = initial('FACE_SERVICE_TIMEOUT_MS');
export let FACE_MATCH_THRESHOLD = initial('FACE_MATCH_THRESHOLD');

export let ONECHATTING_TEMPLATE_TOKEN = initial('ONECHATTING_TEMPLATE_TOKEN');
export let ONECHATTING_SEND_TOKEN = initial('ONECHATTING_SEND_TOKEN');
export let ONECHATTING_SEND_URL = initial('ONECHATTING_SEND_URL');
export let TEMPLATE_LIST_URL = initial('TEMPLATE_LIST_URL');

export let FAST2SMS_API_KEY = initial('FAST2SMS_API_KEY');
export let FAST2SMS_SENDER_ID = initial('FAST2SMS_SENDER_ID');
export let FAST2SMS_URL = initial('FAST2SMS_URL');
export let FAST2SMS_OTP_TEMPLATE = initial('FAST2SMS_OTP_TEMPLATE');

export let B2_ENDPOINT = initial('B2_ENDPOINT');
export let B2_REGION = initial('B2_REGION');
export let B2_BUCKET = initial('B2_BUCKET');
export let B2_ACCESS_KEY = initial('B2_ACCESS_KEY');
export let B2_SECRET_KEY = initial('B2_SECRET_KEY');
export let B2_DOWNLOAD_AUTH_TTL_SECONDS = initial('B2_DOWNLOAD_AUTH_TTL_SECONDS');

export let RAZORPAY_API_KEY = initial('RAZORPAY_API_KEY');
export let RAZORPAY_KEY_SECRET = initial('RAZORPAY_KEY_SECRET');
export let RAZORPAY_WEBHOOK_SECRET = initial('RAZORPAY_WEBHOOK_SECRET');

export let productionBaseDomain = String(SERVER_BASE_URL ?? '').replace(/\/$/, '');

const assignSetting = (key, value) => {
  switch (key) {
    case 'PORT': PORT = value; break;
    case 'NODE_ENV': NODE_ENV = value; break;
    case 'MEDIA_URL_SECRET': MEDIA_URL_SECRET = value; break;
    case 'SERVER_BASE_URL': SERVER_BASE_URL = value; break;
    case 'FRONTEND_URL': FRONTEND_URL = value; break;
    case 'DB_HOST': DB_HOST = value; break;
    case 'DB_PORT': DB_PORT = value; break;
    case 'DB_USER': DB_USER = value; break;
    case 'DB_PASSWORD': DB_PASSWORD = value; break;
    case 'DB_NAME': DB_NAME = value; break;
    case 'EMAIL_USER': EMAIL_USER = value; break;
    case 'EMAIL_PASS': EMAIL_PASS = value; break;
    case 'SMTP_HOST': SMTP_HOST = value; break;
    case 'SMTP_PORT': SMTP_PORT = value; break;
    case 'WEB_GOOGLE_CLIENT_ID': WEB_GOOGLE_CLIENT_ID = value; break;
    case 'APP_GOOGLE_CLIENT_ID': APP_GOOGLE_CLIENT_ID = value; break;
    case 'TRUECALLER_CLIENT_ID': TRUECALLER_CLIENT_ID = value; break;
    case 'FACEBOOK_APP_ID': FACEBOOK_APP_ID = value; break;
    case 'FACEBOOK_APP_SECRET': FACEBOOK_APP_SECRET = value; break;
    case 'LEDGER_MAX_LIMIT': LEDGER_MAX_LIMIT = value; break;
    case 'FACE_SERVICE_URL': FACE_SERVICE_URL = value; break;
    case 'FACE_SERVICE_TIMEOUT_MS': FACE_SERVICE_TIMEOUT_MS = value; break;
    case 'FACE_MATCH_THRESHOLD': FACE_MATCH_THRESHOLD = value; break;
    case 'ONECHATTING_TEMPLATE_TOKEN': ONECHATTING_TEMPLATE_TOKEN = value; break;
    case 'ONECHATTING_SEND_TOKEN': ONECHATTING_SEND_TOKEN = value; break;
    case 'ONECHATTING_SEND_URL': ONECHATTING_SEND_URL = value; break;
    case 'TEMPLATE_LIST_URL': TEMPLATE_LIST_URL = value; break;
    case 'FAST2SMS_API_KEY': FAST2SMS_API_KEY = value; break;
    case 'FAST2SMS_SENDER_ID': FAST2SMS_SENDER_ID = value; break;
    case 'FAST2SMS_URL': FAST2SMS_URL = value; break;
    case 'FAST2SMS_OTP_TEMPLATE': FAST2SMS_OTP_TEMPLATE = value; break;
    case 'B2_ENDPOINT': B2_ENDPOINT = value; break;
    case 'B2_REGION': B2_REGION = value; break;
    case 'B2_BUCKET': B2_BUCKET = value; break;
    case 'B2_ACCESS_KEY': B2_ACCESS_KEY = value; break;
    case 'B2_SECRET_KEY': B2_SECRET_KEY = value; break;
    case 'B2_DOWNLOAD_AUTH_TTL_SECONDS': B2_DOWNLOAD_AUTH_TTL_SECONDS = value; break;
    case 'RAZORPAY_API_KEY': RAZORPAY_API_KEY = value; break;
    case 'RAZORPAY_KEY_SECRET': RAZORPAY_KEY_SECRET = value; break;
    case 'RAZORPAY_WEBHOOK_SECRET': RAZORPAY_WEBHOOK_SECRET = value; break;
    default: break;
  }
};

export function applyRuntimeSettings(entries) {
  for (const entry of entries) {
    const definition = SETTINGS_BY_KEY[entry.setting_key];
    if (!definition) continue;
    const raw = entry.setting_value ?? '';
    const value = definition.valueType === 'number' ? Number(raw) : String(raw);
    const normalized = definition.valueType === 'number' && !Number.isFinite(value)
      ? definition.fallback
      : value;
    process.env[entry.setting_key] = String(normalized);
    assignSetting(entry.setting_key, normalized);
  }

  DATABASE_HOST = DB_HOST;
  DATABASE_PORT = DB_PORT;
  DATABASE_USER = DB_USER;
  DATABASE_PASSWORD = DB_PASSWORD;
  DATABASE_NAME = DB_NAME;
  productionBaseDomain = String(SERVER_BASE_URL ?? '').replace(/\/$/, '');
}

const config = {
  get PORT() { return PORT; },
  get NODE_ENV() { return NODE_ENV; },
  get SERVER_BASE_URL() { return SERVER_BASE_URL; },
  get FRONTEND_URL() { return FRONTEND_URL; },
  get DB_HOST() { return DB_HOST; },
  get DB_PORT() { return DB_PORT; },
  get DB_USER() { return DB_USER; },
  get DB_PASSWORD() { return DB_PASSWORD; },
  get DB_NAME() { return DB_NAME; },
  get EMAIL_USER() { return EMAIL_USER; },
  get EMAIL_PASS() { return EMAIL_PASS; },
  get SMTP_HOST() { return SMTP_HOST; },
  get SMTP_PORT() { return SMTP_PORT; },
  get RAZORPAY_API_KEY() { return RAZORPAY_API_KEY; },
  get RAZORPAY_KEY_SECRET() { return RAZORPAY_KEY_SECRET; },
  get RAZORPAY_WEBHOOK_SECRET() { return RAZORPAY_WEBHOOK_SECRET; },
};

export default config;

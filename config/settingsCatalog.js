/**
 * Settings edited from the admin panel.
 * Database connection, port, and NODE_ENV stay in the server .env file.
 */
export const SETTINGS_CATALOG = [
  { key: 'MEDIA_URL_SECRET', group: 'Server', label: 'Media link secret', valueType: 'secret', fallback: '', description: 'Signs file links. Leave blank to generate one automatically.' },
  { key: 'SERVER_BASE_URL', group: 'Server', label: 'Server base URL', valueType: 'string', fallback: 'https://server.oneattendance.in', description: 'Public API origin, without a trailing slash.' },
  { key: 'FRONTEND_URL', group: 'Server', label: 'Client app URL', valueType: 'string', fallback: 'https://app.oneattendance.in', description: 'Panel URL used in emails and dashboard links.' },

  { key: 'EMAIL_USER', group: 'Email', label: 'Email user', valueType: 'string', fallback: '' },
  { key: 'EMAIL_PASS', group: 'Email', label: 'Email password', valueType: 'secret', fallback: '' },
  { key: 'SMTP_HOST', group: 'Email', label: 'SMTP host', valueType: 'string', fallback: '' },
  { key: 'SMTP_PORT', group: 'Email', label: 'SMTP port', valueType: 'number', fallback: 465 },

  { key: 'WEB_GOOGLE_CLIENT_ID', group: 'Google', label: 'Web Google client ID', valueType: 'string', fallback: '' },
  { key: 'APP_GOOGLE_CLIENT_ID', group: 'Google', label: 'App Google client ID', valueType: 'string', fallback: '' },

  { key: 'TRUECALLER_CLIENT_ID', group: 'Truecaller', label: 'Truecaller client ID', valueType: 'secret', fallback: '' },

  { key: 'FACEBOOK_APP_ID', group: 'Facebook', label: 'Facebook app ID', valueType: 'string', fallback: '' },
  { key: 'FACEBOOK_APP_SECRET', group: 'Facebook', label: 'Facebook app secret', valueType: 'secret', fallback: '' },

  { key: 'LEDGER_MAX_LIMIT', group: 'Ledger', label: 'Ledger page limit', valueType: 'number', fallback: 100, description: 'Maximum rows allowed in one ledger request.' },

  { key: 'FACE_SERVICE_URL', group: 'Face recognition', label: 'Face service URL', valueType: 'string', fallback: 'http://localhost:8000' },
  { key: 'FACE_SERVICE_TIMEOUT_MS', group: 'Face recognition', label: 'Face service timeout (ms)', valueType: 'number', fallback: 120000 },
  { key: 'FACE_MATCH_THRESHOLD', group: 'Face recognition', label: 'Face match threshold', valueType: 'number', fallback: 0.8, description: 'Minimum similarity score for a face match.' },

  { key: 'ONECHATTING_TEMPLATE_TOKEN', group: 'WhatsApp', label: 'Template token', valueType: 'secret', fallback: '' },
  { key: 'ONECHATTING_SEND_TOKEN', group: 'WhatsApp', label: 'Send token', valueType: 'secret', fallback: '' },
  { key: 'ONECHATTING_SEND_URL', group: 'WhatsApp', label: 'Send URL', valueType: 'string', fallback: '' },
  { key: 'TEMPLATE_LIST_URL', group: 'WhatsApp', label: 'Template list URL', valueType: 'string', fallback: '' },

  { key: 'FAST2SMS_API_KEY', group: 'SMS', label: 'Fast2SMS API key', valueType: 'secret', fallback: '' },
  { key: 'FAST2SMS_SENDER_ID', group: 'SMS', label: 'Sender ID', valueType: 'string', fallback: '' },
  { key: 'FAST2SMS_URL', group: 'SMS', label: 'Send URL', valueType: 'string', fallback: '' },
  { key: 'FAST2SMS_OTP_TEMPLATE', group: 'SMS', label: 'OTP template ID', valueType: 'string', fallback: '' },

  { key: 'B2_ENDPOINT', group: 'Storage', label: 'B2 endpoint', valueType: 'string', fallback: '' },
  { key: 'B2_REGION', group: 'Storage', label: 'B2 region', valueType: 'string', fallback: '' },
  { key: 'B2_BUCKET', group: 'Storage', label: 'B2 bucket', valueType: 'string', fallback: '' },
  { key: 'B2_ACCESS_KEY', group: 'Storage', label: 'B2 access key', valueType: 'secret', fallback: '' },
  { key: 'B2_SECRET_KEY', group: 'Storage', label: 'B2 secret key', valueType: 'secret', fallback: '' },
  { key: 'B2_DOWNLOAD_AUTH_TTL_SECONDS', group: 'Storage', label: 'Download auth TTL (seconds)', valueType: 'number', fallback: 86400 },

  { key: 'RAZORPAY_API_KEY', group: 'Razorpay', label: 'API key', valueType: 'secret', fallback: '' },
  { key: 'RAZORPAY_KEY_SECRET', group: 'Razorpay', label: 'Key secret', valueType: 'secret', fallback: '' },
  { key: 'RAZORPAY_WEBHOOK_SECRET', group: 'Razorpay', label: 'Webhook secret', valueType: 'secret', fallback: '' },
];

export const SETTINGS_BY_KEY = Object.fromEntries(
  SETTINGS_CATALOG.map((item) => [item.key, item]),
);

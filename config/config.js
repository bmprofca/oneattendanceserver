/**
 * Central application configuration.
 * Edit values here instead of using a .env file.
 */

const config = {
  PORT: 7736,

  // Database Configuration
  DATABASE_HOST: '193.203.184.193',
  DATABASE_PORT: 3306,
  DATABASE_USER: 'u278432002_oneattendance',
  DATABASE_PASSWORD: 'c/f^9CagZG9',
  DATABASE_NAME: 'u278432002_oneattendance',

  // Alias DB keys for compatibility
  DB_HOST: '193.203.184.193',
  DB_PORT: 3306,
  DB_USER: 'u278432002_oneattendance',
  DB_PASSWORD: 'c/f^9CagZG9',
  DB_NAME: 'u278432002_oneattendance',

  // Email / SMTP Configuration
  EMAIL_USER: 'contact@onesaas.in',
  EMAIL_PASS: '6&Fe~FGqyMvk',
  SMTP_HOST: 'smtp.hostinger.com',
  SMTP_PORT: 465,

  // Google OAuth
  WEB_GOOGLE_CLIENT_ID: '1099166791217-ejpnup928oqaitbkjlu7sa7gvuhq5om5.apps.googleusercontent.com',
  APP_GOOGLE_CLIENT_ID: '1099166791217-gv208acpiqat45qg263n6jhuifu7vvji.apps.googleusercontent.com',

  // Server BASE_URL
  SERVER_BASE_URL: "https://oneattendanceserver.onesaas.in",

  // Frontend URL
  FRONTEND_URL: 'https://oneattendanceclient.vercel.app',

  // Truecaller
  TRUECALLER_CLIENT_ID: 'nttf4gwxb5is457f2hzqoaqkahyokj1_21vsb7ul-i4',

  // Facebook
  FACEBOOK_APP_ID: '1745467266627339',
  FACEBOOK_APP_SECRET: 'b598238311f5aa61fc9b928e73a4f7cd',

  NODE_ENV: 'production',

  // Face Recognition Service
  FACE_SERVICE_URL: 'http://localhost:8000',
  FACE_SERVICE_TIMEOUT_MS: 120000,

  // Zwitch (Open Money)
  ZWITCH_PAYMENT_TOKEN_URL: 'https://api.zwitch.io/v1/pg/payment_token',
  ZWITCH_API_KEY: 'ebab5ff3-8ff5-423c-b1bf-4f5a0f99fec0',
  ZWITCH_API_SECRET: '1bc5b906b1d6c9d7dca6cfdbdf2494c8815ffd921da93cde0b9dfeaece8fe8a3',

  // OneChatting WhatsApp Integration
  ONECHATTING_TEMPLATE_TOKEN: '4u4jeam9d32kgkvzp27m8zqhumwfy7bd16l1bpwmb015nh54zmmd7t2infrm1x5',
  ONECHATTING_SEND_TOKEN: 'ekl28if8u7xy772wo22u2f1chnbk47blb8hhq658fx19tqeht05s6v5kj519h6z',
  ONECHATTING_SEND_URL: 'https://server.onechatting.com/developer/message/send-template',
  TEMPLATE_LIST_URL: 'https://server.onechatting.com/developer/template/template-list',

  // Fast2SMS Integration
  FAST2SMS_API_KEY: 'TNcvwZtlCVKAhVecVxeTOBubj8TdQDkRuw9m6r0bcsbdRjYzhv5ylzoyli6T',
  FAST2SMS_SENDER_ID: 'FINFLR',
  FAST2SMS_URL: 'https://www.fast2sms.com/dev/bulkV2',
  FAST2SMS_OTP_TEMPLATE: '219530',
};

export const {
  PORT,
  DATABASE_HOST,
  DATABASE_PORT,
  DATABASE_USER,
  DATABASE_PASSWORD,
  DATABASE_NAME,
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  EMAIL_USER,
  EMAIL_PASS,
  SMTP_HOST,
  SMTP_PORT,
  WEB_GOOGLE_CLIENT_ID,
  APP_GOOGLE_CLIENT_ID,
  SERVER_BASE_URL,
  FRONTEND_URL,
  TRUECALLER_CLIENT_ID,
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
  NODE_ENV,
  FACE_SERVICE_URL,
  FACE_SERVICE_TIMEOUT_MS,
  ZWITCH_PAYMENT_TOKEN_URL,
  ZWITCH_API_KEY,
  ZWITCH_API_SECRET,
  ONECHATTING_TEMPLATE_TOKEN,
  ONECHATTING_SEND_TOKEN,
  ONECHATTING_SEND_URL,
  TEMPLATE_LIST_URL,
  FAST2SMS_API_KEY,
  FAST2SMS_SENDER_ID,
  FAST2SMS_URL,
  FAST2SMS_OTP_TEMPLATE,
} = config;

export default config;

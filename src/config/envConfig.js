import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NODE_ENV = process.env.NODE_ENV || 'development';

dotenv.config({ path: path.resolve(__dirname, `../../.env.${NODE_ENV}`) });

const required = (value, name) => {
  if (!value) throw new Error(`❌ Missing environment variable: ${name}`);
  return value;
};

const env = {
  NODE_ENV,
  PORT: process.env.PORT || 4000,
  DB_URI: required(process.env.DB_URI, 'DB_URI'),
  BASE_URL: required(process.env.BASE_URL, 'BASE_URL'),
  FRONTEND_URL: required(process.env.FRONTEND_URL, 'FRONTEND_URL'),
  SALT_ROUNDS: parseInt(process.env.SALT_ROUNDS || '10', 10),
  JWT_ACCESS_SECRET: required(
    process.env.JWT_ACCESS_SECRET,
    'JWT_ACCESS_SECRET',
  ),
  JWT_REFRESH_SECRET: required(
    process.env.JWT_REFRESH_SECRET,
    'JWT_REFRESH_SECRET',
  ),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  // Email config - optional (only required when emailTransporter is used)
  SES_SMTP_USER: process.env.SES_SMTP_USER,
  SES_SMTP_PASS: process.env.SES_SMTP_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM,
  SMTP_HOST: process.env.SMTP_HOST || 'email-smtp.us-east-2.amazonaws.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  FIREBASE_PROJECT_ID: required(
    process.env.FIREBASE_PROJECT_ID,
    'FIREBASE_PROJECT_ID',
  ),
  FIREBASE_CLIENT_EMAIL: required(
    process.env.FIREBASE_CLIENT_EMAIL,
    'FIREBASE_CLIENT_EMAIL',
  ),
  FIREBASE_PRIVATE_KEY: required(
    process.env.FIREBASE_PRIVATE_KEY,
    'FIREBASE_PRIVATE_KEY',
  ),
  GOOGLE_CLIENT_ID: required(process.env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID'),
  AWS_REGION: process.env.AWS_REGION,
  AWS_ACCESS_KEY_ID: required(
    process.env.AWS_ACCESS_KEY_ID,
    'AWS_ACCESS_KEY_ID',
  ),
  AWS_SECRET_ACCESS_KEY: required(
    process.env.AWS_SECRET_ACCESS_KEY,
    'AWS_SECRET_ACCESS_KEY',
  ),
  AWS_S3_BUCKET: required(process.env.AWS_S3_BUCKET, 'AWS_S3_BUCKET'),
  FRONTEND_URL: required(process.env.FRONTEND_URL, 'FRONTEND_URL'),
  REDIS_URL: required(process.env.REDIS_URL, 'REDIS_URL'),
  JOB_ATTEMPTS: required(process.env.JOB_ATTEMPTS, 'JOB_ATTEMPTS'),
  JOB_BACKOFF_MS: required(process.env.JOB_BACKOFF_MS, 'JOB_BACKOFF_MS'),
  DLQ_QUEUE_NAME: required(process.env.DLQ_QUEUE_NAME, 'DLQ_QUEUE_NAME'),
  BATCH_SIZE: required(process.env.BATCH_SIZE, 'BATCH_SIZE'),
  SCHEDULER_CRON: required(process.env.SCHEDULER_CRON, 'SCHEDULER_CRON'),
  MIN_TRANSFER_AMOUNT: required(
    process.env.MIN_TRANSFER_AMOUNT,
    'MIN_TRANSFER_AMOUNT',
  ),
  RP_ID: required(process.env.RP_ID, 'RP_ID'),
  RP_NAME: required(process.env.RP_NAME, 'RP_NAME'),
  ORIGIN: required(process.env.ORIGIN, 'ORIGIN'),
  WORKER_CONCURRENCY: required(
    process.env.WORKER_CONCURRENCY,
    'WORKER_CONCURRENCY',
  ),
  TWILIO_ACCOUNT_SID: required(
    process.env.TWILIO_ACCOUNT_SID,
    'TWILIO_ACCOUNT_SID',
  ),
  TWILIO_AUTH_TOKEN: required(
    process.env.TWILIO_AUTH_TOKEN,
    'TWILIO_AUTH_TOKEN',
  ),
  TWILIO_VERIFY_SERVICE_SID: required(
    process.env.TWILIO_VERIFY_SERVICE_SID,
    'TWILIO_VERIFY_SERVICE_SID',
  ),
  TWILIO_PHONE_NUMBER: required(
    process.env.TWILIO_PHONE_NUMBER,
    'TWILIO_PHONE_NUMBER',
  ),
  OTP_TTL_SECONDS: required(process.env.OTP_TTL_SECONDS, 'OTP_TTL_SECONDS'),
  OTP_COOLDOWN_SECONDS: required(
    process.env.OTP_COOLDOWN_SECONDS,
    'OTP_COOLDOWN_SECONDS',
  ),
  OTP_MAX_ATTEMPTS_PER_HOUR: required(
    process.env.OTP_MAX_ATTEMPTS_PER_HOUR,
    'OTP_MAX_ATTEMPTS_PER_HOUR',
  ),
  OTP_HMAC_KEY: required(process.env.OTP_HMAC_KEY, 'OTP_HMAC_KEY'),
  STRIPE_SECRET_KEY: required(
    process.env.STRIPE_SECRET_KEY,
    'STRIPE_SECRET_KEY',
  ),
  LOCATION_TTL_SECONDS: required(
    process.env.LOCATION_TTL_SECONDS,
    'LOCATION_TTL_SECONDS',
  ),
  AGORA_APP_ID: required(process.env.AGORA_APP_ID, 'AGORA_APP_ID'),
  AGORA_APP_CERTIFICATE: required(
    process.env.AGORA_APP_CERTIFICATE,
    'AGORA_APP_CERTIFICATE',
  ),
};

export default env;

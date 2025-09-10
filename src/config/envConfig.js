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
  EMAIL_USER: required(process.env.EMAIL_USER, 'EMAIL_USER'),
  EMAIL_PASS: required(process.env.EMAIL_PASS, 'EMAIL_PASS'),
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
  TWILIO_ACCOUNT_SID: required(
    process.env.TWILIO_ACCOUNT_SID,
    'TWILIO_ACCOUNT_SID',
  ),
  TWILIO_AUTH_TOKEN: required(
    process.env.TWILIO_AUTH_TOKEN,
    'TWILIO_AUTH_TOKEN',
  ),
  TWILIO_VERIFY_SERVICE_SID: required(process.env.TWILIO_VERIFY_SERVICE_SID, "TWILIO_VERIFY_SERVICE_SID"),
  TWILIO_PHONE_NUMBER: required(
    process.env.TWILIO_PHONE_NUMBER,
    'TWILIO_PHONE_NUMBER',
  ),
  OTP_TTL_SECONDS: required(process.env.OTP_TTL_SECONDS, 'OTP_TTL_SECONDS'),
  OTP_COOLDOWN_SECONDS: required(
    process.env.OTP_COOLDOWN_SECONDS,
    'OTP_COOLDOWN_SECONDS',
  ),
  OTP_MAX_ATTEMPTS_PER_HOUR: required(process.env, 'OTP_MAX_ATTEMPTS_PER_HOUR'),
  OTP_HMAC_KEY: required(process.env.OTP_HMAC_KEY, 'OTP_HMAC_KEY'),
  STRIPE_SECRET_KEY: required(process.env.STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY")
};

export default env;

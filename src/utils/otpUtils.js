import crypto from 'crypto';
import redisConfig from '../config/redisConfig.js';
import { emailQueue } from '../queues/emailQueue.js';
import { smsQueue } from '../queues/smsQueue.js';
import { otpQueue } from '../queues/otpQueue.js';
import { getTwilioClient, TWILIO_CONFIG } from '../config/twilioConfig.js';
import env from '../config/envConfig.js';

let client = getTwilioClient();

const HMAC_KEY = env.OTP_HMAC_KEY;

// // -------- Helpers -------- //
const generateOtp = () => Math.floor(10000 + Math.random() * 90000).toString();

const hashOtp = (otp) =>
  crypto.createHmac('sha256', HMAC_KEY).update(otp).digest('hex');

const compareHash = (a, b) => {
  const A = Buffer.from(a, 'hex');
  const B = Buffer.from(b, 'hex');
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
};

// Redis keys - fixed duplicate declarations
export const emailOtpKey = (email) => `email_otp:${email}`;
export const emailCooldownKey = (email) => `email_otp_cd:${email}`;
export const emailPendingKey = (email) => `email_otp_pending:${email}`;
export const emailVerifiedKey = (email) => `email_otp_verified:${email}`;
export const emailAttemptsKey = (email) => `email_otp_attempts:${email}`;

export const phoneOtpKey = (phone) => `phone_otp:${phone}`;
export const phoneCooldownKey = (phone) => `phone_otp_cooldown:${phone}`;
export const phonePendingKey = (phone) => `phone_pending_update:${phone}`;
export const phoneVerifiedKey = (phone) => `phone_otp_verified:${phone}`;
export const phoneAttemptsKey = (phone) => `phone_otp_attempts:${phone}`;

// Set with TTL
const setWithTTL = async (key, ttlSeconds, value) => {
  if (typeof redisConfig.setEx === 'function') {
    return redisConfig.setEx(key, ttlSeconds, value);
  } else {
    return redisConfig.set(key, value, 'EX', ttlSeconds);
  }
};

// // -------- Services -------- //

// Request Email OTP
export const requestEmailOtp = async (email, username, context = {}, type) => {
  try {
    const cdTtl = await redisConfig.ttl(emailCooldownKey(email));
    if (cdTtl > 0) return { ok: false, waitSeconds: cdTtl };

    // Clear any existing OTP data before creating new one
    const keys = [
      emailOtpKey(email),
      emailCooldownKey(email),
      emailPendingKey(email),
      emailAttemptsKey(email),
      emailVerifiedKey(email),
    ];

    await redisConfig.del(...keys);

    const otp = generateOtp();
    const hashed = hashOtp(otp);

    await setWithTTL(emailOtpKey(email), env.OTP_TTL_SECONDS, hashed);
    await setWithTTL(emailCooldownKey(email), env.OTP_COOLDOWN_SECONDS, '1');

    if (Object.keys(context || {}).length > 0) {
      await setWithTTL(
        emailPendingKey(email),
        env.OTP_TTL_SECONDS,
        JSON.stringify(context),
      );
    }

    await emailQueue.add('sendEmailOtp', { email, otp, username, type });

    return { ok: true };
  } catch (error) {
    console.error(`ERROR SENDING OTP to ${email}: ${error.message}`);
    return { ok: false };
  }
};

export const verifyEmailOtp = async (email, otpRaw, expectedPurpose = null) => {
  const verifiedKeyName = emailVerifiedKey(email);
  const attemptsKeyName = emailAttemptsKey(email);

  // 1. Check if this email has already been verified
  const alreadyVerified = await redisConfig.get(verifiedKeyName);
  if (alreadyVerified) {
    return { ok: false, reason: 'already_verified' };
  }

  // 2. Fetch OTP hash
  const storedHash = await redisConfig.get(emailOtpKey(email));
  if (!storedHash) {
    return { ok: false, reason: 'expired_or_not_requested' };
  }

  // 3. Anti-bruteforce check
  const attempts = Number(await redisConfig.get(attemptsKeyName)) || 0;
  if (attempts >= 3) {
    return { ok: false, reason: 'too_many_attempts' };
  }

  // 4. Verify hash
  const inputHash = hashOtp(otpRaw);
  const match = compareHash(storedHash, inputHash);

  if (!match) {
    await redisConfig.incr(attemptsKeyName);
    await redisConfig.expire(attemptsKeyName, 600);
    return { ok: false, reason: 'invalid_otp' };
  }

  // 5. Read pending payload
  const pending = await redisConfig.get(emailPendingKey(email));
  let pendingData = pending ? JSON.parse(pending) : null;

  // 6. Purpose validation — only when needed
  if (expectedPurpose) {
    const storedPurpose = pendingData?.purpose || null;

    if (!storedPurpose) {
      // Optional: log missing purpose for debugging
      console.warn(`⚠️ OTP verified for ${email}, but stored purpose missing.`);
      return { ok: false, reason: 'purpose_missing' };
    }

    if (storedPurpose !== expectedPurpose) {
      return { ok: false, reason: 'purpose_mismatch' };
    }
  }

  // 7. Cleanup OTP & attempts
  await redisConfig.del(
    emailOtpKey(email),
    emailCooldownKey(email),
    emailPendingKey(email),
    attemptsKeyName,
  );

  // 8. Mark verified
  await redisConfig.setex(verifiedKeyName, env.OTP_TTL_SECONDS, 'true');

  return { ok: true, pending: pendingData };
};

export const resendEmailOtp = async (email, username, context = {}) => {
  return requestEmailOtp(email, username, context);
};

// Phone Number verification Otp Services
export const requestPhoneOtp = async (
  currentPhone,
  username,
  context,
  type,
) => {
  const cooldownExists = await redisConfig.exists(
    phoneCooldownKey(currentPhone),
  );
  if (cooldownExists) {
    const ttl = await redisConfig.ttl(phoneCooldownKey(currentPhone));
    return { ok: false, reason: 'cooldown', waitSeconds: ttl };
  }

  // 🚨 CLEAR PREVIOUS OTP DATA BEFORE CREATING NEW ONE
  await redisConfig.del(
    phoneOtpKey(currentPhone),
    phonePendingKey(currentPhone),
    phoneAttemptsKey(currentPhone),
    phoneVerifiedKey(currentPhone),
  );

  const otp = String(Math.floor(10000 + Math.random() * 90000));
  const otpHash = hashOtp(otp);

  // Save OTP and context for verification
  await redisConfig.setex(phoneOtpKey(currentPhone), 300, otpHash);
  await redisConfig.setex(
    phonePendingKey(currentPhone),
    600,
    JSON.stringify(context),
  );
  await redisConfig.setex(phoneCooldownKey(currentPhone), 60, 'true');

  await smsQueue.add(
    'sendPhoneOtp',
    {
      phoneNumber: currentPhone,
      otp,
      username,
      type,
    },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  );

  return { ok: true, message: `OTP sent to ${currentPhone}` };
};

export const verifyPhoneOtp = async (phoneNumber, otpRaw) => {
  const verifiedKeyName = phoneVerifiedKey(phoneNumber);
  const attemptsKeyName = phoneAttemptsKey(phoneNumber);

  const alreadyVerified = await redisConfig.get(verifiedKeyName);
  if (alreadyVerified) return { ok: false, reason: 'already_verified' };

  const storedHash = await redisConfig.get(phoneOtpKey(phoneNumber));
  if (!storedHash) return { ok: false, reason: 'expired_or_not_requested' };

  const attempts = Number(await redisConfig.get(attemptsKeyName)) || 0;
  if (attempts >= 3) return { ok: false, reason: 'too_many_attempts' };

  const inputHash = hashOtp(otpRaw);
  const match = compareHash(storedHash, inputHash);

  if (!match) {
    await redisConfig.incr(attemptsKeyName);
    await redisConfig.expire(attemptsKeyName, 600);
    return { ok: false, reason: 'invalid_otp' };
  }

  const pending = await redisConfig.get(phonePendingKey(phoneNumber));
  await redisConfig.del(
    phoneOtpKey(phoneNumber),
    phoneCooldownKey(phoneNumber),
    phonePendingKey(phoneNumber),
    attemptsKeyName,
  );

  await redisConfig.setex(verifiedKeyName, 300, 'true');

  return { ok: true, pending: pending ? JSON.parse(pending) : null };
};

export const sendOtp = async (phoneNumber) => {
  try {
    const verification = await client.verify.v2
      .services(env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({
        to: phoneNumber,
        channel: 'sms',
      });

    return { success: true }; // Fixed: should return success: true when verification is created
  } catch (err) {
    console.error(`ERROR SENDING OTP to ${phoneNumber}: ${err.message}`);
    return { success: false };
  }
};

export const verifyOtp = async (phoneNumber, code) => {
  try {
    const verificationCheck = await client.verify.v2
      .services(env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to: phoneNumber,
        code,
      });

    return verificationCheck.status === 'approved';
  } catch (err) {
    console.error(`OTP VERIFICATION ERROR for ${phoneNumber}: ${err.message}`);
    throw new Error('Failed to verify OTP, please try again later.');
  }
};

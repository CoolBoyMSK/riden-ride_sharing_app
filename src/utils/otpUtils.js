import crypto from 'crypto';
import redisConfig from '../config/redisConfig.js';
import { otpQueue } from '../queues/otpQueue.js';
import { getTwilioClient, TWILIO_CONFIG } from '../config/twilioConfig.js';
import env from '../config/envConfig.js';

const HMAC_KEY = env.OTP_HMAC_KEY;

const generateOtp = () => {
  return Math.floor(10000 + Math.random() * 90000).toString();
};

const hashOtp = (otp) => {
  return crypto.createHmac('sha256', HMAC_KEY).update(otp).digest('hex');
};

const compareHash = (a, b) => {
  const A = Buffer.from(a, 'hex');
  const B = Buffer.from(b, 'hex');
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
};

const otpKey = (phone) => `otp:${phone}`;
const cooldownKey = (phone) => `otp_cd:${phone}`;
const pendingKey = (phone) => `otp_pending:${phone}`;

/**
 * Helper wrapper for Redis set with TTL
 * Works for both ioredis and node-redis v4+
 */
const setWithTTL = async (key, ttlSeconds, value) => {
  if (typeof redisConfig.setEx === 'function') {
    // node-redis v4+
    return redisConfig.setEx(key, ttlSeconds, value);
  } else {
    // ioredis or node-redis v3
    return redisConfig.set(key, value, 'EX', ttlSeconds);
  }
};

// used both for phone-signup (driver) and social/email when phone provided
export const requestOtp = async (phoneNumber, context = {}) => {
  // cooldown check
  const cdTtl = await redisConfig.ttl(cooldownKey(phoneNumber));
  if (cdTtl > 0) return { ok: false, waitSeconds: cdTtl };

  // generate + hash
  const otp = generateOtp();
  console.log('Generated OTP:', otp);
  const hashed = hashOtp(otp);

  // store hashed otp with TTL
  await setWithTTL(otpKey(phoneNumber), env.OTP_TTL_SECONDS, hashed);

  // set cooldown
  await setWithTTL(cooldownKey(phoneNumber), env.OTP_COOLDOWN_SECONDS, '1');

  // store pending payload if provided
  if (Object.keys(context || {}).length > 0) {
    await setWithTTL(
      pendingKey(phoneNumber),
      env.OTP_TTL_SECONDS,
      JSON.stringify(context),
    );
  }

  // enqueue SMS job (Twilio consumer will process this)
  await otpQueue.add('sendOtp', { phoneNumber, otp });

  // return ok (⚠️ never return OTP in production!)
  return { ok: true };
};

export const verifyOtp = async (phoneNumber, otpRaw) => {
  const storedHash = await redisConfig.get(otpKey(phoneNumber));
  if (!storedHash) return { ok: false, reason: 'expired_or_not_requested' };

  const inputHash = hashOtp(otpRaw);
  const match = compareHash(storedHash, inputHash);
  if (!match) return { ok: false, reason: 'invalid_otp' };

  // read pending payload
  const pending = await redisConfig.get(pendingKey(phoneNumber));

  // cleanup after success
  await redisConfig.del(
    otpKey(phoneNumber),
    cooldownKey(phoneNumber),
    pendingKey(phoneNumber),
  );

  return { ok: true, pending: pending ? JSON.parse(pending) : null };
};

export const resendOtp = async (phoneNumber, context = {}) => {
  return requestOtp(phoneNumber, context);
};

export const sendOtpSms = async (receiver, otp) => {
  try {
    const client = getTwilioClient();

    const message = await client.messages.create({
      body: `Your OTP code is ${otp}. Please do not share it with anyone.`,
      from: TWILIO_CONFIG.phoneNumber,
      to: receiver,
    });

    return message.sid;
  } catch (error) {
    console.error('❌ Failed to send OTP SMS:', error.message);
  }
};

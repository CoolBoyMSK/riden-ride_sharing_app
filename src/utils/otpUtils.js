import crypto from 'crypto';
import redisConfig from '../config/redisConfig.js';
import { otpQueue } from '../queues/otpQueue.js';
import { getTwilioClient, TWILIO_CONFIG } from '../config/twilioConfig.js';
import env from '../config/envConfig.js';
import { sendEmailVerificationOtp } from '../templates/emails/user/index.js';

let client = getTwilioClient();

// const HMAC_KEY = env.OTP_HMAC_KEY;

// // -------- Helpers -------- //
// const generateOtp = () => Math.floor(10000 + Math.random() * 90000).toString();

// const hashOtp = (otp) =>
//   crypto.createHmac('sha256', HMAC_KEY).update(otp).digest('hex');

// const compareHash = (a, b) => {
//   const A = Buffer.from(a, 'hex');
//   const B = Buffer.from(b, 'hex');
//   if (A.length !== B.length) return false;
//   return crypto.timingSafeEqual(A, B);
// };

// // Redis keys
// const otpKey = (email) => `email_otp:${email}`;
// const cooldownKey = (email) => `email_otp_cd:${email}`;
// const pendingKey = (email) => `email_otp_pending:${email}`;

// // Set with TTL
// const setWithTTL = async (key, ttlSeconds, value) => {
//   if (typeof redisConfig.setEx === 'function') {
//     return redisConfig.setEx(key, ttlSeconds, value);
//   } else {
//     return redisConfig.set(key, value, 'EX', ttlSeconds);
//   }
// };

// // -------- Services -------- //

// // Request Email OTP
// export const requestEmailOtp = async (email, username, context = {}) => {
//   // cooldown check
//   const cdTtl = await redisConfig.ttl(cooldownKey(email));
//   if (cdTtl > 0) return { ok: false, waitSeconds: cdTtl };

//   // generate & hash OTP
//   const otp = generateOtp();
//   const hashed = hashOtp(otp);

//   // store hashed otp with TTL
//   await setWithTTL(otpKey(email), env.OTP_TTL_SECONDS, hashed);

//   // set cooldown
//   await setWithTTL(cooldownKey(email), env.OTP_COOLDOWN_SECONDS, '1');

//   // store pending payload if provided
//   if (Object.keys(context || {}).length > 0) {
//     await setWithTTL(
//       pendingKey(email),
//       env.OTP_TTL_SECONDS,
//       JSON.stringify(context),
//     );
//   }

//   // send email using your nodemailer template
//   await sendEmailVerificationOtp(email, otp, username); // pass OTP here

//   return { ok: true };
// };

// // Verify Email OTP
// export const verifyEmailOtp = async (email, otpRaw) => {
//   const storedHash = await redisConfig.get(otpKey(email));
//   if (!storedHash) return { ok: false, reason: 'expired_or_not_requested' };

//   const inputHash = hashOtp(otpRaw);
//   const match = compareHash(storedHash, inputHash);
//   if (!match) return { ok: false, reason: 'invalid_otp' };

//   // read pending payload
//   const pending = await redisConfig.get(pendingKey(email));

//   // cleanup after success
//   await redisConfig.del(otpKey(email), cooldownKey(email), pendingKey(email));

//   return { ok: true, pending: pending ? JSON.parse(pending) : null };
// };

// // Resend OTP
// export const resendEmailOtp = async (email,username, context = {}) => {
//   return requestEmailOtp(email, username, context);
// };

// Phone Number verification Otp Services

export const sendOtp = async (phoneNumber) => {
  try {
    console.log(`🔔 Sending OTP to ${phoneNumber}...`);

    const verification = await client.verify.v2
      .services(env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({
        to: phoneNumber,
        channel: 'sms',
      });
    return { success: true };
  } catch (err) {
    console.error(`ERROR SENDING OTP to ${phoneNumber}: ${err.message}`);
    throw new Error('Failed to send OTP, please try again later.');
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

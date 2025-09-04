import { Worker } from 'bullmq';
import redisClient from '../config/redisConfig.js';
import { sendOtpSms } from '../utils/otpUtils.js';

const otpWorker = new Worker(
  'otpQueue',
  async (job) => {
    const { phoneNumber, otp } = job.data;
    await sendOtpSms(phoneNumber, otp);
  },
  { connection: redisClient },
);

otpWorker.on('completed', (job) => console.log('OTP job done', job.id));
otpWorker.on('failed', (job, err) =>
  console.error('OTP job failed', job.id, err?.message),
);

import { Worker } from 'bullmq';
import redisClient from '../config/redisConfig.js';
import sendOtpSms from '../utils/sendOtpSms.js';

export const otpWorker = new Worker(
  'otpSms',
  async (job) => {
    const { phoneNumber, otp } = job.data;
    await sendOtpSms(phoneNumber, otp);
  },
  { connection: redisClient },
);

otpWorker.on('completed', (job) => {
  console.log(`✅ OTP sent successfully to ${job.data.phoneNumber}`);
});

otpWorker.on('failed', (job, err) => {
  console.error(
    `❌ Failed to send OTP to ${job?.data?.phoneNumber}:`,
    err.message,
  );
});

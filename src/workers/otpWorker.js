import { Worker } from 'bullmq';
import redisClient from '../config/redisConfig.js';
import { sendOtp } from '../utils/otpUtils.js';

const otpWorker = new Worker(
  'otpQueue',
  async (job) => {
    const { phoneNumber } = job.data;
    console.log(`Processing OTP job for ${phoneNumber}...`);
    console.log('Picked job:', job.id, job.data);
    await sendOtp(phoneNumber);
    return { success: true, phoneNumber };
  },
  {
    connection: redisClient,
    concurrency: 5,
  },
);

otpWorker.on('ready', () => {
  console.log(`🔌 OTP worker connected`);
});

otpWorker.on('completed', (job) =>
  console.log(`✅ OTP job ${job.id} completed for ${job.data.phoneNumber}`),
);

otpWorker.on('failed', (job, err) =>
  console.error(
    `❌ OTP job ${job.id} failed for ${job?.data?.phoneNumber}: ${err?.message}`,
  ),
);

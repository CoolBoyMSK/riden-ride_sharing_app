import { Queue } from 'bullmq';
import redisClient from '../config/redisConfig.js';

export const otpQueue = new Queue('otpQueue', {
  connection: redisClient,
  defaultJobOptions: {
    removeOnComplete: true, // clean completed jobs
    removeOnFail: false, // keep failed jobs for inspection
    attempts: 3, // retry up to 3 times
    backoff: { type: 'exponential', delay: 5000 }, // 5s, 10s, 20s
  },
});

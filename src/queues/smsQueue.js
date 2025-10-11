import { Queue } from 'bullmq';
import redisClient from '../config/redisConfig.js';

export const smsQueue = new Queue('sms', {
  connection: redisClient,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 100,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

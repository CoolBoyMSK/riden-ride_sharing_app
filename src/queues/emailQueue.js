import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import env from '../config/envConfig.js';

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const emailQueue = new Queue('emails', { connection });

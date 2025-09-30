import { Queue } from 'bullmq';
import redisClient from '../config/redisConfig.js';
import env from '../config/envConfig.js';

export const alertQueue = new Queue('alerts', { connection: redisClient });
export const dlqQueue = new Queue(env.DLQ_QUEUE_NAME || 'alerts-dlq', {
  connection: redisClient,
});

import { Queue } from 'bullmq';
import redisClient from '../config/redisConfig.js';

export const emailQueue = new Queue('emails', {
  connection: redisClient,
});

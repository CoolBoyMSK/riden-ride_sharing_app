import { Queue } from 'bullmq';
import redisClient from '../config/redisConfig.js';

export const otpSmsQueue = new Queue('otpSms', { connection: redisClient });

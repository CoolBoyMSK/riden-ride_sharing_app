import { Queue } from 'bullmq';
import  redisClient  from '../config/redisConfig.js';

export const otpQueue = new Queue('otpQueue', { connection: redisClient });

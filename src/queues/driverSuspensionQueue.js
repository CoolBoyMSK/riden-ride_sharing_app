import { Queue, QueueScheduler } from 'bullmq';
import redisClient from '../config/redisConfig.js';

export const DRIVER_SUSPENSION_QUEUE = 'driverSuspension';

new QueueScheduler(DRIVER_SUSPENSION_QUEUE, { connection: redisClient });

export const driverSuspensionQueue = new Queue(DRIVER_SUSPENSION_QUEUE, {
  connection: redisClient,
});

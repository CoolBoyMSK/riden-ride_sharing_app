import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import env from '../../config/envConfig.js';

const connection = new IORedis(env.REDIS_URL);
const prefix = env.QUEUE_PREFIX || 'riden';

export const mainQueue = new Queue('weekly-payout-queue', {
  connection,
  prefix,
});

export const driverQueue = new Queue('driver-transfer-queue', {
  connection,
  prefix,
});

export const scheduledRideQueue = new Queue('scheduled-ride-queue', {
  connection,
  prefix,
});

export default connection;

// Optional cleanup for graceful shutdown
process.on('SIGTERM', async () => {
  await Promise.all([
    mainQueue.close(),
    driverQueue.close(),
    scheduledRideQueue.close(),
    connection.quit(),
  ]);
  console.log('✅ Queues and Redis connection closed gracefully');
  process.exit(0);
});

import pkg from 'bullmq';
const { Queue, QueueScheduler } = pkg;
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

export const mainQueueScheduler = new QueueScheduler('weekly-payout-queue', {
  connection,
  prefix,
});
await mainQueueScheduler.waitUntilReady();

export const driverQueueScheduler = new QueueScheduler(
  'driver-transfer-queue',
  {
    connection,
    prefix,
  },
);
await driverQueueScheduler.waitUntilReady();

export default connection;

// Optional cleanup for graceful shutdown
process.on('SIGTERM', async () => {
  await Promise.all([
    mainQueueScheduler.close(),
    driverQueueScheduler.close(),
    connection.quit(),
  ]);
  console.log('✅ Queues and Redis connection closed gracefully');
  process.exit(0);
});

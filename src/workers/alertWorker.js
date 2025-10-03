import pkg from 'bullmq';
const { Worker, QueueScheduler } = pkg;
import redisClient from '../config/redisConfig.js';
import { alertQueue, dlqQueue } from '../queues/alertQueue.js';
import { sendAlert } from '../dal/admin/index.js';
import env from '../config/envConfig.js';
import firebaseAdmin from '../config/firebaseAdmin.js';

// ensure firebase initialized
firebaseAdmin;

// Needed for delayed/repeatable jobs
const queueScheduler = new QueueScheduler('alerts', {
  connection: redisClient,
});
await queueScheduler.waitUntilReady();

const concurrency = Number(env.WORKER_CONCURRENCY || 4);

const worker = new Worker(
  'alerts',
  async (job) => {
    const { alertId } = job.data;
    console.log(`[worker] processing alert ${alertId} jobId=${job.id}`);
    return await sendAlert(alertId);
  },
  { connection: redisClient, concurrency },
);

worker.on('ready', () => {
  console.log(`🔌 Alert worker connected`);
});

worker.on('failed', async (job, err) => {
  console.error(`Job ${job.id} failed`, err?.message || err);

  if (job.attemptsMade >= (job.opts.attempts || 1)) {
    await dlqQueue.add('dlq', job.data, { removeOnComplete: true });
    console.warn(`Moved job ${job.id} to DLQ`);

    await import('../models/Alert.js').then((m) =>
      m.default
        .findByIdAndUpdate(job.data.alertId, { status: 'FAILED' })
        .exec(),
    );
  }
});

const shutdown = async () => {
  console.log('Worker graceful shutdown');
  await worker.close();
  await queueScheduler.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('Alert worker started');

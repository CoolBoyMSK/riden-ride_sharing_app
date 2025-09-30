// workers/alertWorker.js
import { Worker, QueueScheduler } from 'bullmq';
import redisClient from '../config/redisConfig.js';
import { alertQueue, dlqQueue } from '../queues/alertQueue.js';
import { sendAlert } from '../dal/admin/index.js';
import env from '../config/envConfig.js';
import firebaseAdmin from '../config/firebaseAdmin.js';

// ensure firebase initialized
firebaseAdmin; // module initializes on import

// needed for delayed/repeatable jobs
new QueueScheduler('alerts', { connection: redisClient });

const concurrency = Number(env.WORKER_CONCURRENCY || 4);

const worker = new Worker(
  'alerts',
  async (job) => {
    const { alertId } = job.data;
    console.log(`[worker] processing alert ${alertId} jobId=${job.id}`);
    const result = await sendAlert(alertId);
    return result;
  },
  { connection: redisClient, concurrency },
);

worker.on('failed', async (job, err) => {
  console.error(`Job ${job.id} failed`, err?.message || err);
  // if attempts exhausted push to DLQ
  if (job.attemptsMade >= (job.opts.attempts || 1)) {
    await dlqQueue.add('dlq', job.data, { removeOnComplete: true });
    console.warn(`Moved job ${job.id} to DLQ`);
    // optional: update alert status to FAILED
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
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('Alert worker started');

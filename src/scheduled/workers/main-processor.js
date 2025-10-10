import { Worker } from 'bullmq';
import { driverQueue } from '../queues/index.js';
import logger from '../lib/logger.js';
import { getDriversCursor } from '../services/driverService.js'; // below
import { v4 as uuidv4 } from 'uuid';
import env from '../../config/envConfig.js'; // load env

const concurrency = 1; // only one main job runs at once

export const startMainProcessor = () => {
  const worker = new Worker(
    'weekly-payout-queue',
    async (job) => {
      logger.info('Main job started', { jobId: job.id, data: job.data });

      // iterate drivers in pages using a DB cursor to avoid loading all drivers at once
      const batchSize = parseInt(env.BATCH_SIZE || '200', 10);

      const cursor = getDriversCursor({
        minPending: parseFloat(env.MIN_TRANSFER_AMOUNT || '10'),
      });

      let batch = [];
      for await (const driver of cursor) {
        batch.push(driver);

        if (batch.length >= batchSize) {
          // enqueue batch
          const groupId = uuidv4();
          await driverQueue.add(
            'driver-batch',
            { drivers: batch.map((d) => d._id.toString()), batchId: groupId },
            { removeOnComplete: true },
          );
          logger.info('Enqueued driver batch', {
            size: batch.length,
            batchId: groupId,
          });
          batch = [];
        }
      }

      // enqueue remaining
      if (batch.length > 0) {
        const groupId = uuidv4();
        await driverQueue.add(
          'driver-batch',
          { drivers: batch.map((d) => d._id.toString()), batchId: groupId },
          { removeOnComplete: true },
        );
        logger.info('Enqueued final driver batch', { size: batch.length });
      }

      logger.info('Main job finished');
      return { status: 'ok' };
    },
    { connection: driverQueue.connection, concurrency },
  );

  worker.on('failed', (job, err) => {
    logger.error('Main worker failed', { jobId: job.id, err: err.message });
  });

  logger.info('Main processor started');
};

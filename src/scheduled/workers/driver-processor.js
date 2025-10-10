import { Worker } from 'bullmq';
import logger from '../lib/logger.js';
import pLimit from 'p-limit';
import promiseRetry from 'promise-retry';
import stripe from 'stripe';
import mongoose from 'mongoose';
import {
  getDriverBalance,
  decreaseDriverPendingBalance,
  increaseDriverAvailableBalance,
} from '../services/walletService.js';
import DriverModel from '../../models/Driver.js';
import DriverPayout from '../../models/DriverPayout.js';
import env from '../../config/envConfig.js'; // load env

const stripeClient = stripe(env.STRIPE_SECRET_KEY);
const concurrency = parseInt(env.WORKER_CONCURRENCY || '6', 10);
const driverQueueName = 'driver-transfer-queue';

// helper: attempt Stripe transfer with idempotency and retry
const attemptTransfer = async (driver, amount, weekKey) => {
  const idempotencyKey = `transfer:${driver._id.toString()}:${weekKey}`; // stable key per driver-week
  return promiseRetry(
    async (retry, number) => {
      try {
        const transfer = await stripeClient.transfers.create(
          {
            amount: Math.round(amount * 100),
            currency: 'cad',
            destination: driver.stripeAccountId,
            description: `Weekly payout transfer for week ${weekKey}`,
          },
          {
            idempotencyKey,
          },
        );

        if (!transfer || transfer.status !== 'paid') {
          // For some statuses, we may want to retry (e.g., pending)
          const err = new Error(
            'Transfer not completed or pending: ' +
              (transfer ? transfer.status : 'no-transfer'),
          );
          err.transfer = transfer;
          throw err;
        }
        return transfer;
      } catch (err) {
        // If stripe returned an error that is unrecoverable (invalid_account, etc.) do not retry
        const msg = err && err.type ? err.type : err.message;
        if (
          msg &&
          (msg === 'invalid_request_error' ||
            msg === 'authentication_error' ||
            msg === 'invalid_account' ||
            /account.*closed/i.test(msg))
        ) {
          logger.error('Unrecoverable stripe error, aborting transfer', {
            driverId: driver._id,
            error: msg,
          });
          throw err;
        }
        logger.warn('Transfer attempt failed, retrying', {
          driverId: driver._id,
          attempt: number,
          message: err.message,
        });
        retry(err);
      }
    },
    {
      retries: 4,
      factor: 2,
      minTimeout: 2000,
    },
  );
};

export const startDriverProcessor = () => {
  const worker = new Worker(
    driverQueueName,
    async (job) => {
      const { drivers, batchId } = job.data;
      logger.info('Processing driver batch', { batchId, size: drivers.length });

      // p-limit with concurrency
      const limit = pLimit(concurrency);

      // weekKey -> derive from current date: e.g., YYYY-WW or startDate
      const now = new Date();
      const weekStart = (() => {
        const d = new Date(now);
        const day = d.getDay();
        const diffToMonday = (day === 0 ? -6 : 1) - day;
        d.setDate(d.getDate() + diffToMonday);
        d.setHours(0, 0, 0, 0);
        return d.toISOString().slice(0, 10); // YYYY-MM-DD
      })();

      const tasks = drivers.map((driverId) =>
        limit(async () => {
          // load driver and wallet
          const driver = await DriverModel.findById(driverId).lean();
          if (!driver) {
            logger.warn('Driver not found - skipping', { driverId });
            return;
          }
          if (!driver.stripeAccountId) {
            logger.warn('Driver has no stripe account - skipping', {
              driverId,
            });
            return;
          }

          // get wallet
          const wallet = await getDriverBalance(driver._id);
          const pending = wallet.pendingBalance || 0;
          const minAmount = parseFloat(env.MIN_TRANSFER_AMOUNT || '10');

          if (pending < minAmount) {
            logger.info('Pending below threshold - skipping', {
              driverId,
              pending,
            });
            return;
          }

          // Use mongoose transaction to atomically move pending -> available (or mark as in-progress)
          const session = await mongoose.startSession();
          session.startTransaction();
          try {
            // Mark pending as transferring by decreasing pending balance
            await decreaseDriverPendingBalance(driver._id, pending, {
              session,
            });

            // Optionally set a 'pendingTransfer' record to track
            // Attempt stripe transfer
            const transfer = await attemptTransfer(driver, pending, weekStart);

            // On success, increase available (on driver Stripe account) in DB
            await increaseDriverAvailableBalance(driver._id, pending, {
              session,
            });

            // Record transaction
            await DriverPayout.create(
              [
                {
                  driverId: driver._id,
                  totalEarnings: pending,
                  totalPaid: pending,
                  status: 'paid',
                  payoutMethod: 'automatic',
                  payoutDate: new Date(),
                  stripeTransferId: transfer.id,
                },
              ],
              { session },
            );

            await session.commitTransaction();
            session.endSession();

            logger.info('Transfer succeeded', {
              driverId: driver._id,
              amount: pending,
              transferId: transfer.id,
            });
          } catch (err) {
            await session.abortTransaction();
            session.endSession();
            logger.error(
              'Transfer failed for driver, rolling back DB changes',
              { driverId, error: err.message },
            );
            // Optionally: move pending back or mark as failed using separate update
            // push failure metrics / alert
          }
        }),
      );

      await Promise.all(tasks);

      logger.info('Batch processed', { batchId });
      return { ok: true };
    },
    { connection: driverQueue.connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error('Driver batch worker failed', {
      jobId: job.id,
      err: err.message,
    });
  });

  logger.info('Driver processor started');
};

import { mainQueue } from '../queues/index.js';
import Redlock from 'redlock';
import IORedis from 'ioredis';
import logger from '../lib/logger.js';
import env from '../../config/envConfig.js';

const redis = new IORedis(env.REDIS_URL);

// create redlock (used to avoid scheduling collisions)
const redlock = new Redlock([redis], {
  driftFactor: 0.01,
  retryCount: 3,
  retryDelay: 200,
  retryJitter: 200,
});

export const installWeeklyScheduler = async () => {
  // Acquire a short lock to perform schedule installation once
  const lockKey = 'locks:install-weekly-scheduler';
  try {
    const lock = await redlock.acquire([lockKey], 10000); // hold 10s
    logger.info('Installing weekly scheduler job...');

    // create a repeatable job (cron) that triggers the main job
    // Cron from env - default Monday 05:00 UTC
    const cronExpr = env.SCHEDULER_CRON || '59 59 23 * * 0';

    await mainQueue.add(
      'trigger-weekly-payout',
      { triggeredAt: new Date().toISOString() },
      {
        repeat: { cron: cronExpr, tz: 'UTC' },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    await lock.release();
    logger.info('Weekly scheduler installed', { cron: cronExpr });
  } catch (err) {
    logger.warn(
      'Could not install scheduler (maybe already installed): ' + err.message,
    );
  }
};

import connectDB from '../../config/db.js';
import { installWeeklyScheduler } from '../scheduler/index.js';
import { startMainProcessor } from '../workers/main-processor.js';
import { startDriverProcessor } from '../workers/driver-processor.js';
import { startScheduledRideProcessor } from '../workers/scheduled-ride-processor.js';
import logger from '../lib/logger.js';
import { scheduledRideQueue } from '../queues/index.js';

(async () => {
  try {
    logger.info('🚀 Starting scheduled ride worker...');

    // Connect to database
    await connectDB();
    logger.info('✅ Database connected');

    // Verify Redis connection by checking queue
    try {
      const waitingJobs = await scheduledRideQueue.getWaiting();
      const delayedJobs = await scheduledRideQueue.getDelayed();
      logger.info('✅ Redis connection verified', {
        waitingJobs: waitingJobs.length,
        delayedJobs: delayedJobs.length,
      });
    } catch (redisError) {
      logger.error('❌ Redis connection failed:', redisError);
      process.exit(1);
    }

    // Start the scheduled ride processor
    const worker = startScheduledRideProcessor();

    if (!worker) {
      logger.error('❌ Failed to start scheduled ride processor');
      process.exit(1);
    }

    logger.info('✅ Scheduled ride worker started successfully');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('🛑 Received SIGTERM, shutting down gracefully...');
      await worker.close();
      await scheduledRideQueue.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('🛑 Received SIGINT, shutting down gracefully...');
      await worker.close();
      await scheduledRideQueue.close();
      process.exit(0);
    });
  } catch (error) {
    logger.error('❌ Failed to start worker:', error);
    process.exit(1);
  }
})();

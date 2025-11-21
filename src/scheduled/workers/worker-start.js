import connectDB from '../../config/db.js';
import { installWeeklyScheduler } from '../scheduler/index.js';
import { startMainProcessor } from '../workers/main-processor.js';
import { startDriverProcessor } from '../workers/driver-processor.js';
import { startScheduledRideProcessor } from '../workers/scheduled-ride-processor.js';
import logger from '../lib/logger.js';

(async () => {
  await connectDB();
  await installWeeklyScheduler();
  startMainProcessor();
  startDriverProcessor();
  startScheduledRideProcessor();
  logger.info('Worker service started');
})();

import connectDB from '../../config/db.js';
import { installWeeklyScheduler } from '../scheduler/index.js';
import { startMainProcessor } from '../workers/main-processor.js';
import { startDriverProcessor } from '../workers/driver-processor.js';
import logger from '../lib/logger.js';

(async () => {
  await connectDB();
  await installWeeklyScheduler();
  startMainProcessor();
  startDriverProcessor();
  logger.info('Worker service started');
})();

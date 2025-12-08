import app from './src/app.js';
import connectDB from './src/config/db.js';
import startServer from './src/config/server.js';
import './src/crons/cronjobs.js';
import { startScheduledRideProcessor } from './src/scheduled/workers/scheduled-ride-processor.js';
import logger from './src/scheduled/lib/logger.js';

const bootstrap = async () => {
  await connectDB();
  startServer(app);
  
  // Start scheduled ride processor worker
  try {
    logger.info('🚀 Starting scheduled ride processor in main app...');
    const worker = startScheduledRideProcessor();
    if (worker) {
      logger.info('✅ Scheduled ride processor started successfully in main app');
    } else {
      logger.error('❌ Failed to start scheduled ride processor');
    }
  } catch (error) {
    logger.error('❌ Error starting scheduled ride processor:', error);
    // Don't exit - let the app continue running even if worker fails
  }
};

bootstrap();

import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import redisClient from '../config/redisConfig.js';
import { alertQueue, dlqQueue } from '../queues/alertQueue.js';
import { sendAlert } from '../dal/admin/index.js';
import env from '../config/envConfig.js';
import firebaseAdmin from '../config/firebaseAdmin.js';

// Initialize connections
const initializeConnections = async () => {
  try {
    // MongoDB connection
    await mongoose.connect(env.DB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected for worker');

    // Firebase admin
    await firebaseAdmin;
    console.log('✅ Firebase initialized');
  } catch (error) {
    console.error('❌ Connection initialization failed:', error);
    process.exit(1);
  }
};

// Connection event handlers
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

const concurrency = Number(env.WORKER_CONCURRENCY || 2); // Reduced for stability

const startWorker = async () => {
  await initializeConnections();

  const worker = new Worker(
    'alerts',
    async (job) => {
      const { alertId } = job.data;
      console.log(`[worker] processing alert ${alertId} jobId=${job.id}`);

      // Check connection health
      if (mongoose.connection.readyState !== 1) {
        throw new Error('Database connection lost');
      }

      return await sendAlert(alertId);
    },
    {
      connection: redisClient,
      concurrency,
      lockDuration: 300000, // 5 minutes
      settings: {
        maxStalledCount: 1,
        stallInterval: 30000,
      },
    },
  );

  worker.on('ready', () => {
    console.log(`🔌 Alert worker connected with concurrency: ${concurrency}`);
  });

  worker.on('completed', (job) => {
    console.log(`✅ Job ${job.id} completed successfully`);
  });

  worker.on('failed', async (job, err) => {
    console.error(`❌ Job ${job.id} failed:`, err?.message || err);

    if (job && job.attemptsMade >= (job.opts?.attempts || 1)) {
      try {
        await dlqQueue.add('dlq', job.data, {
          removeOnComplete: true,
          attempts: 1,
        });
        console.warn(`📦 Moved job ${job.id} to DLQ`);

        // Update alert status to FAILED
        if (mongoose.connection.readyState === 1) {
          const Alert = (await import('../models/Alert.js')).default;
          await Alert.findByIdAndUpdate(
            job.data.alertId,
            { status: 'FAILED' },
            { runValidators: false },
          );
        }
      } catch (dlqError) {
        console.error('Failed to move job to DLQ:', dlqError);
      }
    }
  });

  worker.on('error', (err) => {
    console.error('🚨 Worker error:', err);
  });

  return worker;
};

// Start the worker
const worker = await startWorker();

const shutdown = async (signal) => {
  console.log(`\n${signal} received, starting graceful shutdown...`);

  try {
    await worker.close();
    console.log('✅ Worker closed');

    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');

    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('🚀 Alert worker started successfully');

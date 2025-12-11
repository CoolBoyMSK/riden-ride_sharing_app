import { Worker } from 'bullmq';
import fg from 'fast-glob';
import { pathToFileURL } from 'url';
import redisClient from '../config/redisConfig.js';

const connection = redisClient;
const QUEUE_NAME = 'emails'; // same name as in emailQueue.js

async function loadJobs() {
  try {
    const files = await fg('src/workers/jobs/*.js', {
      cwd: process.cwd(),
      absolute: true,
    });

    const entries = await Promise.all(
      files.map(async (file) => {
        try {
          const mod = await import(pathToFileURL(file).href);
          if (!mod.name || !mod.handler) {
            console.error(`⚠️ Job file ${file} missing 'name' or 'handler' export`);
            return null;
          }
          return [mod.name, mod.handler];
        } catch (error) {
          console.error(`❌ Failed to load job file ${file}:`, error.message);
          return null;
        }
      }),
    );

    const validEntries = entries.filter((entry) => entry !== null);
    return Object.fromEntries(validEntries);
  } catch (error) {
    console.error('❌ Failed to load jobs:', error);
    throw error;
  }
}

(async () => {
  try {
    const jobs = await loadJobs();

    if (Object.keys(jobs).length === 0) {
      console.error('❌ No valid jobs loaded. Exiting.');
      process.exit(1);
    }

    console.log(
      `📋 Loaded ${Object.keys(jobs).length} job(s): ${Object.keys(jobs).join(', ')}`,
    );

    const worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const fn = jobs[job.name];
        if (!fn) throw new Error(`No handler for job ${job.name}`);
        await fn(job.data);
      },
      { connection },
    );

    worker.on('ready', () => {
      console.log(
        `🔌 Email worker connected; registered jobs: ${Object.keys(jobs).join(', ')}`,
      );
    });

    worker.on('completed', (job) => {
      console.log(`✅ Job ${job.id} (${job.name}) completed successfully`);
    });

    worker.on('failed', (job, err) => {
      console.error(`❌ Job ${job?.id} (${job?.name}) failed:`, err?.message || err);
    });

    worker.on('error', (err) => {
      console.error('🚨 Email worker error:', err?.message || err);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('🚨 Uncaught Exception:', error);
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Failed to start email worker:', error);
    process.exit(1);
  }
})();

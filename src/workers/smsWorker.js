import { Worker } from 'bullmq';
import redisClient from '../config/redisConfig.js';
import fg from 'fast-glob';
import { pathToFileURL } from 'url';

const connection = redisClient;
const QUEUE_NAME = 'sms'; // same name as in emailQueue.js

async function loadJobs() {
  const files = await fg('src/workers/jobs/*.js', {
    cwd: process.cwd(),
    absolute: true,
  });

  const entries = await Promise.all(
    files.map(async (file) => {
      const mod = await import(pathToFileURL(file).href);
      return [mod.name, mod.handler];
    }),
  );

  return Object.fromEntries(entries);
}

(async () => {
  const jobs = await loadJobs();

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
    console.log(`📡 SMS Worker connected to queue: ${QUEUE_NAME}`);
  });

  worker.on('completed', (job) => {
    console.log(`✅ SMS Job completed: ${job.name} (${job.id})`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ SMS Job failed: ${job.name} (${job.id}) —`, err.message);
  });
})();

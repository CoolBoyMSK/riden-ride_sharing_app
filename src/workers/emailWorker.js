import { Worker } from 'bullmq';
import fg from 'fast-glob';
import { pathToFileURL } from 'url';
import redisClient from '../config/redisConfig.js';

const connection = redisClient;

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
    'emails',
    async (job) => {
      const fn = jobs[job.name];
      if (!fn) throw new Error(`No handler for job ${job.name}`);
      await fn(job.data);
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job.id} (${job.name}) failed:`, err);
  });

  console.log(
    `📬 Email worker listening, registered jobs: ${Object.keys(jobs).join(', ')}`,
  );
})();

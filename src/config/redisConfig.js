import { Cluster } from 'ioredis';
import IORedis from 'ioredis';
import env from './envConfig.js';

const url = new URL(env.REDIS_URL);
const protocol = url.protocol;
const host = url.hostname;
const port = Number(url.port || 6379);

let client;

if (protocol === 'rediss:') {
  client = new Cluster([{ host, port }], {
    redisOptions: {
      tls: {},
      maxRetriesPerRequest: null,
    },
  });
  client.on('error', (err) => console.error('🔴 Redis cluster error:', err));
} else {
  client = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  client.on('error', (err) => console.error('🔴 Redis error:', err));
}

export default client;

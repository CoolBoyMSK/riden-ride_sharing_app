import IORedis from 'ioredis';
import env from './envConfig.js';

const url = new URL(env.REDIS_URL);
const protocol = url.protocol;
const host = url.hostname;
const port = Number(url.port || 6379);
let client;

const redisConfig = {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
  lazyConnect: true, 
  enableOfflineQueue: false,
};

if (protocol === 'rediss:') {
  client = new IORedis({
    host,
    port,
    tls: {
      rejectUnauthorized: false,
    },
    ...redisConfig,
  });
  client.on('connect', () => {
    console.log('🟢 Redis (TLS) connected:', host, port);
  });

  client.on('error', (err) => {
    if (err.code !== 'ECONNREFUSED') {
      console.error('🔴 Redis (TLS) error:', err.message);
    }
  });
} else {
  client = new IORedis(env.REDIS_URL, redisConfig);
  client.on('connect', () => {
    console.log('🟢 Redis connected:', host, port);
  });

  client.on('error', (err) => {
    if (err.code !== 'ECONNREFUSED') {
      console.error('🔴 Redis error:', err.message);
    }
  });
}

client.connect().catch((err) => {
  if (err.code === 'ECONNREFUSED') {
    console.warn(
      '⚠️  Redis connection refused. Make sure Redis is running on',
      `${host}:${port}. The app will continue but Redis features will be unavailable.`,
    );
    console.warn(
      '💡 To start Redis locally, run: brew install redis && brew services start redis',
    );
  } else {
    console.error('🔴 Redis connection error:', err.message);
  }
});

export default client;

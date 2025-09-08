// import IORedis from 'ioredis';
// import env from './envConfig.js';

// const url = new URL(env.REDIS_URL);
// const protocol = url.protocol;
// const host = url.hostname;
// const port = Number(url.port || 6379);
// let client;

// if (protocol === 'rediss:') {
//   client = new IORedis({
//     host,
//     port,
//     tls: {
//       // rejectUnauthorized: false,
//     },
//     maxRetriesPerRequest: null,
//   });
//   client.on('connect', () => {
//     console.log('🟢 Redis (TLS) connected:', host, port);
//   });

//   client.on('error', (err) =>
//     console.error('🔴 Redis (TLS) error:', err, port),
//   );
// } else {
//   client = new IORedis(env.REDIS_URL, {
//     maxRetriesPerRequest: null,
//   });
//   client.on('error', (err) => console.error('🔴 Redis error:', err));
// }

// export default client;

// testRedis.js
import IORedis from 'ioredis';

const redis = new IORedis('redis://127.0.0.1:6379');

redis.on('connect', () => console.log('✅ Connected to Redis'));
redis.on('error', (err) => console.error('❌ Redis error:', err));

export default redis;

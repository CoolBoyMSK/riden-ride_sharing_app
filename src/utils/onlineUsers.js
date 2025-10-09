import Redis from 'ioredis';
import env from '../config/envConfig.js';
const redisUrl = env.REDIS_URL || null;

let redis = null;
if (redisUrl) redis = new Redis(redisUrl);

const localMap = new Map();

export const addSocket = async (userId, socketId) => {
  if (redis) {
    await redis.sadd(`online:${userId}`, socketId);
    await redis.expire(`online:${userId}`, 60 * 60 * 24); // TTL optional
  } else {
    const set = localMap.get(userId) || new Set();
    set.add(socketId);
    localMap.set(userId, set);
  }
};

export const removeSocket = async (userId, socketId) => {
  if (redis) {
    await redis.srem(`online:${userId}`, socketId);
  } else {
    const set = localMap.get(userId);
    if (set) {
      set.delete(socketId);
      if (set.size === 0) localMap.delete(userId);
    }
  }
};

export const getSocketIds = async (userId) => {
  if (redis) {
    const ids = await redis.smembers(`online:${userId}`);
    return ids || [];
  } else {
    return Array.from(localMap.get(userId) || []);
  }
};

export const isOnline = async (userId) => {
  const ids = await getSocketIds(userId);
  return ids.length > 0;
};

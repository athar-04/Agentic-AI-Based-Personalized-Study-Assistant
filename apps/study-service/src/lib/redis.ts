import Redis from 'ioredis';
import { logger } from '../utils/logger';

/**
 * REDIS_URL=memory runs an in-process stand-in so the prototype starts without Docker.
 * It is refused in production: it is per-process, so cache invalidation and pub/sub
 * do not cross service boundaries.
 */
export function createRedisClient(): Redis {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  if (url === 'memory') {
    if (process.env.NODE_ENV === 'production') throw new Error('REDIS_URL=memory is for local development only');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RedisMock = require('ioredis-mock');
    return new RedisMock() as Redis;
  }
  return new Redis(url);
}

export const redisClient = createRedisClient();

redisClient.on('error', (err) => {
  logger.error('Redis error:', err);
});

redisClient.on('connect', () => {
  logger.info('Connected to Redis');
});

export const getCache = async (key: string): Promise<any> => {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    logger.error(`Error getting cache for key ${key}:`, err);
    return null;
  }
};

export const setCache = async (key: string, value: any, ttlSeconds: number = 3600): Promise<void> => {
  try {
    await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.error(`Error setting cache for key ${key}:`, err);
  }
};

export const deleteCache = async (key: string): Promise<void> => {
  try {
    await redisClient.del(key);
  } catch (err) {
    logger.error(`Error deleting cache for key ${key}:`, err);
  }
};

export default redisClient;


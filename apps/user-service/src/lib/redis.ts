import Redis from 'ioredis';
import { logger } from '../utils/logger';

export const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redisClient.on('error', (err) => {
  logger.error('Redis error:', err);
});

redisClient.on('connect', () => {
  logger.info('Connected to Redis');
});

export const getCache = async (key: string): Promise<any | null> => {
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


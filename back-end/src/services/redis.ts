import type { Redis as RedisInstance } from 'ioredis';
import { getBackendEnv } from '../config/env.js';

let redisClient: RedisInstance | null = null;
let redisUnavailable = false;

function getRedisUrl() {
  return getBackendEnv('REDIS_URL') ?? 'redis://127.0.0.1:6379';
}

export async function getRedisClient() {
  if (redisUnavailable) {
    return null;
  }

  if (!redisClient) {
    const { default: RedisClient } = (await import('ioredis')) as unknown as {
      default: new (url: string, options?: Record<string, unknown>) => RedisInstance;
    };

    redisClient = new RedisClient(getRedisUrl(), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    redisClient.on('error', (error: Error) => {
      console.error('Redis cache client error:', error.message);
    });
  }

  if (redisClient.status === 'wait' || redisClient.status === 'end') {
    try {
      await redisClient.connect();
    } catch (error) {
      redisUnavailable = true;
      console.error('Redis cache client unavailable:', (error as Error).message);
      return null;
    }
  }

  return redisClient;
}

export async function getRedisJsonValue<T>(key: string): Promise<T | null> {
  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  try {
    const value = await client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch (error) {
    console.error(`Redis cache read failed for key "${key}":`, (error as Error).message);
    return null;
  }
}

export async function setRedisJsonValue(key: string, value: unknown, ttlSeconds: number) {
  const client = await getRedisClient();
  if (!client) {
    return false;
  }

  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    return true;
  } catch (error) {
    console.error(`Redis cache write failed for key "${key}":`, (error as Error).message);
    return false;
  }
}

export async function deleteRedisKey(key: string) {
  const client = await getRedisClient();
  if (!client) {
    return false;
  }

  try {
    await client.del(key);
    return true;
  } catch (error) {
    console.error(`Redis cache delete failed for key "${key}":`, (error as Error).message);
    return false;
  }
}

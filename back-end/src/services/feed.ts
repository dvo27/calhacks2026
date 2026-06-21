import { deleteRedisKey, getRedisJsonValue, setRedisJsonValue } from './redis.js';

const MAIN_FEED_CACHE_KEY = 'feed:main:v1';
const MAIN_FEED_CACHE_TTL_SECONDS = 30;

export async function getCachedMainFeed<T>(): Promise<T | null> {
  return getRedisJsonValue<T>(MAIN_FEED_CACHE_KEY);
}

export async function setCachedMainFeed(value: unknown) {
  return setRedisJsonValue(MAIN_FEED_CACHE_KEY, value, MAIN_FEED_CACHE_TTL_SECONDS);
}

export async function invalidateMainFeedCache() {
  return deleteRedisKey(MAIN_FEED_CACHE_KEY);
}

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  throw new Error('REDIS_URL environment variable is not set');
}

function makeRedis() {
  return new Redis(REDIS_URL!, {
    maxRetriesPerRequest: null, // required by BullMQ
    retryStrategy(times) {
      if (times > 60) {
        console.error('[redis] Max reconnect attempts reached — exiting');
        process.exit(1);
      }
      return Math.min(200 * Math.pow(1.5, times), 10_000);
    },
    reconnectOnError(err) {
      const recoverable = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return recoverable.some((s) => err.message.includes(s));
    },
  });
}

// Singleton — safe for Next.js hot-reload
declare global {
  // eslint-disable-next-line no-var
  var _redis: Redis | undefined;
}

export const redis = globalThis._redis ?? makeRedis();
if (process.env.NODE_ENV !== 'production') globalThis._redis = redis;

export default redis;

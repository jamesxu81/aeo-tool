import Redis from 'ioredis';

// Lazy singleton — created on first use, not at module load time
let _client: Redis | null = null;

function getRedis(): Redis {
  if (_client) return _client;

  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is not set');

  _client = new Redis(url, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      if (times > 60) {
        console.error('[worker/redis] Max reconnect attempts — exiting');
        process.exit(1);
      }
      return Math.min(200 * Math.pow(1.5, times), 10_000);
    },
    reconnectOnError(err) {
      const recoverable = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return recoverable.some((s) => err.message.includes(s));
    },
  });

  _client.on('reconnecting', () => console.log('[worker/redis] reconnecting...'));
  _client.on('ready', () => console.log('[worker/redis] connected ✅'));
  _client.on('error', (err) => console.error('[worker/redis] error:', err.message));

  return _client;
}

export { getRedis };

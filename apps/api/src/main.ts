import { Redis } from 'ioredis';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { createDatabase } from './infra/database.js';
import { RedisRateLimiter } from './infra/rate-limit.js';
import { RedisSourceCooldown } from './infra/source-cooldown.js';
const config = readConfig();
const db = createDatabase(config.DATABASE_URL);
const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 1,
  connectTimeout: 3000,
  commandTimeout: 3000,
  enableOfflineQueue: false,
});
redis.on('error', () => {
  /* Eventos detalhados não devem expor URL/credenciais. */
});
const app = await buildApp({
  config,
  db,
  limiter: new RedisRateLimiter(redis),
  sourceCooldown: new RedisSourceCooldown(redis),
  checkHealth: async () => {
    await Promise.all([db.$queryRaw`SELECT 1`, redis.ping()]);
  },
});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    void (async () => {
      await app.close();
      await db.$disconnect();
      redis.disconnect();
    })();
  });
await app.listen({ port: config.PORT, host: '0.0.0.0' });

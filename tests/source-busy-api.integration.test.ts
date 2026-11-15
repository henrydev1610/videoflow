import { describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { buildApp } from '../apps/api/src/app.js';
import { readConfig } from '../apps/api/src/config.js';
import { RedisRateLimiter } from '../apps/api/src/infra/rate-limit.js';

describe.skipIf(process.env.RUN_INTEGRATION !== '1')(
  'SOURCE_BUSY integrado ao Fastify',
  () => {
    it('bloqueia antes de persistir ou publicar job', async () => {
      const config = readConfig();

      const db = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: config.DATABASE_URL,
        }),
      });

      const redis = new Redis(config.REDIS_URL);

      const sourceCooldown = {
        remaining: vi.fn(async () => 0),
        activate: vi.fn(async () => 60),
        acquireInspection: vi.fn(async () => ({
          acquired: false,
          retryAfter: 17,
        })),
        releaseInspection: vi.fn(async () => {}),
      };

      const queueAdd = vi.spyOn(Queue.prototype, 'add');

      let app: Awaited<ReturnType<typeof buildApp>> | undefined;

      try {
        app = await buildApp({
          db,
          config,
          limiter: new RedisRateLimiter(redis),
          sourceCooldown,
          checkHealth: async () => {
            await redis.ping();
          },
          logger: false,
        });

        const headers = {
          origin: config.ORIGIN,
          'content-type': 'application/json',
        };

        const context = await app.inject({
          method: 'POST',
          url: '/api/context',
          headers,
          payload: {},
        });

        expect(context.statusCode, context.body).toBe(201);

        const cookie = String(context.headers['set-cookie']).split(';')[0]!;

        const before = await db.mediaInspection.count();

        const response = await app.inject({
          method: 'POST',
          url: '/api/media/inspect',
          headers: { ...headers, cookie },
          payload: {
            url: 'https://www.youtube.com/watch?v=2VpYy3SUJTE',
          },
        });

        const after = await db.mediaInspection.count();

        expect(response.statusCode, response.body).toBe(429);
        expect(response.json().error.code).toBe('SOURCE_BUSY');
        expect(response.headers['retry-after']).toBe('17');

        expect(sourceCooldown.remaining).toHaveBeenCalled();
        expect(sourceCooldown.acquireInspection).toHaveBeenCalledTimes(1);
        expect(sourceCooldown.releaseInspection).not.toHaveBeenCalled();

        expect(after).toBe(before);
        expect(queueAdd).not.toHaveBeenCalled();
      } finally {
        if (app) await app.close();
        queueAdd.mockRestore();
        redis.disconnect();
        await db.$disconnect();
      }
    });
  },
);

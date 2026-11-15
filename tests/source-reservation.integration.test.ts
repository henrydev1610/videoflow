import { describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { RedisSourceCooldown } from '../apps/api/src/infra/source-cooldown.js';

describe.skipIf(process.env.RUN_INTEGRATION !== '1')(
  'Reserva distribuida de inspecao',
  () => {
    it('garante exclusividade e liberacao pelo proprietario', async () => {
      const redis = new Redis(process.env.REDIS_URL!, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        enableOfflineQueue: false,
      });

      redis.on('error', () => {});

      const key = 'videoflow:source-cooldown:youtube:inspection';
      const cooldownKey = 'videoflow:source-cooldown:youtube';

      await redis.connect();

      try {
        expect(await redis.exists(key)).toBe(0);
        expect(await redis.exists(cooldownKey)).toBe(0);

        const cooldown = new RedisSourceCooldown(redis);

        const [first, second] = await Promise.all([
          cooldown.acquireInspection('www.youtube.com'),
          cooldown.acquireInspection('youtu.be'),
        ]);

        const winners = [first, second].filter((result) => result.acquired);

        expect(winners).toHaveLength(1);

        const winner = winners[0]!;
        expect(winner.token).toBeDefined();

        await cooldown.releaseInspection(
          'youtube.com',
          'token-de-outro-proprietario',
        );

        expect(await redis.exists(key)).toBe(1);

        await cooldown.releaseInspection('youtube.com', winner.token!);

        expect(await redis.exists(key)).toBe(0);

        const next = await cooldown.acquireInspection('youtu.be');

        expect(next.acquired).toBe(true);

        if (next.token) {
          await cooldown.releaseInspection('youtu.be', next.token);
        }
      } finally {
        redis.disconnect();
      }
    });
  },
);

import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../apps/api/src/app.js';
import { readConfig } from '../apps/api/src/config.js';
import { RedisRateLimiter } from '../apps/api/src/infra/rate-limit.js';
describe.skipIf(process.env.RUN_MEDIA !== '1')(
  'API integrada ao sandbox',
  () => {
    it('inspeciona mídia real, cria por contrato e entrega somente ao dono', async () => {
      const config = readConfig();
      const db = new PrismaClient({
        adapter: new PrismaPg({ connectionString: config.DATABASE_URL }),
      });
      const redis = new Redis(config.REDIS_URL);
      const app = await buildApp({
        db,
        config,
        limiter: new RedisRateLimiter(redis),
        logger: false,
        checkHealth: async () => {
          await redis.ping();
        },
      });
      const origin = config.ORIGIN;
      const headers = { origin, 'content-type': 'application/json' };
      const visitor = await app.inject({
        method: 'POST',
        url: '/api/context',
        headers,
        payload: {},
        remoteAddress: '192.0.2.71',
      });
      const cookie = String(visitor.headers['set-cookie']).split(';')[0]!;
      try {
        const page = await app.inject({
          method: 'POST',
          url: '/api/media/inspect',
          headers: { ...headers, cookie },
          payload: { url: 'http://fixture/page' },
          remoteAddress: '192.0.2.73',
        });
        expect(page.statusCode, page.body).toBe(200);
        const pageInfo = page.json().data;
        expect(pageInfo.thumbnailUrl).toBe(
          `/api/media/inspections/${pageInfo.inspectionId}/thumbnail`,
        );
        const image = await app.inject({
          url: pageInfo.thumbnailUrl,
          headers: { cookie },
          remoteAddress: '192.0.2.73',
        });
        expect(image.statusCode, image.body).toBe(200);
        expect(image.headers['content-type']).toBe('image/png');
        const inspected = await app.inject({
          method: 'POST',
          url: '/api/media/inspect',
          headers: { ...headers, cookie },
          payload: { url: 'http://fixture/video.mp4' },
          remoteAddress: '192.0.2.71',
        });
        expect(inspected.statusCode, inspected.body).toBe(200);
        const info = inspected.json().data;
        expect(new Date(info.expiresAt).getTime() - Date.now()).toBeGreaterThan(
          570000,
        );
        expect(
          new Date(info.expiresAt).getTime() - Date.now(),
        ).toBeLessThanOrEqual(600000);
        expect(info.availableFormats).toEqual(['mp4', 'mp3']);
        expect(info.durationSeconds).toBeCloseTo(4, 0);
        expect(info.thumbnailUrl).toBeNull();
        const created = await app.inject({
          method: 'POST',
          url: '/api/downloads',
          headers: { ...headers, cookie, 'idempotency-key': randomUUID() },
          payload: {
            inspectionId: info.inspectionId,
            format: 'mp4',
            quality: 'low',
            rightsConfirmed: true,
          },
          remoteAddress: '192.0.2.71',
        });
        expect(created.statusCode, created.body).toBe(202);
        const id = created.json().data.id;
        await expect
          .poll(
            async () => {
              const result = await app.inject({
                url: `/api/downloads/${id}`,
                headers: { cookie },
                remoteAddress: '192.0.2.71',
              });
              return result.json().data.status;
            },
            { timeout: 30000, interval: 500 },
          )
          .toBe('COMPLETED');
        const file = await app.inject({
          url: `/api/downloads/${id}/file`,
          headers: { cookie, range: 'bytes=0-100' },
          remoteAddress: '192.0.2.71',
        });
        expect(file.statusCode).toBe(206);
        expect(file.rawPayload.length).toBe(101);
        await db.fileArtifact.update({
          where: { jobId: id },
          data: { expiresAt: new Date(Date.now() - 1) },
        });
        const expiredFile = await app.inject({
          url: `/api/downloads/${id}/file`,
          headers: { cookie },
          remoteAddress: '192.0.2.71',
        });
        expect(expiredFile.statusCode).toBe(410);
        expect(expiredFile.json().error.code).toBe('FILE_EXPIRED');
        await db.mediaInspection.update({
          where: { id: info.inspectionId },
          data: { expiresAt: new Date(Date.now() - 1) },
        });
        const expiredCreation = await app.inject({
          method: 'POST',
          url: '/api/downloads',
          headers: { ...headers, cookie, 'idempotency-key': randomUUID() },
          payload: {
            inspectionId: info.inspectionId,
            format: 'mp4',
            quality: 'low',
            rightsConfirmed: true,
          },
          remoteAddress: '192.0.2.71',
        });
        expect(expiredCreation.statusCode).toBe(409);
        expect(expiredCreation.json().error.code).toBe('INSPECTION_EXPIRED');
        const foreign = await app.inject({
          method: 'POST',
          url: '/api/context',
          headers,
          payload: {},
          remoteAddress: '192.0.2.72',
        });
        const other = String(foreign.headers['set-cookie']).split(';')[0]!;
        expect(
          (
            await app.inject({
              url: pageInfo.thumbnailUrl,
              headers: { cookie: other },
              remoteAddress: '192.0.2.72',
            })
          ).statusCode,
        ).toBe(404);
        await db.mediaInspection.update({
          where: { id: pageInfo.inspectionId },
          data: { expiresAt: new Date(Date.now() - 1) },
        });
        expect(
          (
            await app.inject({
              url: pageInfo.thumbnailUrl,
              headers: { cookie },
              remoteAddress: '192.0.2.73',
            })
          ).statusCode,
        ).toBe(410);
        expect(
          (
            await app.inject({
              url: `/api/downloads/${id}/file`,
              headers: { cookie: other },
              remoteAddress: '192.0.2.72',
            })
          ).statusCode,
        ).toBe(404);
        const audio = await app.inject({
          method: 'POST',
          url: '/api/media/inspect',
          headers: { ...headers, cookie },
          payload: { url: 'http://fixture/audio.mp3' },
          remoteAddress: '192.0.2.71',
        });
        expect(audio.statusCode, audio.body).toBe(200);
        expect(audio.json().data.availableFormats).toEqual(['mp3']);
        expect(audio.json().data.warnings).toContain('SOURCE_QUALITY_LIMIT');
        const silent = await app.inject({
          method: 'POST',
          url: '/api/media/inspect',
          headers: { ...headers, cookie },
          payload: { url: 'http://fixture/silent.mp4' },
          remoteAddress: '192.0.2.71',
        });
        expect(silent.statusCode, silent.body).toBe(200);
        expect(silent.json().data.availableFormats).toEqual(['mp4']);
        const protectedSource = await app.inject({
          method: 'POST',
          url: '/api/media/inspect',
          headers: { ...headers, cookie },
          payload: { url: 'http://fixture/protected' },
          remoteAddress: '192.0.2.74',
        });
        expect(protectedSource.statusCode, protectedSource.body).toBe(422);
        expect(protectedSource.json().error.code).toBe('SOURCE_UNAVAILABLE');
        const began = Date.now();
        const timeout = await app.inject({
          method: 'POST',
          url: '/api/media/inspect',
          headers: { ...headers, cookie },
          payload: { url: 'http://fixture/drip.html' },
          remoteAddress: '192.0.2.74',
        });
        expect(timeout.statusCode, timeout.body).toBe(504);
        expect(timeout.json().error.code).toBe('INSPECTION_TIMEOUT');
        expect(Date.now() - began).toBeLessThan(31000);
      } finally {
        await app.close();
        redis.disconnect();
        await db.$disconnect();
      }
    }, 120000);
  },
);

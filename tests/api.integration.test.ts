import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/api/src/app.js';
import { readConfig } from '../apps/api/src/config.js';
import { createDatabase } from '../apps/api/src/infra/database.js';
import { RedisRateLimiter } from '../apps/api/src/infra/rate-limit.js';
import { hashToken } from '../apps/api/src/modules/context/service.js';

describe.skipIf(process.env.RUN_INTEGRATION !== '1')(
  'API com PostgreSQL e Redis reais',
  () => {
    const config = readConfig({
      DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
      REDIS_URL: 'redis://localhost:6379',
      ...process.env,
    });
    const db = createDatabase(config.DATABASE_URL);
    const redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      commandTimeout: 3000,
      lazyConnect: true,
    });
    let app: FastifyInstance;
    const contextIds: string[] = [];
    let ipSequence = 1;
    const origin = config.ORIGIN;
    const freshIp = () =>
      `198.18.${Math.floor(ipSequence / 250)}.${(ipSequence++ % 250) + 1}`;
    const headers = (cookie?: string) => ({
      origin,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    });
    async function visitor() {
      const response = await app.inject({
        method: 'POST',
        url: '/api/context',
        payload: {},
        headers: headers(),
        remoteAddress: freshIp(),
      });
      expect(response.statusCode).toBe(201);
      const cookie = response.cookies[0]!;
      const context = await db.anonymousContext.findUniqueOrThrow({
        where: { tokenHash: hashToken(cookie.value) },
      });
      contextIds.push(context.id);
      return {
        context,
        cookie: `${cookie.name}=${cookie.value}`,
        token: cookie.value,
        response,
      };
    }
    async function inspection(contextId: string, expired = false) {
      return db.mediaInspection.create({
        data: {
          contextId,
          sourceUrl: 'https://example.com/authorized.mp4',
          title: 'Mídia sintética autorizada',
          source: 'example.com',
          availableFormats: ['mp3', 'mp4'],
          metadata: {},
          expiresAt: new Date(Date.now() + (expired ? -10000 : 600000)),
        },
      });
    }
    async function create(
      v: Awaited<ReturnType<typeof visitor>>,
      inspectionId: string,
      key = randomUUID(),
      extra = {},
    ) {
      return app.inject({
        method: 'POST',
        url: '/api/downloads',
        headers: { ...headers(v.cookie), 'idempotency-key': key },
        payload: {
          inspectionId,
          format: 'mp4',
          quality: 'medium',
          rightsConfirmed: true,
          ...extra,
        },
        remoteAddress: freshIp(),
      });
    }
    async function fixtureJob(
      v: Awaited<ReturnType<typeof visitor>>,
      status: 'PENDING' | 'COMPLETED' | 'FAILED' = 'PENDING',
    ) {
      return db.downloadJob.create({
        data: {
          contextId: v.context.id,
          sourceUrl: 'https://example.com/authorized.mp4',
          title: 'Fixture autorizada',
          source: 'example.com',
          format: 'mp4',
          quality: 'medium',
          status,
          historyExpiresAt: v.context.expiresAt,
        },
      });
    }
    beforeAll(async () => {
      await db.$connect();
      await redis.ping();
      await mkdir(config.ARTIFACT_ROOT, { recursive: true });
      app = await buildApp({
        config,
        db,
        limiter: new RedisRateLimiter(redis),
        logger: false,
        checkHealth: async () => {
          await Promise.all([db.$queryRaw`SELECT 1`, redis.ping()]);
        },
      });
      await app.ready();
    });
    afterAll(async () => {
      // Somente registros criados por esta suíte; nunca limpar tabelas/volumes globais.
      await db.anonymousContext.deleteMany({
        where: { id: { in: contextIds } },
      });
      await app.close();
      await db.$disconnect();
      redis.disconnect();
    });
    it('emite capacidade, guarda só hash, reutiliza e expira', async () => {
      const v = await visitor();
      expect(v.token).toHaveLength(43);
      expect(v.context.tokenHash).not.toBe(v.token);
      expect(v.response.headers['set-cookie']).toContain('HttpOnly');
      expect(v.response.headers['set-cookie']).toContain('SameSite=Strict');
      expect(v.response.body).not.toContain(v.token);
      const reused = await app.inject({
        method: 'POST',
        url: '/api/context',
        headers: headers(v.cookie),
        payload: {},
        remoteAddress: freshIp(),
      });
      expect(reused.statusCode).toBe(200);
      expect(reused.json().data.expiresAt).toBe(
        v.context.expiresAt.toISOString(),
      );
      await db.anonymousContext.update({
        where: { id: v.context.id },
        data: { expiresAt: new Date(0) },
      });
      expect(
        (
          await app.inject({
            url: '/api/downloads',
            headers: headers(v.cookie),
            remoteAddress: freshIp(),
          })
        ).statusCode,
      ).toBe(403);
    });
    it('nega origem externa, JSON ausente, cookies inválidos e corpo excessivo', async () => {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/context',
            payload: {},
            headers: { origin: 'https://evil.example' },
            remoteAddress: freshIp(),
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/context',
            payload: 'text',
            headers: { origin },
            remoteAddress: freshIp(),
          })
        ).statusCode,
      ).toBe(415);
      for (const cookie of [undefined, 'videoflow_context=invalid'])
        expect(
          (
            await app.inject({
              url: '/api/downloads',
              headers: headers(cookie),
              remoteAddress: freshIp(),
            })
          ).statusCode,
        ).toBe(403);
      const large = await app.inject({
        method: 'POST',
        url: '/api/context',
        headers: headers(),
        payload: { value: 'x'.repeat(17000) },
        remoteAddress: freshIp(),
      });
      expect(large.statusCode).toBe(413);
      expect(large.json().error).toHaveProperty('requestId');
    });
    it('cria job + outbox atomicamente e trata idempotência', async () => {
      const v = await visitor();
      const media = await inspection(v.context.id);
      const key = randomUUID();
      const first = await create(v, media.id, key);
      expect(first.statusCode).toBe(202);
      const id = first.json().data.id;
      const second = await create(v, media.id, key);
      expect(second.json().data.id).toBe(id);
      expect(
        await db.downloadJob.count({ where: { contextId: v.context.id } }),
      ).toBe(1);
      expect(
        await db.outboxEvent.count({ where: { jobId: id, type: 'PROCESS' } }),
      ).toBe(1);
      expect(
        (await create(v, media.id, key, { format: 'mp3' })).statusCode,
      ).toBe(409);
      expect(
        (await create(v, media.id, randomUUID(), { extra: true })).statusCode,
      ).toBe(400);
      expect(
        (await create(v, (await inspection(v.context.id, true)).id)).statusCode,
      ).toBe(409);
    });
    it('reserva quota em criações concorrentes', async () => {
      const v = await visitor();
      const media = await inspection(v.context.id);
      const results = await Promise.all(
        Array.from({ length: 5 }, () => create(v, media.id)),
      );
      expect(results.filter((r) => r.statusCode === 202)).toHaveLength(3);
      expect(results.filter((r) => r.statusCode === 429)).toHaveLength(2);
      expect(
        await db.downloadJob.count({ where: { contextId: v.context.id } }),
      ).toBe(3);
    });
    it('isola listagem, indicadores, detalhes, ações e arquivos', async () => {
      const a = await visitor();
      const b = await visitor();
      const job = await fixtureJob(a);
      const list = await app.inject({
        url: '/api/downloads',
        headers: headers(b.cookie),
        remoteAddress: freshIp(),
      });
      expect(list.json().items).toEqual([]);
      expect(list.json().summary.total).toBe(0);
      for (const action of ['', '/file', '/cancel', '/retry']) {
        const mutation = action === '/cancel' || action === '/retry';
        const res = await app.inject({
          method: mutation ? 'POST' : 'GET',
          url: `/api/downloads/${job.id}${action}`,
          headers: { ...headers(b.cookie), 'idempotency-key': randomUUID() },
          ...(mutation ? { payload: {} } : {}),
          remoteAddress: freshIp(),
        });
        expect(res.statusCode).toBe(404);
        expect(res.body).not.toContain(job.title);
      }
      const foreign = await inspection(a.context.id);
      expect((await create(b, foreign.id)).statusCode).toBe(404);
    });
    it('busca, paginação e summary completo', async () => {
      const v = await visitor();
      for (let n = 0; n < 5; n++)
        await fixtureJob(v, n < 3 ? 'FAILED' : 'COMPLETED');
      const response = await app.inject({
        url: '/api/downloads?status=FAILED&pageSize=2&page=2&q=fixture&sort=title:asc',
        headers: headers(v.cookie),
        remoteAddress: freshIp(),
      });
      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.items).toHaveLength(1);
      expect(data.total).toBe(3);
      expect(data.summary.total).toBe(5);
      expect(data.summary.failed).toBe(3);
      expect(JSON.stringify(data)).not.toMatch(
        /tokenHash|sourceUrl|storageKey|leaseOwner/,
      );
    });
    it('cancelamento persistido, repetição idempotente e retry elegível', async () => {
      const v = await visitor();
      const pending = await fixtureJob(v);
      const cancel = () =>
        app.inject({
          method: 'POST',
          url: `/api/downloads/${pending.id}/cancel`,
          headers: headers(v.cookie),
          payload: {},
          remoteAddress: freshIp(),
        });
      expect((await cancel()).statusCode).toBe(202);
      expect((await cancel()).statusCode).toBe(200);
      expect(
        (await db.downloadJob.findUniqueOrThrow({ where: { id: pending.id } }))
          .cancelRequestedAt,
      ).not.toBeNull();
      const failed = await fixtureJob(v, 'FAILED');
      const key = randomUUID();
      const retry = () =>
        app.inject({
          method: 'POST',
          url: `/api/downloads/${failed.id}/retry`,
          headers: { ...headers(v.cookie), 'idempotency-key': key },
          payload: {},
          remoteAddress: freshIp(),
        });
      expect((await retry()).statusCode).toBe(202);
      expect((await retry()).statusCode).toBe(202);
      expect(
        (await db.downloadJob.findUniqueOrThrow({ where: { id: failed.id } }))
          .generation,
      ).toBe(2);
      const done = await fixtureJob(v, 'COMPLETED');
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/downloads/${done.id}/retry`,
            headers: { ...headers(v.cookie), 'idempotency-key': randomUUID() },
            payload: {},
            remoteAddress: freshIp(),
          })
        ).statusCode,
      ).toBe(409);
    });
    it('serve arquivo e Range, bloqueia expiração e symlink', async () => {
      const v = await visitor();
      const job = await fixtureJob(v, 'COMPLETED');
      const key = `${job.id}.mp4`;
      await writeFile(join(config.ARTIFACT_ROOT, key), '0123456789');
      await db.fileArtifact.create({
        data: {
          jobId: job.id,
          storageKey: key,
          mime: 'video/mp4',
          bytes: 10n,
          checksum: 'fixture',
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      const get = (range?: string) =>
        app.inject({
          url: `/api/downloads/${job.id}/file`,
          headers: { ...headers(v.cookie), ...(range ? { range } : {}) },
          remoteAddress: freshIp(),
        });
      expect((await get()).body).toBe('0123456789');
      const partial = await get('bytes=2-4');
      expect(partial.statusCode).toBe(206);
      expect(partial.body).toBe('234');
      expect((await get('bytes=99-')).statusCode).toBe(416);
      await db.fileArtifact.update({
        where: { jobId: job.id },
        data: { storageKey: '../outside.mp4' },
      });
      expect((await get()).statusCode).toBe(410);
      await db.fileArtifact.update({
        where: { jobId: job.id },
        data: { storageKey: 'missing.mp4' },
      });
      expect((await get()).statusCode).toBe(410);
      const link = `${job.id}-link.mp4`;
      await symlink(
        join(config.ARTIFACT_ROOT, key),
        join(config.ARTIFACT_ROOT, link),
      );
      await db.fileArtifact.update({
        where: { jobId: job.id },
        data: { storageKey: link },
      });
      expect((await get()).statusCode).toBe(410);
      await db.fileArtifact.update({
        where: { jobId: job.id },
        data: { storageKey: key, expiresAt: new Date(0) },
      });
      expect((await get()).json().error.code).toBe('FILE_EXPIRED');
      const detail = await app.inject({
        url: `/api/downloads/${job.id}`,
        headers: headers(v.cookie),
        remoteAddress: freshIp(),
      });
      expect(detail.json().data.status).toBe('EXPIRED');
    });
    it('limita por origem real mesmo com X-Forwarded-For forjado', async () => {
      const ip = freshIp();
      for (let n = 0; n < 10; n++) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/context',
          headers: { ...headers(), 'x-forwarded-for': `8.8.8.${n}` },
          payload: {},
          remoteAddress: ip,
        });
        const token = response.cookies[0]!.value;
        const c = await db.anonymousContext.findUniqueOrThrow({
          where: { tokenHash: hashToken(token) },
        });
        contextIds.push(c.id);
        expect(response.statusCode).toBe(201);
      }
      const limited = await app.inject({
        method: 'POST',
        url: '/api/context',
        headers: { ...headers(), 'x-forwarded-for': '1.1.1.1' },
        payload: {},
        remoteAddress: ip,
      });
      expect(limited.statusCode).toBe(429);
      expect(limited.headers['retry-after']).toBe('60');
    });
    it('saúde e OpenAPI documentam contratos reais', async () => {
      expect((await app.inject('/api/health')).json()).toEqual({
        status: 'ok',
      });
      const spec = (await app.inject('/api/openapi.json')).json();
      expect(spec.paths['/api/downloads'].post.requestBody).toBeDefined();
      expect(spec.paths['/api/downloads'].post.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            in: 'header',
            name: 'idempotency-key',
            required: true,
          }),
        ]),
      );
      expect(
        spec.paths['/api/downloads/{id}/file'].get.responses['200'].content[
          'video/mp4'
        ].schema.format,
      ).toBe('binary');
      expect(spec.paths['/api/downloads'].get.security).toEqual([
        { anonymousCapability: [] },
      ]);
      expect(spec.paths['/api/downloads/{id}']).toBeDefined();
    });
    it('conserva dados ao reconstruir a instância API', async () => {
      const v = await visitor();
      const job = await fixtureJob(v);
      const restarted = await buildApp({
        config,
        db,
        limiter: new RedisRateLimiter(redis),
        logger: false,
        checkHealth: async () => {
          await redis.ping();
        },
      });
      const response = await restarted.inject({
        url: `/api/downloads/${job.id}`,
        headers: headers(v.cookie),
        remoteAddress: freshIp(),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.id).toBe(job.id);
      await restarted.close();
    });
    it('impõe quota global e mantém integridade referencial', async () => {
      const v = await visitor();
      const media = await inspection(v.context.id);
      await db.downloadJob.createMany({
        data: Array.from({ length: 100 }, () => ({
          contextId: v.context.id,
          sourceUrl: 'https://example.com/media.mp4',
          title: 'Quota fixture',
          source: 'example.com',
          format: 'mp4',
          quality: 'medium',
          historyExpiresAt: v.context.expiresAt,
        })),
      });
      try {
        const other = await visitor();
        const inspected = await inspection(other.context.id);
        expect((await create(other, inspected.id)).json().error.code).toBe(
          'CAPACITY_EXCEEDED',
        );
        await expect(
          db.mediaInspection.create({
            data: {
              contextId: randomUUID(),
              sourceUrl: media.sourceUrl,
              title: 'FK inválida',
              source: media.source,
              availableFormats: ['mp4'],
              metadata: {},
              expiresAt: media.expiresAt,
            },
          }),
        ).rejects.toThrow();
      } finally {
        await db.downloadJob.deleteMany({ where: { contextId: v.context.id } });
      }
    });
    it('retorna saúde degradada e falha fechada sem Redis', async () => {
      const disconnected = new Redis(config.REDIS_URL, {
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      disconnected.disconnect();
      const degraded = await buildApp({
        config,
        db,
        limiter: new RedisRateLimiter(disconnected),
        logger: false,
        checkHealth: async () => {
          throw new Error('private connection detail');
        },
      });
      expect((await degraded.inject('/api/health')).statusCode).toBe(503);
      const response = await degraded.inject({
        method: 'POST',
        url: '/api/context',
        headers: headers(),
        payload: {},
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('RATE_LIMIT_UNAVAILABLE');
      expect(response.body).not.toContain('private connection detail');
      await degraded.close();
    });
    it('não divulga tokens e URLs em logs ou erros', async () => {
      let logs = '';
      const stream = new Writable({
        write(chunk, _encoding, done) {
          logs += chunk.toString();
          done();
        },
      });
      const logged = await buildApp({
        config,
        db,
        limiter: new RedisRateLimiter(redis),
        logger: { level: 'info', stream },
        checkHealth: async () => {},
      });
      const secret = 'private-secret';
      const response = await logged.inject({
        method: 'POST',
        url: `/api/context?secret=${secret}`,
        headers: { ...headers(), cookie: `videoflow_context=${secret}` },
        payload: { sourceUrl: `https://example.com/?secret=${secret}` },
        remoteAddress: freshIp(),
      });
      expect(response.statusCode).toBe(400);
      expect(response.body).not.toContain(secret);
      expect(logs).not.toContain(secret);
      expect(response.body).not.toMatch(/stack|sourceUrl|tokenHash/);
      await logged.close();
    });
    it('aplica cookie Secure em HTTPS e headers defensivos', async () => {
      const secureConfig = readConfig({
        ...process.env,
        ORIGIN: 'https://videoflow.example',
      });
      const secureApp = await buildApp({
        config: secureConfig,
        db,
        limiter: new RedisRateLimiter(redis),
        logger: false,
        checkHealth: async () => {},
      });
      const response = await secureApp.inject({
        method: 'POST',
        url: '/api/context',
        headers: {
          origin: secureConfig.ORIGIN,
          'content-type': 'application/json',
        },
        payload: {},
        remoteAddress: freshIp(),
      });
      expect(response.statusCode).toBe(201);
      const token = response.cookies[0]!.value;
      contextIds.push(
        (
          await db.anonymousContext.findUniqueOrThrow({
            where: { tokenHash: hashToken(token) },
          })
        ).id,
      );
      expect(response.headers['set-cookie']).toContain('Secure');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['access-control-allow-origin']).toBe(
        secureConfig.ORIGIN,
      );
      await secureApp.close();
    });
  },
);

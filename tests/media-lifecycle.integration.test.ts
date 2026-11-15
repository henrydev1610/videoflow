import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { DownloadRepository } from '../apps/api/src/modules/downloads/repository.js';
describe.skipIf(process.env.RUN_MEDIA !== '1')(
  'lifecycle real de mídia',
  () => {
    it.each([
      { path: 'redirect', code: 'SOURCE_BLOCKED' },
      { path: 'evil.m3u8', code: 'SOURCE_BLOCKED' },
      { path: 'invalid.mp4', code: 'PROCESS_FAILED' },
    ])(
      'não publica fonte adversa $path',
      async ({ path, code }) => {
        const db = new PrismaClient({
          adapter: new PrismaPg({
            connectionString: process.env.DATABASE_URL!,
          }),
        });
        const context = await db.anonymousContext.create({
          data: {
            tokenHash: randomUUID(),
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        try {
          const job = await db.downloadJob.create({
            data: {
              contextId: context.id,
              sourceUrl: `http://fixture/${path}`,
              title: 'Adversarial fixture',
              source: 'fixture',
              format: 'mp4',
              quality: 'low',
              historyExpiresAt: context.expiresAt,
              events: { create: { type: 'PROCESS', generation: 1 } },
            },
          });
          await expect
            .poll(
              async () =>
                (
                  await db.downloadJob.findUniqueOrThrow({
                    where: { id: job.id },
                  })
                ).status,
              { timeout: 20000, interval: 250 },
            )
            .toBe('FAILED');
          const result = await db.downloadJob.findUniqueOrThrow({
            where: { id: job.id },
            include: { artifact: true, attempts: true },
          });
          expect(result.errorCode).toBe(code);
          expect(result.artifact).toBeNull();
          expect(result.attempts).toHaveLength(1);
        } finally {
          await db.$disconnect();
        }
      },
      30000,
    );
    it('reconcilia mensagem perdida e rejeita MP3 quando a fonte não tem áudio', async () => {
      const db = new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
      });
      const context = await db.anonymousContext.create({
        data: {
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      try {
        const missing = await db.downloadJob.create({
          data: {
            contextId: context.id,
            sourceUrl: 'http://fixture/video.mp4',
            title: 'Missing queue fixture',
            source: 'fixture',
            format: 'mp4',
            quality: 'low',
            historyExpiresAt: context.expiresAt,
            events: {
              create: {
                type: 'PROCESS',
                generation: 1,
                deliveredAt: new Date(),
              },
            },
          },
        });
        await expect
          .poll(
            async () =>
              (
                await db.downloadJob.findUniqueOrThrow({
                  where: { id: missing.id },
                })
              ).status,
            { timeout: 90000, interval: 500 },
          )
          .toBe('COMPLETED');
        const silent = await db.downloadJob.create({
          data: {
            contextId: context.id,
            sourceUrl: 'http://fixture/silent.mp4',
            title: 'Changed source fixture',
            source: 'fixture',
            format: 'mp3',
            quality: 'high',
            historyExpiresAt: context.expiresAt,
            events: { create: { type: 'PROCESS', generation: 1 } },
          },
        });
        await expect
          .poll(
            async () =>
              (
                await db.downloadJob.findUniqueOrThrow({
                  where: { id: silent.id },
                })
              ).status,
            { timeout: 30000, interval: 500 },
          )
          .toBe('FAILED');
        const failed = await db.downloadJob.findUniqueOrThrow({
          where: { id: silent.id },
          include: { artifact: true },
        });
        expect(failed.errorCode).toBe('FORMAT_UNAVAILABLE');
        expect(failed.artifact).toBeNull();
        expect(failed.attemptCount).toBe(1);
      } finally {
        await db.$disconnect();
      }
    }, 130000);
    it.each([
      { path: 'slow.mp4', phase: 'DOWNLOADING' },
      { path: 'long.mp4', phase: 'PROCESSING' },
    ])(
      'cancela processo em $phase e impede artefato em até 10 segundos',
      async ({ path, phase }) => {
        const db = new PrismaClient({
          adapter: new PrismaPg({
            connectionString: process.env.DATABASE_URL!,
          }),
        });
        const context = await db.anonymousContext.create({
          data: {
            tokenHash: randomUUID(),
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        try {
          const job = await db.downloadJob.create({
            data: {
              contextId: context.id,
              sourceUrl: `http://fixture/${path}`,
              title: 'Cancellation fixture',
              source: 'fixture',
              format: 'mp4',
              quality: 'low',
              historyExpiresAt: context.expiresAt,
              events: { create: { type: 'PROCESS', generation: 1 } },
            },
          });
          await expect
            .poll(
              async () =>
                (
                  await db.downloadJob.findUniqueOrThrow({
                    where: { id: job.id },
                  })
                ).status,
              { timeout: 20000, interval: 100 },
            )
            .toBe(phase);
          const began = Date.now();
          const repository = new DownloadRepository(db);
          await repository.cancel(context.id, job.id);
          await expect
            .poll(
              async () =>
                (
                  await db.downloadJob.findUniqueOrThrow({
                    where: { id: job.id },
                  })
                ).leaseOwner,
              { timeout: 9500, interval: 100 },
            )
            .toBeNull();
          expect(Date.now() - began).toBeLessThan(10000);
          const ended = await db.downloadJob.findUniqueOrThrow({
            where: { id: job.id },
            include: { attempts: true, artifact: true },
          });
          expect(ended.status).toBe('CANCELLED');
          expect(ended.artifact).toBeNull();
          expect(ended.attempts[0]?.outcome).toBe('CANCELLED');
          expect(
            (await repository.cancel(context.id, job.id)).alreadyCancelled,
          ).toBe(true);
          console.log(
            JSON.stringify({
              jobId: job.id,
              cancellationMs: Date.now() - began,
            }),
          );
        } finally {
          await db.$disconnect();
        }
      },
      30000,
    );
    it('não repete falha permanente e admite retry manual no mesmo job', async () => {
      const db = new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
      });
      const context = await db.anonymousContext.create({
        data: {
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      try {
        const job = await db.downloadJob.create({
          data: {
            contextId: context.id,
            sourceUrl: `http://fixture/switch/${randomUUID()}.mp4`,
            title: 'Manual retry fixture',
            source: 'fixture',
            format: 'mp4',
            quality: 'low',
            historyExpiresAt: context.expiresAt,
            events: { create: { type: 'PROCESS', generation: 1 } },
          },
        });
        await expect
          .poll(
            async () =>
              (
                await db.downloadJob.findUniqueOrThrow({
                  where: { id: job.id },
                })
              ).status,
            { timeout: 15000 },
          )
          .toBe('FAILED');
        const repo = new DownloadRepository(db);
        const key = randomUUID();
        const first = await repo.retry(context.id, job.id, key);
        expect(first.id).toBe(job.id);
        expect((await repo.retry(context.id, job.id, key)).id).toBe(job.id);
        await expect
          .poll(
            async () =>
              (
                await db.downloadJob.findUniqueOrThrow({
                  where: { id: job.id },
                })
              ).status,
            { timeout: 30000 },
          )
          .toBe('COMPLETED');
        const attempts = await db.downloadAttempt.findMany({
          where: { jobId: job.id },
          orderBy: { sequence: 'asc' },
        });
        expect(attempts.map((a) => a.outcome)).toEqual(['FAILED', 'COMPLETED']);
        expect(attempts.map((a) => a.cycle)).toEqual([1, 2]);
      } finally {
        await db.$disconnect();
      }
    }, 60000);
    it('repete falhas transitórias com backoffs de 5 e 20 segundos', async () => {
      const db = new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
      });
      const context = await db.anonymousContext.create({
        data: {
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      try {
        const job = await db.downloadJob.create({
          data: {
            contextId: context.id,
            sourceUrl: `http://fixture/flaky/${randomUUID()}.mp4`,
            title: 'Transient fixture',
            source: 'fixture',
            format: 'mp4',
            quality: 'low',
            historyExpiresAt: context.expiresAt,
            events: { create: { type: 'PROCESS', generation: 1 } },
          },
        });
        await expect
          .poll(
            async () =>
              (
                await db.downloadJob.findUniqueOrThrow({
                  where: { id: job.id },
                })
              ).status,
            { timeout: 90000, interval: 500 },
          )
          .toBe('COMPLETED');
        const attempts = await db.downloadAttempt.findMany({
          where: { jobId: job.id },
          orderBy: { sequence: 'asc' },
        });
        expect(attempts).toHaveLength(3);
        expect(attempts.map((a) => a.outcome)).toEqual([
          'FAILED',
          'FAILED',
          'COMPLETED',
        ]);
        expect(
          attempts[1]!.startedAt.getTime() - attempts[0]!.finishedAt!.getTime(),
        ).toBeGreaterThanOrEqual(5000);
        expect(
          attempts[2]!.startedAt.getTime() - attempts[1]!.finishedAt!.getTime(),
        ).toBeGreaterThanOrEqual(20000);
        console.log(
          JSON.stringify({
            jobId: job.id,
            attempts: attempts.map((a) => ({
              sequence: a.sequence,
              outcome: a.outcome,
              startedAt: a.startedAt,
              finishedAt: a.finishedAt,
            })),
          }),
        );
      } finally {
        await db.$disconnect();
      }
    }, 100000);
  },
);

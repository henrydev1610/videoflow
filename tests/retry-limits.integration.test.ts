import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { finishFailure } from '../workers/media-worker/src/lifecycle.js';
import { commandSchema } from '../workers/media-worker/src/protocol.js';
import { DownloadRepository } from '../apps/api/src/modules/downloads/repository.js';
describe.skipIf(process.env.RUN_INTEGRATION !== '1')(
  'limites persistidos de retry',
  () => {
    it('esgota ciclo/total, serializa retry concorrente e revalida quota', async () => {
      const db = new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
      });
      const context = await db.anonymousContext.create({
        data: {
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      const repo = new DownloadRepository(db);
      const make = (attemptCount: number, cycle: number) =>
        db.downloadJob.create({
          data: {
            contextId: context.id,
            sourceUrl: 'https://example.com/',
            title: 'Retry fixture',
            source: 'fixture',
            format: 'mp4',
            quality: 'low',
            status: 'PROCESSING',
            leaseOwner: 'test',
            leaseExpiresAt: new Date(Date.now() + 30000),
            historyExpiresAt: context.expiresAt,
            attemptCount,
            cycle,
            attempts: {
              create: [1, 2, 3].map((n) => ({
                sequence: attemptCount - 3 + n,
                cycle,
                generation: n,
                finishedAt: n < 3 ? new Date() : null,
              })),
            },
            generation: 3,
          },
          include: { attempts: true },
        });
      try {
        for (const total of [3, 9]) {
          const job = await make(total, total / 3);
          const attempt = job.attempts.find((a) => a.finishedAt === null)!;
          await finishFailure(
            db,
            commandSchema.parse({
              version: 1,
              operationId: attempt.id,
              jobId: job.id,
              attemptId: attempt.id,
              generation: 3,
              operation: 'process',
              url: job.sourceUrl,
              format: 'mp4',
              quality: 'low',
              deadline: Date.now() + 30000,
            }),
            'test',
            'NETWORK_ERROR',
          );
          expect(
            (await db.downloadJob.findUniqueOrThrow({ where: { id: job.id } }))
              .status,
          ).toBe('FAILED');
          expect(await db.outboxEvent.count({ where: { jobId: job.id } })).toBe(
            0,
          );
          if (total === 9)
            await expect(
              repo.retry(context.id, job.id, randomUUID()),
            ).rejects.toMatchObject({ code: 'INVALID_STATE' });
          else {
            const result = await Promise.allSettled([
              repo.retry(context.id, job.id, randomUUID()),
              repo.retry(context.id, job.id, randomUUID()),
            ]);
            expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(
              1,
            );
            expect(
              await db.outboxEvent.count({ where: { jobId: job.id } }),
            ).toBe(1);
          }
        }
        for (let i = 0; i < 2; i++)
          await db.downloadJob.create({
            data: {
              contextId: context.id,
              sourceUrl: 'https://example.com/',
              title: 'Quota',
              source: 'fixture',
              format: 'mp4',
              quality: 'low',
              historyExpiresAt: context.expiresAt,
            },
          });
        const failed = await make(3, 1);
        await db.downloadJob.update({
          where: { id: failed.id },
          data: { status: 'FAILED', leaseOwner: null, leaseExpiresAt: null },
        });
        await expect(
          repo.retry(context.id, failed.id, randomUUID()),
        ).rejects.toMatchObject({ code: 'ACTIVE_LIMIT' });
      } finally {
        await db.anonymousContext.delete({ where: { id: context.id } });
        await db.$disconnect();
      }
    });
  },
);

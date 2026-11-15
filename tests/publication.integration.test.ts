import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  writeFile,
  access,
  utimes,
  rm,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { publish, cleanup } from '../workers/media-worker/src/lifecycle.js';
import { commandSchema } from '../workers/media-worker/src/protocol.js';
import { DownloadRepository } from '../apps/api/src/modules/downloads/repository.js';
describe.skipIf(process.env.RUN_INTEGRATION !== '1')(
  'janelas de publicação',
  () => {
    it.each(['staged', 'renamed', 'committed', 'cancelled'] as const)(
      'falha em %s preserva autorização e permite coleta de órfão',
      async (stage) => {
        const db = new PrismaClient({
          adapter: new PrismaPg({
            connectionString: process.env.DATABASE_URL!,
          }),
        });
        const root = await mkdtemp(join(tmpdir(), 'vf-publish-'));
        const temp = join(root, 'temp');
        const artifacts = join(root, 'artifacts');
        await mkdir(temp);
        await mkdir(artifacts);
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
              sourceUrl: 'https://example.com/',
              title: 'Publication fixture',
              source: 'fixture',
              format: 'mp4',
              quality: 'low',
              status: 'PROCESSING',
              generation: 1,
              leaseOwner: 'test',
              leaseExpiresAt: new Date(Date.now() + 30000),
              historyExpiresAt: context.expiresAt,
              attempts: { create: { sequence: 1, cycle: 1, generation: 1 } },
            },
            include: { attempts: true },
          });
          await mkdir(join(temp, job.id, '1'), { recursive: true });
          await writeFile(
            join(temp, job.id, '1', 'output.mp4'),
            'transaction-fixture',
          );
          const cmd = commandSchema.parse({
            version: 1,
            operationId: job.attempts[0]!.id,
            jobId: job.id,
            attemptId: job.attempts[0]!.id,
            generation: 1,
            operation: 'process',
            url: job.sourceUrl,
            format: 'mp4',
            quality: 'low',
            deadline: Date.now() + 30000,
          });
          await expect(
            publish(db, cmd, 'test', temp, artifacts, async (point) => {
              if (point === 'staged' && stage === 'cancelled')
                await new DownloadRepository(db).cancel(context.id, job.id);
              if (point === stage) throw new Error('crash checkpoint');
            }),
          ).rejects.toThrow(
            stage === 'cancelled' ? 'STALE_EXECUTION' : 'crash checkpoint',
          );
          const after = await db.downloadJob.findUniqueOrThrow({
            where: { id: job.id },
            include: { artifact: true },
          });
          if (stage === 'committed') {
            expect(after.status).toBe('COMPLETED');
            expect(after.artifact).not.toBeNull();
            await access(join(artifacts, after.artifact!.storageKey));
            await expect(
              new DownloadRepository(db).cancel(context.id, job.id),
            ).rejects.toMatchObject({ code: 'INVALID_STATE' });
          } else {
            expect(after.status).toBe(
              stage === 'cancelled' ? 'CANCELLED' : 'PROCESSING',
            );
            expect(after.artifact).toBeNull();
            await db.downloadJob.update({
              where: { id: job.id },
              data: {
                status: 'FAILED',
                leaseOwner: null,
                leaseExpiresAt: null,
              },
            });
            const file = join(
              artifacts,
              `${job.id}-1.mp4${stage === 'staged' || stage === 'cancelled' ? '.staging' : ''}`,
            );
            await utimes(file, new Date(0), new Date(0));
            await cleanup(db, artifacts);
            await expect(access(file)).rejects.toThrow();
          }
        } finally {
          await db.anonymousContext.delete({ where: { id: context.id } });
          await db.$disconnect();
          await rm(root, { recursive: true, force: true });
        }
      },
    );
  },
);

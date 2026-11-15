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
import {
  cleanup,
  cleanupTemporary,
} from '../workers/media-worker/src/lifecycle.js';
describe.skipIf(process.env.RUN_INTEGRATION !== '1')(
  'retenção persistente',
  () => {
    it('expira arquivo, conserva histórico e lease e remove órfãos seguros', async () => {
      const db = new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
      });
      const root = await mkdtemp(join(tmpdir(), 'vf-cleanup-'));
      const artifactRoot = join(root, 'artifacts');
      const temporary = join(root, 'temp');
      await mkdir(artifactRoot);
      await mkdir(temporary);
      const context = await db.anonymousContext.create({
        data: {
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      try {
        const expiredContext = await db.anonymousContext.create({
          data: {
            tokenHash: randomUUID(),
            expiresAt: new Date(Date.now() - 1000),
          },
        });
        const inspection = await db.mediaInspection.create({
          data: {
            contextId: expiredContext.id,
            sourceUrl: 'https://example.com/',
            title: 'Expired',
            source: 'fixture',
            availableFormats: ['mp4'],
            metadata: {},
            expiresAt: new Date(Date.now() - 1),
          },
        });
        await writeFile(
          join(artifactRoot, `${inspection.id}.thumbnail`),
          'fixture',
        );
        const job = await db.downloadJob.create({
          data: {
            contextId: context.id,
            sourceUrl: 'https://example.com/',
            title: 'Retention fixture',
            source: 'fixture',
            format: 'mp4',
            quality: 'low',
            status: 'COMPLETED',
            historyExpiresAt: context.expiresAt,
            artifact: {
              create: {
                storageKey: `${randomUUID()}-1.mp4`,
                mime: 'video/mp4',
                bytes: 4n,
                checksum: 'fixture',
                expiresAt: new Date(Date.now() - 1000),
              },
            },
          },
          include: { artifact: true },
        });
        await writeFile(join(artifactRoot, job.artifact!.storageKey), 'test');
        const valid = await db.downloadJob.create({
          data: {
            contextId: context.id,
            sourceUrl: 'https://example.com/',
            title: 'Valid retention fixture',
            source: 'fixture',
            format: 'mp4',
            quality: 'low',
            status: 'COMPLETED',
            historyExpiresAt: context.expiresAt,
            artifact: {
              create: {
                storageKey: `${randomUUID()}-1.mp4`,
                mime: 'video/mp4',
                bytes: 4n,
                checksum: 'fixture',
                expiresAt: new Date(Date.now() + 86400000),
              },
            },
          },
          include: { artifact: true },
        });
        await writeFile(join(artifactRoot, valid.artifact!.storageKey), 'keep');
        await cleanup(db, artifactRoot);
        await access(join(artifactRoot, valid.artifact!.storageKey));
        expect(
          (await db.downloadJob.findUniqueOrThrow({ where: { id: valid.id } }))
            .status,
        ).toBe('COMPLETED');
        expect(
          await db.mediaInspection.findUnique({ where: { id: inspection.id } }),
        ).toBeNull();
        expect(
          await db.anonymousContext.findUnique({
            where: { id: expiredContext.id },
          }),
        ).toBeNull();
        await expect(
          access(join(artifactRoot, `${inspection.id}.thumbnail`)),
        ).rejects.toThrow();
        expect(
          (await db.downloadJob.findUniqueOrThrow({ where: { id: job.id } }))
            .status,
        ).toBe('EXPIRED');
        await expect(
          access(join(artifactRoot, job.artifact!.storageKey)),
        ).rejects.toThrow();
        const active = await db.downloadJob.create({
          data: {
            contextId: context.id,
            sourceUrl: 'https://example.com/',
            title: 'Active fixture',
            source: 'fixture',
            format: 'mp4',
            quality: 'low',
            status: 'DOWNLOADING',
            leaseOwner: 'live',
            leaseExpiresAt: new Date(Date.now() + 30000),
            historyExpiresAt: context.expiresAt,
          },
        });
        const live = join(temporary, active.id);
        const orphan = join(temporary, randomUUID());
        await mkdir(live);
        await mkdir(orphan);
        await writeFile(join(live, 'keep'), 'data');
        const old = new Date(Date.now() - 3600000);
        const commands = join(root, 'commands');
        await mkdir(commands);
        const abandonedControl = join(commands, `${randomUUID()}.control.json`);
        await writeFile(abandonedControl, '{}');
        await utimes(abandonedControl, old, old);
        await utimes(live, old, old);
        await utimes(orphan, old, old);
        await cleanupTemporary(
          db,
          temporary,
          join(root, 'commands'),
          join(root, 'results'),
        );
        await access(join(live, 'keep'));
        await expect(access(abandonedControl)).rejects.toThrow();
        await expect(access(orphan)).rejects.toThrow();
        await db.downloadJob.update({
          where: { id: job.id },
          data: { historyExpiresAt: new Date(Date.now() - 1000) },
        });
        await cleanup(db, artifactRoot);
        expect(
          await db.downloadJob.findUnique({ where: { id: job.id } }),
        ).toBeNull();
      } finally {
        await db.anonymousContext.delete({ where: { id: context.id } });
        await db.$disconnect();
        await rm(root, { recursive: true, force: true });
      }
    });
  },
);

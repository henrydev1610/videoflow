import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  mediaQueue,
  dispatch,
  consume,
  deliveryId,
} from '../workers/media-worker/src/queue.js';
import {
  acquire,
  heartbeat,
  progress,
} from '../workers/media-worker/src/execution.js';
describe.skipIf(process.env.RUN_INTEGRATION !== '1')(
  'outbox e consumidores reais',
  () => {
    it('tolera crash após enqueue, duplicação e geração antiga; limita dois workers', async () => {
      const db = new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
      });
      const name = `test-media-${randomUUID()}`;
      const queue = mediaQueue(process.env.REDIS_URL!, name);
      const context = await db.anonymousContext.create({
        data: {
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      let worker: ReturnType<typeof consume> | undefined;
      let secondWorker: ReturnType<typeof consume> | undefined;
      try {
        const jobs = [];
        for (let i = 0; i < 3; i++)
          jobs.push(
            await db.downloadJob.create({
              data: {
                contextId: context.id,
                sourceUrl: 'https://example.com/media.mp4',
                title: 'fixture',
                source: 'fixture',
                format: 'mp4',
                quality: 'low',
                historyExpiresAt: context.expiresAt,
                events: { create: { generation: 1, type: 'PROCESS' } },
              },
            }),
          );
        expect(
          await acquire(
            db,
            { jobId: jobs[0]!.id, generation: 1 },
            'disk-test',
            async () => 1,
          ),
        ).toBeNull();
        await expect(
          dispatch(
            db,
            queue,
            async () => {},
            async () => {
              throw new Error('simulated crash');
            },
          ),
        ).rejects.toThrow('simulated crash');
        await dispatch(db, queue, async () => {});
        await dispatch(db, queue, async () => {});
        const acquired: string[] = [];
        worker = consume(
          process.env.REDIS_URL!,
          async (delivery) => {
            const execution = await acquire(db, delivery, randomUUID());
            if (execution) acquired.push(execution.id);
          },
          name,
        );
        await worker.waitUntilReady();
        secondWorker = consume(
          process.env.REDIS_URL!,
          async (delivery) => {
            const execution = await acquire(db, delivery, randomUUID());
            if (execution) acquired.push(execution.id);
          },
          name,
        );
        await secondWorker.waitUntilReady();
        await expect.poll(() => acquired.length, { timeout: 10000 }).toBe(2);
        expect(new Set(acquired).size).toBe(2);
        const first = jobs[0]!;
        const state = await db.downloadJob.findUniqueOrThrow({
          where: { id: first.id },
        });
        expect(state.attemptCount).toBeLessThanOrEqual(1);
        expect(
          await queue.getJob(deliveryId({ jobId: first.id, generation: 1 })),
        ).toBeTruthy();
        expect(
          await acquire(db, { jobId: first.id, generation: 1 }, 'duplicate'),
        ).toBeNull();
        const active = await db.downloadJob.findFirstOrThrow({
          where: { contextId: context.id, leaseOwner: { not: null } },
        });
        const message = { jobId: active.id, generation: active.generation };
        expect(await heartbeat(db, message, active.leaseOwner!)).toBe(true);
        await db.downloadJob.update({
          where: { id: active.id },
          data: { leaseExpiresAt: new Date(Date.now() - 1) },
        });
        expect(await heartbeat(db, message, active.leaseOwner!)).toBe(false);
        expect(
          await progress(
            db,
            message,
            active.leaseOwner!,
            'PROCESSING',
            80,
            false,
          ),
        ).toBe(false);
        await db.downloadJob.update({
          where: { id: active.id },
          data: { leaseExpiresAt: new Date(Date.now() + 30000) },
        });
        expect(
          await progress(
            db,
            { ...message, generation: 99 },
            active.leaseOwner!,
            'PROCESSING',
            99,
            false,
          ),
        ).toBe(false);
        await db.downloadJob.update({
          where: { id: active.id },
          data: { status: 'CANCELLED' },
        });
        expect(await heartbeat(db, message, active.leaseOwner!)).toBe(false);
        expect(
          await progress(
            db,
            message,
            active.leaseOwner!,
            'PROCESSING',
            99,
            false,
          ),
        ).toBe(false);
      } finally {
        await secondWorker?.close();
        await worker?.close();
        await queue.obliterate({ force: true });
        await queue.close();
        await db.anonymousContext.delete({ where: { id: context.id } });
        await db.$disconnect();
      }
    }, 20000);
  },
);

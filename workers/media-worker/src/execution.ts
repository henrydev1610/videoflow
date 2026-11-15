import type { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { Delivery } from './queue.js';
export const leaseMs = 30000;
export async function executionLock(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`INSERT INTO "QuotaCounter" ("key", "active") VALUES ('executions',0) ON CONFLICT ("key") DO NOTHING`;
  await tx.$queryRaw`SELECT "key" FROM "QuotaCounter" WHERE "key"='executions' FOR UPDATE`;
}
export async function acquire(
  db: PrismaClient,
  message: Delivery,
  owner: string,
  availableBytes?: () => Promise<number>,
) {
  return db.$transaction(async (tx) => {
    await executionLock(tx);
    // Expired leases still occupy slots until reconciliation confirms termination or waits the kill grace.
    const active = await tx.downloadJob.count({
      where: { leaseOwner: { not: null } },
    });
    if (active >= 2) return null;
    if (
      availableBytes &&
      (await availableBytes()) < (active + 1) * 3 * 1024 ** 3 + 1024 ** 3
    )
      return null;
    const job = await tx.downloadJob.findFirst({
      where: {
        id: message.jobId,
        generation: message.generation,
        status: 'PENDING',
        leaseOwner: null,
        attemptCount: { lt: 9 },
        historyExpiresAt: { gt: new Date() },
      },
    });
    if (!job) return null;
    const attemptId = randomUUID();
    const changed = await tx.downloadJob.updateMany({
      where: {
        id: job.id,
        generation: job.generation,
        status: 'PENDING',
        leaseOwner: null,
      },
      data: {
        status: 'DOWNLOADING',
        leaseOwner: owner,
        leaseExpiresAt: new Date(Date.now() + leaseMs),
        attemptCount: { increment: 1 },
        progress: 0,
        progressIndeterminate: true,
      },
    });
    if (!changed.count) return null;
    await tx.downloadAttempt.create({
      data: {
        id: attemptId,
        jobId: job.id,
        sequence: job.attemptCount + 1,
        cycle: job.cycle,
        generation: job.generation,
      },
    });
    return { ...job, attemptId, leaseOwner: owner };
  });
}
export async function heartbeat(
  db: PrismaClient,
  message: Delivery,
  owner: string,
) {
  return (
    (
      await db.downloadJob.updateMany({
        where: {
          id: message.jobId,
          generation: message.generation,
          leaseOwner: owner,
          leaseExpiresAt: { gt: new Date() },
          status: { in: ['DOWNLOADING', 'PROCESSING'] },
        },
        data: { leaseExpiresAt: new Date(Date.now() + leaseMs) },
      })
    ).count === 1
  );
}
export async function progress(
  db: PrismaClient,
  message: Delivery,
  owner: string,
  state: 'DOWNLOADING' | 'PROCESSING',
  percent: number,
  indeterminate: boolean,
) {
  return (
    (
      await db.downloadJob.updateMany({
        where: {
          id: message.jobId,
          generation: message.generation,
          leaseOwner: owner,
          leaseExpiresAt: { gt: new Date() },
          status: {
            in:
              state === 'PROCESSING'
                ? ['DOWNLOADING', 'PROCESSING']
                : ['DOWNLOADING'],
          },
        },
        data: {
          status: state,
          progress: Math.max(0, Math.min(99, Math.floor(percent))),
          progressIndeterminate: indeterminate,
        },
      })
    ).count === 1
  );
}

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
try {
  if (process.argv[2] === 'seed') {
    const context = await db.anonymousContext.create({
      data: {
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const job = await db.downloadJob.create({
      data: {
        contextId: context.id,
        sourceUrl: `http://fixture/recover/${randomUUID()}.mp4`,
        title: 'Recovery fixture',
        source: 'fixture',
        format: 'mp4',
        quality: 'low',
        historyExpiresAt: context.expiresAt,
        events: { create: { type: 'PROCESS', generation: 1 } },
      },
    });
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (
        (await db.downloadJob.findUniqueOrThrow({ where: { id: job.id } }))
          .status === 'DOWNLOADING'
      ) {
        await delay(1500);
        console.log(JSON.stringify({ jobId: job.id, readyForKill: true }));
        break;
      }
      await delay(100);
    }
  } else {
    const id = process.argv[2]!;
    const begin = Date.now();
    while (Date.now() - begin < 120000) {
      const job = await db.downloadJob.findUniqueOrThrow({
        where: { id },
        include: { attempts: { orderBy: { sequence: 'asc' } }, artifact: true },
      });
      if (job.status === 'COMPLETED') {
        assert.ok(job.artifact);
        assert.ok(job.attempts.length >= 2);
        assert.ok(
          job.attempts.some((a) => a.errorCode === 'WORKER_INTERRUPTED'),
        );
        console.log(
          JSON.stringify({
            jobId: id,
            recoveredMs: Date.now() - begin,
            attempts: job.attempts.map((a) => ({
              outcome: a.outcome,
              code: a.errorCode,
              generation: a.generation,
            })),
          }),
        );
        break;
      }
      if (Date.now() - begin > 119000) throw new Error('RECOVERY_TIMEOUT');
      await delay(500);
    }
  }
} finally {
  await db.$disconnect();
}

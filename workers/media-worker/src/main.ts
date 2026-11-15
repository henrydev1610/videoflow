import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir, rm, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { SandboxClient } from './client.js';
import { mediaQueue, consume, dispatch } from './queue.js';
import { acquire, heartbeat, progress } from './execution.js';
import { commandSchema } from './protocol.js';
import {
  publish,
  finishFailure,
  reconcile,
  cleanup,
  cleanupTemporary,
} from './lifecycle.js';
import { MediaError } from './supervisor.js';
import { inspectionWorker } from './inspection.js';
import { verifyOutputEvidence } from './evidence.js';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const redis = process.env.REDIS_URL!;
const queue = mediaQueue(redis);
await queue.setGlobalConcurrency(2);
const spool = new SandboxClient(
  process.env.COMMAND_ROOT ?? '/spool/commands',
  process.env.RESULT_ROOT ?? '/spool/results',
);
const temp = process.env.TEMP_ROOT ?? '/media/temp';
const artifacts = process.env.ARTIFACT_ROOT ?? '/media/artifacts';
const owner = randomUUID();
await mkdir(temp, { recursive: true });
await mkdir(artifacts, { recursive: true });
const inspector = await inspectionWorker(db, redis, spool, temp, artifacts);
const worker = consume(redis, async (message) => {
  const execution = await acquire(db, message, owner, async () => {
    const disk = await statfs(temp);
    return disk.bavail * disk.bsize;
  });
  if (!execution) return;
  const cmd = commandSchema.parse({
    version: 1,
    operationId: execution.attemptId,
    jobId: execution.id,
    attemptId: execution.attemptId,
    generation: execution.generation,
    operation: 'process',
    url: execution.sourceUrl,
    format: execution.format,
    quality: execution.quality,
    deadline: Date.now() + 1800000,
  });
  try {
    const result = await spool.run(
      cmd,
      () => heartbeat(db, message, owner),
      async (result) => {
        if (result.state === 'DOWNLOADING' || result.state === 'PROCESSING')
          await progress(
            db,
            message,
            owner,
            result.state,
            result.progress,
            result.indeterminate,
          );
      },
    );
    await verifyOutputEvidence(cmd, result.metadata, temp);
    await publish(db, cmd, owner, temp, artifacts);
    await rm(join(temp, cmd.jobId, String(cmd.generation)), {
      recursive: true,
      force: true,
    });
    console.log(
      JSON.stringify({
        event: 'completed',
        jobId: cmd.jobId,
        generation: cmd.generation,
      }),
    );
  } catch (error) {
    const code = error instanceof MediaError ? error.code : 'INTERNAL_ERROR';
    if (!['SANDBOX_UNAVAILABLE', 'INVALID_MESSAGE'].includes(code)) {
      await finishFailure(db, cmd, owner, code);
      await rm(join(temp, cmd.jobId, String(cmd.generation)), {
        recursive: true,
        force: true,
      });
    }
    console.log(
      JSON.stringify({ event: 'attempt_failed', jobId: cmd.jobId, code }),
    );
  }
});
worker.on('error', () =>
  console.error(JSON.stringify({ event: 'queue_unavailable' })),
);
let busy = false;
let lastReconcile = 0;
let lastCleanup = 0;
const tick = async () => {
  if (busy) return;
  busy = true;
  try {
    await dispatch(db, queue, async (message) => {
      const attempt = await db.downloadAttempt.findFirst({
        where: {
          jobId: message.jobId,
          generation: message.generation,
          finishedAt: null,
        },
      });
      const job = await db.downloadJob.findUnique({
        where: { id: message.jobId },
      });
      if (attempt && job)
        await spool.cancel(
          commandSchema.parse({
            version: 1,
            operationId: attempt.id,
            jobId: job.id,
            attemptId: attempt.id,
            generation: job.generation,
            operation: 'process',
            url: job.sourceUrl,
            format: job.format,
            quality: job.quality,
            deadline: Date.now() + 10000,
          }),
        );
    });
    if (Date.now() - lastReconcile > 30000) {
      await db.$transaction(
        async (tx) => {
          const locks = await tx.$queryRaw<
            Array<{ locked: boolean }>
          >`SELECT pg_try_advisory_xact_lock(7194201) AS locked`;
          if (locks[0]?.locked) await reconcile(db, queue, temp);
        },
        { timeout: 60000 },
      );
      lastReconcile = Date.now();
    }
    if (Date.now() - lastCleanup > 300000) {
      await db.$transaction(
        async (tx) => {
          const locks = await tx.$queryRaw<
            Array<{ locked: boolean }>
          >`SELECT pg_try_advisory_xact_lock(7194202) AS locked`;
          if (locks[0]?.locked) {
            await cleanup(db, artifacts);
            await cleanupTemporary(db, temp, spool.commands, spool.results);
          }
        },
        { timeout: 60000 },
      );
      lastCleanup = Date.now();
    }
    await writeFile('/tmp/worker-heartbeat', String(Date.now()));
  } catch {
    console.error(JSON.stringify({ event: 'coordination_unavailable' }));
  } finally {
    busy = false;
  }
};
const timer = setInterval(() => void tick(), 1000);
await tick();
process.on('SIGTERM', () => {
  clearInterval(timer);
  void inspector.worker.close().then(() => inspector.queue.close());
  void worker
    .close()
    .then(() => queue.close())
    .then(() => db.$disconnect());
});

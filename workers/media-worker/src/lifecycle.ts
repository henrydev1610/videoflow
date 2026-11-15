import type { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import {
  mkdir,
  open,
  rename,
  unlink,
  lstat,
  readdir,
  rm,
  realpath,
} from 'node:fs/promises';
import { resolve, sep, join } from 'node:path';
import type { Queue } from 'bullmq';
import { deliveryId } from './queue.js';
import type { Command } from './protocol.js';
import { executionLock } from './execution.js';
import { MediaError } from './supervisor.js';
export async function safeFile(root: string, segments: string[]) {
  const base = await realpath(root);
  let path = base;
  for (const part of segments) {
    if (!/^[a-zA-Z0-9._-]+$/.test(part) || part === '.' || part === '..')
      throw new MediaError('INVALID_PATH');
    path = join(path, part);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new MediaError('INVALID_PATH');
  }
  const actual = await realpath(path);
  if (!actual.startsWith(base + sep)) throw new MediaError('INVALID_PATH');
  return actual;
}
export async function publish(
  db: PrismaClient,
  cmd: Command,
  owner: string,
  tempRoot: string,
  artifactRoot: string,
  checkpoint?: (stage: 'staged' | 'renamed' | 'committed') => Promise<void>,
) {
  const input = await safeFile(tempRoot, [
    cmd.jobId,
    String(cmd.generation),
    `output.${cmd.format}`,
  ]);
  await mkdir(artifactRoot, { recursive: true });
  const base = await realpath(artifactRoot);
  const key = `${cmd.jobId}-${cmd.generation}.${cmd.format}`;
  const staging = join(base, `${key}.staging`);
  const target = join(base, key);
  const source = await open(input, constants.O_RDONLY | constants.O_NOFOLLOW);
  const destination = await open(staging, 'wx', 0o600);
  const digest = createHash('sha256');
  let bytes = 0;
  try {
    for await (const chunk of source.createReadStream()) {
      const buffer = chunk as Buffer;
      bytes += buffer.length;
      if (bytes > 1024 ** 3) throw new MediaError('OUTPUT_LIMIT');
      digest.update(buffer);
      await destination.writeFile(buffer);
    }
    await destination.sync();
  } finally {
    await source.close();
    await destination.close();
  }
  if (!bytes) throw new MediaError('INVALID_MEDIA');
  const checksum = digest.digest('hex');
  await checkpoint?.('staged');
  await db.$transaction(async (tx) => {
    const changed = await tx.downloadJob.updateMany({
      where: {
        id: cmd.jobId,
        generation: cmd.generation,
        leaseOwner: owner,
        leaseExpiresAt: { gt: new Date() },
        status: 'PROCESSING',
      },
      data: {
        status: 'COMPLETED',
        progress: 100,
        progressIndeterminate: false,
        completedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
    if (!changed.count) throw new MediaError('STALE_EXECUTION');
    await rename(staging, target);
    await checkpoint?.('renamed');
    await tx.fileArtifact.create({
      data: {
        jobId: cmd.jobId,
        storageKey: key,
        mime: cmd.format === 'mp3' ? 'audio/mpeg' : 'video/mp4',
        bytes: BigInt(bytes),
        checksum,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await tx.downloadAttempt.update({
      where: { id: cmd.attemptId },
      data: { finishedAt: new Date(), outcome: 'COMPLETED' },
    });
  });
  await checkpoint?.('committed');
}
const transient = new Set([
  'PROCESS_TIMEOUT',
  'WORKER_INTERRUPTED',
  'NETWORK_ERROR',
  'SANDBOX_UNAVAILABLE',
  'STATE_UNAVAILABLE',
]);
export async function finishFailure(
  db: PrismaClient,
  cmd: Command,
  owner: string,
  code: string,
) {
  await db.$transaction(async (tx) => {
    await executionLock(tx);
    const job = await tx.downloadJob.findFirst({
      where: { id: cmd.jobId, generation: cmd.generation, leaseOwner: owner },
    });
    if (!job) return;
    const count = await tx.downloadAttempt.count({
      where: { jobId: job.id, cycle: job.cycle },
    });
    const retry =
      job.status !== 'CANCELLED' &&
      transient.has(code) &&
      count < 3 &&
      job.attemptCount < 9 &&
      job.historyExpiresAt > new Date();
    await tx.downloadAttempt.updateMany({
      where: { id: cmd.attemptId, finishedAt: null },
      data: {
        finishedAt: new Date(),
        outcome: job.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
        errorCode: code,
        errorMessage: 'Não foi possível concluir esta tentativa.',
      },
    });
    if (!['DOWNLOADING', 'PROCESSING', 'CANCELLED'].includes(job.status))
      return;
    await tx.downloadJob.update({
      where: { id: job.id },
      data: {
        status:
          job.status === 'CANCELLED'
            ? 'CANCELLED'
            : retry
              ? 'PENDING'
              : 'FAILED',
        generation: retry ? { increment: 1 } : undefined,
        leaseOwner: null,
        leaseExpiresAt: null,
        errorCode: code,
        errorMessage: 'Não foi possível concluir esta tentativa.',
        progress: 0,
        progressIndeterminate: true,
      },
    });
    if (retry)
      await tx.outboxEvent.create({
        data: {
          jobId: job.id,
          generation: job.generation + 1,
          type: 'PROCESS',
          createdAt: new Date(Date.now() + (count === 1 ? 5000 : 20000)),
        },
      });
  });
}
export async function reconcile(
  db: PrismaClient,
  queue: Queue,
  tempRoot: string,
) {
  const expired = await db.downloadJob.findMany({
    where: {
      leaseOwner: { not: null },
      leaseExpiresAt: { lt: new Date(Date.now() - 10000) },
    },
  });
  for (const job of expired) {
    const attempt = await db.downloadAttempt.findFirst({
      where: { jobId: job.id, generation: job.generation, finishedAt: null },
    });
    if (!attempt) continue;
    const directory = resolve(tempRoot, job.id, String(job.generation));
    if (!directory.startsWith(resolve(tempRoot) + sep))
      throw new MediaError('INVALID_PATH');
    await rm(directory, { recursive: true, force: true });
    await finishFailure(
      db,
      {
        version: 1,
        operationId: attempt.id,
        jobId: job.id,
        attemptId: attempt.id,
        generation: job.generation,
        operation: 'process',
        url: job.sourceUrl,
        format: job.format as 'mp3' | 'mp4',
        quality: job.quality as 'low' | 'medium' | 'high',
        deadline: 1,
      },
      job.leaseOwner!,
      'WORKER_INTERRUPTED',
    );
  }
  const pending = await db.downloadJob.findMany({
    where: { status: 'PENDING' },
    take: 100,
  });
  for (const job of pending) {
    const event = await db.outboxEvent.findUnique({
      where: {
        jobId_generation_type: {
          jobId: job.id,
          generation: job.generation,
          type: 'PROCESS',
        },
      },
    });
    if (event && event.createdAt > new Date()) continue;
    const delivery = { jobId: job.id, generation: job.generation };
    const queued = await queue.getJob(deliveryId(delivery));
    const stale =
      queued && ['completed', 'failed'].includes(await queued.getState());
    if (stale) await queued.remove();
    if (!queued || stale)
      await queue.add('process', delivery, {
        jobId: deliveryId(delivery),
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
  }
}
export async function cleanup(
  db: PrismaClient,
  artifactRoot: string,
  now = new Date(),
) {
  await mkdir(artifactRoot, { recursive: true });
  const expired = await db.fileArtifact.findMany({
    where: { expiresAt: { lte: now } },
  });
  for (const artifact of expired) {
    try {
      await unlink(await safeFile(artifactRoot, [artifact.storageKey]));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') continue;
    }
    await db.downloadJob.updateMany({
      where: { id: artifact.jobId, status: 'COMPLETED' },
      data: { status: 'EXPIRED' },
    });
  }
  for (const file of await readdir(artifactRoot)) {
    if (!/^[a-f0-9-]+-\d+\.(mp3|mp4)(\.staging)?$/.test(file)) continue;
    const info = await lstat(join(artifactRoot, file));
    if (info.mtimeMs > Date.now() - 900000) continue;
    const exists = await db.fileArtifact.findUnique({
      where: { storageKey: file },
    });
    if (exists) continue;
    const jobId = file.slice(0, 36);
    if (
      await db.downloadJob.count({
        where: { id: jobId, leaseOwner: { not: null } },
      })
    )
      continue;
    await unlink(await safeFile(artifactRoot, [file]));
  }
  const inspections = await db.mediaInspection.findMany({
    where: { expiresAt: { lte: now } },
  });
  for (const inspection of inspections) {
    try {
      await unlink(
        await safeFile(artifactRoot, [`${inspection.id}.thumbnail`]),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') continue;
    }
    await db.mediaInspection.delete({ where: { id: inspection.id } });
  }
  const histories = await db.downloadJob.findMany({
    where: { historyExpiresAt: { lte: now }, leaseOwner: null },
    include: { artifact: true },
  });
  for (const job of histories) {
    if (job.artifact) {
      try {
        await unlink(await safeFile(artifactRoot, [job.artifact.storageKey]));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') continue;
      }
    }
    await db.downloadJob.deleteMany({
      where: { id: job.id, leaseOwner: null },
    });
  }
  await db.anonymousContext.deleteMany({
    where: {
      expiresAt: { lte: now },
      jobs: { none: {} },
      inspections: { none: {} },
    },
  });
}
export async function cleanupTemporary(
  db: PrismaClient,
  tempRoot: string,
  commands: string,
  results: string,
) {
  await mkdir(tempRoot, { recursive: true });
  for (const id of await readdir(tempRoot)) {
    if (!/^[a-f0-9-]{36}$/.test(id)) continue;
    const job = await db.downloadJob.findUnique({ where: { id } });
    if (job?.leaseOwner) continue;
    const inspection = await db.mediaInspection.findUnique({ where: { id } });
    if (inspection && inspection.expiresAt > new Date()) continue;
    try {
      const path = await safeFile(tempRoot, [id]);
      const info = await lstat(path);
      if (info.isDirectory() && info.mtimeMs < Date.now() - 900000)
        await rm(path, { recursive: true, force: true });
    } catch {
      /* Preserve entries that fail containment validation. */
    }
  }
  for (const root of [commands, results]) {
    await mkdir(root, { recursive: true });
    for (const name of await readdir(root)) {
      const match =
        /^([a-f0-9-]{36})\.(?:(?:command|control|result)\.json|[a-f0-9-]{36}\.tmp)$/.exec(
          name,
        );
      if (!match) continue;
      const attempt = await db.downloadAttempt.findUnique({
        where: { id: match[1] },
        include: { job: true },
      });
      if (attempt?.job.leaseOwner) continue;
      const inspections = await db.mediaInspection.count({
        where: {
          metadata: { path: ['operationId'], equals: match[1] },
          expiresAt: { gt: new Date() },
        },
      });
      if (inspections) continue;
      try {
        const path = await safeFile(root, [name]);
        if ((await lstat(path)).mtimeMs < Date.now() - 900000)
          await unlink(path);
      } catch {
        /* Retry on next sweep without following untrusted links. */
      }
    }
  }
}
export async function checksum(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

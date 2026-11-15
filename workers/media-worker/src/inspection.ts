import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { rm, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { consume, mediaQueue } from './queue.js';
import { commandSchema } from './protocol.js';
import type { SandboxClient } from './client.js';
import { MediaError } from './supervisor.js';
import { safeFile } from './lifecycle.js';
export async function inspectionWorker(
  db: PrismaClient,
  redis: string,
  spool: SandboxClient,
  temp: string,
  artifacts: string,
) {
  const queue = mediaQueue(redis, 'videoflow-inspect');
  await queue.setGlobalConcurrency(2);
  const worker = consume(
    redis,
    async (message) => {
      const inspection = await db.mediaInspection.findUnique({
        where: { id: message.jobId },
      });
      if (!inspection || message.generation !== 1) return;
      const input = inspection.metadata as Record<string, unknown>;
      if (
        input.state !== 'PENDING' ||
        typeof input.deadline !== 'number' ||
        input.deadline < Date.now()
      )
        return;
      const operationId = randomUUID();
      const changed = await db.mediaInspection.updateMany({
        where: {
          id: inspection.id,
          metadata: { path: ['state'], equals: 'PENDING' },
        },
        data: {
          metadata: { state: 'RUNNING', deadline: input.deadline, operationId },
        },
      });
      if (!changed.count) return;
      const cmd = commandSchema.parse({
        version: 1,
        operationId,
        jobId: inspection.id,
        attemptId: operationId,
        generation: 1,
        operation: 'inspect',
        url: inspection.sourceUrl,
        format: 'mp4',
        quality: 'low',
        deadline: Math.max(Date.now() + 1, input.deadline - 6000),
      });
      let confirmedStopped = false;
      try {
        const result = await spool.run(
          cmd,
          async () => {
            const row = await db.mediaInspection.findUnique({
              where: { id: inspection.id },
            });
            return (
              (row?.metadata as Record<string, unknown>)?.state === 'RUNNING'
            );
          },
          async () => {},
        );
        const metadata = result.metadata!;
        confirmedStopped = true;
        if (metadata.thumbnailMime)
          await copyFile(
            await safeFile(temp, [inspection.id, '1', 'thumbnail']),
            join(artifacts, `${inspection.id}.thumbnail`),
          );
        await db.mediaInspection.updateMany({
          where: {
            id: inspection.id,
            metadata: { path: ['state'], equals: 'RUNNING' },
          },
          data: {
            title:
              typeof metadata.title === 'string'
                ? metadata.title
                : 'Mídia sem título',
            source:
              typeof metadata.source === 'string'
                ? metadata.source
                : new URL(inspection.sourceUrl).hostname,
            durationSeconds:
              typeof metadata.durationSeconds === 'number'
                ? metadata.durationSeconds
                : null,
            availableFormats: metadata.availableFormats as string[],
            metadata: JSON.parse(
              JSON.stringify({ ...metadata, state: 'COMPLETED' }),
            ),
          },
        });
      } catch (error) {
        confirmedStopped =
          error instanceof MediaError &&
          !['SANDBOX_UNAVAILABLE', 'INVALID_MESSAGE'].includes(error.code);
        await db.mediaInspection.updateMany({
          where: {
            id: inspection.id,
            metadata: { path: ['state'], equals: 'RUNNING' },
          },
          data: {
            metadata: {
              state: 'FAILED',
              code:
                Date.now() >= cmd.deadline ||
                (error instanceof MediaError &&
                  error.code === 'PROCESS_TIMEOUT')
                  ? 'INSPECTION_TIMEOUT'
                  : error instanceof MediaError
                    ? error.code === 'PROCESS_FAILED'
                      ? 'SOURCE_UNAVAILABLE'
                      : error.code
                    : 'SOURCE_UNAVAILABLE',
            },
          },
        });
      } finally {
        if (confirmedStopped)
          await rm(join(temp, inspection.id, '1'), {
            recursive: true,
            force: true,
          });
      }
    },
    'videoflow-inspect',
  );
  worker.on('error', () =>
    console.error(JSON.stringify({ event: 'inspection_queue_unavailable' })),
  );
  return { worker, queue };
}

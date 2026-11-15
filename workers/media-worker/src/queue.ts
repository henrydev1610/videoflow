import { Queue, Worker } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
export const deliverySchema = z.strictObject({
  jobId: z.uuid(),
  generation: z.number().int().positive(),
});
export type Delivery = z.infer<typeof deliverySchema>;
export function connection(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
  };
}
export const deliveryId = (job: Delivery) => `${job.jobId}-${job.generation}`;
export function mediaQueue(url: string, name = 'videoflow-media') {
  return new Queue(name, { connection: connection(url) });
}
export async function dispatch(
  db: PrismaClient,
  queue: Queue,
  cancel: (job: Delivery) => Promise<void>,
  afterEnqueue?: () => Promise<void>,
) {
  const events = await db.outboxEvent.findMany({
    where: { deliveredAt: null, createdAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  for (const event of events) {
    const message = deliverySchema.parse({
      jobId: event.jobId,
      generation: event.generation,
    });
    if (event.type === 'PROCESS') {
      await queue.add('process', message, {
        jobId: deliveryId(message),
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
      await afterEnqueue?.();
    } else if (event.type === 'CANCEL') await cancel(message);
    else throw new Error('INVALID_EVENT');
    await db.outboxEvent.updateMany({
      where: { id: event.id, deliveredAt: null },
      data: { deliveredAt: new Date() },
    });
  }
}
export function consume(
  url: string,
  handler: (delivery: Delivery) => Promise<void>,
  name = 'videoflow-media',
) {
  return new Worker(
    name,
    async (job) => {
      await handler(deliverySchema.parse(job.data));
    },
    { connection: connection(url), concurrency: 2 },
  );
}

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { inspectSchema, dataSchema, errorSchema } from '@videoflow/shared';
import { parseSourceUrl } from '@videoflow/shared/security';
import { capabilityCookie, type ContextService } from '../context/service.js';
import { AppError } from '../../common/errors.js';
import type { Config } from '../../config.js';
import type { SourceCooldown } from '../../infra/source-cooldown.js';
import { openArtifact } from '../../infra/artifacts.js';
const response = z.strictObject({
  inspectionId: z.uuid(),
  expiresAt: z.iso.datetime(),
  title: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  thumbnailUrl: z.string().nullable(),
  source: z.string().nullable(),
  availableFormats: z.array(z.enum(['mp3', 'mp4'])),
  warnings: z.array(z.string()),
});
export function mediaRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  contexts: ContextService,
  config: Config,
  cooldown?: SourceCooldown,
) {
  const url = new URL(config.REDIS_URL);
  const queue = new Queue('videoflow-inspect', {
    connection: {
      host: url.hostname,
      port: Number(url.port || 6379),
      password: url.password || undefined,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      enableOfflineQueue: true,
      retryStrategy: () => null,
    },
  });
  queue.on('error', () => {});
  app.addHook('onClose', async () => {
    await queue.close();
  });
  app.withTypeProvider<ZodTypeProvider>().post(
    '/api/media/inspect',
    {
      schema: {
        body: inspectSchema,
        response: {
          200: dataSchema(response),
          400: errorSchema,
          403: errorSchema,
          422: errorSchema,
          429: errorSchema,
          503: errorSchema,
          504: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const context = await contexts.require(req.cookies[capabilityCookie]);
      const source = parseSourceUrl(req.body.url, config.sourceAllowlist);

      if (cooldown) {
        const remaining = await cooldown.remaining(source.hostname);

        if (remaining > 0) {
          reply.header('retry-after', String(remaining));

          throw new AppError(
            429,
            'SOURCE_RATE_LIMITED',
            'Fonte temporariamente limitada. Tente novamente mais tarde.',
          );
        }
      }
      const reservation = cooldown
        ? await cooldown.acquireInspection(source.hostname)
        : { acquired: true, retryAfter: 0 };

      if (!reservation.acquired) {
        reply.header('retry-after', String(reservation.retryAfter));

        throw new AppError(
          429,
          'SOURCE_BUSY',
          'Ja existe uma inspecao desta fonte em andamento.',
        );
      }

      try {
        const deadline = Date.now() + 30000;
        const inspection = await db.mediaInspection.create({
          data: {
            contextId: context.id,
            sourceUrl: source.toString(),
            title: '',
            source: source.hostname,
            availableFormats: [],
            metadata: { state: 'PENDING', deadline },
            expiresAt: new Date(Date.now() + 600000),
          },
        });
        try {
          await queue.add(
            'inspect',
            { jobId: inspection.id, generation: 1 },
            { jobId: inspection.id, removeOnComplete: 100, removeOnFail: 100 },
          );
        } catch {
          await db.mediaInspection.update({
            where: { id: inspection.id },
            data: { metadata: { state: 'CANCELLED', deadline } },
          });
          throw new AppError(
            503,
            'QUEUE_UNAVAILABLE',
            'Inspeção temporariamente indisponível.',
          );
        }
        while (Date.now() < deadline) {
          const current = await db.mediaInspection.findFirst({
            where: { id: inspection.id, contextId: context.id },
          });
          const metadata = current?.metadata as
            Record<string, unknown> | undefined;
          if (metadata?.state === 'COMPLETED') {
            return reply.send({
              data: response.parse({
                inspectionId: inspection.id,
                expiresAt: current!.expiresAt.toISOString(),
                title: metadata.title ?? null,
                durationSeconds: current!.durationSeconds,
                thumbnailUrl: metadata.thumbnailMime
                  ? `/api/media/inspections/${inspection.id}/thumbnail`
                  : null,
                source: metadata.source ?? null,
                availableFormats: current!.availableFormats,
                warnings: metadata.warnings ?? [],
              }),
            });
          }
          if (metadata?.state === 'FAILED') {
            const errorCode =
              typeof metadata.code === 'string'
                ? metadata.code
                : 'SOURCE_UNAVAILABLE';

            if (errorCode === 'SOURCE_RATE_LIMITED' && cooldown) {
              const remaining = await cooldown.activate(source.hostname);
              reply.header('retry-after', String(Math.max(1, remaining)));
            }

            throw new AppError(
              errorCode === 'INSPECTION_TIMEOUT'
                ? 504
                : errorCode === 'SOURCE_RATE_LIMITED'
                  ? 429
                  : 422,
              errorCode,
              errorCode === 'SOURCE_RATE_LIMITED'
                ? 'A plataforma de origem limitou temporariamente as requisicoes. Tente novamente mais tarde.'
                : errorCode === 'SOURCE_AUTH_REQUIRED'
                  ? 'A plataforma de origem solicitou verificacao adicional. Nao foi possivel acessar esta midia sem autenticacao na origem.'
                  : 'Fonte indisponível para processamento.',
            );
          }
          await delay(100);
        }
        await db.mediaInspection.updateMany({
          where: { id: inspection.id, contextId: context.id },
          data: { metadata: { state: 'CANCELLED', deadline } },
        });
        throw new AppError(
          504,
          'INSPECTION_TIMEOUT',
          'A inspeção excedeu o prazo permitido.',
        );
      } finally {
        if (cooldown && reservation.token) {
          try {
            await cooldown.releaseInspection(
              source.hostname,
              reservation.token,
            );
          } catch {
            req.log.warn(
              { code: 'RESERVATION_RELEASE_FAILED' },
              'Falha ao liberar reserva de inspecao',
            );
          }
        }
      }
    },
  );
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/media/inspections/:id/thumbnail',
    {
      schema: {
        params: z.object({ id: z.uuid() }),
        response: {
          200: z.unknown(),
          403: errorSchema,
          404: errorSchema,
          410: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const context = await contexts.require(req.cookies[capabilityCookie]);
      const row = await db.mediaInspection.findFirst({
        where: { id: req.params.id, contextId: context.id },
      });
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Recurso não encontrado.');
      if (row.expiresAt <= new Date())
        throw new AppError(410, 'INSPECTION_EXPIRED', 'Inspeção expirada.');
      const metadata = row.metadata as Record<string, unknown>;
      const mime = metadata.thumbnailMime;
      if (
        metadata.state !== 'COMPLETED' ||
        typeof mime !== 'string' ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(mime)
      )
        throw new AppError(404, 'NOT_FOUND', 'Recurso não encontrado.');
      const { file, size } = await openArtifact(
        config.ARTIFACT_ROOT,
        `${row.id}.thumbnail`,
      );
      if (size > 2097152) {
        await file.close();
        throw new AppError(410, 'FILE_UNAVAILABLE', 'Imagem indisponível.');
      }
      return reply
        .type(mime)
        .header('content-length', size)
        .send(file.createReadStream());
    },
  );
}

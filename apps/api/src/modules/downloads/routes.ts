import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createDownloadSchema,
  dataSchema,
  detailSchema,
  emptyBodySchema,
  errorSchema,
  idParamsSchema,
  idSchema,
  idempotencyHeadersSchema,
  jobSchema,
  listQuerySchema,
  listResponseSchema,
} from '@videoflow/shared';
import { AppError } from '../../common/errors.js';
import { openArtifact, parseRange } from '../../infra/artifacts.js';
import { capabilityCookie, type ContextService } from '../context/service.js';
import type { DownloadRepository } from './repository.js';
import type { DownloadService } from './service.js';

export function downloadRoutes(
  app: FastifyInstance,
  service: DownloadService,
  repository: DownloadRepository,
  contexts: ContextService,
  artifactRoot: string,
) {
  const api = app.withTypeProvider<ZodTypeProvider>();
  const errors = {
    400: errorSchema,
    403: errorSchema,
    404: errorSchema,
    409: errorSchema,
    422: errorSchema,
    429: errorSchema,
    503: errorSchema,
  };
  const requireKey = (value: unknown) => {
    const parsed = idSchema.safeParse(value);
    if (!parsed.success)
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Idempotency-Key deve ser um UUID.',
      );
    return parsed.data;
  };
  api.post(
    '/api/downloads',
    {
      schema: {
        body: createDownloadSchema,
        headers: idempotencyHeadersSchema,
        response: { 202: dataSchema(jobSchema), ...errors },
      },
    },
    async (request, reply) => {
      const context = await contexts.require(request.cookies[capabilityCookie]);
      return reply.code(202).send({
        data: await service.create(
          context,
          request.body,
          requireKey(request.headers['idempotency-key']),
        ),
      });
    },
  );
  api.get(
    '/api/downloads',
    {
      schema: {
        querystring: listQuerySchema,
        response: { 200: listResponseSchema, ...errors },
      },
    },
    async (request) => {
      const context = await contexts.require(request.cookies[capabilityCookie]);
      return service.list(context.id, request.query);
    },
  );
  api.get(
    '/api/downloads/:id',
    {
      schema: {
        params: idParamsSchema,
        response: { 200: dataSchema(detailSchema), ...errors },
      },
    },
    async (request) => {
      const context = await contexts.require(request.cookies[capabilityCookie]);
      return { data: await service.detail(context.id, request.params.id) };
    },
  );
  api.post(
    '/api/downloads/:id/cancel',
    {
      schema: {
        params: idParamsSchema,
        body: emptyBodySchema,
        response: {
          200: dataSchema(jobSchema),
          202: dataSchema(jobSchema),
          ...errors,
        },
      },
    },
    async (request, reply) => {
      const context = await contexts.require(request.cookies[capabilityCookie]);
      const result = await service.cancel(context.id, request.params.id);
      return reply
        .code(result.alreadyCancelled ? 200 : 202)
        .send({ data: result.job });
    },
  );
  api.post(
    '/api/downloads/:id/retry',
    {
      schema: {
        params: idParamsSchema,
        body: emptyBodySchema,
        headers: idempotencyHeadersSchema,
        response: { 202: dataSchema(jobSchema), ...errors },
      },
    },
    async (request, reply) => {
      const context = await contexts.require(request.cookies[capabilityCookie]);
      return reply.code(202).send({
        data: await service.retry(
          context.id,
          request.params.id,
          requireKey(request.headers['idempotency-key']),
        ),
      });
    },
  );
  api.get(
    '/api/downloads/:id/file',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: z.unknown(),
          206: z.unknown(),
          ...errors,
          410: errorSchema,
          416: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const context = await contexts.require(request.cookies[capabilityCookie]);
      const job = await repository.find(context.id, request.params.id);
      if (
        job.status === 'EXPIRED' ||
        (job.artifact && job.artifact.expiresAt <= new Date())
      )
        throw new AppError(410, 'FILE_EXPIRED', 'Este arquivo expirou.');
      if (job.status !== 'COMPLETED')
        throw new AppError(
          409,
          'FILE_NOT_READY',
          'O arquivo ainda não está disponível.',
        );
      if (!job.artifact)
        throw new AppError(410, 'FILE_UNAVAILABLE', 'Arquivo indisponível.');
      const { file, size } = await openArtifact(
        artifactRoot,
        job.artifact.storageKey,
      );
      try {
        const range = parseRange(request.headers.range, size);
        reply
          .header('accept-ranges', 'bytes')
          .header(
            'content-type',
            job.format === 'mp3' ? 'audio/mpeg' : 'video/mp4',
          )
          .header(
            'content-disposition',
            `attachment; filename="videoflow-${job.id}.${job.format}"`,
          )
          .header('content-length', range ? range.end - range.start + 1 : size);
        if (range)
          reply
            .code(206)
            .header(
              'content-range',
              `bytes ${range.start}-${range.end}/${size}`,
            );
        return reply.send(file.createReadStream(range ?? {}));
      } catch (error) {
        await file.close();
        if (error instanceof AppError && error.statusCode === 416)
          reply.header('content-range', `bytes */${size}`);
        throw error;
      }
    },
  );
}

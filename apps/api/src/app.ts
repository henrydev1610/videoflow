import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import Fastify, { type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
} from 'fastify-type-provider-zod';
import type { PrismaClient } from '@prisma/client';
import { SourcePolicyError } from '@videoflow/shared/security';
import { AppError } from './common/errors.js';
import type { Config } from './config.js';
import type { RateLimiter } from './infra/rate-limit.js';
import type { SourceCooldown } from './infra/source-cooldown.js';
import { SafeLogController } from './infra/logging.js';
import { ContextRepository } from './modules/context/repository.js';
import { ContextService } from './modules/context/service.js';
import { contextRoutes } from './modules/context/routes.js';
import { DownloadRepository } from './modules/downloads/repository.js';
import { DownloadService } from './modules/downloads/service.js';
import { downloadRoutes } from './modules/downloads/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { mediaRoutes } from './modules/media/routes.js';

export async function buildApp(options: {
  db: PrismaClient;
  config: Config;
  limiter: RateLimiter;
  sourceCooldown?: SourceCooldown;
  checkHealth: () => Promise<void>;
  logger?: FastifyServerOptions['logger'];
}) {
  const { config, db } = options;
  let proxyAddresses = new Set<string>();
  const refreshProxy = async () => {
    try {
      proxyAddresses = new Set(
        (await lookup(config.TRUSTED_PROXY_HOST, { all: true })).map(
          ({ address }) => address,
        ),
      );
    } catch {
      proxyAddresses.clear();
    }
  };
  if (config.TRUSTED_PROXY_HOST) await refreshProxy();
  const app = Fastify({
    bodyLimit: 16384,
    requestTimeout: 35000,
    connectionTimeout: 10000,
    trustProxy: config.TRUSTED_PROXY_HOST
      ? (address, hop) =>
          hop === 0 && proxyAddresses.has(address.replace(/^::ffff:/, ''))
      : config.TRUSTED_PROXY
        ? config.TRUSTED_PROXY.split(',')
        : false,
    genReqId: () => randomUUID(),
    logController: new SafeLogController(),
    logger: options.logger ?? {
      level: 'info',
      redact: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
      ],
      serializers: {
        req: (req) => ({ method: req.method }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    },
  });
  if (config.TRUSTED_PROXY_HOST) {
    const timer = setInterval(() => void refreshProxy(), 5000);
    timer.unref();
    app.addHook('onClose', async () => clearInterval(timer));
  }
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(cookie);
  await app.register(cors, {
    origin: config.ORIGIN,
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key'],
  });
  await app.register(helmet, { global: true });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'VideoFlow API',
        version: '0.1.0',
        description: 'Capacidades anônimas por cookie; sem contas.',
      },
      components: {
        securitySchemes: {
          anonymousCapability: {
            type: 'apiKey',
            in: 'cookie',
            name: 'videoflow_context',
            description:
              'Capacidade anônima temporária; não representa conta de usuário.',
          },
        },
      },
    },
    transform: (input) => {
      const result = jsonSchemaTransform(input);
      if (input.url.endsWith('/:id/file')) {
        const binary = {
          description: 'Arquivo autorizado',
          content: {
            'video/mp4': { schema: { type: 'string', format: 'binary' } },
            'audio/mpeg': { schema: { type: 'string', format: 'binary' } },
          },
        };
        return {
          ...result,
          schema: {
            ...result.schema,
            response: {
              ...(result.schema.response as Record<string, unknown>),
              200: binary,
              206: binary,
            },
          },
        };
      }
      return result;
    },
  });
  app.addHook('onRoute', (route) => {
    if (
      route.url.startsWith('/api/downloads') ||
      route.url.startsWith('/api/media')
    )
      route.schema = {
        ...route.schema,
        security: [{ anonymousCapability: [] }],
      };
  });
  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('cache-control', 'no-store')
      .header('x-request-id', request.id);
    if (request.method === 'POST') {
      if (request.headers.origin !== config.ORIGIN)
        throw new AppError(403, 'ORIGIN_FORBIDDEN', 'Origem não permitida.');
      if (
        !/^application\/json(?:\s*;|$)/i.test(
          request.headers['content-type'] ?? '',
        )
      )
        throw new AppError(415, 'JSON_REQUIRED', 'Envie um corpo JSON.');
    }
    if (request.routeOptions.url !== '/api/health')
      await options.limiter.consume(
        request.ip,
        request.method === 'GET'
          ? 'read'
          : request.routeOptions.url === '/api/media/inspect'
            ? 'inspect'
            : 'mutation',
      );
  });
  app.setErrorHandler((error, request, reply) => {
    const frameworkError = error as { validation?: unknown; code?: string };
    let safe: AppError;
    if (error instanceof AppError) safe = error;
    else if (error instanceof SourcePolicyError)
      safe = new AppError(
        error.code === 'INVALID_URL' ? 400 : 422,
        error.code,
        'Fonte não permitida.',
      );
    else if (
      frameworkError.validation ||
      frameworkError.code === 'FST_ERR_CTP_INVALID_JSON_BODY'
    )
      safe = new AppError(
        400,
        'VALIDATION_ERROR',
        'Verifique os campos da solicitação.',
      );
    else if (frameworkError.code === 'FST_ERR_CTP_BODY_TOO_LARGE')
      safe = new AppError(
        413,
        'BODY_TOO_LARGE',
        'Corpo excede o limite permitido.',
      );
    else
      safe = new AppError(
        500,
        'INTERNAL_ERROR',
        'Não foi possível concluir a operação.',
      );
    if (safe.statusCode === 429 && !reply.hasHeader('retry-after')) {
      reply.header('retry-after', '60');
    }
    request.log.warn(
      { code: safe.code, requestId: request.id, statusCode: safe.statusCode },
      'Falha na solicitação',
    );
    reply.code(safe.statusCode).send({
      error: {
        code: safe.code,
        message: safe.message,
        requestId: request.id,
        ...(safe.code === 'VALIDATION_ERROR'
          ? {
              details: [
                {
                  field: 'request',
                  message: 'Campos inválidos ou não permitidos.',
                },
              ],
            }
          : {}),
      },
    });
  });
  const contexts = new ContextService(new ContextRepository(db));
  const downloads = new DownloadRepository(db);
  contextRoutes(app, contexts, config.secureCookie);
  downloadRoutes(
    app,
    new DownloadService(downloads, config.sourceAllowlist),
    downloads,
    contexts,
    config.ARTIFACT_ROOT,
  );
  healthRoutes(app, options.checkHealth);
  mediaRoutes(app, db, contexts, config, options.sourceCooldown);
  app.get('/api/openapi.json', async () => app.swagger());
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Recurso não encontrado.',
        requestId: request.id,
      },
    }),
  );
  return app;
}

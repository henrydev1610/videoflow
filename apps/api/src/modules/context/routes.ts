import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  contextSchema,
  dataSchema,
  emptyBodySchema,
  errorSchema,
} from '@videoflow/shared';
import { capabilityCookie, type ContextService } from './service.js';
export function contextRoutes(
  app: FastifyInstance,
  service: ContextService,
  secure: boolean,
) {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/api/context',
    {
      schema: {
        body: emptyBodySchema,
        response: {
          200: dataSchema(contextSchema),
          201: dataSchema(contextSchema),
          403: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await service.initialize(
        request.cookies[capabilityCookie],
      );
      if (result.token)
        reply.setCookie(capabilityCookie, result.token, {
          httpOnly: true,
          sameSite: 'strict',
          secure,
          path: '/api',
          expires: result.context.expiresAt,
        });
      return reply.code(result.created ? 201 : 200).send({
        data: { expiresAt: result.context.expiresAt.toISOString() },
      });
    },
  );
}

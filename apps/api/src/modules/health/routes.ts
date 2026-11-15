import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
export function healthRoutes(app: FastifyInstance, check: () => Promise<void>) {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/health',
    {
      schema: {
        response: {
          200: z.strictObject({ status: z.literal('ok') }),
          503: z.strictObject({ status: z.literal('unavailable') }),
        },
      },
    },
    async (_request, reply) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          check(),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('timeout')), 3000);
          }),
        ]);
        return reply.send({ status: 'ok' as const });
      } catch {
        return reply.code(503).send({ status: 'unavailable' as const });
      } finally {
        clearTimeout(timer);
      }
    },
  );
}

import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ChangesSchema } from '@crew-board/shared';
import type { RouteDeps } from '../app.ts';
import { getDataVersion } from '../repositories/dataVersion.ts';

export const changeRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (instance) => {
    const app = instance.withTypeProvider<ZodTypeProvider>();

    // Every open board polls this. It is one primary-key read, so it is not rate limited per address, which
    // would otherwise cut off a whole office sharing one. The browser must never reuse an old answer.
    app.get(
      '/changes',
      { schema: { tags: ['changes'], response: { 200: ChangesSchema } }, config: { rateLimit: false } },
      async (_req, reply) => {
        void reply.header('cache-control', 'no-store');
        return { version: getDataVersion(db) };
      },
    );
  };

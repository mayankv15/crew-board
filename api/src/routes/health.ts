import type { FastifyPluginAsync } from 'fastify';
import type { RouteDeps } from '../app.ts';

export const healthRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));

    app.get('/ready', { config: { rateLimit: false } }, async (_req, reply) => {
      try {
        db.prepare('SELECT 1').get();
        return { status: 'ready' };
      } catch {
        return reply.status(503).send({ status: 'unavailable' });
      }
    });
  };

import type { FastifyPluginAsync } from 'fastify';
import type { RouteDeps } from '../app.ts';

export const healthRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    // Liveness: the process is up. No dependencies checked, so it never flaps.
    app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));

    // Readiness: can we reach the database.
    app.get('/ready', { config: { rateLimit: false } }, async (_req, reply) => {
      try {
        db.prepare('SELECT 1').get();
        return { status: 'ready' };
      } catch {
        return reply.status(503).send({ status: 'unavailable' });
      }
    });
  };

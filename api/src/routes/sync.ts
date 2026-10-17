import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { StartSyncResponse, SyncRunSchema, SyncRunsQuery } from '@crew-board/shared';
import { z } from 'zod';
import type { RouteDeps } from '../app.ts';
import { notFound } from '../errors.ts';
import { startSync } from '../integration/sync.ts';
import { getRun, listRuns } from '../repositories/syncRuns.ts';
import { IdParams } from './common.ts';

export const syncRoutes =
  ({ db, hr, config }: RouteDeps): FastifyPluginAsync =>
  async (instance) => {
    const app = instance.withTypeProvider<ZodTypeProvider>();
    const tags = ['sync'];

    app.post(
      '/sync/technicians',
      {
        schema: { tags, response: { 202: StartSyncResponse } },
        config: { rateLimit: { max: config.RATE_LIMIT_SYNC_MAX, timeWindow: '1 minute' } },
      },
      async (req, reply) => {
        const { runId } = startSync({ db, hr, log: req.log }, 'api');
        return reply.status(202).send({ runId });
      },
    );

    app.get(
      '/sync/runs',
      { schema: { tags, querystring: SyncRunsQuery, response: { 200: z.array(SyncRunSchema) } } },
      async (req) => listRuns(db, req.query.limit),
    );

    app.get('/sync/runs/:id', { schema: { tags, params: IdParams, response: { 200: SyncRunSchema } } }, async (req) => {
      const run = getRun(db, req.params.id);
      if (!run) throw notFound('Sync run');
      return run;
    });
  };

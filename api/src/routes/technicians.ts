import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { TechnicianDetailSchema, TechnicianQuery, TechnicianSchema, pageOf } from '@crew-board/shared';
import type { RouteDeps } from '../app.ts';
import { notFound } from '../errors.ts';
import { getTechnicianDetail, listTechnicians } from '../repositories/technicians.ts';
import { IdParams } from './common.ts';

export const technicianRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (instance) => {
    const app = instance.withTypeProvider<ZodTypeProvider>();
    const tags = ['technicians'];

    app.get('/technicians', { schema: { tags, querystring: TechnicianQuery, response: { 200: pageOf(TechnicianSchema) } } }, async (req) =>
      listTechnicians(db, req.query),
    );

    app.get('/technicians/:id', { schema: { tags, params: IdParams, response: { 200: TechnicianDetailSchema } } }, async (req) => {
      const technician = getTechnicianDetail(db, req.params.id);
      if (!technician) throw notFound('Technician');
      return technician;
    });
  };

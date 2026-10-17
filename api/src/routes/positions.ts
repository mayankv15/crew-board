import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AssignmentSchema,
  CandidateQuery,
  CandidateSchema,
  CreateAssignmentBody,
  CreatePositionBody,
  PositionQuery,
  PositionSchema,
  PositionSummarySchema,
  pageOf,
} from '@crew-board/shared';
import type { RouteDeps } from '../app.ts';
import { notFound } from '../errors.ts';
import { createPosition, getPosition, listPositions, summarizePositions } from '../repositories/positions.ts';
import { getProject } from '../repositories/projects.ts';
import { listCandidates } from '../repositories/technicians.ts';
import { assignTechnician, unassign } from '../services/assignments.ts';
import { IdParams } from './common.ts';

const AssignmentParams = z.object({ id: z.string().min(1).max(64), assignmentId: z.string().min(1).max(64) });

export const positionRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (instance) => {
    const app = instance.withTypeProvider<ZodTypeProvider>();
    const tags = ['positions'];

    app.get(
      '/positions',
      { schema: { tags, querystring: PositionQuery, response: { 200: pageOf(PositionSchema) } } },
      async (req) => listPositions(db, req.query),
    );

    app.get('/positions/summary', { schema: { tags, response: { 200: PositionSummarySchema } } }, async () =>
      summarizePositions(db),
    );

    app.get(
      '/positions/:id',
      { schema: { tags, params: IdParams, response: { 200: PositionSchema } } },
      async (req) => {
        const position = getPosition(db, req.params.id);
        if (!position) throw notFound('Position');
        return position;
      },
    );

    app.post(
      '/projects/:id/positions',
      { schema: { tags, params: IdParams, body: CreatePositionBody, response: { 201: PositionSchema } } },
      async (req, reply) => {
        if (!getProject(db, req.params.id)) throw notFound('Project');
        return reply.status(201).send(createPosition(db, req.params.id, req.body));
      },
    );

    app.get(
      '/positions/:id/candidates',
      { schema: { tags, params: IdParams, querystring: CandidateQuery, response: { 200: pageOf(CandidateSchema) } } },
      async (req) => {
        const position = getPosition(db, req.params.id);
        if (!position) throw notFound('Position');
        return listCandidates(db, position, req.query);
      },
    );

    app.post(
      '/positions/:id/assignments',
      { schema: { tags, params: IdParams, body: CreateAssignmentBody, response: { 201: AssignmentSchema } } },
      async (req, reply) => reply.status(201).send(assignTechnician(db, req.params.id, req.body.technicianId)),
    );

    app.delete(
      '/positions/:id/assignments/:assignmentId',
      { schema: { tags, params: AssignmentParams } },
      async (req, reply) => {
        unassign(db, req.params.id, req.params.assignmentId);
        return reply.status(204).send();
      },
    );
  };

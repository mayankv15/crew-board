import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CreateProjectBody, ProjectQuery, ProjectSchema, pageOf } from '@crew-board/shared';
import type { RouteDeps } from '../app.ts';
import { notFound } from '../errors.ts';
import { createProject, getProject, listProjects } from '../repositories/projects.ts';
import { IdParams } from './common.ts';

export const projectRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (instance) => {
    const app = instance.withTypeProvider<ZodTypeProvider>();

    app.get('/projects', { schema: { tags: ['projects'], querystring: ProjectQuery, response: { 200: pageOf(ProjectSchema) } } }, async (req) =>
      listProjects(db, req.query),
    );

    app.post('/projects', { schema: { tags: ['projects'], body: CreateProjectBody, response: { 201: ProjectSchema } } }, async (req, reply) =>
      reply.status(201).send(createProject(db, req.body)),
    );

    app.get('/projects/:id', { schema: { tags: ['projects'], params: IdParams, response: { 200: ProjectSchema } } }, async (req) => {
      const project = getProject(db, req.params.id);
      if (!project) throw notFound('Project');
      return project;
    });
  };

import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { ApiErrorBody, ErrorCode } from '@crew-board/shared';
import type { Config } from './config.ts';
import type { Db } from './db/connection.ts';
import { AppError } from './errors.ts';
import type { HrClient } from './integration/hrClient.ts';
import { healthRoutes } from './routes/health.ts';
import { positionRoutes } from './routes/positions.ts';
import { projectRoutes } from './routes/projects.ts';
import { syncRoutes } from './routes/sync.ts';
import { technicianRoutes } from './routes/technicians.ts';
import { webhookRoutes } from './routes/webhooks.ts';

export interface AppDeps {
  config: Config;
  db: Db;
  hr: HrClient;
  logger?: boolean;
}

export interface RouteDeps extends AppDeps {
  app: FastifyInstance;
}

const body = (
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): ApiErrorBody => ({
  error: { code, message, requestId, ...(details ? { details } : {}) },
});

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;

  const app = Fastify({
    logger:
      deps.logger === false
        ? false
        : {
            level: 'info',
            redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-hr-signature"]'],
          },
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 64 * 1024,
    requestTimeout: 30_000,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet);
  await app.register(cors, { origin: config.CORS_ORIGIN, methods: ['GET', 'POST', 'DELETE'] });
  await app.register(rateLimit, { global: true, max: config.RATE_LIMIT_MAX, timeWindow: '1 minute' });

  await app.register(swagger, {
    openapi: { info: { title: 'Crew Board API', version: '0.1.0' } },
    transform: jsonSchemaTransform,
  });
  if (config.NODE_ENV !== 'production') {
    const { default: swaggerUi } = await import('@fastify/swagger-ui');
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    if (error instanceof AppError) {
      return reply.status(error.status).send(body(error.code, error.message, requestId, error.details));
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      const issues = error.validation.map((v) => ({
        field:
          v.instancePath.replace(/^\//, '').replace(/\//g, '.') ||
          String((v.params as { issue?: { path?: unknown[] } }).issue?.path?.join('.') ?? ''),
        message: v.message ?? 'Invalid value',
      }));
      return reply.status(400).send(
        body('VALIDATION_ERROR', 'The request is not valid. Fix the listed fields and try again.', requestId, {
          issues,
        }),
      );
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 413)
      return reply.status(413).send(body('PAYLOAD_TOO_LARGE', 'The request body is too large.', requestId));
    if (status === 429)
      return reply.status(429).send(body('RATE_LIMITED', 'Too many requests. Wait a moment and try again.', requestId));
    if (status === 400 || status === 415) {
      return reply.status(400).send(body('VALIDATION_ERROR', 'The request body could not be read as JSON.', requestId));
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply
      .status(500)
      .send(body('INTERNAL', 'Something went wrong on our side. Quote the request id if you report it.', requestId));
  });

  app.setNotFoundHandler((request, reply) => reply.status(404).send(body('NOT_FOUND', 'No such route.', request.id)));

  const routeDeps: RouteDeps = { ...deps, app };
  await app.register(healthRoutes(routeDeps));
  await app.register(projectRoutes(routeDeps));
  await app.register(positionRoutes(routeDeps));
  await app.register(technicianRoutes(routeDeps));
  await app.register(syncRoutes(routeDeps));
  await app.register(webhookRoutes(routeDeps));

  return app;
}

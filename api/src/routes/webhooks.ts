import type { FastifyPluginAsync } from 'fastify';
import type { RouteDeps } from '../app.ts';
import { AppError } from '../errors.ts';
import { verifySignature } from '../integration/signature.ts';
import { WebhookEventSchema, processWebhookEvent } from '../integration/webhook.ts';

export const webhookRoutes =
  ({ db, config }: RouteDeps): FastifyPluginAsync =>
  async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 64 * 1024 }, (_req, raw, done) =>
      done(null, raw),
    );

    scope.post(
      '/webhooks/hr',
      {
        schema: { tags: ['webhooks'] },
        config: { rateLimit: { max: config.RATE_LIMIT_WEBHOOK_MAX, timeWindow: '1 minute' } },
      },
      async (req, reply) => {
        const raw = req.body as Buffer;
        const header = (name: string) => {
          const v = req.headers[name];
          return typeof v === 'string' ? v : undefined;
        };

        const valid = verifySignature({
          secret: config.HR_WEBHOOK_SECRET,
          timestamp: header('x-hr-timestamp'),
          signature: header('x-hr-signature'),
          rawBody: raw,
          nowSeconds: Math.floor(Date.now() / 1000),
        });
        if (!valid) throw new AppError('INVALID_SIGNATURE', 'The webhook signature could not be verified.');

        let json: unknown;
        try {
          json = JSON.parse(raw.toString('utf8'));
        } catch {
          throw new AppError('VALIDATION_ERROR', 'The webhook body is not valid JSON.');
        }
        const parsed = WebhookEventSchema.safeParse(json);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'The webhook event is not valid.', {
            issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          });
        }

        const result = processWebhookEvent(db, parsed.data);
        req.log.info({ eventId: parsed.data.id, type: parsed.data.type, result: result.status }, 'webhook handled');
        return reply.status(200).send(result);
      },
    );
  };

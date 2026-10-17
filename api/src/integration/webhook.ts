import { z } from 'zod';
import type { Db } from '../db/connection.ts';
import { AppError } from '../errors.ts';
import { deactivateTechnician, upsertTechnician } from '../repositories/upsert.ts';
import { nowIso } from '../repositories/util.ts';
import { HrUserSchema, toTechnicianInput } from './mapping.ts';

const EventId = z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/, 'letters, digits, _ and - only');
const OccurredAt = z.iso.datetime({ offset: true }).transform((v) => new Date(v).toISOString());

export const WebhookEventSchema = z.discriminatedUnion('type', [
  z.object({
    id: EventId,
    type: z.literal('technician.updated'),
    occurredAt: OccurredAt,
    // The full technician as HR now sees them, plus an optional explicit active flag.
    data: HrUserSchema.extend({ active: z.boolean().optional() }),
  }),
  z.object({
    id: EventId,
    type: z.literal('technician.deactivated'),
    occurredAt: OccurredAt,
    data: z.object({ id: z.number().int().positive() }),
  }),
]);
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export interface WebhookResult {
  status: 'processed' | 'ignored';
  reason?: string;
}

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && 'code' in e && String((e as { code: unknown }).code).startsWith('SQLITE_CONSTRAINT');
}

// Recording the event id and applying the change happen in ONE transaction:
//  - the id is the primary key of webhook_events, so a repeat of the same id fails to insert (replay);
//  - if applying the change throws, the insert rolls back too, so the sender can retry the same id.
export function processWebhookEvent(db: Db, event: WebhookEvent, now: Date = new Date()): WebhookResult {
  const occurred = Date.parse(event.occurredAt);
  if (occurred > now.getTime() + MAX_CLOCK_SKEW_MS) {
    throw new AppError('VALIDATION_ERROR', 'occurredAt is in the future.', { field: 'occurredAt' });
  }

  return db.transaction((): WebhookResult => {
    try {
      db.prepare("INSERT INTO webhook_events (event_id, type, received_at, outcome) VALUES (?, ?, ?, 'pending')").run(event.id, event.type, nowIso());
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new AppError('DUPLICATE_EVENT', `Event ${event.id} was already received and was not applied again.`, { eventId: event.id });
      }
      throw e;
    }

    let result: WebhookResult;
    if (event.type === 'technician.updated') {
      const outcome = upsertTechnician(db, toTechnicianInput(event.data), event.occurredAt, {
        source: 'webhook',
        ...(event.data.active === undefined ? {} : { active: event.data.active }),
      });
      result = outcome === 'stale' ? { status: 'ignored', reason: 'stale: a newer change is already applied' } : { status: 'processed' };
    } else {
      const outcome = deactivateTechnician(db, event.data.id, event.occurredAt, 'webhook');
      result =
        outcome === 'unknown'
          ? { status: 'ignored', reason: 'unknown technician' }
          : outcome === 'stale'
            ? { status: 'ignored', reason: 'stale: a newer change is already applied' }
            : { status: 'processed' };
    }
    db.prepare('UPDATE webhook_events SET outcome = ? WHERE event_id = ?').run(result.reason ?? result.status, event.id);
    return result;
  }).immediate();
}

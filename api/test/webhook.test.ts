import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../src/db/connection.ts';
import { signPayload, verifySignature } from '../src/integration/signature.ts';
import { getPosition } from '../src/repositories/positions.ts';
import { assignTechnician } from '../src/services/assignments.ts';
import { SECRET, hrUser, signedHeaders, testApp } from './app-helpers.ts';
import { makePosition, makeProject, makeTechnician } from './helpers.ts';

let app: FastifyInstance;
let db: Db;

beforeEach(async () => {
  ({ app, db } = await testApp());
});
afterEach(async () => {
  await app.close();
});

const body = (o: object) => JSON.stringify(o);
const event = (over: Record<string, unknown> = {}) => ({
  id: `evt_${Math.random().toString(36).slice(2)}_${Date.now()}`,
  type: 'technician.updated',
  occurredAt: new Date().toISOString(),
  data: hrUser(42),
  ...over,
});
const post = (payload: string, headers = signedHeaders(payload)) => app.inject({ method: 'POST', url: '/webhooks/hr', payload, headers });
const json = (res: { body: string }) => JSON.parse(res.body);
const row = (externalId: number) => db.prepare('SELECT * FROM technicians WHERE external_id = ?').get(externalId) as Record<string, unknown> | undefined;

describe('signature check', () => {
  const raw = Buffer.from('{"a":1}');
  const now = 1_800_000_000;
  const ok = (over: object = {}) =>
    verifySignature({ secret: SECRET, timestamp: String(now), signature: signPayload(SECRET, String(now), raw), rawBody: raw, nowSeconds: now, ...over });

  it('accepts a correct signature', () => expect(ok()).toBe(true));
  it('rejects the wrong secret', () => expect(ok({ signature: signPayload('x'.repeat(40), String(now), raw) })).toBe(false));
  it('rejects a tampered body', () => expect(ok({ rawBody: Buffer.from('{"a":2}') })).toBe(false));
  it('rejects a changed timestamp (it is part of what is signed)', () => expect(ok({ timestamp: String(now + 1) })).toBe(false));
  it('rejects an old timestamp, and a far-future one', () => {
    const old = String(now - 301);
    expect(ok({ timestamp: old, signature: signPayload(SECRET, old, raw) })).toBe(false);
    const future = String(now + 301);
    expect(ok({ timestamp: future, signature: signPayload(SECRET, future, raw) })).toBe(false);
  });
  it('accepts a timestamp inside the tolerance window', () => {
    const near = String(now - 299);
    expect(ok({ timestamp: near, signature: signPayload(SECRET, near, raw) })).toBe(true);
  });
  it.each([undefined, '', 'sha256=', 'sha256=zz', 'md5=abc', `sha256=${'a'.repeat(63)}`, `sha256=${'A'.repeat(64)}`])('rejects a malformed signature %j', (signature) => {
    expect(ok({ signature })).toBe(false);
  });
  it('rejects a missing or non-numeric timestamp', () => {
    expect(ok({ timestamp: undefined })).toBe(false);
    expect(ok({ timestamp: 'abc' })).toBe(false);
  });
});

describe('POST /webhooks/hr: authentication', () => {
  it('answers every kind of bad signature identically with 401 INVALID_SIGNATURE', async () => {
    const payload = body(event());
    const cases = [
      { ...signedHeaders(payload), 'x-hr-signature': signPayload('y'.repeat(40), String(Math.floor(Date.now() / 1000)), payload) },
      signedHeaders(payload, { timestamp: Math.floor(Date.now() / 1000) - 3600 }),
      signedHeaders(payload, { timestamp: Math.floor(Date.now() / 1000) + 3600 }),
      { 'content-type': 'application/json' },
      { ...signedHeaders(payload), 'x-hr-signature': 'garbage' },
      signedHeaders(body(event({ id: 'someone-elses-body' }))),
    ];
    const messages = new Set<string>();
    for (const headers of cases) {
      const res = await post(payload, headers as never);
      expect(res.statusCode).toBe(401);
      expect(json(res).error.code).toBe('INVALID_SIGNATURE');
      messages.add(json(res).error.message);
    }
    expect(messages.size).toBe(1);
    expect(row(42)).toBeUndefined();
  });

  it('does not parse or act on the body before the signature is verified', async () => {
    const res = await post('{not even json', { 'content-type': 'application/json' } as never);
    expect(res.statusCode).toBe(401);
  });

  it('413 for a body over 64 KB', async () => {
    const payload = body({ pad: 'x'.repeat(70_000) });
    const res = await post(payload);
    expect(res.statusCode).toBe(413);
    expect(json(res).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects a non-JSON content type', async () => {
    const payload = body(event());
    const res = await app.inject({ method: 'POST', url: '/webhooks/hr', payload, headers: { ...signedHeaders(payload), 'content-type': 'text/plain' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /webhooks/hr: events', () => {
  it('technician.updated creates a new technician with derived skills', async () => {
    const res = await post(body(event({ data: hrUser(42, { company: { department: 'Services', title: 'Engineer' } }) })));
    expect(res.statusCode).toBe(200);
    expect(json(res)).toEqual({ status: 'processed' });
    expect(row(42)).toMatchObject({ name: 'First42 Last42', active: 1 });
    expect(db.prepare('SELECT skill FROM technician_skills').all()).toEqual([{ skill: 'fibre-cabling' }]);
  });

  it('technician.updated changes an existing technician in place', async () => {
    const tech = makeTechnician(db, { externalId: 42, name: 'Old Name' });
    const res = await post(body(event({ occurredAt: new Date(Date.now() + 1000).toISOString(), data: hrUser(42, { firstName: 'New', lastName: 'Name' }) })));
    expect(json(res)).toEqual({ status: 'processed' });
    expect(db.prepare('SELECT id, name FROM technicians WHERE external_id = 42').get()).toEqual({ id: tech.id, name: 'New Name' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM technicians').get()).toEqual({ n: 1 });
  });

  it('technician.deactivated deactivates, never deletes, keeps the assignment and reopens the seat', async () => {
    const project = makeProject(db);
    const position = makePosition(db, project.id, { headcount: 1 });
    const tech = makeTechnician(db, { externalId: 42 });
    assignTechnician(db, position.id, tech.id);
    expect(getPosition(db, position.id)?.filled).toBe(true);

    const res = await post(body(event({ type: 'technician.deactivated', occurredAt: new Date(Date.now() + 1000).toISOString(), data: { id: 42 } })));
    expect(json(res)).toEqual({ status: 'processed' });
    expect(row(42)).toMatchObject({ active: 0, deactivated_by: 'webhook' });
    expect(row(42)?.deactivated_at).toBeTruthy();
    expect(db.prepare('SELECT COUNT(*) AS n FROM assignments').get()).toEqual({ n: 1 });
    expect(getPosition(db, position.id)).toMatchObject({ filled: false, seatsRemaining: 1 });
  });

  it('technician.updated with active:true restores a deactivated technician and their seat', async () => {
    const project = makeProject(db);
    const position = makePosition(db, project.id, { headcount: 1 });
    const tech = makeTechnician(db, { externalId: 42 });
    assignTechnician(db, position.id, tech.id);
    await post(body(event({ type: 'technician.deactivated', occurredAt: new Date(Date.now() + 1000).toISOString(), data: { id: 42 } })));
    const res = await post(body(event({ occurredAt: new Date(Date.now() + 2000).toISOString(), data: hrUser(42, { active: true }) })));
    expect(json(res)).toEqual({ status: 'processed' });
    expect(row(42)).toMatchObject({ active: 1, deactivated_by: null });
    expect(getPosition(db, position.id)?.filled).toBe(true);
  });

  it('acknowledges but ignores a deactivation for someone we do not know', async () => {
    const res = await post(body(event({ type: 'technician.deactivated', data: { id: 999 } })));
    expect(res.statusCode).toBe(200);
    expect(json(res)).toEqual({ status: 'ignored', reason: 'unknown technician' });
  });

  it('ignores an event older than the change already applied (out of order)', async () => {
    const newer = new Date(Date.now() + 10_000).toISOString();
    const older = new Date(Date.now() + 5_000).toISOString();
    await post(body(event({ type: 'technician.deactivated', occurredAt: newer, data: { id: 42 } })));
    makeTechnician(db, { externalId: 43 });
    const first = await post(body(event({ occurredAt: newer, data: hrUser(43, { firstName: 'Newer' }) })));
    expect(json(first).status).toBe('processed');
    const late = await post(body(event({ occurredAt: older, data: hrUser(43, { firstName: 'Older' }) })));
    expect(json(late)).toMatchObject({ status: 'ignored' });
    expect(row(43)?.name).toBe('Newer Last43');
  });

  it('rejects an event dated in the future', async () => {
    const res = await post(body(event({ occurredAt: new Date(Date.now() + 3_600_000).toISOString() })));
    expect(res.statusCode).toBe(400);
  });

  it('400 with field details for a signed but invalid event', async () => {
    for (const bad of [{ id: 'short', type: 'technician.updated' }, event({ type: 'technician.exploded' }), event({ data: { id: 'x' } }), { ...event(), extra: 1, id: 'has spaces!!' }]) {
      const res = await post(body(bad));
      expect(res.statusCode).toBe(400);
      expect(json(res).error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('drops sensitive fields that HR includes in an event', async () => {
    await post(body(event({ data: hrUser(42, { ssn: '123-45-6789', password: 'hunter2' }) })));
    expect(JSON.stringify(db.prepare('SELECT * FROM technicians').all())).not.toMatch(/123-45-6789|hunter2/);
  });
});

describe('POST /webhooks/hr: replay protection', () => {
  it('rejects the same event id twice with 409 DUPLICATE_EVENT and applies it once', async () => {
    const payload = body(event({ id: 'evt_replay_0001' }));
    expect((await post(payload)).statusCode).toBe(200);
    db.prepare("UPDATE technicians SET name = 'Edited Locally' WHERE external_id = 42").run();
    const replay = await post(payload);
    expect(replay.statusCode).toBe(409);
    expect(json(replay).error.code).toBe('DUPLICATE_EVENT');
    expect(row(42)?.name).toBe('Edited Locally');
    expect(db.prepare('SELECT COUNT(*) AS n FROM webhook_events').get()).toEqual({ n: 1 });
  });

  it('does not burn the event id when applying the change fails, so the sender can retry', async () => {
    db.exec("CREATE TRIGGER boom BEFORE INSERT ON technicians BEGIN SELECT RAISE(ABORT, 'boom'); END;");
    const payload = body(event({ id: 'evt_retry_0001' }));
    const failed = await post(payload);
    expect(failed.statusCode).toBe(500);
    expect(db.prepare('SELECT COUNT(*) AS n FROM webhook_events').get()).toEqual({ n: 0 });

    db.exec('DROP TRIGGER boom');
    const retried = await post(payload);
    expect(retried.statusCode).toBe(200);
    expect(row(42)).toBeDefined();
  });
});

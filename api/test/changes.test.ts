import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../src/db/connection.ts';
import { createHttpHrClient } from '../src/integration/hrClient.ts';
import { startSync } from '../src/integration/sync.ts';
import { getDataVersion } from '../src/repositories/dataVersion.ts';
import { assignTechnician } from '../src/services/assignments.ts';
import { startFakeHr, type FakeHr } from './fake-hr.ts';
import { hrUser, signedHeaders, testApp } from './app-helpers.ts';
import { makePosition, makeProject, makeTechnician } from './helpers.ts';

let app: FastifyInstance;
let db: Db;

beforeEach(async () => {
  ({ app, db } = await testApp());
});
afterEach(async () => {
  await app.close();
});

const json = (res: { body: string }) => JSON.parse(res.body);
const version = async () => json(await app.inject({ method: 'GET', url: '/changes' })).version as number;
const webhook = (payload: object) => {
  const raw = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, ...payload });
  return app.inject({ method: 'POST', url: '/webhooks/hr', payload: raw, headers: signedHeaders(raw) });
};

describe('GET /changes', () => {
  it('returns the current version, never cached, and the same value until something changes', async () => {
    const res = await app.inject({ method: 'GET', url: '/changes' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(json(res)).toEqual({ version: 0 });
    expect(await version()).toBe(0);
  });

  it('is not rate limited per address, because every open board polls it', async () => {
    const limited = await testApp({ env: { RATE_LIMIT_MAX: '2' } });
    const statuses = async (url: string) =>
      Promise.all(Array.from({ length: 6 }, () => limited.app.inject({ method: 'GET', url }))).then((all) =>
        all.map((r) => r.statusCode),
      );
    expect(await statuses('/positions')).toContain(429);
    expect(new Set(await statuses('/changes'))).toEqual(new Set([200]));
    await limited.app.close();
  });
});

describe('what moves the version', () => {
  it('moves when a project or a position is created', async () => {
    const before = await version();
    const project = json(
      await app.inject({ method: 'POST', url: '/projects', payload: { name: 'P', client: 'C', site: 'S' } }),
    );
    const afterProject = await version();
    expect(afterProject).not.toBe(before);

    await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/positions`,
      payload: { skill: 'network-engineering', startDate: '2026-11-03', endDate: '2026-11-14', headcount: 1 },
    });
    expect(await version()).not.toBe(afterProject);
  });

  it('moves when someone is assigned and again when they are unassigned', async () => {
    const position = makePosition(db, makeProject(db).id);
    const tech = makeTechnician(db);
    const before = await version();

    const assigned = await app.inject({
      method: 'POST',
      url: `/positions/${position.id}/assignments`,
      payload: { technicianId: tech.id },
    });
    const afterAssign = await version();
    expect(afterAssign).not.toBe(before);

    await app.inject({ method: 'DELETE', url: `/positions/${position.id}/assignments/${json(assigned).id}` });
    expect(await version()).not.toBe(afterAssign);
  });

  it('moves when HR deactivates or changes a technician through the webhook', async () => {
    makeTechnician(db, { externalId: 42 });
    const before = await version();
    const later = (ms: number) => new Date(Date.now() + ms).toISOString();

    await webhook({ type: 'technician.updated', occurredAt: later(1000), data: hrUser(42, { firstName: 'Renamed' }) });
    const afterUpdate = await version();
    expect(afterUpdate).not.toBe(before);

    await webhook({ type: 'technician.deactivated', occurredAt: later(2000), data: { id: 42 } });
    expect(await version()).not.toBe(afterUpdate);
  });

  it('moves when a technician gains a skill, which changes who can be booked', async () => {
    makeTechnician(db, { externalId: 7, skills: ['network-engineering'] });
    const before = getDataVersion(db);
    db.prepare(
      "INSERT INTO technician_skills (technician_id, skill) SELECT id, 'fibre-cabling' FROM technicians",
    ).run();
    expect(getDataVersion(db)).not.toBe(before);
  });
});

describe('what leaves the version alone', () => {
  it('does not move on reads, on a replayed webhook event, or on a webhook that changes nothing', async () => {
    const position = makePosition(db, makeProject(db).id);
    const tech = makeTechnician(db, { externalId: 42 });
    assignTechnician(db, position.id, tech.id);
    const settled = await version();

    await app.inject({ method: 'GET', url: '/positions' });
    await app.inject({ method: 'GET', url: '/positions/summary' });
    await app.inject({ method: 'GET', url: `/positions/${position.id}/candidates` });
    expect(await version()).toBe(settled);

    const raw = JSON.stringify({
      id: 'evt_same',
      type: 'technician.deactivated',
      occurredAt: new Date(Date.now() + 1000).toISOString(),
      data: { id: 42 },
    });
    const send = () => app.inject({ method: 'POST', url: '/webhooks/hr', payload: raw, headers: signedHeaders(raw) });
    expect((await send()).statusCode).toBe(200);
    const afterFirst = await version();
    expect(afterFirst).not.toBe(settled);

    expect((await send()).statusCode).toBe(409);
    expect(await version()).toBe(afterFirst);
  });
});

describe('after a sync', () => {
  let hr: FakeHr;
  beforeEach(async () => {
    hr = await startFakeHr(Array.from({ length: 12 }, (_, i) => hrUser(i + 1)));
  });
  afterEach(() => hr.close());

  const runSync = () =>
    startSync(
      {
        db,
        hr: createHttpHrClient({
          baseUrl: hr.url,
          timeoutMs: 2000,
          maxRetries: 0,
          baseDelayMs: 1,
          maxDelayMs: 1,
        }),
        log: { info: () => {}, error: () => {} },
        pageSize: 5,
      },
      'cli',
    ).done;

  it('moves for the first run, and a second run that finds nothing new leaves it alone', async () => {
    const before = await version();
    await runSync();
    const afterFirst = await version();
    expect(afterFirst).not.toBe(before);

    const second = await runSync();
    expect(second).toMatchObject({ created: 0, updated: 0, unchanged: 12 });
    expect(await version()).toBe(afterFirst);
  });
});

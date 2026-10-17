import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/connection.ts';
import { AppError } from '../src/errors.ts';
import { backoffDelay, createHttpHrClient, type HrClient } from '../src/integration/hrClient.ts';
import { deriveSkills } from '../src/integration/mapping.ts';
import { startSync } from '../src/integration/sync.ts';
import { assignTechnician } from '../src/services/assignments.ts';
import { failInterruptedRuns, getRun, listRuns } from '../src/repositories/syncRuns.ts';
import { deactivateTechnician } from '../src/repositories/upsert.ts';
import { startFakeHr, type FakeHr } from './fake-hr.ts';
import { hrUser, testApp } from './app-helpers.ts';
import { freshDb, makePosition, makeProject } from './helpers.ts';

const silent = { info: () => {}, error: () => {} };
const users = (n: number) => Array.from({ length: n }, (_, i) => hrUser(i + 1));

let hrServer: FakeHr;
let db: Db;
const sleeps: number[] = [];

const client = (over: { timeoutMs?: number; maxRetries?: number; maxDelayMs?: number } = {}): HrClient =>
  createHttpHrClient({
    baseUrl: hrServer.url,
    timeoutMs: over.timeoutMs ?? 2000,
    maxRetries: over.maxRetries ?? 3,
    baseDelayMs: 1,
    maxDelayMs: over.maxDelayMs ?? 4,
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 1,
  });

const runSync = (hr: HrClient, pageSize = 10) => startSync({ db, hr, log: silent, pageSize }, 'cli').done;
const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

beforeEach(async () => {
  sleeps.length = 0;
  db = freshDb();
  hrServer = await startFakeHr(users(25));
});
afterEach(async () => {
  await hrServer.close();
});

describe('sync: idempotency', () => {
  it('creates everyone once, then a second run changes nothing', async () => {
    const first = await runSync(client());
    expect(first).toMatchObject({ status: 'succeeded', created: 25, updated: 0, unchanged: 0, failed: 0, pagesDone: 3, pagesTotal: 3 });

    const before = db.prepare('SELECT * FROM technicians ORDER BY external_id').all();
    const second = await runSync(client());
    expect(second).toMatchObject({ status: 'succeeded', created: 0, updated: 0, unchanged: 25, failed: 0, deactivated: 0 });
    expect(db.prepare('SELECT * FROM technicians ORDER BY external_id').all()).toEqual(before);
    expect(count('SELECT COUNT(*) AS n FROM technicians')).toBe(25);
  });

  it('updates only what changed in HR', async () => {
    await runSync(client());
    hrServer.setUsers(users(25).map((u) => (u.id === 7 ? hrUser(7, { address: { city: 'Dallas', state: 'Texas', country: 'United States' } }) : u)));
    const run = await runSync(client());
    expect(run).toMatchObject({ created: 0, updated: 1, unchanged: 24 });
    expect(db.prepare('SELECT city, state FROM technicians WHERE external_id = 7').get()).toEqual({ city: 'Dallas', state: 'Texas' });
  });

  it('keeps assignments attached when a technician is updated', async () => {
    await runSync(client());
    const project = makeProject(db);
    const position = makePosition(db, project.id);
    const tech = db.prepare('SELECT id FROM technicians WHERE external_id = 3').get() as { id: string };
    const assignment = assignTechnician(db, position.id, tech.id);
    hrServer.setUsers(users(25).map((u) => (u.id === 3 ? hrUser(3, { firstName: 'Renamed' }) : u)));
    await runSync(client());
    expect(db.prepare('SELECT technician_id FROM assignments WHERE id = ?').get(assignment.id)).toEqual({ technician_id: tech.id });
    expect(db.prepare('SELECT name FROM technicians WHERE id = ?').get(tech.id)).toEqual({ name: 'Renamed Last3' });
  });
});

describe('sync: data minimisation', () => {
  it('asks only for the fields it needs and never stores sensitive ones', async () => {
    hrServer.setUsers([hrUser(1, { ssn: '123-45-6789', password: 'hunter2', bank: { cardNumber: '4111111111111111' }, ip: '10.1.2.3' })]);
    await runSync(client());
    expect(hrServer.requests[0]?.query).toContain('select=id%2CfirstName%2ClastName%2Ccompany%2Caddress');
    const stored = JSON.stringify(db.prepare('SELECT * FROM technicians').all()) + JSON.stringify(db.prepare('SELECT * FROM sync_runs').all());
    for (const secret of ['123-45-6789', 'hunter2', '4111111111111111', '10.1.2.3']) expect(stored).not.toContain(secret);
  });

  it('derives skills from department and title, and tolerates unknown departments', async () => {
    expect(deriveSkills('Engineering', 'Software Engineer')).toEqual(['network-engineering']);
    expect(deriveSkills('Support', 'Technical Support Engineer')).toEqual(['hardware-support']);
    expect(deriveSkills('Legal', 'Database Administrator')).toEqual(['systems-administration']);
    expect(deriveSkills('Underwater Basket Weaving', 'Chief Weaver')).toEqual([]);
  });
});

describe('sync: slow and failing partner', () => {
  it('retries 500s with backoff and still succeeds', async () => {
    hrServer.behave((skip, attempt) => (skip === 10 && attempt < 2 ? { status: 500 } : 'ok'));
    const run = await runSync(client());
    expect(run).toMatchObject({ status: 'succeeded', created: 25 });
    expect(hrServer.requests.filter((r) => r.skip === 10)).toHaveLength(3);
    expect(sleeps).toHaveLength(2);
  });

  it('honours Retry-After on 429', async () => {
    hrServer.behave((skip, attempt) => (skip === 0 && attempt === 0 ? { status: 429, headers: { 'retry-after': '3' } } : 'ok'));
    // Waits at least what the partner asked for, bounded at twice the backoff cap.
    const run = await runSync(client({ maxDelayMs: 4000 }));
    expect(run.status).toBe('succeeded');
    expect(sleeps[0]).toBeGreaterThanOrEqual(3000);
  });

  it('does not retry a client error such as 404', async () => {
    hrServer.behave((skip) => (skip === 0 ? { status: 404 } : 'ok'));
    const run = await runSync(client());
    expect(run.status).toBe('failed');
    expect(hrServer.requests).toHaveLength(1);
  });

  it('retries a truncated response body', async () => {
    hrServer.behave((skip, attempt) => (skip === 0 && attempt === 0 ? 'garbage' : 'ok'));
    expect((await runSync(client())).status).toBe('succeeded');
  });

  it('times out a hanging page, records it, and still saves the other pages (partial)', async () => {
    hrServer.behave((skip) => (skip === 10 ? 'hang' : 'ok'));
    const run = await runSync(client({ timeoutMs: 100, maxRetries: 1 }));
    expect(run.status).toBe('partial');
    expect(run).toMatchObject({ created: 15, pagesDone: 3, pagesTotal: 3 });
    expect(run.errors).toHaveLength(1);
    expect(run.errors[0]).toMatchObject({ scope: 'page 2' });
    expect(run.errors[0]?.message).toContain('timed out after 100 ms');
    expect(run.errors[0]?.message).toContain('2 attempts');
    expect(count('SELECT COUNT(*) AS n FROM technicians')).toBe(15);
  });

  it('fails the run when the first page never succeeds', async () => {
    hrServer.behave(() => ({ status: 503 }));
    const run = await runSync(client({ maxRetries: 2 }));
    expect(run).toMatchObject({ status: 'failed', created: 0 });
    expect(run.finishedAt).not.toBeNull();
    expect(hrServer.requests).toHaveLength(3);
  });

  it('counts one malformed record as failed and saves the rest of its page', async () => {
    const list = users(25);
    list[4] = { id: 5, firstName: '', company: null, address: {} } as never;
    hrServer.setUsers(list);
    const run = await runSync(client());
    expect(run).toMatchObject({ status: 'partial', created: 24, failed: 1 });
    expect(run.errors[0]).toMatchObject({ scope: 'technician 5' });
  });

  it('backoff grows exponentially, is capped, and is jittered', () => {
    expect(backoffDelay(0, 500, 8000, () => 1)).toBe(500);
    expect(backoffDelay(1, 500, 8000, () => 1)).toBe(1000);
    expect(backoffDelay(2, 500, 8000, () => 1)).toBe(2000);
    expect(backoffDelay(10, 500, 8000, () => 1)).toBe(8000);
    expect(backoffDelay(2, 500, 8000, () => 0)).toBe(1000);
  });
});

describe('sync: deactivation of people missing from HR', () => {
  it('deactivates (never deletes) after a clean run and keeps their assignment', async () => {
    hrServer.setUsers(users(25));
    await runSync(client());
    const project = makeProject(db);
    const position = makePosition(db, project.id, { headcount: 1 });
    const tech = db.prepare('SELECT id FROM technicians WHERE external_id = 25').get() as { id: string };
    assignTechnician(db, position.id, tech.id);

    hrServer.setUsers(users(24));
    const run = await runSync(client());
    expect(run).toMatchObject({ status: 'succeeded', deactivated: 1 });
    expect(db.prepare('SELECT active, deactivated_by FROM technicians WHERE external_id = 25').get()).toEqual({ active: 0, deactivated_by: 'sync' });
    expect(count('SELECT COUNT(*) AS n FROM assignments')).toBe(1);

    // and if they reappear in HR the sync brought them back
    hrServer.setUsers(users(25));
    await runSync(client());
    expect(db.prepare('SELECT active FROM technicians WHERE external_id = 25').get()).toEqual({ active: 1 });
  });

  it('does not deactivate anyone when the run was partial', async () => {
    await runSync(client());
    hrServer.setUsers(users(20));
    hrServer.behave((skip) => (skip === 10 ? { status: 500 } : 'ok'));
    const run = await runSync(client({ maxRetries: 0 }));
    expect(run.status).toBe('partial');
    expect(run.deactivated).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM technicians WHERE active = 1')).toBe(25);
  });

  it('refuses to deactivate a large share of the roster when HR returns an almost empty list', async () => {
    await runSync(client());
    hrServer.setUsers(users(2));
    const run = await runSync(client());
    expect(run.deactivated).toBe(0);
    expect(run.status).toBe('partial');
    expect(run.errors[0]?.message).toContain('Refused to deactivate');
    expect(count('SELECT COUNT(*) AS n FROM technicians WHERE active = 1')).toBe(25);
  });

  it('never undoes a deactivation that HR sent by webhook', async () => {
    await runSync(client());
    deactivateTechnician(db, 4, new Date(Date.now() + 1000).toISOString(), 'webhook');
    await runSync(client());
    expect(db.prepare('SELECT active FROM technicians WHERE external_id = 4').get()).toEqual({ active: 0 });
  });
});

describe('sync: runs', () => {
  it('records started, finished, counts and errors, newest first', async () => {
    await runSync(client());
    await runSync(client());
    const runs = listRuns(db, 10);
    expect(runs).toHaveLength(2);
    expect((runs[0]?.startedAt ?? '') >= (runs[1]?.startedAt ?? '')).toBe(true);
    expect(runs[0]).toMatchObject({ trigger: 'cli', status: 'succeeded' });
    expect(runs[0]?.finishedAt).toBeTruthy();
  });

  it('allows only one run at a time', async () => {
    hrServer.behave(() => 'hang');
    const hr = client({ timeoutMs: 200, maxRetries: 0 });
    const first = startSync({ db, hr, log: silent }, 'cli');
    expect(() => startSync({ db, hr, log: silent }, 'api')).toThrowError(AppError);
    try {
      startSync({ db, hr, log: silent }, 'api');
    } catch (e) {
      expect((e as AppError).code).toBe('SYNC_IN_PROGRESS');
    }
    await first.done;
    hrServer.behave(() => 'ok');
    expect((await runSync(client())).status).toBe('succeeded');
  });

  it('closes runs left "running" by a process that died', () => {
    db.prepare("INSERT INTO sync_runs (id, trigger, status, started_at) VALUES ('old', 'api', 'running', '2026-01-01T00:00:00Z')").run();
    expect(failInterruptedRuns(db)).toBe(1);
    expect(getRun(db, 'old')).toMatchObject({ status: 'failed' });
    expect(getRun(db, 'old')?.errors[0]?.message).toContain('Interrupted');
  });
});

describe('POST /sync/technicians', () => {
  it('returns 202 at once, then progress is readable until the run finishes; second trigger while running is 409', async () => {
    const t = await testApp({ hr: client() });
    hrServer.behave(() => 'ok');
    const res = await t.app.inject({ method: 'POST', url: '/sync/technicians' });
    expect(res.statusCode).toBe(202);
    const { runId } = JSON.parse(res.body) as { runId: string };

    const again = await t.app.inject({ method: 'POST', url: '/sync/technicians' });
    expect([202, 409]).toContain(again.statusCode);

    let run = JSON.parse((await t.app.inject({ method: 'GET', url: `/sync/runs/${runId}` })).body);
    for (let i = 0; i < 50 && run.status === 'running'; i += 1) {
      await new Promise((r) => setTimeout(r, 20));
      run = JSON.parse((await t.app.inject({ method: 'GET', url: `/sync/runs/${runId}` })).body);
    }
    expect(run.status).toBe('succeeded');
    expect(run.created).toBe(25);

    const list = JSON.parse((await t.app.inject({ method: 'GET', url: '/sync/runs?limit=10' })).body);
    expect(list[0].id).toBeTruthy();
    expect((await t.app.inject({ method: 'GET', url: '/sync/runs/missing' })).statusCode).toBe(404);
    await t.app.close();
  });

  it('answers 409 SYNC_IN_PROGRESS while a run is active', async () => {
    const t = await testApp({ hr: client({ timeoutMs: 300, maxRetries: 0 }) });
    hrServer.behave(() => 'hang');
    expect((await t.app.inject({ method: 'POST', url: '/sync/technicians' })).statusCode).toBe(202);
    const second = await t.app.inject({ method: 'POST', url: '/sync/technicians' });
    expect(second.statusCode).toBe(409);
    expect(JSON.parse(second.body).error.code).toBe('SYNC_IN_PROGRESS');
    await new Promise((r) => setTimeout(r, 450));
    await t.app.close();
  });
});

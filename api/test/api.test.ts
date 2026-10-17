import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../src/db/connection.ts';
import { testApp } from './app-helpers.ts';
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

describe('projects and positions', () => {
  it('creates and lists projects with pagination metadata', async () => {
    for (const name of ['A', 'B', 'C']) {
      const res = await app.inject({ method: 'POST', url: '/projects', payload: { name, client: 'X', site: 'Y' } });
      expect(res.statusCode).toBe(201);
    }
    const res = await app.inject({ method: 'GET', url: '/projects?page=2&pageSize=2' });
    expect(res.statusCode).toBe(200);
    expect(json(res)).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(json(res).data).toHaveLength(1);
  });

  it('creates a position under a project and derives seats', async () => {
    const project = json(await app.inject({ method: 'POST', url: '/projects', payload: { name: 'P', client: 'C', site: 'S' } }));
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/positions`,
      payload: { skill: 'network-engineering', startDate: '2026-11-03', endDate: '2026-11-14', headcount: 2 },
    });
    expect(res.statusCode).toBe(201);
    expect(json(res)).toMatchObject({ projectName: 'P', headcount: 2, seatsRemaining: 2, filled: false, assigned: [] });
  });

  it('filters positions by skill, date range and status', async () => {
    const project = makeProject(db);
    const net = makePosition(db, project.id, { skill: 'network-engineering', startDate: '2026-11-03', endDate: '2026-11-14', headcount: 1 });
    makePosition(db, project.id, { skill: 'fibre-cabling', startDate: '2026-12-01', endDate: '2026-12-05' });
    const tech = makeTechnician(db);
    await app.inject({ method: 'POST', url: `/positions/${net.id}/assignments`, payload: { technicianId: tech.id } });

    const bySkill = json(await app.inject({ method: 'GET', url: '/positions?skill=fibre-cabling' }));
    expect(bySkill.total).toBe(1);
    const byRange = json(await app.inject({ method: 'GET', url: '/positions?from=2026-11-10&to=2026-11-20' }));
    expect(byRange.data.map((p: { id: string }) => p.id)).toEqual([net.id]);
    const filled = json(await app.inject({ method: 'GET', url: '/positions?status=filled' }));
    expect(filled.data.map((p: { id: string }) => p.id)).toEqual([net.id]);
    const open = json(await app.inject({ method: 'GET', url: '/positions?status=open' }));
    expect(open.total).toBe(1);
  });

  it('rejects an end date before the start date with a field-level message', async () => {
    const project = makeProject(db);
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/positions`,
      payload: { skill: 'network-engineering', startDate: '2026-11-14', endDate: '2026-11-03', headcount: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(json(res).error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(JSON.stringify(json(res).error.details)).toContain('endDate');
  });
});

describe('one consistent error shape', () => {
  const expectShape = (res: { statusCode: number; body: string }, status: number, code: string) => {
    expect(res.statusCode).toBe(status);
    const { error } = json(res);
    expect(error.code).toBe(code);
    expect(typeof error.message).toBe('string');
    expect(error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(json(res))).toEqual(['error']);
  };

  it('400 for a bad body, unknown field, bad enum, bad date and bad headcount', async () => {
    const project = makeProject(db);
    const url = `/projects/${project.id}/positions`;
    const good = { skill: 'network-engineering', startDate: '2026-11-03', endDate: '2026-11-14', headcount: 1 };
    for (const payload of [
      { ...good, extra: 'smuggled' },
      { ...good, skill: 'juggling' },
      { ...good, startDate: '2026-13-45' },
      { ...good, headcount: 0 },
      { ...good, headcount: 'two' },
      {},
    ]) {
      expectShape(await app.inject({ method: 'POST', url, payload }), 400, 'VALIDATION_ERROR');
    }
  });

  it('400 for bad query strings', async () => {
    expectShape(await app.inject({ method: 'GET', url: '/technicians?pageSize=1000' }), 400, 'VALIDATION_ERROR');
    expectShape(await app.inject({ method: 'GET', url: '/technicians?availableFrom=2026-11-03' }), 400, 'VALIDATION_ERROR');
    expectShape(await app.inject({ method: 'GET', url: '/positions?status=maybe' }), 400, 'VALIDATION_ERROR');
  });

  it('400 for malformed JSON', async () => {
    const res = await app.inject({ method: 'POST', url: '/projects', headers: { 'content-type': 'application/json' }, payload: '{not json' });
    expectShape(res, 400, 'VALIDATION_ERROR');
  });

  it('404 for a missing resource and for an unknown route', async () => {
    expectShape(await app.inject({ method: 'GET', url: '/projects/nope' }), 404, 'NOT_FOUND');
    expectShape(await app.inject({ method: 'GET', url: '/positions/nope' }), 404, 'NOT_FOUND');
    expectShape(await app.inject({ method: 'GET', url: '/does-not-exist' }), 404, 'NOT_FOUND');
  });

  it('413 for an oversized body', async () => {
    const res = await app.inject({ method: 'POST', url: '/projects', payload: { name: 'x'.repeat(70_000), client: 'c', site: 's' } });
    expectShape(res, 413, 'PAYLOAD_TOO_LARGE');
  });

  it('500 is generic: no stack, no internals, but still carries the request id', async () => {
    db.close();
    const res = await app.inject({ method: 'GET', url: '/projects' });
    expectShape(res, 500, 'INTERNAL');
    expect(res.body).not.toMatch(/at |node_modules|sqlite|TypeError/i);
  });
});

describe('assigning through the API', () => {
  it('201 on success; 409 with an actionable message on overlap; unassign reopens the position', async () => {
    const project = makeProject(db);
    const first = makePosition(db, project.id, { headcount: 1 });
    const second = makePosition(db, project.id, { startDate: '2026-11-10', endDate: '2026-11-20' });
    const tech = makeTechnician(db, { name: 'Priya Rao' });

    const ok = await app.inject({ method: 'POST', url: `/positions/${first.id}/assignments`, payload: { technicianId: tech.id } });
    expect(ok.statusCode).toBe(201);
    expect(json(await app.inject({ method: 'GET', url: `/positions/${first.id}` }))).toMatchObject({ filled: true, seatsRemaining: 0 });

    const clash = await app.inject({ method: 'POST', url: `/positions/${second.id}/assignments`, payload: { technicianId: tech.id } });
    expect(clash.statusCode).toBe(409);
    expect(json(clash).error).toMatchObject({ code: 'ASSIGNMENT_OVERLAP' });
    expect(json(clash).error.message).toContain('Priya Rao is already booked');

    const del = await app.inject({ method: 'DELETE', url: `/positions/${first.id}/assignments/${json(ok).id}` });
    expect(del.statusCode).toBe(204);
    expect(json(await app.inject({ method: 'GET', url: `/positions/${first.id}` }))).toMatchObject({ filled: false, seatsRemaining: 1 });
  });

  it('409 SKILL_MISSING over HTTP', async () => {
    const project = makeProject(db);
    const position = makePosition(db, project.id, { skill: 'fibre-cabling' });
    const tech = makeTechnician(db);
    const res = await app.inject({ method: 'POST', url: `/positions/${position.id}/assignments`, payload: { technicianId: tech.id } });
    expect(res.statusCode).toBe(409);
    expect(json(res).error.code).toBe('SKILL_MISSING');
  });

  it('candidates show availability and the exact clash before anything is clicked', async () => {
    const project = makeProject(db, 'Frankfurt DC-2');
    const booked = makePosition(db, project.id, { startDate: '2026-11-03', endDate: '2026-11-14' });
    const target = makePosition(db, project.id, { startDate: '2026-11-10', endDate: '2026-11-20' });
    const busy = makeTechnician(db, { name: 'Busy Bee' });
    const free = makeTechnician(db, { name: 'Free Fran' });
    const wrongSkill = makeTechnician(db, { name: 'Zed Other', skills: ['fibre-cabling'] });
    await app.inject({ method: 'POST', url: `/positions/${booked.id}/assignments`, payload: { technicianId: busy.id } });

    const res = json(await app.inject({ method: 'GET', url: `/positions/${target.id}/candidates` }));
    const byName = Object.fromEntries(res.data.map((c: { name: string }) => [c.name, c]));
    expect(byName['Free Fran']).toMatchObject({ hasSkill: true, available: true, conflict: null });
    expect(byName['Busy Bee']).toMatchObject({ hasSkill: true, available: false });
    expect(byName['Busy Bee'].conflict).toMatchObject({ projectName: 'Frankfurt DC-2', startDate: '2026-11-03', endDate: '2026-11-14' });
    expect(byName['Zed Other']).toMatchObject({ hasSkill: false, available: true });
    expect(res.data.map((c: { name: string }) => c.name)).toEqual(['Free Fran', 'Busy Bee', 'Zed Other']);
    expect(free.id).toBeTruthy();
    expect(wrongSkill.id).toBeTruthy();
  });
});

describe('technicians', () => {
  beforeEach(() => {
    makeTechnician(db, { name: 'Ann Net', state: 'Texas', city: 'Austin', skills: ['network-engineering'] });
    makeTechnician(db, { name: 'Bob Fibre', state: 'Ohio', city: 'Dayton', skills: ['fibre-cabling', 'commissioning'] });
    makeTechnician(db, { name: '100% Ace', state: 'Ohio', city: 'Dayton', skills: ['commissioning'] });
  });

  it('filters by skill, state (case-insensitive) and name or skill search', async () => {
    const names = async (qs: string) => json(await app.inject({ method: 'GET', url: `/technicians?${qs}` })).data.map((t: { name: string }) => t.name);
    expect(await names('skill=fibre-cabling')).toEqual(['Bob Fibre']);
    expect(await names('state=ohio')).toEqual(['100% Ace', 'Bob Fibre']);
    expect(await names('q=ann')).toEqual(['Ann Net']);
    expect(await names('q=commission')).toEqual(['100% Ace', 'Bob Fibre']);
  });

  it('filters by availability between two dates', async () => {
    const project = makeProject(db);
    const position = makePosition(db, project.id, { skill: 'fibre-cabling', startDate: '2026-11-03', endDate: '2026-11-14' });
    const bob = json(await app.inject({ method: 'GET', url: '/technicians?q=bob' })).data[0];
    await app.inject({ method: 'POST', url: `/positions/${position.id}/assignments`, payload: { technicianId: bob.id } });

    const avail = async (from: string, to: string) =>
      json(await app.inject({ method: 'GET', url: `/technicians?availableFrom=${from}&availableTo=${to}` })).data.map((t: { name: string }) => t.name);
    expect(await avail('2026-11-10', '2026-11-20')).not.toContain('Bob Fibre');
    expect(await avail('2026-11-15', '2026-11-20')).toContain('Bob Fibre');
    expect(await avail('2026-11-14', '2026-11-14')).not.toContain('Bob Fibre');
  });

  it('treats search text as data: injection attempts and LIKE wildcards do nothing special', async () => {
    const inj = await app.inject({ method: 'GET', url: `/technicians?q=${encodeURIComponent("'; DROP TABLE technicians; --")}` });
    expect(inj.statusCode).toBe(200);
    expect(json(inj).total).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS n FROM technicians').get() as { n: number }).n).toBe(3);

    const pct = json(await app.inject({ method: 'GET', url: `/technicians?q=${encodeURIComponent('%')}` }));
    expect(pct.data.map((t: { name: string }) => t.name)).toEqual(['100% Ace']);
    const under = json(await app.inject({ method: 'GET', url: `/technicians?q=${encodeURIComponent('_')}` }));
    expect(under.total).toBe(0);
  });

  it('returns a technician with their assignments', async () => {
    const project = makeProject(db);
    const position = makePosition(db, project.id, { skill: 'fibre-cabling' });
    const bob = json(await app.inject({ method: 'GET', url: '/technicians?q=bob' })).data[0];
    await app.inject({ method: 'POST', url: `/positions/${position.id}/assignments`, payload: { technicianId: bob.id } });
    const res = json(await app.inject({ method: 'GET', url: `/technicians/${bob.id}` }));
    expect(res.assignments).toHaveLength(1);
    expect(res.skills).toEqual(['commissioning', 'fibre-cabling']);
  });
});

describe('platform hardening', () => {
  it('sets security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeTruthy();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('serves liveness, readiness and the OpenAPI document', async () => {
    expect(json(await app.inject({ method: 'GET', url: '/ready' }))).toEqual({ status: 'ready' });
    const spec = json(await app.inject({ method: 'GET', url: '/docs/json' }));
    expect(Object.keys(spec.paths)).toContain('/positions/{id}/assignments');
  });

  it('rate limits with the standard error shape, but never the health checks', async () => {
    const limited = await testApp({ env: { RATE_LIMIT_MAX: '3' } });
    for (let i = 0; i < 3; i += 1) expect((await limited.app.inject({ method: 'GET', url: '/projects' })).statusCode).toBe(200);
    const res = await limited.app.inject({ method: 'GET', url: '/projects' });
    expect(res.statusCode).toBe(429);
    expect(json(res).error.code).toBe('RATE_LIMITED');
    expect((await limited.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    await limited.app.close();
  });

  it('only allows the configured CORS origin', async () => {
    const ok = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'http://localhost:5173' } });
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const bad = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'http://evil.example' } });
    // A single configured origin is always answered with that origin, never echoed back or '*',
    // so the browser refuses the response for any other site.
    expect(bad.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});

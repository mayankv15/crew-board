import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/connection.ts';
import { AppError } from '../src/errors.ts';
import { getPosition } from '../src/repositories/positions.ts';
import { assignTechnician, unassign } from '../src/services/assignments.ts';
import { deactivateTechnician } from '../src/repositories/upsert.ts';
import { freshDb, makePosition, makeProject, makeTechnician } from './helpers.ts';

let db: Db;
let projectId: string;

beforeEach(() => {
  db = freshDb();
  projectId = makeProject(db).id;
});

function failure(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error('expected the call to throw');
}

describe('booking rule: overlapping dates', () => {
  it('allows a first assignment', () => {
    const position = makePosition(db, projectId);
    const tech = makeTechnician(db);
    const a = assignTechnician(db, position.id, tech.id);
    expect(a).toMatchObject({ positionId: position.id, technicianId: tech.id, startDate: '2026-11-03', endDate: '2026-11-14' });
  });

  it('rejects an overlapping assignment with a message naming the clash and the next free day', () => {
    const first = makePosition(db, projectId, { startDate: '2026-11-03', endDate: '2026-11-14' });
    const second = makePosition(db, projectId, { startDate: '2026-11-10', endDate: '2026-11-20' });
    const tech = makeTechnician(db, { name: 'Priya Rao' });
    assignTechnician(db, first.id, tech.id);

    const err = failure(() => assignTechnician(db, second.id, tech.id));
    expect(err.code).toBe('ASSIGNMENT_OVERLAP');
    expect(err.status).toBe(409);
    expect(err.message).toContain('Priya Rao is already booked');
    expect(err.message).toContain('Frankfurt DC-2');
    expect(err.message).toContain('3 Nov 2026 to 14 Nov 2026');
    expect(err.message).toContain('next free on 15 Nov 2026');
    expect(err.details).toMatchObject({ earliestFreeDate: '2026-11-15' });
  });

  it('rejects when one assignment ends the same day the next begins (inclusive days)', () => {
    const first = makePosition(db, projectId, { startDate: '2026-11-03', endDate: '2026-11-14' });
    const second = makePosition(db, projectId, { startDate: '2026-11-14', endDate: '2026-11-20' });
    const tech = makeTechnician(db);
    assignTechnician(db, first.id, tech.id);
    expect(failure(() => assignTechnician(db, second.id, tech.id)).code).toBe('ASSIGNMENT_OVERLAP');
  });

  it('allows an assignment that starts the day after the previous one ends', () => {
    const first = makePosition(db, projectId, { startDate: '2026-11-03', endDate: '2026-11-14' });
    const second = makePosition(db, projectId, { startDate: '2026-11-15', endDate: '2026-11-20' });
    const tech = makeTechnician(db);
    assignTechnician(db, first.id, tech.id);
    expect(() => assignTechnician(db, second.id, tech.id)).not.toThrow();
  });

  it('allows an assignment that ends the day before the existing one starts', () => {
    const later = makePosition(db, projectId, { startDate: '2026-11-10', endDate: '2026-11-14' });
    const earlier = makePosition(db, projectId, { startDate: '2026-11-01', endDate: '2026-11-09' });
    const tech = makeTechnician(db);
    assignTechnician(db, later.id, tech.id);
    expect(() => assignTechnician(db, earlier.id, tech.id)).not.toThrow();
  });

  it.each([
    ['contained in', '2026-11-05', '2026-11-08'],
    ['containing', '2026-10-01', '2026-12-01'],
    ['identical to', '2026-11-03', '2026-11-14'],
    ['overlapping the start of', '2026-10-28', '2026-11-03'],
  ])('rejects a range %s the existing booking', (_label, startDate, endDate) => {
    const first = makePosition(db, projectId);
    const other = makePosition(db, projectId, { startDate, endDate });
    const tech = makeTechnician(db);
    assignTechnician(db, first.id, tech.id);
    expect(failure(() => assignTechnician(db, other.id, tech.id)).code).toBe('ASSIGNMENT_OVERLAP');
  });

  it('does not let two different people clash with each other', () => {
    const position = makePosition(db, projectId, { headcount: 2 });
    const a = makeTechnician(db);
    const b = makeTechnician(db);
    assignTechnician(db, position.id, a.id);
    expect(() => assignTechnician(db, position.id, b.id)).not.toThrow();
  });

  it('lets exactly one of two back-to-back requests for the same person win', () => {
    const one = makePosition(db, projectId);
    const two = makePosition(db, projectId);
    const tech = makeTechnician(db);
    const results = [one.id, two.id].map((id) => {
      try {
        assignTechnician(db, id, tech.id);
        return 'ok';
      } catch (e) {
        return (e as AppError).code;
      }
    });
    expect(results.sort()).toEqual(['ASSIGNMENT_OVERLAP', 'ok']);
  });
});

describe('booking rule: skill', () => {
  it('rejects a technician without the required skill and names what they do have', () => {
    const position = makePosition(db, projectId, { skill: 'fibre-cabling' });
    const tech = makeTechnician(db, { name: 'Sam Lee', skills: ['network-engineering', 'commissioning'] });
    const err = failure(() => assignTechnician(db, position.id, tech.id));
    expect(err.code).toBe('SKILL_MISSING');
    expect(err.status).toBe(409);
    expect(err.message).toContain('Sam Lee does not have the fibre-cabling skill');
    expect(err.message).toContain('commissioning, network-engineering');
  });

  it('rejects a technician with no skills at all', () => {
    const position = makePosition(db, projectId);
    const tech = makeTechnician(db, { skills: [] });
    expect(failure(() => assignTechnician(db, position.id, tech.id)).message).toContain('no recorded skills');
  });
});

describe('booking rule: other guards', () => {
  it('rejects assigning the same person twice to one position', () => {
    const position = makePosition(db, projectId, { headcount: 2 });
    const tech = makeTechnician(db);
    assignTechnician(db, position.id, tech.id);
    expect(failure(() => assignTechnician(db, position.id, tech.id)).code).toBe('ALREADY_ASSIGNED');
  });

  it('rejects an inactive technician', () => {
    const position = makePosition(db, projectId);
    const tech = makeTechnician(db);
    deactivateTechnician(db, tech.externalId, new Date().toISOString(), 'webhook');
    expect(failure(() => assignTechnician(db, position.id, tech.id)).code).toBe('TECHNICIAN_INACTIVE');
  });

  it('returns 404 for an unknown position or technician', () => {
    const position = makePosition(db, projectId);
    const tech = makeTechnician(db);
    expect(failure(() => assignTechnician(db, 'nope', tech.id)).code).toBe('NOT_FOUND');
    expect(failure(() => assignTechnician(db, position.id, 'nope')).code).toBe('NOT_FOUND');
  });
});

describe('filled is derived from assignments', () => {
  it('fills at headcount, refuses one more, and reopens when someone is removed', () => {
    const position = makePosition(db, projectId, { headcount: 2 });
    const [a, b, c] = [makeTechnician(db), makeTechnician(db), makeTechnician(db)] as const;

    const first = assignTechnician(db, position.id, a.id);
    expect(getPosition(db, position.id)).toMatchObject({ filled: false, seatsRemaining: 1 });

    assignTechnician(db, position.id, b.id);
    expect(getPosition(db, position.id)).toMatchObject({ filled: true, seatsRemaining: 0 });
    expect(failure(() => assignTechnician(db, position.id, c.id)).code).toBe('POSITION_FULL');

    unassign(db, position.id, first.id);
    expect(getPosition(db, position.id)).toMatchObject({ filled: false, seatsRemaining: 1 });
    expect(() => assignTechnician(db, position.id, c.id)).not.toThrow();
  });

  it('reopens by itself when HR deactivates an assignee, keeps the assignment, and restores on reactivation', () => {
    const position = makePosition(db, projectId, { headcount: 1 });
    const tech = makeTechnician(db);
    assignTechnician(db, position.id, tech.id);
    expect(getPosition(db, position.id)?.filled).toBe(true);

    deactivateTechnician(db, tech.externalId, new Date(Date.now() + 1000).toISOString(), 'webhook');
    const reopened = getPosition(db, position.id)!;
    expect(reopened).toMatchObject({ filled: false, seatsRemaining: 1 });
    expect(reopened.assigned).toEqual([expect.objectContaining({ technicianId: tech.id, active: false })]);
  });

  it('unassign only works through the position that owns the assignment', () => {
    const one = makePosition(db, projectId);
    const two = makePosition(db, projectId, { startDate: '2026-12-01', endDate: '2026-12-05' });
    const tech = makeTechnician(db);
    const a = assignTechnician(db, one.id, tech.id);
    expect(failure(() => unassign(db, two.id, a.id)).code).toBe('NOT_FOUND');
    expect(() => unassign(db, one.id, a.id)).not.toThrow();
    expect(failure(() => unassign(db, one.id, a.id)).code).toBe('NOT_FOUND');
  });
});

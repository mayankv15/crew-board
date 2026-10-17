import type { Skill } from '@crew-board/shared';
import { openDatabase, type Db } from '../src/db/connection.ts';
import { createProject } from '../src/repositories/projects.ts';
import { createPosition } from '../src/repositories/positions.ts';
import { upsertTechnician, type TechnicianInput } from '../src/repositories/upsert.ts';

export const freshDb = (): Db => openDatabase(':memory:');

export function makeProject(db: Db, name = 'Frankfurt DC-2') {
  return createProject(db, { name, client: 'NorthStar Cloud', site: 'Frankfurt' });
}

export function makePosition(
  db: Db,
  projectId: string,
  over: Partial<{ skill: Skill; startDate: string; endDate: string; headcount: number }> = {},
) {
  return createPosition(db, projectId, {
    skill: 'network-engineering',
    startDate: '2026-11-03',
    endDate: '2026-11-14',
    headcount: 2,
    ...over,
  });
}

let nextExternal = 1;
export function makeTechnician(db: Db, over: Partial<TechnicianInput> = {}) {
  const externalId = over.externalId ?? nextExternal++;
  const input: TechnicianInput = {
    externalId,
    name: `Tech ${externalId}`,
    title: 'Engineer',
    department: 'Engineering',
    city: 'Phoenix',
    state: 'Arizona',
    country: 'United States',
    skills: ['network-engineering'],
    ...over,
  };
  upsertTechnician(db, input, new Date().toISOString());
  const row = db.prepare('SELECT id FROM technicians WHERE external_id = ?').get(externalId) as { id: string };
  return { id: row.id, externalId, name: input.name };
}

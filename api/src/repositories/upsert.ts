import { randomUUID } from 'node:crypto';
import type { Skill } from '@crew-board/shared';
import type { Db } from '../db/connection.ts';
import { getTechnicianByExternalId, skillsFor } from './technicians.ts';
import { nowIso } from './util.ts';

export interface TechnicianInput {
  externalId: number;
  name: string;
  title: string;
  department: string;
  city: string;
  state: string;
  country: string;
  skills: Skill[];
}

export type UpsertOutcome = 'created' | 'updated' | 'unchanged' | 'stale';

interface UpsertOptions {
  source: 'sync' | 'webhook';
  active?: boolean;
}

const FIELDS = ['name', 'title', 'department', 'city', 'state', 'country'] as const;

function writeSkills(db: Db, technicianId: string, skills: Skill[]): void {
  db.prepare('DELETE FROM technician_skills WHERE technician_id = ?').run(technicianId);
  const insert = db.prepare('INSERT INTO technician_skills (technician_id, skill) VALUES (?, ?)');
  for (const skill of new Set(skills)) insert.run(technicianId, skill);
}

export function upsertTechnician(
  db: Db,
  input: TechnicianInput,
  observedAt: string,
  options: UpsertOptions = { source: 'sync' },
): UpsertOutcome {
  const existing = getTechnicianByExternalId(db, input.externalId);
  const now = nowIso();

  if (!existing) {
    const id = randomUUID();
    const active = options.active ?? true;
    db.prepare(
      'INSERT INTO technicians (id, external_id, name, title, department, city, state, country, active, deactivated_at, deactivated_by, hr_updated_at, created_at, updated_at) ' +
        'VALUES (@id, @externalId, @name, @title, @department, @city, @state, @country, @active, @deactivatedAt, @deactivatedBy, @observedAt, @now, @now)',
    ).run({
      id,
      ...input,
      active: active ? 1 : 0,
      deactivatedAt: active ? null : observedAt,
      deactivatedBy: active ? null : options.source,
      observedAt,
      now,
    });
    writeSkills(db, id, input.skills);
    return 'created';
  }

  if (existing.hr_updated_at > observedAt) return 'stale';

  const currentSkills = skillsFor(db, [existing.id]).get(existing.id) ?? [];
  const sameSkills =
    currentSkills.length === new Set(input.skills).size && input.skills.every((s) => currentSkills.includes(s));
  const sameFields = FIELDS.every((f) => existing[f] === input[f]);

  let nextActive = existing.active === 1;
  let deactivatedBy = existing.deactivated_by;
  let deactivatedAt = existing.deactivated_at;
  if (options.active === false && existing.active === 1) {
    nextActive = false;
    deactivatedBy = options.source;
    deactivatedAt = observedAt;
  } else if (
    existing.active === 0 &&
    (options.active === true ||
      (options.active === undefined && options.source === 'sync' && existing.deactivated_by === 'sync'))
  ) {
    nextActive = true;
    deactivatedBy = null;
    deactivatedAt = null;
  }
  const sameActive = nextActive === (existing.active === 1);

  if (sameFields && sameSkills && sameActive) return 'unchanged';

  db.prepare(
    'UPDATE technicians SET name = @name, title = @title, department = @department, city = @city, state = @state, ' +
      'country = @country, active = @active, deactivated_at = @deactivatedAt, deactivated_by = @deactivatedBy, ' +
      'hr_updated_at = @observedAt, updated_at = @now WHERE id = @id',
  ).run({
    id: existing.id,
    name: input.name,
    title: input.title,
    department: input.department,
    city: input.city,
    state: input.state,
    country: input.country,
    active: nextActive ? 1 : 0,
    deactivatedAt,
    deactivatedBy,
    observedAt,
    now,
  });
  if (!sameSkills) writeSkills(db, existing.id, input.skills);
  return 'updated';
}

export type DeactivateOutcome = 'deactivated' | 'unchanged' | 'stale' | 'unknown';

export function deactivateTechnician(
  db: Db,
  externalId: number,
  observedAt: string,
  by: 'sync' | 'webhook',
): DeactivateOutcome {
  const existing = getTechnicianByExternalId(db, externalId);
  if (!existing) return 'unknown';
  if (existing.hr_updated_at > observedAt) return 'stale';
  if (existing.active === 0) return 'unchanged';
  db.prepare(
    'UPDATE technicians SET active = 0, deactivated_at = ?, deactivated_by = ?, hr_updated_at = ?, updated_at = ? WHERE id = ?',
  ).run(observedAt, by, observedAt, nowIso(), existing.id);
  return 'deactivated';
}

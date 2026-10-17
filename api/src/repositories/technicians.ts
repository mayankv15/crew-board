import type {
  Candidate,
  CandidateQuery,
  Conflict,
  Page,
  Position,
  Skill,
  Technician,
  TechnicianDetail,
  TechnicianQuery,
} from '@crew-board/shared';
import type { Db } from '../db/connection.ts';
import { likePattern, placeholders, toPage } from './util.ts';

export interface TechnicianRow {
  id: string;
  external_id: number;
  name: string;
  title: string;
  department: string;
  city: string;
  state: string;
  country: string;
  active: number;
  deactivated_at: string | null;
  deactivated_by: 'sync' | 'webhook' | null;
  hr_updated_at: string;
}

const COLUMNS =
  't.id, t.external_id, t.name, t.title, t.department, t.city, t.state, t.country, t.active, ' +
  't.deactivated_at, t.deactivated_by, t.hr_updated_at';

export function skillsFor(db: Db, ids: string[]): Map<string, Skill[]> {
  const map = new Map<string, Skill[]>();
  if (ids.length === 0) return map;
  const rows = db
    .prepare(
      'SELECT technician_id, skill FROM technician_skills WHERE technician_id IN (' +
        placeholders(ids.length) +
        ') ORDER BY skill',
    )
    .all(...ids) as { technician_id: string; skill: Skill }[];
  for (const r of rows) map.set(r.technician_id, [...(map.get(r.technician_id) ?? []), r.skill]);
  return map;
}

export function toTechnician(row: TechnicianRow, skills: Skill[]): Technician {
  return {
    id: row.id,
    externalId: row.external_id,
    name: row.name,
    title: row.title,
    department: row.department,
    city: row.city,
    state: row.state,
    country: row.country,
    active: row.active === 1,
    skills,
  };
}

const NAME_OR_SKILL_MATCH =
  "(t.name LIKE @q ESCAPE '\\' OR EXISTS (SELECT 1 FROM technician_skills s WHERE s.technician_id = t.id AND s.skill LIKE @q ESCAPE '\\'))";

export function listTechnicians(db: Db, query: TechnicianQuery): Page<Technician> {
  // Every fragment is a constant; values only ever travel as bound parameters.
  const where =
    ' WHERE (@skill IS NULL OR EXISTS (SELECT 1 FROM technician_skills s WHERE s.technician_id = t.id AND s.skill = @skill))' +
    ' AND (@state IS NULL OR t.state = @state COLLATE NOCASE)' +
    ' AND (@city IS NULL OR t.city = @city COLLATE NOCASE)' +
    ' AND (@q IS NULL OR ' +
    NAME_OR_SKILL_MATCH +
    ')' +
    ' AND (@active IS NULL OR t.active = @active)' +
    ' AND (@availFrom IS NULL OR NOT EXISTS (SELECT 1 FROM assignments a WHERE a.technician_id = t.id' +
    ' AND a.start_date <= @availTo AND a.end_date >= @availFrom))';
  const params = {
    skill: query.skill ?? null,
    state: query.state ?? null,
    city: query.city ?? null,
    q: query.q ? likePattern(query.q) : null,
    active: query.active === undefined ? null : query.active ? 1 : 0,
    availFrom: query.availableFrom ?? null,
    availTo: query.availableTo ?? null,
  };
  const total = (db.prepare('SELECT COUNT(*) AS n FROM technicians t' + where).get(params) as { n: number }).n;
  const rows = db
    .prepare(
      'SELECT ' + COLUMNS + ' FROM technicians t' + where +
        ' ORDER BY t.name COLLATE NOCASE, t.id LIMIT @limit OFFSET @offset',
    )
    .all({ ...params, limit: query.pageSize, offset: (query.page - 1) * query.pageSize }) as TechnicianRow[];
  const skills = skillsFor(db, rows.map((r) => r.id));
  return toPage(rows.map((r) => toTechnician(r, skills.get(r.id) ?? [])), total, query.page, query.pageSize);
}

export function getTechnicianRow(db: Db, id: string): TechnicianRow | undefined {
  return db.prepare('SELECT ' + COLUMNS + ' FROM technicians t WHERE t.id = ?').get(id) as TechnicianRow | undefined;
}

export function getTechnicianByExternalId(db: Db, externalId: number): TechnicianRow | undefined {
  return db.prepare('SELECT ' + COLUMNS + ' FROM technicians t WHERE t.external_id = ?').get(externalId) as
    | TechnicianRow
    | undefined;
}

export function getTechnician(db: Db, id: string): Technician | undefined {
  const row = getTechnicianRow(db, id);
  return row && toTechnician(row, skillsFor(db, [id]).get(id) ?? []);
}

export function getTechnicianDetail(db: Db, id: string): TechnicianDetail | undefined {
  const technician = getTechnician(db, id);
  if (!technician) return undefined;
  return { ...technician, assignments: assignmentsOf(db, id) };
}

const ASSIGNMENT_SUMMARY =
  'SELECT a.technician_id, a.id AS assignment_id, a.position_id, pr.name AS project_name, p.skill, a.start_date, a.end_date ' +
  'FROM assignments a JOIN positions p ON p.id = a.position_id JOIN projects pr ON pr.id = p.project_id';

interface SummaryRow {
  technician_id: string;
  assignment_id: string;
  position_id: string;
  project_name: string;
  skill: Skill;
  start_date: string;
  end_date: string;
}

const toConflict = (r: SummaryRow): Conflict => ({
  assignmentId: r.assignment_id,
  positionId: r.position_id,
  projectName: r.project_name,
  skill: r.skill,
  startDate: r.start_date,
  endDate: r.end_date,
});

export function assignmentsOf(db: Db, technicianId: string): Conflict[] {
  const rows = db
    .prepare(ASSIGNMENT_SUMMARY + ' WHERE a.technician_id = ? ORDER BY a.start_date, a.id')
    .all(technicianId) as SummaryRow[];
  return rows.map(toConflict);
}

// Drawer data: active technicians, each with whether they have the skill, whether they are free for
// the position's dates and, if not, which booking is in the way. Skilled and free people come first.
export function listCandidates(db: Db, position: Position, query: CandidateQuery): Page<Candidate> {
  const BUSY =
    '(EXISTS (SELECT 1 FROM assignments a WHERE a.technician_id = t.id AND a.position_id <> @positionId' +
    ' AND a.start_date <= @end AND a.end_date >= @start))';
  const HAS_SKILL = '(EXISTS (SELECT 1 FROM technician_skills s WHERE s.technician_id = t.id AND s.skill = @skill))';
  const where = ' WHERE t.active = 1 AND (@q IS NULL OR ' + NAME_OR_SKILL_MATCH + ')';
  const params = {
    positionId: position.id,
    start: position.startDate,
    end: position.endDate,
    skill: position.skill,
    q: query.q ? likePattern(query.q) : null,
  };
  const total = (db.prepare('SELECT COUNT(*) AS n FROM technicians t' + where).get({ q: params.q }) as { n: number }).n;
  const rows = db
    .prepare(
      'SELECT ' + COLUMNS + ', ' + HAS_SKILL + ' AS has_skill, ' + BUSY + ' AS busy FROM technicians t' + where +
        ' ORDER BY has_skill DESC, busy ASC, t.name COLLATE NOCASE, t.id LIMIT @limit OFFSET @offset',
    )
    .all({ ...params, limit: query.pageSize, offset: (query.page - 1) * query.pageSize }) as (TechnicianRow & {
    has_skill: number;
    busy: number;
  })[];

  const ids = rows.map((r) => r.id);
  const skills = skillsFor(db, ids);
  const conflicts = new Map<string, Conflict>();
  const alreadyHere = new Set<string>();
  if (ids.length > 0) {
    const marks = placeholders(ids.length);
    const clashes = db
      .prepare(
        ASSIGNMENT_SUMMARY + ' WHERE a.technician_id IN (' + marks + ') AND a.position_id <> ? ' +
          'AND a.start_date <= ? AND a.end_date >= ? ORDER BY a.start_date, a.id',
      )
      .all(...ids, position.id, position.endDate, position.startDate) as SummaryRow[];
    for (const c of clashes) if (!conflicts.has(c.technician_id)) conflicts.set(c.technician_id, toConflict(c));
    const here = db
      .prepare('SELECT technician_id FROM assignments WHERE position_id = ? AND technician_id IN (' + marks + ')')
      .all(position.id, ...ids) as { technician_id: string }[];
    for (const h of here) alreadyHere.add(h.technician_id);
  }

  return toPage(
    rows.map((r) => ({
      ...toTechnician(r, skills.get(r.id) ?? []),
      hasSkill: r.has_skill === 1,
      alreadyAssigned: alreadyHere.has(r.id),
      available: r.busy === 0,
      conflict: conflicts.get(r.id) ?? null,
    })),
    total,
    query.page,
    query.pageSize,
  );
}

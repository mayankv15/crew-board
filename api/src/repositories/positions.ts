import { randomUUID } from 'node:crypto';
import type {
  AssignedPerson,
  CreatePositionBody,
  Page,
  Position,
  PositionQuery,
  Skill,
} from '@crew-board/shared';
import type { Db } from '../db/connection.ts';
import { nowIso, placeholders, toPage } from './util.ts';

interface PositionRow {
  id: string;
  project_id: string;
  project_name: string;
  skill: Skill;
  start_date: string;
  end_date: string;
  headcount: number;
  seats_taken: number;
}

// Stored or derived? Derived.
// "Filled" depends on assignments AND on whether each assignee is still active at HR. A stored flag
// would be a second source of truth that assign, unassign, HR deactivation and sync would all have
// to keep in step; one missed path leaves it wrong. Counting here costs one indexed subquery and can
// never drift. If it ever got slow we would cache the count, not a flag.
const SEATS_TAKEN =
  '(SELECT COUNT(*) FROM assignments a JOIN technicians t ON t.id = a.technician_id ' +
  'WHERE a.position_id = p.id AND t.active = 1)';

const SELECT =
  'SELECT p.id, p.project_id, pr.name AS project_name, p.skill, p.start_date, p.end_date, p.headcount, ' +
  SEATS_TAKEN +
  ' AS seats_taken FROM positions p JOIN projects pr ON pr.id = p.project_id';

function toPosition(row: PositionRow, assigned: AssignedPerson[]): Position {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    skill: row.skill,
    startDate: row.start_date,
    endDate: row.end_date,
    headcount: row.headcount,
    assigned,
    seatsRemaining: Math.max(0, row.headcount - row.seats_taken),
    filled: row.seats_taken >= row.headcount,
  };
}

function assignedFor(db: Db, positionIds: string[]): Map<string, AssignedPerson[]> {
  const byPosition = new Map<string, AssignedPerson[]>();
  if (positionIds.length === 0) return byPosition;
  const rows = db
    .prepare(
      'SELECT a.position_id, a.id AS assignment_id, t.id AS technician_id, t.name, t.active ' +
        'FROM assignments a JOIN technicians t ON t.id = a.technician_id ' +
        'WHERE a.position_id IN (' +
        placeholders(positionIds.length) +
        ') ORDER BY a.created_at, a.id',
    )
    .all(...positionIds) as {
    position_id: string;
    assignment_id: string;
    technician_id: string;
    name: string;
    active: number;
  }[];
  for (const r of rows) {
    const list = byPosition.get(r.position_id) ?? [];
    list.push({ assignmentId: r.assignment_id, technicianId: r.technician_id, name: r.name, active: r.active === 1 });
    byPosition.set(r.position_id, list);
  }
  return byPosition;
}

export function listPositions(db: Db, query: PositionQuery): Page<Position> {
  // Every fragment is a constant; values only ever travel as bound parameters.
  const where =
    ' WHERE (@projectId IS NULL OR pos.project_id = @projectId)' +
    ' AND (@skill IS NULL OR pos.skill = @skill)' +
    ' AND (@from IS NULL OR pos.end_date >= @from)' +
    ' AND (@to IS NULL OR pos.start_date <= @to)' +
    " AND (@status IS NULL OR (@status = 'open' AND pos.seats_taken < pos.headcount)" +
    " OR (@status = 'filled' AND pos.seats_taken >= pos.headcount))";
  const params = {
    projectId: query.projectId ?? null,
    skill: query.skill ?? null,
    from: query.from ?? null,
    to: query.to ?? null,
    status: query.status ?? null,
  };
  const base = 'SELECT * FROM (' + SELECT + ') pos';
  const total = (db.prepare('SELECT COUNT(*) AS n FROM (' + SELECT + ') pos' + where).get(params) as { n: number }).n;
  const rows = db
    .prepare(base + where + ' ORDER BY pos.start_date, pos.id LIMIT @limit OFFSET @offset')
    .all({ ...params, limit: query.pageSize, offset: (query.page - 1) * query.pageSize }) as PositionRow[];
  const assigned = assignedFor(db, rows.map((r) => r.id));
  return toPage(
    rows.map((r) => toPosition(r, assigned.get(r.id) ?? [])),
    total,
    query.page,
    query.pageSize,
  );
}

export function getPosition(db: Db, id: string): Position | undefined {
  const row = db.prepare(SELECT + ' WHERE p.id = ?').get(id) as PositionRow | undefined;
  return row && toPosition(row, assignedFor(db, [id]).get(id) ?? []);
}

export function createPosition(db: Db, projectId: string, body: CreatePositionBody): Position {
  const id = randomUUID();
  db.prepare(
    'INSERT INTO positions (id, project_id, skill, start_date, end_date, headcount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, projectId, body.skill, body.startDate, body.endDate, body.headcount, nowIso());
  return getPosition(db, id)!;
}

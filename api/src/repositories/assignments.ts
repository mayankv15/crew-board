import { randomUUID } from 'node:crypto';
import type { Assignment, Conflict } from '@crew-board/shared';
import type { DateRange } from '../domain/dates.ts';
import type { Db } from '../db/connection.ts';
import { nowIso } from './util.ts';

interface AssignmentRow {
  id: string;
  position_id: string;
  technician_id: string;
  start_date: string;
  end_date: string;
  created_at: string;
}

const toAssignment = (r: AssignmentRow): Assignment => ({
  id: r.id,
  positionId: r.position_id,
  technicianId: r.technician_id,
  startDate: r.start_date,
  endDate: r.end_date,
  createdAt: r.created_at,
});

export function getAssignment(db: Db, id: string): Assignment | undefined {
  const row = db.prepare('SELECT * FROM assignments WHERE id = ?').get(id) as AssignmentRow | undefined;
  return row && toAssignment(row);
}

export function isAssigned(db: Db, positionId: string, technicianId: string): boolean {
  return db.prepare('SELECT 1 FROM assignments WHERE position_id = ? AND technician_id = ?').get(positionId, technicianId) !== undefined;
}

// Bookings of this technician that share at least one day with `range`, earliest first.
// Overlap test: each range starts on or before the day the other ends (inclusive days).
export function findOverlapping(db: Db, technicianId: string, range: DateRange): Conflict[] {
  const rows = db
    .prepare(
      'SELECT a.id AS assignment_id, a.position_id, pr.name AS project_name, p.skill, a.start_date, a.end_date ' +
        'FROM assignments a JOIN positions p ON p.id = a.position_id JOIN projects pr ON pr.id = p.project_id ' +
        'WHERE a.technician_id = @technicianId AND a.start_date <= @end AND a.end_date >= @start ' +
        'ORDER BY a.start_date, a.id',
    )
    .all({ technicianId, start: range.startDate, end: range.endDate }) as {
    assignment_id: string;
    position_id: string;
    project_name: string;
    skill: Conflict['skill'];
    start_date: string;
    end_date: string;
  }[];
  return rows.map((r) => ({
    assignmentId: r.assignment_id,
    positionId: r.position_id,
    projectName: r.project_name,
    skill: r.skill,
    startDate: r.start_date,
    endDate: r.end_date,
  }));
}

// Every booking of this technician that ends on or after `from`; used to find the next free day.
export function upcomingRanges(db: Db, technicianId: string, from: string): DateRange[] {
  const rows = db
    .prepare('SELECT start_date, end_date FROM assignments WHERE technician_id = ? AND end_date >= ?')
    .all(technicianId, from) as { start_date: string; end_date: string }[];
  return rows.map((r) => ({ startDate: r.start_date, endDate: r.end_date }));
}

// Seats taken = assignments whose technician is still active at HR.
export function seatsTaken(db: Db, positionId: string): number {
  return (
    db
      .prepare(
        'SELECT COUNT(*) AS n FROM assignments a JOIN technicians t ON t.id = a.technician_id WHERE a.position_id = ? AND t.active = 1',
      )
      .get(positionId) as { n: number }
  ).n;
}

export function insertAssignment(db: Db, positionId: string, technicianId: string, range: DateRange): Assignment {
  const id = randomUUID();
  db.prepare(
    'INSERT INTO assignments (id, position_id, technician_id, start_date, end_date, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, positionId, technicianId, range.startDate, range.endDate, nowIso());
  return getAssignment(db, id)!;
}

export function deleteAssignment(db: Db, id: string): void {
  db.prepare('DELETE FROM assignments WHERE id = ?').run(id);
}

import type { Assignment } from '@crew-board/shared';
import type { Db } from '../db/connection.ts';
import { earliestFreeDay, formatDay, formatRange } from '../domain/dates.ts';
import { AppError, notFound } from '../errors.ts';
import {
  deleteAssignment,
  findOverlapping,
  getAssignment,
  insertAssignment,
  isAssigned,
  seatsTaken,
  upcomingRanges,
} from '../repositories/assignments.ts';
import { getPosition } from '../repositories/positions.ts';
import { getTechnicianRow, skillsFor } from '../repositories/technicians.ts';

export function assignTechnician(db: Db, positionId: string, technicianId: string): Assignment {
  return db
    .transaction((): Assignment => {
      const position = getPosition(db, positionId);
      if (!position) throw notFound('Position');
      const technician = getTechnicianRow(db, technicianId);
      if (!technician) throw notFound('Technician');

      if (technician.active !== 1) {
        const since = technician.deactivated_at ? ` on ${formatDay(technician.deactivated_at.slice(0, 10))}` : '';
        throw new AppError(
          'TECHNICIAN_INACTIVE',
          `${technician.name} was deactivated by HR${since} and cannot be assigned. Pick another technician.`,
          { technicianId },
        );
      }

      const skills = skillsFor(db, [technicianId]).get(technicianId) ?? [];
      if (!skills.includes(position.skill)) {
        const has = skills.length > 0 ? skills.join(', ') : 'no recorded skills';
        throw new AppError(
          'SKILL_MISSING',
          `${technician.name} does not have the ${position.skill} skill this position needs (they have: ${has}). Pick a technician with ${position.skill}.`,
          { technicianId, requiredSkill: position.skill, skills },
        );
      }

      if (isAssigned(db, positionId, technicianId)) {
        throw new AppError('ALREADY_ASSIGNED', `${technician.name} is already assigned to this position.`, {
          technicianId,
        });
      }

      const [clash] = findOverlapping(db, technicianId, position);
      if (clash) {
        const free = earliestFreeDay(upcomingRanges(db, technicianId, position.startDate), position.startDate);
        throw new AppError(
          'ASSIGNMENT_OVERLAP',
          `${technician.name} is already booked as ${clash.skill} on ${clash.projectName} from ${formatRange(clash)}, ` +
            `which overlaps this position (${formatRange(position)}). ` +
            `Pick another technician, or free them from that booking first. They are next free on ${formatDay(free)}.`,
          { technicianId, conflictingAssignmentId: clash.assignmentId, earliestFreeDate: free },
        );
      }

      if (seatsTaken(db, positionId) >= position.headcount) {
        throw new AppError(
          'POSITION_FULL',
          `All ${position.headcount} seats on this position are filled. Unassign someone first, or create another position.`,
          { positionId, headcount: position.headcount },
        );
      }

      return insertAssignment(db, positionId, technicianId, position);
    })
    .immediate();
}

export function unassign(db: Db, positionId: string, assignmentId: string): void {
  const assignment = getAssignment(db, assignmentId);
  if (!assignment || assignment.positionId !== positionId) throw notFound('Assignment');
  deleteAssignment(db, assignmentId);
}

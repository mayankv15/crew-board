import { formatRange, type Candidate, type Position } from '@crew-board/shared';
import { skillLabel } from '../../shared/skills.ts';

export interface CandidateStatus {
  kind: 'ok' | 'busy' | 'no-skill' | 'here' | 'full';
  text: string;
}

export function candidateStatus(c: Candidate, position: Position): CandidateStatus {
  if (c.alreadyAssigned) return { kind: 'here', text: 'Already on this position' };
  if (!c.hasSkill) return { kind: 'no-skill', text: `Does not have ${skillLabel(position.skill)}` };
  if (c.conflict) return { kind: 'busy', text: `Busy ${formatRange(c.conflict)} on ${c.conflict.projectName}` };
  if (position.filled) return { kind: 'full', text: 'This position is full' };
  return { kind: 'ok', text: 'Available for these dates' };
}

import type { Position } from '@crew-board/shared';
import { useAppDispatch } from '../../app/hooks.ts';
import { announce } from '../../app/uiSlice.ts';
import { useUnassignMutation } from '../../shared/api.ts';
import { errorMessage } from '../../shared/errors.ts';
import { skillLabel } from '../../shared/skills.ts';

export const positionTitle = (p: Pick<Position, 'projectName' | 'skill'>): string =>
  `${p.projectName}, ${skillLabel(p.skill)}`;

export function useUnassign(position: Position) {
  const dispatch = useAppDispatch();
  const [unassign, state] = useUnassignMutation();
  const title = positionTitle(position);

  const remove = async (assignmentId: string, technicianId: string, name: string) => {
    try {
      await unassign({ positionId: position.id, assignmentId }).unwrap();
      dispatch(
        announce(`${name} was unassigned. ${title} has an open seat.`, 'success', {
          positionId: position.id,
          technicianId,
          technicianName: name,
        }),
      );
    } catch (e) {
      dispatch(announce(`Could not unassign ${name}. ${errorMessage(e)}`, 'error'));
    }
  };

  return { remove, error: state.error, isError: state.isError };
}

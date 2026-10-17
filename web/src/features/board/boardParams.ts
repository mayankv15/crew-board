import { IsoDate, POSITION_SORTS, SKILLS, type PositionSort, type Skill } from '@crew-board/shared';
import type { BoardFilters } from '../../shared/api.ts';

export type Tab = 'open' | 'filled';

export interface BoardView {
  tab: Tab;
  sort: PositionSort;
  filters: BoardFilters;
}

export const SORT_LABELS: Record<PositionSort, string> = {
  start: 'Soonest start',
  'start-desc': 'Latest start',
  seats: 'Most seats open',
  project: 'Project A to Z',
};

const intIn = (value: string | null, min: number, max: number): number | undefined => {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n >= min && n <= max ? n : undefined;
};

export function parseView(params: URLSearchParams): BoardView {
  const skill = params.get('skill');
  const from = IsoDate.safeParse(params.get('from'));
  const to = IsoDate.safeParse(params.get('to'));
  const sort = params.get('sort');
  const staffing = params.get('staffing');
  const assignee = params.get('assignee')?.trim().slice(0, 80);
  const minSeats = intIn(params.get('seats'), 1, 50);
  const startsWithin = intIn(params.get('within'), 1, 365);
  return {
    tab: params.get('tab') === 'filled' ? 'filled' : 'open',
    sort: (POSITION_SORTS as readonly string[]).includes(sort ?? '') ? (sort as PositionSort) : 'start',
    filters: {
      ...(skill && (SKILLS as readonly string[]).includes(skill) ? { skill: skill as Skill } : {}),
      ...(from.success ? { from: from.data } : {}),
      ...(to.success ? { to: to.data } : {}),
      ...(assignee ? { assignee } : {}),
      ...(staffing === 'none' || staffing === 'some' ? { staffing } : {}),
      ...(params.get('replace') === '1' ? { needsReplacement: true } : {}),
      ...(minSeats ? { minSeats } : {}),
      ...(startsWithin ? { startsWithin } : {}),
    },
  };
}

export function toParams(view: BoardView): URLSearchParams {
  const params = new URLSearchParams();
  const f = view.filters;
  if (view.tab !== 'open') params.set('tab', view.tab);
  if (view.sort !== 'start') params.set('sort', view.sort);
  if (f.skill) params.set('skill', f.skill);
  if (f.from) params.set('from', f.from);
  if (f.to) params.set('to', f.to);
  if (f.assignee) params.set('assignee', f.assignee);
  if (f.staffing) params.set('staffing', f.staffing);
  if (f.needsReplacement) params.set('replace', '1');
  if (f.minSeats) params.set('seats', String(f.minSeats));
  if (f.startsWithin) params.set('within', String(f.startsWithin));
  return params;
}

export const activeFilterCount = (f: BoardFilters): number =>
  Object.values(f).filter((v) => v !== undefined && v !== '' && v !== false).length;

export interface GridSort {
  field: 'project' | 'dates' | 'seats';
  sort: 'asc' | 'desc';
}

export const SORT_TO_GRID: Record<PositionSort, GridSort> = {
  start: { field: 'dates', sort: 'asc' },
  'start-desc': { field: 'dates', sort: 'desc' },
  seats: { field: 'seats', sort: 'desc' },
  project: { field: 'project', sort: 'asc' },
};

export function gridToSort(
  model: readonly { field: string; sort?: 'asc' | 'desc' | null | undefined }[],
): PositionSort {
  const first = model[0];
  if (!first || !first.sort) return 'start';
  if (first.field === 'dates') return first.sort === 'desc' ? 'start-desc' : 'start';
  if (first.field === 'seats') return 'seats';
  if (first.field === 'project') return 'project';
  return 'start';
}

import type { PositionSummary } from '@crew-board/shared';
import type { BoardFilters } from '../../shared/api.ts';
import type { Tab } from './boardParams.ts';

export interface QuickView {
  id: string;
  label: string;
  tone: 'warning' | 'primary';
  filters: BoardFilters;
  count: (summary: PositionSummary) => number;
}

export const QUICK_VIEWS: readonly QuickView[] = [
  {
    id: 'replacement',
    label: 'Needs replacement',
    tone: 'warning',
    filters: { needsReplacement: true },
    count: (s) => s.needsReplacement,
  },
  {
    id: 'soon',
    label: 'Starts within 7 days',
    tone: 'primary',
    filters: { startsWithin: 7 },
    count: (s) => s.startingWithin7,
  },
  {
    id: 'unstaffed',
    label: 'Unstaffed, starts within 14 days',
    tone: 'warning',
    filters: { startsWithin: 14, staffing: 'none' },
    count: (s) => s.unstaffedStartingWithin14,
  },
  {
    id: 'partly',
    label: 'Partly staffed',
    tone: 'primary',
    filters: { staffing: 'some' },
    count: (s) => s.partlyStaffed,
  },
];

const key = (f: BoardFilters): string =>
  JSON.stringify(
    Object.entries(f)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );

export const isActiveView = (view: QuickView, tab: Tab, filters: BoardFilters): boolean =>
  tab === 'open' && key(view.filters) === key(filters);

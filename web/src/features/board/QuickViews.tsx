import { Chip, Stack } from '@mui/material';
import type { PositionSummary } from '@crew-board/shared';
import type { BoardFilters } from '../../shared/api.ts';
import type { Tab } from './boardParams.ts';
import { isActiveView, QUICK_VIEWS, type QuickView } from './quickViews.ts';

interface Props {
  summary: PositionSummary | undefined;
  tab: Tab;
  filters: BoardFilters;
  onPick: (view: QuickView | null) => void;
}

export function QuickViews({ summary, tab, filters, onPick }: Props) {
  return (
    <Stack
      direction="row"
      useFlexGap
      role="group"
      aria-label="Quick views"
      sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}
    >
      {QUICK_VIEWS.map((view) => {
        const active = isActiveView(view, tab, filters);
        const count = summary ? view.count(summary) : undefined;
        const urgent = view.tone === 'warning' && (count ?? 0) > 0;
        return (
          <Chip
            key={view.id}
            clickable
            aria-pressed={active}
            color={urgent ? 'warning' : 'primary'}
            variant={active ? 'filled' : 'outlined'}
            onClick={() => onPick(active ? null : view)}
            label={
              <>
                {view.label}
                {count === undefined ? null : <strong style={{ marginLeft: 6 }}>{count}</strong>}
              </>
            }
            sx={{ fontWeight: 600 }}
          />
        );
      })}
    </Stack>
  );
}

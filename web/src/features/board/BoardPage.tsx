import EventSeatOutlinedIcon from '@mui/icons-material/EventSeatOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import { Box, Button, Fade, LinearProgress, Stack } from '@mui/material';
import type { GridPaginationModel } from '@mui/x-data-grid';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import { announce, closeAssign, openAssign, rememberBoardSearch } from '../../app/uiSlice.ts';
import { useGetPositionSummaryQuery, useGetPositionsQuery } from '../../shared/api.ts';
import { SlidingPanels } from '../../shared/SlidingPanels.tsx';
import { EmptyState, PageHeader, StatPill } from '../../shared/ui.tsx';
import { useDebounced } from '../../shared/useDebounced.ts';
import { useNow } from '../../shared/useNow.ts';
import { ActiveFilters, BoardToolbar } from './BoardToolbar.tsx';
import { loadPageSize, savePageSize } from './pagePrefs.ts';
import { QuickViews } from './QuickViews.tsx';
import { PositionGrid } from './PositionGrid.tsx';
import { activeFilterCount, parseView, toParams, type BoardView, type Tab } from './boardParams.ts';
import type { RowActions } from './cells.tsx';

const AssignDrawer = lazy(() => import('../assign/AssignDrawer.tsx').then((m) => ({ default: m.AssignDrawer })));
const PositionDialog = lazy(() => import('./PositionDialog.tsx').then((m) => ({ default: m.PositionDialog })));

type Paging = Record<Tab, GridPaginationModel>;

export function BoardPage() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const active = location.pathname === '/';
  const storedSearch = useAppSelector((s) => s.ui.boardSearch);

  const search = active ? location.search : storedSearch;
  const view = useMemo(() => parseView(new URLSearchParams(search)), [search]);
  const { tab, sort, filters } = view;
  useEffect(() => {
    if (active) dispatch(rememberBoardSearch(location.search));
  }, [active, location.search, dispatch]);

  const now = useNow(60_000);
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const filtering = activeFilterCount(filters) > 0 || q !== '';

  const setView = (next: Partial<BoardView>) => {
    const query = toParams({ ...view, ...next }).toString();
    void navigate({ pathname: '/', search: query ? `?${query}` : '' }, { replace: true });
  };

  const viewKey = JSON.stringify({ filters, sort, q });
  const [paged, setPaged] = useState<{ key: string; models: Paging }>(() => {
    const pageSize = loadPageSize();
    return { key: viewKey, models: { open: { page: 0, pageSize }, filled: { page: 0, pageSize } } };
  });
  const models: Paging =
    paged.key === viewKey
      ? paged.models
      : { open: { ...paged.models.open, page: 0 }, filled: { ...paged.models.filled, page: 0 } };
  const setModel = (which: Tab) => (model: GridPaginationModel) => {
    if (model.pageSize !== models[which].pageSize) {
      savePageSize(model.pageSize);
      setPaged({
        key: viewKey,
        models: { open: { page: 0, pageSize: model.pageSize }, filled: { page: 0, pageSize: model.pageSize } },
      });
      return;
    }
    setPaged({ key: viewKey, models: { ...models, [which]: model } });
  };

  const common = { ...filters, sort, ...(q ? { q } : {}) };
  const open = useGetPositionsQuery({
    ...common,
    status: 'open',
    page: models.open.page + 1,
    pageSize: models.open.pageSize,
  });
  const filled = useGetPositionsQuery({
    ...common,
    status: 'filled',
    page: models.filled.page + 1,
    pageSize: models.filled.pageSize,
  });
  const summary = useGetPositionSummaryQuery();

  const searchBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!active) return;
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return;
      event.preventDefault();
      searchBox.current?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, [active]);

  const selectedId = useAppSelector((s) => s.ui.selectedPositionId);
  const [managingId, setManagingId] = useState<string | null>(null);
  const opener = useRef<string | null>(null);

  useEffect(() => {
    if (selectedId === null && opener.current) {
      const id = opener.current;
      opener.current = null;
      (document.getElementById(`assign-${id}`) ?? document.querySelector<HTMLElement>('[role="grid"]'))?.focus();
    }
  }, [selectedId]);

  const onAssign = useCallback(
    (positionId: string) => {
      opener.current = positionId;
      dispatch(openAssign(positionId));
    },
    [dispatch],
  );
  const onCopy = useCallback(
    (copied: string, what: string) => {
      const clipboard = navigator.clipboard as Clipboard | undefined;
      if (!clipboard) {
        dispatch(announce(`Could not copy ${what.toLowerCase()}. Copy it by hand instead: ${copied}`, 'error'));
        return;
      }
      clipboard.writeText(copied).then(
        () => dispatch(announce(`${what} copied.`, 'success')),
        () => dispatch(announce(`Could not copy ${what.toLowerCase()}.`, 'error')),
      );
    },
    [dispatch],
  );
  const actions = useMemo<RowActions>(
    () => ({ now, onAssign, onManage: setManagingId, onSearchProject: setText, onCopy }),
    [now, onAssign, setManagingId, setText, onCopy],
  );

  const allRows = [...(open.data?.data ?? []), ...(filled.data?.data ?? [])];
  const selected = allRows.find((p) => p.id === selectedId);
  const managing = allRows.find((p) => p.id === managingId);
  const openTotal = open.data?.total;
  const filledTotal = filled.data?.total;
  const updating = (open.isFetching && !open.isLoading) || (filled.isFetching && !filled.isLoading);
  const nothingAtAll = summary.data && summary.data.openPositions + summary.data.filledPositions === 0;

  const clearAll = () => {
    setText('');
    setView({ filters: {} });
  };

  const emptyFor = (which: Tab) =>
    filtering ? (
      <EmptyState
        title="No positions match"
        action={
          <Button variant="outlined" onClick={clearAll}>
            Clear filters and search
          </Button>
        }
      >
        Try a wider date range, a different skill or another search.
      </EmptyState>
    ) : (
      <EmptyState title={which === 'open' ? 'Nothing open' : 'Nothing filled yet'}>
        {which === 'open' ? 'Every position here is filled.' : 'Positions move here once every seat has someone.'}
      </EmptyState>
    );

  const retryAll = () => {
    void open.refetch();
    void filled.refetch();
    void summary.refetch();
  };

  const grid = (which: Tab) => {
    const result = which === 'open' ? open : filled;
    return (
      <PositionGrid
        label={which}
        data={result.data}
        isLoading={result.isLoading}
        isFetching={result.isFetching}
        isError={result.isError}
        error={result.error}
        retry={retryAll}
        paging={models[which]}
        onPaging={setModel(which)}
        sort={sort}
        onSort={(next) => setView({ sort: next })}
        actions={actions}
        empty={emptyFor(which)}
      />
    );
  };

  return (
    <Stack
      component="section"
      aria-labelledby="board-title"
      spacing={1.5}
      sx={{ flex: 1, minHeight: 0, height: '100%' }}
    >
      <PageHeader
        id="board-title"
        title="Project board"
        actions={
          <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap' }}>
            <StatPill
              label="open positions"
              value={summary.data?.openPositions ?? '–'}
              tone="primary"
              icon={<PendingActionsOutlinedIcon fontSize="small" />}
            />
            <StatPill
              label="seats to fill"
              value={summary.data?.seatsToFill ?? '–'}
              tone="warning"
              icon={<EventSeatOutlinedIcon fontSize="small" />}
            />
            <StatPill
              label="filled positions"
              value={summary.data?.filledPositions ?? '–'}
              tone="secondary"
              icon={<FactCheckOutlinedIcon fontSize="small" />}
            />
          </Stack>
        }
      />

      {nothingAtAll ? (
        <EmptyState title="No positions yet">Positions appear here once a project has them.</EmptyState>
      ) : (
        <>
          <BoardToolbar
            tab={tab}
            onTab={(next) => setView({ tab: next })}
            counts={{ open: openTotal, filled: filledTotal }}
            search={text}
            onSearch={setText}
            searchRef={searchBox}
            sort={sort}
            onSort={(next) => setView({ sort: next })}
            filters={filters}
            onFilters={(next) => setView({ filters: next })}
          />
          <QuickViews
            summary={summary.data}
            tab={tab}
            filters={filters}
            onPick={(picked) => setView({ tab: 'open', filters: picked ? picked.filters : {} })}
          />
          <ActiveFilters filters={filters} onFilters={(next) => setView({ filters: next })} />
          <Box sx={{ height: 3, flex: 'none' }} aria-hidden>
            <Fade in={updating}>
              <LinearProgress sx={{ borderRadius: 2, height: 3 }} />
            </Fade>
          </Box>
          <SlidingPanels
            index={tab === 'open' ? 0 : 1}
            panels={[
              { id: 'panel-open', labelledBy: 'tab-open', content: grid('open') },
              { id: 'panel-filled', labelledBy: 'tab-filled', content: grid('filled') },
            ]}
          />
        </>
      )}

      <Suspense fallback={null}>
        {selected ? <AssignDrawer position={selected} onClose={() => dispatch(closeAssign())} /> : null}
        {managing ? (
          <PositionDialog position={managing} onClose={() => setManagingId(null)} onAssign={onAssign} />
        ) : null}
      </Suspense>
    </Stack>
  );
}

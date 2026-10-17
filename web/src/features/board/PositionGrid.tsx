import { Box, LinearProgress, Link, Paper, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { DataGrid, type GridColDef, type GridPaginationModel, type GridSortModel } from '@mui/x-data-grid';
import type { Page, Position, PositionSort } from '@crew-board/shared';
import { useMemo, useRef, type ReactNode } from 'react';
import { cspNonce } from '../../shared/csp.ts';
import { errorMessage } from '../../shared/errors.ts';
import { ErrorState, LoadingBlock } from '../../shared/ui.tsx';
import { ActionsCell, AssignedCell, DatesCell, ProjectCell, SeatsCell, SkillChip, type RowActions } from './cells.tsx';
import { SORT_TO_GRID, gridToSort } from './boardParams.ts';
import { PAGE_SIZES } from './pagePrefs.ts';
import { timing, todayIso } from './timing.ts';

const HEADER_BG = 'color-mix(in srgb, var(--mui-palette-text-primary) 6%, var(--mui-palette-background-paper))';

declare module '@mui/x-data-grid' {
  interface NoRowsOverlayPropsOverrides {
    empty: ReactNode;
  }
  interface LoadingOverlayPropsOverrides {
    label: string;
    initial: boolean;
  }
}

function NoRows({ empty }: { empty: ReactNode }) {
  return <Box sx={{ p: 2, height: '100%', display: 'grid', placeItems: 'center' }}>{empty}</Box>;
}

function Loading({ label, initial }: { label: string; initial: boolean }) {
  if (initial) {
    return (
      <Box sx={{ p: 2 }}>
        <LoadingBlock label={label} rows={5} height={52} />
      </Box>
    );
  }
  return <LinearProgress aria-label="Updating" sx={{ height: 3 }} />;
}

interface Props {
  label: string;
  data: Page<Position> | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  retry: () => void;
  paging: GridPaginationModel;
  onPaging: (model: GridPaginationModel) => void;
  sort: PositionSort;
  onSort: (sort: PositionSort) => void;
  actions: RowActions;
  empty: ReactNode;
}

export function PositionGrid({
  label,
  data,
  isLoading,
  isFetching,
  isError,
  error,
  retry,
  paging,
  onPaging,
  sort,
  onSort,
  actions,
  empty,
}: Props) {
  const theme = useTheme();
  const frame = useRef<HTMLDivElement>(null);
  const showAssigned = useMediaQuery(theme.breakpoints.up('md'));
  const showSeats = useMediaQuery(theme.breakpoints.up('lg'));
  const showSkill = useMediaQuery('(min-width:1380px)');
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns = useMemo<GridColDef<Position>[]>(
    () => [
      {
        field: 'project',
        headerName: 'Project',
        flex: 2,
        minWidth: 210,
        sortingOrder: ['asc', null],
        renderCell: ({ row }) => <ProjectCell position={row} showSkill={!showSkill} showSeats={!showSeats} />,
      },
      {
        field: 'skill',
        headerName: 'Skill',
        flex: 1,
        minWidth: 215,
        sortable: false,
        renderCell: ({ row }) => <SkillChip position={row} />,
      },
      {
        field: 'dates',
        headerName: 'Dates',
        flex: 1.2,
        minWidth: 210,
        sortingOrder: ['asc', 'desc'],
        renderCell: ({ row }) => <DatesCell position={row} now={actions.now} />,
      },
      {
        field: 'seats',
        headerName: 'Seats',
        flex: 1.3,
        minWidth: 220,
        sortingOrder: ['desc', null],
        renderCell: ({ row }) => <SeatsCell position={row} />,
      },
      {
        field: 'assigned',
        headerName: 'Assigned',
        flex: 1.5,
        minWidth: 195,
        sortable: false,
        renderCell: ({ row }) => <AssignedCell position={row} actions={actions} />,
      },
      {
        field: 'actions',
        headerName: 'Actions',
        width: 180,
        minWidth: 180,
        sortable: false,
        align: 'right',
        headerAlign: 'right',
        renderCell: ({ row }) => <ActionsCell position={row} actions={actions} />,
      },
    ],
    [actions, showSkill, showSeats],
  );

  const sortModel = useMemo<GridSortModel>(() => [SORT_TO_GRID[sort]], [sort]);
  const today = todayIso(actions.now);

  if (isError && !data) {
    return (
      <Paper variant="outlined" sx={{ flex: 1, minHeight: 0, p: 2 }}>
        <ErrorState message={errorMessage(error)} onRetry={retry} />
      </Paper>
    );
  }

  return (
    <Paper
      ref={frame}
      variant="outlined"
      sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}
    >
      <Link
        component="button"
        type="button"
        onClick={() => {
          const pager = frame.current?.querySelector('.MuiTablePagination-root');
          (
            pager?.querySelector<HTMLElement>('button:not(:disabled)') ??
            pager?.querySelector<HTMLElement>('[role="combobox"]')
          )?.focus();
        }}
        sx={{
          position: 'absolute',
          left: 8,
          top: -48,
          zIndex: 3,
          px: 1.5,
          py: 0.75,
          borderRadius: 2,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          '&:focus': { top: 8 },
        }}
      >
        Skip to page controls
      </Link>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <DataGrid
          aria-label={`${label} positions`}
          nonce={cspNonce()}
          rows={rows}
          columns={columns}
          getRowId={(r) => r.id}
          columnVisibilityModel={{ skill: showSkill, seats: showSeats, assigned: showAssigned }}
          rowHeight={showSeats ? 68 : 104}
          columnHeaderHeight={44}
          paginationMode="server"
          rowCount={total}
          paginationModel={paging}
          onPaginationModelChange={onPaging}
          pageSizeOptions={PAGE_SIZES}
          sortingMode="server"
          sortModel={sortModel}
          onSortModelChange={(model) => onSort(gridToSort(model))}
          loading={isLoading || isFetching}
          disableColumnMenu
          disableColumnFilter
          disableColumnSelector
          disableColumnResize
          disableRowSelectionOnClick
          onRowClick={({ row }: { row: Position }, event) => {
            if ((event.target as HTMLElement).closest('button, a, [role="menuitem"], [role="combobox"]')) return;
            actions.onManage(row.id);
          }}
          disableVirtualization={import.meta.env.MODE === 'test'}
          getRowClassName={({ row }: { row: Position }) =>
            [
              row.filled
                ? 'accent-filled'
                : timing(row, today, true).tone === 'urgent'
                  ? 'accent-urgent'
                  : 'accent-open',
              row.assigned.some((a) => !a.active) ? 'has-inactive' : '',
            ].join(' ')
          }
          slots={{ noRowsOverlay: NoRows, loadingOverlay: Loading }}
          slotProps={{
            noRowsOverlay: { empty },
            loadingOverlay: { label: `Loading ${label} positions`, initial: isLoading },
          }}
          sx={{
            border: 0,
            borderRadius: 0,
            '--DataGrid-t-header-background-base': HEADER_BG,
            '& .MuiDataGrid-columnHeaders': { bgcolor: HEADER_BG, backgroundImage: 'none' },
            '& .MuiDataGrid-columnHeader': { bgcolor: HEADER_BG, px: 2 },
            '& .MuiDataGrid-scrollbarFiller': { bgcolor: HEADER_BG },
            '& .MuiDataGrid-columnHeaderTitle': {
              fontWeight: 700,
              textTransform: 'uppercase',
              fontSize: '0.72rem',
              letterSpacing: '0.06em',
              color: 'text.secondary',
            },
            '& .MuiDataGrid-cell': {
              display: 'flex',
              alignItems: 'center',
              px: 2,
              lineHeight: 1.35,
              '&:focus, &:focus-within': { outline: 'none' },
              '&:focus-visible': { outline: '2px solid var(--mui-palette-primary-main)', outlineOffset: -2 },
            },
            '& .MuiDataGrid-row:hover': { bgcolor: 'action.hover' },
            '& .MuiDataGrid-row.accent-open': { boxShadow: 'inset 4px 0 0 var(--mui-palette-primary-main)' },
            '& .MuiDataGrid-row.accent-urgent': { boxShadow: 'inset 4px 0 0 var(--mui-palette-warning-main)' },
            '& .MuiDataGrid-row.accent-filled': { boxShadow: 'inset 4px 0 0 var(--mui-palette-secondary-main)' },
            '& .MuiDataGrid-row.has-inactive': { bgcolor: 'rgb(var(--mui-palette-warning-mainChannel) / 0.07)' },
            '& .MuiDataGrid-footerContainer': { borderTop: 1, borderColor: 'divider' },
            '& .MuiDataGrid-virtualScroller': { overflowX: 'auto' },
          }}
        />
      </Box>
    </Paper>
  );
}

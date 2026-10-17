import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  Button,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { formatRange, type Position } from '@crew-board/shared';
import { useRef, useState, type KeyboardEvent } from 'react';
import { useAppDispatch } from '../../app/hooks.ts';
import { announce } from '../../app/uiSlice.ts';
import { useAssignMutation, useGetCandidatesQuery } from '../../shared/api.ts';
import { errorMessage } from '../../shared/errors.ts';
import { skillLabel } from '../../shared/skills.ts';
import { EmptyState, ErrorState, LoadingBlock } from '../../shared/ui.tsx';
import { useDebounced } from '../../shared/useDebounced.ts';
import { heroSx } from '../../theme/brand.ts';
import { CandidateRow } from './CandidateRow.tsx';

interface Props {
  position: Position;
  onClose: () => void;
}

const ASSIGN_BUTTONS = 'button[data-assign]:not([disabled])';
const STEP = 25;
const MAX = 100;

export function AssignDrawer({ position, onClose }: Props) {
  const dispatch = useAppDispatch();
  const list = useRef<HTMLUListElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [onlyAssignable, setOnlyAssignable] = useState(true);
  const q = useDebounced(search.trim(), 250);
  const assignableOnly = onlyAssignable && search.trim() === '';

  const viewKey = `${q}|${assignableOnly}`;
  const [paging, setPaging] = useState({ key: viewKey, pageSize: STEP });
  const pageSize = paging.key === viewKey ? paging.pageSize : STEP;

  const { data, isLoading, isError, error, refetch, isFetching } = useGetCandidatesQuery({
    positionId: position.id,
    q,
    pageSize,
    assignableOnly,
  });
  const [assign, assignState] = useAssignMutation();

  const title = `${position.projectName}, ${skillLabel(position.skill)}`;
  const seatWord = position.headcount === 1 ? 'seat' : 'seats';

  const doAssign = async (technicianId: string, technicianName: string) => {
    const wasLastSeat = position.seatsRemaining <= 1;
    try {
      await assign({ positionId: position.id, technicianId, technicianName }).unwrap();
      dispatch(announce(`${technicianName} assigned to ${title}.`, 'success'));
      if (wasLastSeat) onClose();
    } catch (e) {
      dispatch(announce(`Could not assign ${technicianName}. ${errorMessage(e)}`, 'error'));
    }
  };

  const move = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>(ASSIGN_BUTTONS) ?? [])];
    if (buttons.length === 0) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length;
    e.preventDefault();
    buttons[at === -1 ? (e.key === 'ArrowDown' ? 0 : buttons.length - 1) : next]?.focus();
  };

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const summary = assignableOnly
    ? `${total} ${total === 1 ? 'person' : 'people'} can take this position`
    : `${total} ${total === 1 ? 'technician' : 'technicians'}${q ? ` match “${q}”` : ''}, people who can take it first`;

  return (
    <Drawer
      anchor="right"
      open
      onClose={onClose}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-labelledby': 'drawer-title',
          'aria-modal': true,
          sx: { width: { xs: '100vw', sm: 520 }, maxWidth: '100vw' },
        },
        transition: { onEntered: () => searchBox.current?.focus() },
      }}
    >
      <Box onKeyDown={move} sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 2, pb: 1, flex: 'none' }}
        >
          <Typography component="h2" variant="h2" id="drawer-title" sx={{ fontSize: '1.3rem' }}>
            Assign technician
          </Typography>
          <IconButton aria-label="Close drawer" onClick={onClose} edge="end">
            <CloseIcon />
          </IconButton>
        </Stack>

        <Box sx={{ px: 2, pb: 1.5, flex: 'none' }}>
          <Box sx={{ ...heroSx, p: 1.5, borderRadius: '12px' }}>
            <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'text.secondary', mt: 0.25 }}>
              <CalendarMonthOutlinedIcon fontSize="small" />
              <Typography variant="body2">
                {formatRange(position)} ·{' '}
                {position.seatsRemaining > 0
                  ? `${position.seatsRemaining} of ${position.headcount} ${seatWord} open`
                  : 'all seats filled'}
              </Typography>
            </Stack>
          </Box>
        </Box>

        <Box sx={{ px: 2, pb: 0.5, flex: 'none' }}>
          <TextField
            id="candidate-search"
            inputRef={searchBox}
            fullWidth
            size="small"
            type="search"
            autoComplete="off"
            label="Search by name or skill"
            placeholder="For example Priya or fibre"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            helperText="Arrow keys move between people, Enter assigns."
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
          <FormControlLabel
            sx={{ mt: 0.5 }}
            control={
              <Switch
                size="small"
                checked={onlyAssignable}
                onChange={(e) => setOnlyAssignable(e.target.checked)}
                disabled={search.trim() !== ''}
              />
            }
            label={<Typography variant="body2">Only people who can take this position</Typography>}
          />
          {search.trim() !== '' ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 0.5 }}>
              Searching shows everyone, so you can see why someone cannot be assigned.
            </Typography>
          ) : null}
        </Box>

        <Box sx={{ px: 2, py: 0.75, flex: 'none', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }} aria-live="polite">
            {data ? summary : 'Loading…'}
          </Typography>
          <Box sx={{ height: 3, mt: 0.5 }} aria-hidden>
            {isFetching && !isLoading ? <LinearProgress sx={{ borderRadius: 2, height: 3 }} /> : null}
          </Box>
        </Box>

        {assignState.isError ? (
          <Alert severity="error" onClose={() => assignState.reset()} sx={{ mx: 2, mt: 1.5, flex: 'none' }}>
            <strong>Could not assign {assignState.originalArgs?.technicianName}.</strong>{' '}
            {errorMessage(assignState.error)}
          </Alert>
        ) : null}

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {isLoading ? (
            <Box sx={{ p: 2 }}>
              <LoadingBlock label="Loading technicians" rows={6} height={64} />
            </Box>
          ) : null}
          {isError ? (
            <Box sx={{ p: 2 }}>
              <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
            </Box>
          ) : null}
          {data && rows.length === 0 ? (
            <Box sx={{ p: 2 }}>
              <EmptyState
                title={assignableOnly ? 'Nobody is free for this position' : 'No technicians found'}
                action={
                  assignableOnly ? (
                    <Button variant="outlined" onClick={() => setOnlyAssignable(false)}>
                      Show everyone
                    </Button>
                  ) : undefined
                }
              >
                {assignableOnly
                  ? 'Nobody has the skill and is free for these dates. Show everyone to see who is busy or missing the skill.'
                  : q
                    ? `Nobody matches “${q}”. Try another name or skill.`
                    : 'There are no active technicians yet. Run a sync.'}
              </EmptyState>
            </Box>
          ) : null}
          {rows.length > 0 ? (
            <Box
              component="ul"
              ref={list}
              aria-label="Technicians"
              aria-busy={isFetching}
              sx={{ listStyle: 'none', m: 0, p: 0 }}
            >
              {rows.map((c) => (
                <CandidateRow
                  key={c.id}
                  candidate={c}
                  position={position}
                  busy={assignState.isLoading}
                  pending={assignState.isLoading && assignState.originalArgs?.technicianId === c.id}
                  onAssign={() => void doAssign(c.id, c.name)}
                />
              ))}
            </Box>
          ) : null}
        </Box>

        {data && total > rows.length ? (
          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              py: 1,
              flex: 'none',
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Showing {rows.length} of {total}
            </Typography>
            {pageSize < MAX ? (
              <Button
                size="small"
                onClick={() => setPaging({ key: viewKey, pageSize: Math.min(MAX, pageSize + STEP) })}
              >
                Show {Math.min(STEP, total - rows.length)} more
              </Button>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Search to narrow the list
              </Typography>
            )}
          </Stack>
        ) : null}
      </Box>
    </Drawer>
  );
}

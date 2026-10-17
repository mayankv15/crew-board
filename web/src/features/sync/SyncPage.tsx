import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SyncIcon from '@mui/icons-material/Sync';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Fade,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import type { SyncRun } from '@crew-board/shared';
import { useEffect, useRef } from 'react';
import { useAppDispatch } from '../../app/hooks.ts';
import { announce } from '../../app/uiSlice.ts';
import { useGetSyncRunsQuery, useStartSyncMutation } from '../../shared/api.ts';
import { errorMessage } from '../../shared/errors.ts';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '../../shared/ui.tsx';
import { tint } from '../../theme/brand.ts';

const STATUS = {
  running: { color: 'info', icon: <SyncIcon />, accent: 'info.main' },
  succeeded: { color: 'success', icon: <CheckCircleIcon />, accent: 'secondary.main' },
  partial: { color: 'warning', icon: <WarningAmberIcon />, accent: 'warning.main' },
  failed: { color: 'error', icon: <ErrorIcon />, accent: 'error.main' },
} as const;

function duration(run: SyncRun): string {
  if (!run.finishedAt) return 'running';
  const ms = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function Count({ label, value, tone }: { label: string; value: number; tone?: 'warning' | 'error' }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column-reverse', textAlign: 'center', minWidth: 64 }}>
      <Typography component="dt" variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        component="dd"
        sx={{
          m: 0,
          fontWeight: 800,
          fontSize: '1.15rem',
          lineHeight: 1.2,
          color: value > 0 && tone ? `${tone}.main` : 'text.primary',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function RunCard({ run, index }: { run: SyncRun; index: number }) {
  const s = STATUS[run.status];
  return (
    <Fade in appear timeout={180 + Math.min(index, 6) * 40}>
      <Card component="li" sx={{ borderLeft: 5, borderLeftColor: s.accent }}>
        <CardContent
          sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
          >
            <Stack
              direction="row"
              spacing={1.5}
              useFlexGap
              sx={{ alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}
            >
              <Chip
                color={s.color}
                icon={s.icon}
                label={run.status}
                size="small"
                sx={{ textTransform: 'capitalize' }}
              />
              <Typography variant="body2">
                <time dateTime={run.startedAt}>{new Date(run.startedAt).toLocaleString()}</time> · {duration(run)} ·
                started from {run.trigger === 'api' ? 'the app' : 'the command line'}
              </Typography>
            </Stack>
            <Box component="dl" sx={{ m: 0, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Count label="Created" value={run.created} />
              <Count label="Updated" value={run.updated} />
              <Count label="Unchanged" value={run.unchanged} />
              <Count label="Deactivated" value={run.deactivated} tone="warning" />
              <Count label="Failed" value={run.failed} tone="error" />
            </Box>
          </Stack>

          {run.status === 'running' ? (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <LinearProgress
                aria-label="Sync progress"
                variant={run.pagesTotal ? 'determinate' : 'indeterminate'}
                value={run.pagesTotal ? (run.pagesDone / run.pagesTotal) * 100 : undefined}
                sx={{ flex: 1, height: 8, borderRadius: 4 }}
              />
              <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                {run.pagesTotal
                  ? `Page ${Math.min(run.pagesDone + 1, run.pagesTotal)} of ${run.pagesTotal}`
                  : 'Starting…'}
              </Typography>
            </Stack>
          ) : null}

          {run.errors.length > 0 ? (
            <Accordion
              disableGutters
              variant="outlined"
              sx={{
                bgcolor: tint(run.status === 'failed' ? 'error' : 'warning', 0.06),
                '&:before': { display: 'none' },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.75 } }}
              >
                <Typography sx={{ fontWeight: 650 }}>
                  {run.errors.length} {run.errors.length === 1 ? 'error' : 'errors'}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ maxHeight: 220, overflowY: 'auto' }}>
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {run.errors.map((e, i) => (
                    <li key={i}>
                      <strong>{e.scope}:</strong> {e.message}
                    </li>
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          ) : null}
        </CardContent>
      </Card>
    </Fade>
  );
}

export function SyncPage({ pollMs: pollWhileRunning = 1000 }: { pollMs?: number }) {
  const dispatch = useAppDispatch();
  const { data: runs, isLoading, isError, error, refetch } = useGetSyncRunsQuery({ limit: 10 });
  const active = runs?.find((r) => r.status === 'running');
  const isRunning = active !== undefined;
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => void refetch(), pollWhileRunning);
    return () => clearInterval(id);
  }, [isRunning, pollWhileRunning, refetch]);
  const [start, startState] = useStartSyncMutation();

  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !isRunning) {
      const status = runs?.[0]?.status ?? 'done';
      dispatch(
        announce(
          `Sync finished: ${status}.`,
          status === 'succeeded' ? 'success' : status === 'failed' ? 'error' : 'info',
        ),
      );
    }
    wasRunning.current = isRunning;
  }, [isRunning, runs, dispatch]);

  const buttonLabel = startState.isLoading
    ? 'Starting…'
    : active
      ? active.pagesTotal
        ? `Syncing, page ${Math.min(active.pagesDone + 1, active.pagesTotal)} of ${active.pagesTotal}`
        : 'Syncing…'
      : 'Run sync now';

  return (
    <Stack component="section" aria-labelledby="sync-title" spacing={2} sx={{ flex: 1, minHeight: 0 }}>
      <PageHeader
        id="sync-title"
        title="HR sync"
        actions={
          <Button
            variant="contained"
            disabled={startState.isLoading || Boolean(active)}
            startIcon={active || startState.isLoading ? <CircularProgress size={18} color="inherit" /> : <SyncIcon />}
            onClick={() =>
              void start()
                .unwrap()
                .catch(() => undefined)
            }
            sx={{ flexShrink: 0 }}
          >
            {buttonLabel}
          </Button>
        }
      />

      <Fade in={startState.isError} unmountOnExit>
        <Typography role="alert" color="error" sx={{ fontWeight: 650 }}>
          {errorMessage(startState.error)}
        </Typography>
      </Fade>

      {isLoading ? <LoadingBlock label="Loading sync runs" rows={3} height={84} /> : null}
      {isError ? <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} /> : null}
      {runs && runs.length === 0 ? (
        <EmptyState title="No sync has run yet">Press “Run sync now” to load technicians from HR.</EmptyState>
      ) : null}
      {runs && runs.length > 0 ? (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 0.5 }}>
          <Typography component="h3" variant="h3" sx={{ mb: 1.25 }}>
            {runs.length === 1 ? 'Latest run' : `Last ${runs.length} runs`}
          </Typography>
          <Stack component="ul" spacing={1.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {runs.map((r, i) => (
              <RunCard key={r.id} run={r} index={i} />
            ))}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}

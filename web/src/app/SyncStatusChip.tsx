import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined';
import SyncIcon from '@mui/icons-material/Sync';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Chip, Tooltip } from '@mui/material';
import { useState } from 'react';
import { NavLink } from 'react-router';
import { useGetSyncRunsQuery } from '../shared/api.ts';
import { timeAgo, useNow } from '../shared/useNow.ts';
import { usePageVisible } from '../shared/usePageVisible.ts';
import { tint } from '../theme/brand.ts';

const POLL_WHILE_RUNNING_MS = 5000;

export function SyncStatusChip() {
  const visible = usePageVisible();
  const [polling, setPolling] = useState(false);
  // Only the latest run is needed, so one run comes back, not ten. The chip checks again on its own while a run
  // is going, because the sync might have been started by someone else or from the command line.
  const { data, isLoading, isError } = useGetSyncRunsQuery(
    { limit: 1 },
    { pollingInterval: polling && visible ? POLL_WHILE_RUNNING_MS : 0 },
  );
  const now = useNow(30_000);
  const latest = data?.[0];
  const running = latest?.status === 'running';
  if (running !== polling) setPolling(running);

  let label = 'HR data: checking';
  let tone: 'success' | 'warning' | 'error' | 'info' = 'info';
  let icon = <HelpOutlineIcon />;

  if (isError) {
    label = 'HR status unknown';
    tone = 'warning';
    icon = <WarningAmberIcon />;
  } else if (!isLoading && !latest) {
    label = 'HR data: never synced';
    tone = 'warning';
    icon = <WarningAmberIcon />;
  } else if (latest?.status === 'running') {
    label = 'Syncing HR data';
    icon = <SyncIcon />;
  } else if (latest) {
    const when = timeAgo(latest.finishedAt ?? latest.startedAt, now);
    if (latest.status === 'succeeded') {
      label = `HR data synced ${when}`;
      tone = 'success';
      icon = <CheckCircleOutlineIcon />;
    } else if (latest.status === 'partial') {
      label = `Last sync partial, ${when}`;
      tone = 'warning';
      icon = <WarningAmberIcon />;
    } else {
      label = `Last sync failed, ${when}`;
      tone = 'error';
      icon = <ErrorOutlineIcon />;
    }
  }

  return (
    <Tooltip title="Open the HR sync page" describeChild>
      <Chip
        component={NavLink}
        to="/sync"
        clickable
        icon={icon}
        label={label}
        color={tone}
        variant="outlined"
        sx={{ bgcolor: tint(tone, 0.08), '& .MuiChip-icon': { color: 'inherit' } }}
      />
    </Tooltip>
  );
}

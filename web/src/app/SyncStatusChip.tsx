import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined';
import SyncIcon from '@mui/icons-material/Sync';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Chip, Tooltip } from '@mui/material';
import { NavLink } from 'react-router';
import { useGetSyncRunsQuery } from '../shared/api.ts';
import { timeAgo, useNow } from '../shared/useNow.ts';
import { tint } from '../theme/brand.ts';

export function SyncStatusChip() {
  const { data, isLoading, isError } = useGetSyncRunsQuery({ limit: 10 });
  const now = useNow(30_000);
  const latest = data?.[0];

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

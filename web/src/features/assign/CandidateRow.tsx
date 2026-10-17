import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Avatar, Box, Button, Stack, Typography } from '@mui/material';
import type { Candidate, Position } from '@crew-board/shared';
import { initials } from '../../shared/ui.tsx';
import { tint } from '../../theme/brand.ts';
import { candidateStatus, type CandidateStatus } from './candidateStatus.ts';

const STATUS_STYLE: Record<CandidateStatus['kind'], { color: string; icon: React.ReactNode }> = {
  ok: { color: 'secondary.main', icon: <CheckCircleIcon sx={{ fontSize: 16 }} /> },
  busy: { color: 'warning.main', icon: <WarningAmberIcon sx={{ fontSize: 16 }} /> },
  'no-skill': { color: 'text.secondary', icon: <BlockIcon sx={{ fontSize: 16 }} /> },
  here: { color: 'text.secondary', icon: <DoneAllIcon sx={{ fontSize: 16 }} /> },
  full: { color: 'text.secondary', icon: <BlockIcon sx={{ fontSize: 16 }} /> },
};

interface Props {
  candidate: Candidate;
  position: Position;
  busy: boolean;
  pending: boolean;
  onAssign: () => void;
}

export function CandidateRow({ candidate: c, position, busy, pending, onAssign }: Props) {
  const status = candidateStatus(c, position);
  const style = STATUS_STYLE[status.kind];
  const blocked = status.kind !== 'ok';

  return (
    <Box
      component="li"
      sx={{
        px: 2,
        py: 1.25,
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        columnGap: 1.5,
        rowGap: 1,
        alignItems: 'center',
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: status.kind === 'busy' ? tint('warning', 0.09) : blocked ? 'action.hover' : 'transparent',
        borderLeft: 4,
        borderLeftColor:
          status.kind === 'busy' ? 'warning.main' : status.kind === 'ok' ? 'secondary.main' : 'transparent',
      }}
    >
      <Avatar
        sx={{
          width: 36,
          height: 36,
          fontSize: 14,
          bgcolor: tint('primary', 0.16),
          color: 'primary.main',
          fontWeight: 700,
        }}
      >
        {initials(c.name)}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, lineHeight: 1.3 }} noWrap>
          {c.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {c.title} · {c.city}, {c.state}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'flex-start', color: style.color, mt: 0.25 }}>
          <Box sx={{ pt: '2px', display: 'flex' }}>{style.icon}</Box>
          <Typography
            id={`status-${c.id}`}
            variant="body2"
            sx={{ fontWeight: 650, color: 'inherit', lineHeight: 1.35 }}
          >
            {status.text}
          </Typography>
        </Stack>
      </Box>
      <Button
        data-assign
        variant="contained"
        size="small"
        startIcon={<PersonAddAlt1Icon />}
        disabled={blocked || busy}
        aria-describedby={`status-${c.id}`}
        aria-label={`Assign ${c.name}`}
        onClick={onAssign}
      >
        {pending ? 'Assigning…' : 'Assign'}
      </Button>
    </Box>
  );
}

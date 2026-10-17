import CloseIcon from '@mui/icons-material/Close';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Avatar,
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  ListItemIcon,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { formatRange, type AssignedPerson, type Position } from '@crew-board/shared';
import { useId, useState } from 'react';
import { errorMessage } from '../../shared/errors.ts';
import { skillLabel } from '../../shared/skills.ts';
import { initials } from '../../shared/ui.tsx';
import { tint } from '../../theme/brand.ts';
import { timing, todayIso, type Timing } from './timing.ts';
import { positionTitle, useUnassign } from './useUnassign.ts';

export interface RowActions {
  now: number;
  onAssign: (positionId: string) => void;
  onManage: (positionId: string) => void;
  onSearchProject: (projectName: string) => void;
  onCopy: (text: string, what: string) => void;
}

const TIMING_COLOR: Record<Timing['tone'], string> = {
  urgent: 'warning.main',
  soon: 'text.secondary',
  running: 'info.main',
  past: 'text.disabled',
  later: 'text.secondary',
};

export function ProjectCell({
  position,
  showSkill,
  showSeats,
}: {
  position: Position;
  showSkill: boolean;
  showSeats: boolean;
}) {
  return (
    <Stack spacing={0.5} sx={{ minWidth: 0, py: 0.5, alignItems: 'flex-start' }}>
      <Typography sx={{ fontWeight: 700, lineHeight: 1.3, maxWidth: '100%' }} noWrap title={position.projectName}>
        {position.projectName}
      </Typography>
      {showSkill ? <SkillChip position={position} /> : null}
      {showSeats ? <SeatsCell position={position} /> : null}
    </Stack>
  );
}

export function SkillChip({ position }: { position: Position }) {
  return (
    <Chip
      size="small"
      color="primary"
      variant="outlined"
      label={skillLabel(position.skill)}
      sx={{ textTransform: 'capitalize', fontWeight: 700 }}
    />
  );
}

export function DatesCell({ position, now }: { position: Position; now: number }) {
  const when = timing(position, todayIso(now), !position.filled);
  return (
    <Box sx={{ lineHeight: 1.35 }}>
      <Typography variant="body2" noWrap>
        {formatRange(position)}
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 650, color: TIMING_COLOR[when.tone] }}>
        {when.tone === 'urgent' ? '⚠ ' : ''}
        {when.text}
      </Typography>
    </Box>
  );
}

export function SeatsCell({ position }: { position: Position }) {
  const taken = position.headcount - position.seatsRemaining;
  const tone = position.filled ? 'secondary' : 'primary';
  const seats = position.headcount === 1 ? 'seat' : 'seats';
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      {position.headcount > 8 ? (
        <LinearProgress
          variant="determinate"
          value={(taken / position.headcount) * 100}
          color={tone}
          aria-hidden
          sx={{ width: 48, height: 6, borderRadius: 3, bgcolor: tint(tone, 0.16) }}
        />
      ) : (
        <Stack direction="row" spacing={0.5} aria-hidden>
          {Array.from({ length: position.headcount }, (_, i) => (
            <Box
              key={i}
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                border: 2,
                borderColor: `${tone}.main`,
                bgcolor: i < taken ? `${tone}.main` : 'transparent',
              }}
            />
          ))}
        </Stack>
      )}
      <Typography
        variant="body2"
        sx={{ fontWeight: 700, color: position.filled ? 'secondary.main' : 'text.primary' }}
        noWrap
      >
        {position.filled
          ? `All ${position.headcount} ${seats} filled`
          : `${position.seatsRemaining} of ${position.headcount} ${seats} open`}
      </Typography>
    </Stack>
  );
}

function PersonPill({ person, title, onRemove }: { person: AssignedPerson; title: string; onRemove: () => void }) {
  const pending = person.assignmentId.startsWith('pending-');
  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{
        alignItems: 'center',
        pl: 0.5,
        pr: 0.25,
        py: 0.25,
        borderRadius: 99,
        border: 1,
        flex: '0 1 auto',
        minWidth: 0,
        maxWidth: 220,
        borderColor: person.active ? 'divider' : tint('warning', 0.55),
        bgcolor: person.active ? 'background.paper' : tint('warning', 0.1),
        opacity: pending ? 0.7 : 1,
      }}
    >
      <Avatar
        sx={{
          width: 22,
          height: 22,
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
          bgcolor: person.active ? tint('primary', 0.16) : tint('warning', 0.25),
          color: person.active ? 'primary.main' : 'warning.main',
        }}
      >
        {initials(person.name)}
      </Avatar>
      <Typography variant="body2" noWrap sx={{ fontWeight: 600, minWidth: 0 }}>
        {person.name}
      </Typography>
      {!person.active ? (
        <Tooltip title="Deactivated by HR. Find a replacement.">
          <WarningAmberIcon aria-label="Deactivated by HR" sx={{ fontSize: 16, color: 'warning.main' }} />
        </Tooltip>
      ) : null}
      <IconButton
        size="small"
        aria-label={`Unassign ${person.name} from ${title}`}
        disabled={pending}
        onClick={onRemove}
        sx={{ p: 0.4, flexShrink: 0 }}
      >
        <CloseIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Stack>
  );
}

const SHOWN = 1;

export function AssignedCell({ position, actions }: { position: Position; actions: RowActions }) {
  const { remove, isError, error } = useUnassign(position);
  const title = positionTitle(position);
  const people = position.assigned;
  const extra = people.length - SHOWN;

  if (people.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No one assigned yet
      </Typography>
    );
  }
  return (
    <Box sx={{ minWidth: 0, width: '100%' }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
        {people.slice(0, SHOWN).map((a) => (
          <PersonPill
            key={a.assignmentId}
            person={a}
            title={title}
            onRemove={() => void remove(a.assignmentId, a.technicianId, a.name)}
          />
        ))}
        {extra > 0 ? (
          <Chip
            size="small"
            clickable
            color="primary"
            variant="outlined"
            label={`+${extra} more`}
            aria-label={`+${extra} more, show all ${people.length} people assigned to ${title}`}
            onClick={() => actions.onManage(position.id)}
            sx={{ flexShrink: 0 }}
          />
        ) : null}
      </Stack>
      {isError ? (
        <Typography role="alert" variant="caption" color="error" sx={{ fontWeight: 600 }}>
          {errorMessage(error)}
        </Typography>
      ) : null}
    </Box>
  );
}

export function ActionsCell({ position, actions }: { position: Position; actions: RowActions }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuButtonId = useId();
  const title = positionTitle(position);
  const close = () => setAnchor(null);
  const names = position.assigned.map((a) => a.name);

  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'flex-end', width: '100%' }}>
      {position.filled ? (
        <Button
          size="small"
          variant="outlined"
          startIcon={<ManageAccountsOutlinedIcon />}
          aria-label={`Manage people on ${title}`}
          onClick={() => actions.onManage(position.id)}
        >
          People
        </Button>
      ) : (
        <Button
          id={`assign-${position.id}`}
          size="small"
          variant="contained"
          startIcon={<PersonAddAlt1Icon />}
          aria-label={`Assign technician to ${title}`}
          onClick={() => actions.onAssign(position.id)}
        >
          Assign
        </Button>
      )}
      <IconButton
        id={menuButtonId}
        size="small"
        aria-label={`More actions for ${title}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        <MoreVertIcon />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        slotProps={{ list: { 'aria-labelledby': menuButtonId } }}
      >
        <MenuItem
          onClick={() => {
            close();
            actions.onSearchProject(position.projectName);
          }}
        >
          <ListItemIcon>
            <FilterAltOutlinedIcon fontSize="small" />
          </ListItemIcon>
          More from this project
        </MenuItem>
        <MenuItem
          disabled={names.length === 0}
          onClick={() => {
            close();
            actions.onCopy(names.join(', '), 'Assigned names');
          }}
        >
          <ListItemIcon>
            <GroupOutlinedIcon fontSize="small" />
          </ListItemIcon>
          Copy assigned names
        </MenuItem>
        <MenuItem
          onClick={() => {
            close();
            const seats = position.filled
              ? `all ${position.headcount} filled`
              : `${position.seatsRemaining} of ${position.headcount} open`;
            actions.onCopy(
              `${title}, ${formatRange(position)}, ${seats}${names.length ? `, assigned: ${names.join(', ')}` : ''}`,
              'Position details',
            );
          }}
        >
          <ListItemIcon>
            <ContentCopyOutlinedIcon fontSize="small" />
          </ListItemIcon>
          Copy position details
        </MenuItem>
      </Menu>
    </Stack>
  );
}

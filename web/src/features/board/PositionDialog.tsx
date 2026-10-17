import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CloseIcon from '@mui/icons-material/Close';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import { formatRange, type Position } from '@crew-board/shared';
import { errorMessage } from '../../shared/errors.ts';
import { initials } from '../../shared/ui.tsx';
import { heroSx, tint } from '../../theme/brand.ts';
import { positionTitle, useUnassign } from './useUnassign.ts';

interface Props {
  position: Position;
  onClose: () => void;
  onAssign: (positionId: string) => void;
}

export function PositionDialog({ position, onClose, onAssign }: Props) {
  const { remove, isError, error } = useUnassign(position);
  const title = positionTitle(position);
  const people = position.assigned;
  const seatWord = position.headcount === 1 ? 'seat' : 'seats';

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="people-title">
      <DialogTitle component="div" sx={{ pb: 1 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography component="h2" variant="h2" id="people-title" sx={{ fontSize: '1.3rem' }}>
            People on this position
          </Typography>
          <IconButton aria-label="Close" onClick={onClose} edge="end">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ p: 2 }}>
          <Box sx={{ ...heroSx, p: 1.5, borderRadius: '12px' }}>
            <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'text.secondary', mt: 0.25 }}>
              <CalendarMonthOutlinedIcon fontSize="small" />
              <Typography variant="body2">
                {formatRange(position)} ·{' '}
                {position.filled
                  ? `All ${position.headcount} ${seatWord} filled`
                  : `${position.seatsRemaining} of ${position.headcount} ${seatWord} open`}
              </Typography>
            </Stack>
          </Box>
        </Box>

        {isError ? (
          <Alert severity="error" role="alert" sx={{ mx: 2, mb: 1 }}>
            {errorMessage(error)}
          </Alert>
        ) : null}

        {people.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 2, pt: 0 }}>
            No one is assigned yet.
          </Typography>
        ) : (
          <Box
            component="ul"
            aria-label={`All ${people.length} people on ${title}`}
            sx={{
              listStyle: 'none',
              m: 0,
              p: 0,
              maxHeight: 360,
              overflowY: 'auto',
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            {people.map((a) => (
              <Stack
                component="li"
                key={a.assignmentId}
                direction="row"
                spacing={1.5}
                sx={{
                  alignItems: 'center',
                  px: 2,
                  py: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  bgcolor: a.active ? 'transparent' : tint('warning', 0.08),
                }}
              >
                <Avatar
                  sx={{
                    width: 34,
                    height: 34,
                    fontSize: 13,
                    fontWeight: 700,
                    bgcolor: a.active ? tint('primary', 0.16) : tint('warning', 0.25),
                    color: a.active ? 'primary.main' : 'warning.main',
                  }}
                >
                  {initials(a.name)}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 650 }} noWrap>
                    {a.name}
                  </Typography>
                  {!a.active ? (
                    <Chip
                      size="small"
                      color="warning"
                      variant="outlined"
                      icon={<WarningAmberIcon />}
                      label="Deactivated by HR, find a replacement"
                      sx={{ mt: 0.25 }}
                    />
                  ) : null}
                </Box>
                <Button
                  size="small"
                  color="inherit"
                  startIcon={<PersonRemoveOutlinedIcon />}
                  aria-label={`Unassign ${a.name} from ${title}`}
                  disabled={a.assignmentId.startsWith('pending-')}
                  onClick={() => void remove(a.assignmentId, a.technicianId, a.name)}
                  sx={{ color: 'text.secondary' }}
                >
                  Unassign
                </Button>
              </Stack>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {people.length} {people.length === 1 ? 'person' : 'people'}
        </Typography>
        {!position.filled ? (
          <Button
            variant="contained"
            startIcon={<PersonAddAlt1Icon />}
            onClick={() => {
              onClose();
              onAssign(position.id);
            }}
          >
            Assign technician
          </Button>
        ) : null}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

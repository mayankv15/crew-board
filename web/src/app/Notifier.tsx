import { Alert, Button, Slide, Snackbar } from '@mui/material';
import type { TransitionProps } from '@mui/material/transitions';
import { forwardRef, type ComponentProps } from 'react';
import { useAssignMutation } from '../shared/api.ts';
import { errorMessage } from '../shared/errors.ts';
import { useAppDispatch, useAppSelector } from './hooks.ts';
import { announce, dismissAnnouncement } from './uiSlice.ts';

const SlideUp = forwardRef<HTMLElement, TransitionProps>(function SlideUp(props, ref) {
  return <Slide {...(props as ComponentProps<typeof Slide>)} ref={ref} direction="up" />;
});

export function Notifier() {
  const dispatch = useAppDispatch();
  const announcement = useAppSelector((s) => s.ui.announcement);
  const open = useAppSelector((s) => s.ui.announcementOpen);
  const [assign] = useAssignMutation();
  const undo = announcement?.undo;

  const putBack = async () => {
    if (!undo) return;
    dispatch(dismissAnnouncement());
    try {
      await assign(undo).unwrap();
      dispatch(announce(`${undo.technicianName} is assigned again.`, 'success'));
    } catch (e) {
      dispatch(announce(`Could not put ${undo.technicianName} back. ${errorMessage(e)}`, 'error'));
    }
  };

  return (
    <Snackbar
      key={announcement?.id}
      open={open}
      autoHideDuration={announcement?.severity === 'error' ? 9000 : undo ? 8000 : 5000}
      onClose={(_event, reason) => {
        if (reason !== 'clickaway') dispatch(dismissAnnouncement());
      }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      slots={{ transition: SlideUp }}
    >
      <Alert
        role="status"
        aria-live="polite"
        severity={announcement?.severity ?? 'info'}
        variant="filled"
        action={
          <>
            {undo ? (
              <Button color="inherit" size="small" onClick={() => void putBack()} sx={{ fontWeight: 800 }}>
                Undo
              </Button>
            ) : null}
          </>
        }
        onClose={() => dispatch(dismissAnnouncement())}
        sx={{ width: '100%', maxWidth: 560, alignItems: 'center', boxShadow: 6 }}
      >
        {announcement?.text}
      </Alert>
    </Snackbar>
  );
}

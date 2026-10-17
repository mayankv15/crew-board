import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';

export interface Panel {
  id: string;
  labelledBy?: string;
  content: ReactNode;
}

export function SlidingPanels({ index, panels }: { index: number; panels: Panel[] }) {
  const theme = useTheme();
  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          height: '100%',
          transform: `translateX(-${index * 100}%)`,
          transition: theme.transitions.create('transform', {
            duration: 340,
            easing: theme.transitions.easing.easeInOut,
          }),
        }}
      >
        {panels.map((panel, i) => (
          <Box
            key={panel.id}
            id={panel.id}
            role={panel.labelledBy ? 'tabpanel' : undefined}
            aria-labelledby={panel.labelledBy}
            aria-hidden={i !== index}
            inert={i !== index}
            sx={{ flex: '0 0 100%', minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
          >
            {panel.content}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

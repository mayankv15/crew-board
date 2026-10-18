import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useState, type ReactNode } from 'react';

export interface Panel {
  id: string;
  labelledBy?: string;
  content: ReactNode;
}

/**
 * Every panel's wrapper is always in the page, so tabs can point at it with aria-controls, but its content is
 * only mounted once the panel has been shown. After that it stays mounted, so the panel keeps its state and
 * slides back without a reload. A panel nobody opens never loads its code or its data.
 */
export function SlidingPanels({ index, panels }: { index: number; panels: Panel[] }) {
  const theme = useTheme();
  const [shown, setShown] = useState<ReadonlySet<number>>(() => new Set([index]));
  if (!shown.has(index)) setShown(new Set(shown).add(index));
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
            {i === index || shown.has(i) ? panel.content : null}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

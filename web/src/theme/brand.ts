import type { SxProps, Theme } from '@mui/material/styles';

export type Tone = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';

export const brandGradient =
  'linear-gradient(135deg, var(--mui-palette-primary-main), var(--mui-palette-secondary-main))';

export const tint = (tone: Tone, alpha: number): string => `rgb(var(--mui-palette-${tone}-mainChannel) / ${alpha})`;

export const heroSx: SxProps<Theme> = {
  background: `linear-gradient(135deg, ${tint('primary', 0.16)}, ${tint('secondary', 0.12)})`,
  border: 1,
  borderColor: 'divider',
  borderRadius: '20px',
  p: { xs: 2.5, md: 3.5 },
};

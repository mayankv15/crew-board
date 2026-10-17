import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import { Box, Button, Paper, Skeleton, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { heroSx, tint, type Tone } from '../theme/brand.ts';

function IconBadge({ tone, children, size = 44 }: { tone: Tone; children: ReactNode; size?: number }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        bgcolor: tint(tone, 0.14),
        color: `${tone}.main`,
      }}
    >
      {children}
    </Box>
  );
}

export function LoadingBlock({ label, rows = 3, height = 112 }: { label: string; rows?: number; height?: number }) {
  return (
    <Stack role="status" aria-label={label} spacing={2}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={height} animation="wave" />
      ))}
    </Stack>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, textAlign: 'center', borderStyle: 'dashed' }}>
      <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
        <IconBadge tone="primary" size={56}>
          <InboxOutlinedIcon />
        </IconBadge>
        <Typography component="h3" variant="h3">
          {title}
        </Typography>
        {children ? (
          <Typography color="text.secondary" sx={{ maxWidth: 460 }}>
            {children}
          </Typography>
        ) : null}
        {action}
      </Stack>
    </Paper>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Paper
      role="alert"
      variant="outlined"
      sx={{ p: { xs: 3, md: 4 }, textAlign: 'center', borderColor: 'error.main', bgcolor: tint('error', 0.06) }}
    >
      <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
        <IconBadge tone="error" size={56}>
          <ErrorOutlineIcon />
        </IconBadge>
        <Typography component="h3" variant="h3">
          Something went wrong
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 520 }}>
          {message}
        </Typography>
        {onRetry ? (
          <Button variant="outlined" color="error" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </Stack>
    </Paper>
  );
}

export function StatPill({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: ReactNode;
  tone: Tone;
  icon: ReactNode;
}) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        alignItems: 'center',
        pl: 0.75,
        pr: 1.5,
        py: 0.5,
        borderRadius: 99,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
      }}
    >
      <IconBadge tone={tone} size={28}>
        {icon}
      </IconBadge>
      <Typography component="span" sx={{ fontWeight: 800 }}>
        {value}
      </Typography>
      <Typography component="span" variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}

export function PageHeader({
  id,
  title,
  subtitle,
  actions,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Box sx={{ ...heroSx, p: { xs: 1.75, md: 1.75 }, borderRadius: '16px', flex: 'none' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        sx={{ justifyContent: 'space-between', alignItems: { md: 'center' } }}
      >
        <Box>
          <Typography component="h2" variant="h2" id={id} sx={{ fontSize: '1.35rem' }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, maxWidth: 640 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {actions}
      </Stack>
      {children}
    </Box>
  );
}

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

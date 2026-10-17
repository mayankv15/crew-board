import HubIcon from '@mui/icons-material/Hub';
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import { AppBar, Box, Button, Stack, Toolbar, Typography } from '@mui/material';
import { NavLink } from 'react-router';
import { useAppSelector } from './hooks.ts';
import { brandGradient, tint } from '../theme/brand.ts';
import { SyncStatusChip } from './SyncStatusChip.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

const navSx = {
  color: 'text.secondary',
  px: 1.75,
  '&.active': { color: 'primary.main', bgcolor: tint('primary', 0.1) },
} as const;

export function AppHeader() {
  const boardSearch = useAppSelector((s) => s.ui.boardSearch);
  return (
    <AppBar
      position="static"
      color="inherit"
      elevation={0}
      sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
    >
      <Toolbar
        disableGutters
        sx={{
          gap: { xs: 1, md: 2 },
          width: '100%',
          maxWidth: 1360,
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          flexWrap: 'wrap',
          py: { xs: 1, md: 0 },
        }}
      >
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <Box
            aria-hidden
            sx={{
              width: 38,
              height: 38,
              borderRadius: 2.5,
              background: brandGradient,
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
            }}
          >
            <HubIcon fontSize="small" />
          </Box>
          <Typography component="h1" variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
            Crew Board
          </Typography>
        </Stack>

        <Stack component="nav" aria-label="Main" direction="row" spacing={0.5} sx={{ ml: { md: 2 } }}>
          <Button component={NavLink} to={`/${boardSearch}`} end sx={navSx} startIcon={<SpaceDashboardOutlinedIcon />}>
            Board
          </Button>
          <Button component={NavLink} to="/sync" sx={navSx} startIcon={<SyncAltIcon />}>
            HR sync
          </Button>
        </Stack>

        <Box sx={{ flex: 1 }} />
        <SyncStatusChip />
        <ThemeToggle />
      </Toolbar>
    </AppBar>
  );
}

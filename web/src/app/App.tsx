import SearchOffIcon from '@mui/icons-material/SearchOff';
import { Box, Button, Container, CssBaseline, Link, ThemeProvider } from '@mui/material';
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router';
import { BoardPage } from '../features/board/BoardPage.tsx';
import { SlidingPanels } from '../shared/SlidingPanels.tsx';
import { useChangeWatcher } from '../shared/useChangeWatcher.ts';
import { createAppTheme } from '../theme/theme.ts';
import { EmptyState, LoadingBlock } from '../shared/ui.tsx';
import { AppHeader } from './AppHeader.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { Notifier } from './Notifier.tsx';

function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      action={
        <Button component={NavLink} to="/" variant="contained" startIcon={<SearchOffIcon />}>
          Back to the board
        </Button>
      }
    >
      That page does not exist. Use the menu to go back to the board.
    </EmptyState>
  );
}

const SyncPage = lazy(() => import('../features/sync/SyncPage.tsx').then((m) => ({ default: m.SyncPage })));

const TITLES: Record<string, string> = { '/': 'Board', '/sync': 'HR sync' };

export function App() {
  useChangeWatcher();
  const theme = useMemo(() => createAppTheme(), []);
  const { pathname } = useLocation();
  const page = pathname === '/' ? 0 : pathname === '/sync' ? 1 : -1;

  useEffect(() => {
    document.title = `${TITLES[pathname] ?? 'Page not found'} · Crew Board`;
  }, [pathname]);

  return (
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline enableColorScheme />
      <Link
        href="#main"
        sx={{
          position: 'absolute',
          left: 8,
          top: -64,
          zIndex: 2000,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          px: 2,
          py: 1,
          borderRadius: 2,
          '&:focus': { top: 8 },
        }}
      >
        Skip to content
      </Link>
      <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <AppHeader />
        <Box
          component="main"
          id="main"
          tabIndex={-1}
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            '&:focus': { outline: 'none' },
          }}
        >
          <Container
            maxWidth={false}
            sx={{
              maxWidth: 1360,
              flex: 1,
              minHeight: 0,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              py: { xs: 2, md: 2.5 },
            }}
          >
            <ErrorBoundary key={pathname}>
              {page === -1 ? (
                <NotFound />
              ) : (
                <SlidingPanels
                  index={page}
                  panels={[
                    { id: 'page-board', content: <BoardPage /> },
                    {
                      id: 'page-sync',
                      content: (
                        <Suspense fallback={<LoadingBlock label="Loading HR sync" rows={3} />}>
                          <SyncPage />
                        </Suspense>
                      ),
                    },
                  ]}
                />
              )}
            </ErrorBoundary>
          </Container>
        </Box>
      </Box>
      <Notifier />
    </ThemeProvider>
  );
}

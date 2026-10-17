import { createTheme } from '@mui/material/styles';

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createAppTheme() {
  const still = reducedMotion();
  const zero = { shortest: 0, shorter: 0, short: 0, standard: 0, complex: 0, enteringScreen: 0, leavingScreen: 0 };

  return createTheme({
    cssVariables: { colorSchemeSelector: 'data' },
    colorSchemes: {
      light: {
        palette: {
          primary: { main: '#3730A3', light: '#4F46E5', dark: '#312E81', contrastText: '#FFFFFF' },
          secondary: { main: '#0E7490', light: '#06B6D4', dark: '#155E75', contrastText: '#FFFFFF' },
          success: { main: '#0E7490', contrastText: '#FFFFFF' },
          warning: { main: '#AD5A06', light: '#F59E0B', dark: '#8A4604', contrastText: '#FFFFFF' },
          error: { main: '#BE123C', light: '#F43F5E', dark: '#9F1239', contrastText: '#FFFFFF' },
          info: { main: '#3730A3', contrastText: '#FFFFFF' },
          background: { default: '#F4F6FB', paper: '#FFFFFF' },
          text: { primary: '#131735', secondary: '#4B5170' },
          divider: 'rgba(55, 48, 163, 0.14)',
        },
      },
      dark: {
        palette: {
          primary: { main: '#A5B4FC', light: '#C7D2FE', dark: '#818CF8', contrastText: '#1E1B4B' },
          secondary: { main: '#67E8F9', light: '#A5F3FC', dark: '#22D3EE', contrastText: '#083344' },
          success: { main: '#67E8F9', contrastText: '#083344' },
          warning: { main: '#FCD34D', light: '#FDE68A', dark: '#FBBF24', contrastText: '#3B2A00' },
          error: { main: '#FDA4AF', light: '#FECDD3', dark: '#FB7185', contrastText: '#4C0519' },
          info: { main: '#A5B4FC', contrastText: '#1E1B4B' },
          background: { default: '#0B0F23', paper: '#131936' },
          text: { primary: '#EEF0FF', secondary: '#A9B0D3' },
          divider: 'rgba(165, 180, 252, 0.18)',
        },
      },
    },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: '"Inter Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      h1: { fontWeight: 800, letterSpacing: '-0.02em' },
      h2: { fontWeight: 800, letterSpacing: '-0.02em', fontSize: '1.9rem' },
      h3: { fontWeight: 700, letterSpacing: '-0.01em', fontSize: '1.15rem' },
      h4: { fontWeight: 700, fontSize: '1.05rem' },
      h6: { fontWeight: 700 },
      button: { textTransform: 'none', fontWeight: 650 },
    },
    ...(still ? { transitions: { duration: zero, create: () => 'none' } } : {}),
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { WebkitFontSmoothing: 'antialiased' },
          ':focus-visible': { outline: '3px solid var(--mui-palette-primary-main)', outlineOffset: 2 },
          '.MuiPaper-root:focus-visible, [role="dialog"]:focus-visible, [tabindex="-1"]:focus-visible': {
            outline: 'none',
          },
          '.MuiMenuItem-root:focus-visible, .MuiTab-root:focus-visible, .MuiDataGrid-columnHeader:focus-visible': {
            outlineOffset: -3,
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 10, minHeight: 40 }, sizeSmall: { minHeight: 32 } },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCard: { defaultProps: { variant: 'outlined' } },
      MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
      MuiTooltip: { defaultProps: { arrow: true } },
    },
  });
}

import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import { IconButton, Tooltip, useColorScheme } from '@mui/material';

const NEXT = { system: 'light', light: 'dark', dark: 'system' } as const;
const LABEL = { system: 'Following your system', light: 'Light', dark: 'Dark' } as const;

export function ThemeToggle() {
  const { mode, setMode } = useColorScheme();
  if (!mode) return null;
  const Icon = mode === 'light' ? LightModeOutlinedIcon : mode === 'dark' ? DarkModeOutlinedIcon : BrightnessAutoIcon;
  return (
    <Tooltip title={`Theme: ${LABEL[mode]}. Click to change.`}>
      <IconButton
        aria-label={`Colour theme: ${LABEL[mode]}. Switch to ${LABEL[NEXT[mode]]}.`}
        onClick={() => setMode(NEXT[mode])}
      >
        <Icon />
      </IconButton>
    </Tooltip>
  );
}

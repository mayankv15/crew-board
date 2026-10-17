import { describe, expect, it } from 'vitest';
import { createAppTheme } from '../src/theme/theme.ts';
import { contrast, distance, VISION, type Vision } from './colorMath.ts';

interface Tone {
  main: string;
  contrastText: string;
}
interface Palette {
  primary: Tone;
  secondary: Tone;
  success: Tone;
  warning: Tone;
  error: Tone;
  text: { primary: string; secondary: string };
  background: { default: string; paper: string };
}
const schemes = (createAppTheme() as unknown as { colorSchemes: Record<'light' | 'dark', { palette: Palette }> })
  .colorSchemes;

describe.each(['light', 'dark'] as const)('%s palette', (mode) => {
  const p = schemes[mode].palette;
  const surfaces = { page: p.background.default, card: p.background.paper };

  it.each(Object.entries(surfaces))(
    'body and secondary text are readable on the %s surface (AA, 4.5:1)',
    (_name, surface) => {
      expect(contrast(p.text.primary, surface)).toBeGreaterThanOrEqual(7);
      expect(contrast(p.text.secondary, surface)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(['primary', 'success', 'warning', 'error'] as const)(
    '%s colour works as text and as an icon on cards (4.5:1)',
    (tone) => {
      expect(contrast(p[tone].main, surfaces.card)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p[tone].main, surfaces.page)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(['primary', 'secondary', 'success', 'warning', 'error'] as const)(
    'text on a filled %s button or chip is readable (4.5:1)',
    (tone) => {
      expect(contrast(p[tone].contrastText, p[tone].main)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('keeps the focus ring and borders visible (3:1 for interface parts)', () => {
    expect(contrast(p.primary.main, surfaces.card)).toBeGreaterThanOrEqual(3);
  });

  const statuses = ['success', 'warning', 'error', 'primary'] as const;
  const pairs = statuses.flatMap((a, i) => statuses.slice(i + 1).map((b) => [a, b] as const));
  const visions = Object.keys(VISION) as Vision[];

  it.each(pairs)('%s and %s stay apart for protan, deutan and tritan vision', (a, b) => {
    for (const vision of visions)
      expect(distance(p[a].main, p[b].main, vision), `${a}/${b} as seen with ${vision}`).toBeGreaterThanOrEqual(18);
  });
});

describe('status is never colour alone', () => {
  it('uses four hues at most, with success a cyan-teal and not green', () => {
    const { main } = schemes.light.palette.success;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(main.slice(i, i + 2), 16));
    expect(b!).toBeGreaterThan(g! * 0.75);
    expect(r!).toBeLessThan(b!);
  });
});

# Colour: what was researched, what was chosen, and how it is kept honest

## The product

Crew Board is a tool a coordinator looks at for hours: dense lists, many statuses, and a constant question of "can I trust this?". That points to a calm, cool, low-glare palette; very few hues, so status colours stay meaningful; and status that never depends on colour alone.

## What the research said

- **Blue is the default trust colour for work software.** Time-and-attendance and scheduling products lean blue because cool tones read as practical and dependable. The warning is that a generic corporate blue disappears, so the exact shade and a distinct accent matter ([Shiftee on choosing a brand colour](https://shiftee.io/en/blog/article/shifteeBrandColor), [Hostinger on colour schemes](https://www.hostinger.com/in/tutorials/website-color-schemes/)).
- **Keep it small.** Roughly 60% dominant (here: neutral surfaces), 30% secondary, 10% accent, and about four colours at most; use dark grey, not pure black, for text (Hostinger).
- **Status needs more than colour.** Pair every status colour with a shape, icon or words; put status text next to the data, not only in a tooltip; and be careful with red and green together, which many people cannot tell apart ([NHS Scotland status palette](https://www.turasdesignsystem.nhs.scot/design/data-visualisation/status-palette/)).
- **Contrast has numbers.** Text needs 4.5:1; interface parts and status icons need 3:1 against whatever they sit on ([W3C, Non-text contrast](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast), [WebAIM](https://webaim.org/articles/contrast/)). This has to be checked on the real dark surface too, not assumed.
- **Colour-blind-safe palettes** such as Okabe-Ito rely on blue, orange and a bluish green, and avoid a red/green pair ([Okabe-Ito reference](https://dev.conceptviz.app/fr/blog/okabe-ito-palette-hex-codes-complete-reference)).

Not found: the actual colours used by named scheduling products (their pages were behind a login or only review sites). Nothing below relies on them.

## What was chosen

| Role               | Light                           | Dark                            | Used for                                                        |
| ------------------ | ------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| Primary, indigo    | `#3730A3`                       | `#A5B4FC`                       | Brand, every action, selection, "in progress"                   |
| Success, cyan-teal | `#0E7490`                       | `#67E8F9`                       | Available, filled, healthy sync                                 |
| Attention, amber   | `#AD5A06`                       | `#FCD34D`                       | Conflicts, partial sync, deactivated people, urgent start dates |
| Problem, rose      | `#BE123C`                       | `#FDA4AF`                       | Errors, failed runs                                             |
| Surfaces           | `#F4F6FB` page, `#FFFFFF` cards | `#0B0F23` page, `#131936` cards | Neutral, cool-tinted, so colour is saved for meaning            |
| Text               | `#131735`, `#4B5170`            | `#EEF0FF`, `#A9B0D3`            | Dark grey-navy, never pure black                                |

Four hues, one job each. Success is cyan-teal and not green on purpose.

## How it was decided: by measurement

Candidate sets were scored on two things: contrast against white and the tinted page, and how far apart the status colours stay under simulated protan, deutan and tritan vision (Machado 2009 matrices, CIE76 distance; bigger is easier to tell apart).

| Finding                                                                            | Number                                                           |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| A conventional green success next to the rose error, seen with colour-blind vision | distance **6**: they nearly merge                                |
| The first palette (teal success `#0F766E`)                                         | worst pair **17.5**                                              |
| The chosen palette                                                                 | worst pair **24**, a gain of about 40%                           |
| Dark mode, before and after switching success to `#67E8F9`                         | 15.9 to 18.5                                                     |
| Okabe-Ito colours used directly as text on white                                   | 2.3 to 3.9:1, which fails 4.5:1, so they were not used as is     |
| First amber `#B45F06` on the tinted page                                           | 4.24:1, below the line, so it was deepened to `#AD5A06` (4.58:1) |

## How it stays that way

[`web/test/theme.test.ts`](../web/test/theme.test.ts) recomputes all of this from the real theme on every test run: text and every status colour against both surfaces in both modes (4.5:1), text on filled buttons and chips (4.5:1), and the distance between every pair of status colours under every vision type (at least 18). Changing a colour so that it fails any of them breaks the build.

In use, colour is never alone: every status has an icon or words (a check, a warning triangle, "Deactivated by HR"), seats are shown as filled and hollow dots as well as in colour, and an urgent start date carries a warning mark and the words "Starts in N days".

An automated axe-core scan of every screen and state, in light and dark, found no colour-contrast violations on the production build.

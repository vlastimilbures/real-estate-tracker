# 0192. Start-up waits for the bundled fonts

- Status: Accepted
- Date: 2026-10-13
- Source: issue #269 (option A, part 1); owner decision 2026-10-13; Track 14 PR N12b
- Related: DR-009 (the first render waits for the dictionary, `src/main.tsx`),
  [0057](0057-ux-capture-tool.md) (the screenshot harness)

## Context

The app bundles its two fonts (Public Sans, Fraunces) and the browser loads them only when
text first needs them. The first render therefore lays out with the fallback font. Recharts
measures tick label widths once and keeps them, so an axis drawn before the font arrives can
place its last tick ("2056") 1 px off. The screenshot harness waits for `document.fonts.ready`
before each shot, which is too late for those measurements: under load one dashboard screen
differs by about 700 px between two captures of the same commit (#269).

## Decision

1. **The first render waits for the bundled fonts**, next to the dictionary wait (DR-009).
   Start-up asks the browser to load both families for the characters charts draw (digits and
   "Kč"), and renders once that and the dictionary have finished.
2. **A font that fails to load never blocks the app.** The failure is logged and the app
   renders with the fallback font, as it did before.

## Consequences

- Charts measure their labels with the final font, so tick positions no longer depend on
  timing. The README's known-flake note for `pnpm ux:capture` is removed.
- Start-up waits a few milliseconds more: the fonts are local files in the app bundle.
- Only the subsets the sample text touches (Latin, Latin Extended) are loaded up front; other
  subsets of the two families still load lazily. Charts draw digits and "Kč" in every
  language, so this does not affect them.
- No computed number, export or stored data changes.

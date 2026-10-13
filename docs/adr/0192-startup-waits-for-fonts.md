# 0192. Start-up waits for the bundled fonts

- Status: Accepted
- Date: 2026-10-13
- Source: issue #269 (option A, part 1); owner decision 2026-10-13; Track 14 PR N12b
- Related: [0066](0066-performance-budgets.md) (DR-009: the first render waits for the
  dictionary; cold-start budget), [0057](0057-ux-capture-tool.md) (the screenshot harness)

## Context

The app bundles its two fonts (Public Sans, Fraunces) and the browser loads them only when
text first needs them. The first render therefore lays out with the fallback font. Recharts
measures tick label widths once and keeps them, so an axis drawn before the font arrives can
place its last tick ("2056") 1 px off. The screenshot harness waits for `document.fonts.ready`
before each shot, which is too late for those measurements: under load about 700 pixels of
one dashboard screen differ between two captures of the same commit (#269).

## Decision

1. **The first render waits for the bundled fonts**, next to the dictionary wait (DR-009).
   Start-up asks the browser to load both families for the characters charts draw (digits,
   with "Kč" so the Latin Extended subset that Czech text needs loads too), and renders once
   that and the dictionary have finished.
2. **A font that fails to load never blocks the app.** A failed, unregistered or slow font
   (no answer within a second) is logged and the app renders with the fallback font, as it
   did before.

## Consequences

- Charts measure their labels with the final font, so tick positions no longer depend on
  timing. The README's known-flake note for `pnpm ux:capture` is removed.
- Start-up waits a few milliseconds more: the fonts are local files in the app bundle.
- Only the Latin and Latin Extended subsets are loaded up front. Chart ticks draw digits,
  separators, "−", "%" and unit suffixes, all in Latin. The families have no Cyrillic, so
  Russian text always uses the system font; only their Vietnamese subset still loads
  lazily.
- No computed number, export or stored data changes.

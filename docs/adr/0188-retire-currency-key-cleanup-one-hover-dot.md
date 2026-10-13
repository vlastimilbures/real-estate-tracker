# 0188. Retire the old currency-key cleanup; one hover dot for every line chart

- Status: Accepted
- Date: 2026-10-13
- Source: issues #145 (R8-18) and #170 (R5-09), 2026-10 review; owner chose on
  2026-10-13 to drop the cleanup with an ADR; Track 14 PR N9b
- Related: [0058](0058-remove-currency-tab.md) (CZK locked, UX-017),
  [0114](0114-a11y-skip-link-charts.md) (chart names and series keys)

## Context

1. Every launch deletes the browser-storage key `ui.currency`, written by the €/$/£ picker
   that UX-017 removed before 1.1. The app has never read it since, and every install that
   started a later build has already cleared it. The cleanup is code and a test kept for a
   key that is harmless when present.
2. PR N9a (#346) drew every chart through one ChartCard body. The Dashboard LTV line was
   the only line without the small hover dot (r = 3) the other lines use; N9a kept that
   difference behind a temporary series flag so its screenshots stayed identical.

## Decision

1. The app no longer deletes `ui.currency`. A value left by a very old build stays in
   browser storage, unused; amounts stay in Kč whatever it holds.
2. Every line chart marks the hovered year with the same r = 3 dot, the Dashboard LTV line
   included. The temporary series flag is removed.

## Consequences

No computed number, parity target, golden master or export changes. Old installs may keep
one unused storage key. The LTV hover dot is slightly smaller than before; static
screenshots do not change (they show no hover).

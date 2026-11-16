# 0222. KPI band: one surface, captioned groups

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-16
- Source: issue #421 (UX/UI review 2026-11, round 2, tracking #425); direction approved
  by the owner on 2026-11-16 (point 3 of the round-2 plan); acceptance delegated by the
  owner for the 2026-11-16 run
- Amends: [0200](0200-dashboard-kpi-strip.md) §1, §2 and §4 (six boxed tiles become one band in two
  groups; the basis and the horizon are named in the group captions),
  [0215](0215-property-detail-top.md) §3 (Property detail's tiles take the band look)
- Related: [0208](0208-key-figures-grouped.md) (the tiles' exact values, kept),
  [0169](0169-development-drawn-debt-display.md) (the undrawn note, kept),
  [0195](0195-health-marker.md) (the health marker and word, kept)

## Context

The Dashboard's KPI strip is six boxed tiles. Four are for the as-of date and two for the
horizon, but nothing groups them. The horizon and lens are written twice ("30-yr
horizon · nominal" and "30-yr · after debt · nominal"), and the basis hides at the end of
the net cash flow foot. Six borders and shadows make the strip read as six cards rather
than one summary.

## Decision

1. **One band.** The strip is one surface (the panel's background, border and radius).
   Cells are separated by hairlines, not boxes. Each cell reads label, value and at most
   one short foot, in that order.
2. **Two captioned groups on the Dashboard,** each a `role="group"` named by its caption:
   - **As of** — caption: the basis, capitalised (`dashboard.basisCurrent`,
     `basisOn`, `basisProjection`, as before). Cells: Net worth (foot: assets · debt,
     with the undrawn note and the real-lens note as before), Net cash flow per month
     (foot: the year's amount and `dashboard.perYear`), LTV, DSCR (health marker and
     word).
   - **Horizon** — caption `dashboard.bandHorizonCaption(endYear, n, lens)` ("In 2056 ·
     30-yr horizon · nominal"). Cells: Net worth (foot `dashboard.bandMultiple`, the
     multiple), Levered IRR (foot `dashboard.bandIrrFoot`, "after debt").
3. **Layout.** At 960 px of band width and more the groups sit side by side (4 + 2 cells),
   with a hairline between them. Below that they stack, the as-of group as four cells in
   a row down to 640 px and two by two below. The horizon group is always two cells.
4. **Property detail** shows its six snapshot cells as one band with one group, captioned
   with the basis. Six across from 960 px, three by two below. Net cash flow's foot uses
   `dashboard.perYear`.
5. **No figure is dropped.** The values, tooltips and read-out exact amounts (ADR 0208 §1)
   and the health words are unchanged.
6. **Dictionary:** new `dashboard.bandHorizonCaption`, `bandMultiple`, `bandIrrFoot` and
   `perYear` (en, cs, ru). Removed: `stripInYear`, `stripHorizonFoot`, `irrFoot` and
   `perYearBasis`, whose content the captions now carry.

## Consequences

- The band reads as one summary in two parts, with the basis and the horizon stated once
  each, where the eye starts.
- No computed number, stored data or export changes.
- The ux capture checks the band: the group count and captions, the cell counts, one row
  at 960 px and wider, labels on one line, values not cut off, and cell height.

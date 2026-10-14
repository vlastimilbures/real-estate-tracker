# 0194. Kept app banners announce once; a Purchases column in the projections

- Status: Accepted
- Date: 2026-10-14
- Source: issues #350 (follow-up of the review of PR #349) and #317; owner decisions
  2026-10-14 (#350: announce once; #317: add the column, an off-plan purchase counted as the
  chart counts it); Track 14 PR N13c
- Amends: [0189](0189-outcome-regions-pending-purchase-a11y.md) (§2: the stale-data and
  edit-error banners too), [0165](0165-future-purchases.md) (the acquired value is shown in
  the projection grid and its export)
- Related: [0170](0170-equity-change-drawn-debt.md) (the chart's Purchases stack the
  column repeats)

## Context

1. Each page renders its own app shell. The stale-data banner and the edit-error banner
   keep `role="alert"` there, so a screen reader reads them again on every page change
   (#350). ADR 0189 §2 already fixed this for the kept notice and failure.
2. A future purchase's value comes online in its purchase year (`acquiredValue`, ADR 0165).
   The Value column jumps that year, but the projection grid and its Excel export do not say
   why; only the Dashboard's equity-change chart splits the purchase (and a development
   flat's construction, ADR 0170) out (#317).

## Decision

1. **The stale-data and edit-error banners announce once**, as ADR 0189 §2 does for the
   notice and failure: the live role only on the page where the banner first shows; later
   pages show it unchanged without a live role until it goes away. A new edit error is
   announced again, and so is the stale banner when the data turns stale again after a
   successful reload.
2. **A Purchases column** (`projGrid.purchases`, the same words as the equity-change
   chart's stack) follows Value in the projection grid and in its Excel export. It holds
   the value purchases and construction add that year, the figure the equity-change chart
   stacks (ADR 0170): a future purchase's value less the tranches it has not drawn yet,
   plus the tranches a development loan draws for construction. So an off-plan flat with
   9.5 M completed value and 2.5 M still to draw shows 7.0 M in its purchase year, what
   Value rises by apart from growth, and the rest in the years the tranches are drawn
   (owner, 2026-10-14). The column follows the chosen lens; it is shown only when some
   year rounds to a non-zero amount (ADR 0116 §12, ADR 0178) and is blank in the opening
   row, like the other flow columns.

## Consequences

- No computed number changes: the column shows a figure the chart already shows. The
  export gains a column only for a portfolio or property with a future purchase or a
  development loan drawing inside the horizon; the sample portfolio has neither, so its
  screens and export are unchanged.
- A rise in Value that is not growth reads in the grid row where it happens.

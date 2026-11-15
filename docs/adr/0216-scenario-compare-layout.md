# 0216. Scenarios: three charts in a row, a flush key-figures table

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-16
- Source: issue #388 (UX/UI review 2026-11, tracking #392); direction approved by the
  owner on 2026-11-15 (the issue's decision); acceptance delegated by the owner for the
  2026-11-15 run (comment on #392)
- Related: [0202](0202-dashboard-hierarchy.md) (the small-multiple plot height),
  [0089](0089-compare-owner-loss.md) (the starting-equity footnote, kept),
  [0097](0097-compare-delta-view.md) (Δ vs Base, unchanged),
  [0108](0108-scenario-compare-xlsx-export.md) (the export, unchanged)

## Context

Scenario compare shows three charts (net worth, net cash flow, loan-to-value) in a
two-column grid, so the third sits alone beside an empty cell. The key-figures table is
inset in its panel with its own padding and header style, while every other table in
the app runs to the panel's edges with the shared header style.

## Decision

1. **Charts.** The three charts share one row when their row is at least 900 px wide
   (1280 × 800), with the Dashboard's small-multiple plot height of 180 px
   (`SMALL_CHART_HEIGHT`, moved from the Dashboard to the chart components). Narrower,
   two side by side and the third across the row (1100 px window); below 640 px, one per
   row (900 × 600). A container query on the charts' own width decides, so no cell is
   ever empty.
2. **Key figures table.** The shared data-table look (`table.data`): the panel body is
   flush, the header is the standard one (11 px caps, faint, strong rule), rows have the
   standard padding and rule, and the metric column is pinned (`sticky-col`) when the
   table scrolls sideways. Each scenario's header keeps the colour of its chart line
   (UX-025), and the columns keep their shares (metric 1.4, each scenario 1).
3. **Unchanged:** the rows and their figures, the Values / Δ vs Base toggle and its
   content, the starting-equity footnote and the own-rate lines (now padded like the
   panel's body), the export, the "not compared" notice.

## Consequences

- No empty grid cell at 1280 × 800, 1100 px or 900 × 600 with one to four compared lines
  (checked by the ux capture on screens 40, 42 and 43).
- The charts are shorter (180 px plots instead of 196 px), as on the Dashboard.
- No computed number, stored data, export or dictionary change.

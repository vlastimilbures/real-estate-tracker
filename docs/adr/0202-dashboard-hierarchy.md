# 0202. Dashboard: the projection first, small multiples after

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-15
- Source: issue #376 (UX/UI review 2026-11, tracking #392, finding F3); direction approved
  by the owner on 2026-11-15 (the issue's layout); acceptance delegated by the owner for
  the 2026-11-15 run (comment on #392)
- Related: [0200](0200-dashboard-kpi-strip.md) (the KPI strip above),
  [0114](0114-a11y-skip-link-charts.md) (charts and their table view, unchanged),
  [0157](0157-accessibility-batch.md) (one h1, sections h2)

## Context

1. The Dashboard was about 2,750 px tall at 1280 × 800 after ADR 0200, and the 30-year
   projection, which is what the app is for, started below the Financing and Data check
   panels, below the second fold.
2. Its six charts were the same size in a two-column grid: "Value vs debt vs equity" had
   the weight of "Loan-to-value".
3. Their heading, `dashboard.trajectory`, was a bare `section-head` in a size and style of
   its own, unlike every panel title.

## Decision

1. **Order:** filter bar → KPI strip → the projection (hero chart) → Financing & upcoming →
   Data check (its own issue moves it later) → the five other charts → Key performance
   indicators. Sections are 24 px apart on the Dashboard (`.page.dashboard`) instead of
   32 px, and the sample banner and filter bar add no margin of their own there.
2. **Hero chart:** "Value vs debt vs equity" alone, full width, plot 300 px tall, in a
   card headed like a panel: an h2 `dashboard.projectionTitle` ("30-year projection") and
   the lens (`dashboard.nominalKc` / `dashboard.realTerms`) as its hint. The chart's own
   title (`dashboard.chartValueVsDebtVsEquity`), unit, legend, tooltip and Table view are
   unchanged, under that head.
3. **Small multiples:** the other five charts, plot 180 px, in this order: net cash flow
   by year, equity change, NOI vs debt service, then rent gross vs effective and
   loan-to-value. Three then two per row when their row is at least 900 px wide (1280 and
   the 1200 default window), two per row with the fifth across the row below that (1100),
   one per row below 640 px (900 × 600). No row has an empty cell. A container query on
   the grid decides, as the KPI strip's does.
4. **Headings:** the small multiples are their own section with an h2 for screen readers
   only (`dashboard.moreCharts`, "More {n}-year charts"), so they are not read as part of
   the Data check before them. Chart titles stay text, as before.
5. **Removed:** the `section-head` above the charts and its key `dashboard.trajectory`;
   `ChartCard` gains a `height` (default 196 px, as before) used by the chart and its
   table.

## Consequences

- At 1280 × 800, as of Today with the sample portfolio, the hero chart's bottom edge is in
  the first viewport (about 780 px) and Financing starts in the second (about 800 px).
  The page keeps about its length (about 2,750 px, with the sample banner): the hero is
  taller and the small multiples shorter. What changes is what the first screen shows. The capture harness checks both, and the empty-cell rule at 1280, 1100 and
  900 (a 1100 × 800 viewport is added, run on demand).
- Every chart's title, unit, legend, tooltip and table keep their content.
- Property detail and Scenarios charts are unchanged.
- No computed number, stored data or behaviour changes.

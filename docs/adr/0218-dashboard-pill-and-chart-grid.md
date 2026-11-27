# 0218. Dashboard: the review count beside the title; six charts in one grid

- Status: Accepted
- Superseded in part by: [0275](0275-data-check-current-rule.md) (decision 1)
- Date: 2026-11-16
- Source: issue #420 (UX/UI review 2026-11, round 2, tracking #425); direction approved
  by the owner on 2026-11-16 (points 1 and 2 of the round-2 plan, including the owner's
  answer "small amber pill beside the page title"); acceptance delegated by the owner for
  the 2026-11-16 run
- Amends: [0202](0202-dashboard-hierarchy.md) §1–§4 (the hero chart and the small
  multiples become one grid; Financing follows the charts),
  [0206](0206-data-check-grouped.md) §2 (the "N to review" link leaves the filter bar),
  [0198](0198-asof-hint-own-row.md) (the hint row no longer has a lead)
- Related: [0210](0210-chart-reset-markers.md) (fixation-end markers, kept on the value
  chart), [0118](0118-data-check.md) (the Data check's jump, unchanged)

## Context

The filter bar holds the as-of picker and the property chips. When the Data check had
findings, the bar's hint row also led with an amber "N to review" button. A warning
among the filters reads as a filter. The projection was one 280 px hero chart, then
Financing, then a second heading ("More 30-year projection charts") over five small
multiples in a 3 + 2 grid. The page named the horizon and the lens twice, and the charts
had three sizes.

## Decision

1. **Review pill.** `AppShell` takes `attention?: { count, label, onSelect }` and renders a
   compact amber pill right after the page title: a warning icon and the number. Its
   accessible name and tooltip are the full sentence `dataCheck.reviewPill(n)` ("6 to
   review in the Data check"). A click opens the Data check and moves focus to its
   heading, the same jump as before. The Dashboard passes it when findings need attention
   (`check.attention.length > 0`). The filter bar loses the button, and `AsOfPicker` loses
   its `lead` prop. Property detail gets the same pill with its Data check rework (#422).
2. **One chart section.** The heading `dashboard.projectionTitle(n)` ("30-year projection")
   with the lens hint, stated once. Under it, **six charts, two per row**, all with the
   same 220 px plot. Value vs debt vs equity comes first and keeps the fixation-end
   markers. Then net cash flow, equity change, NOI vs debt service, rent, and LTV. Below a
   640 px container the grid is one column. `ProjectionHero` and `MoreCharts` merge into
   `ProjectionCharts`. The `.chart-hero` and 3 + 2 rules and the second heading
   (`dashboard.moreCharts`, removed from the dictionaries) go.
3. **Page order:** filter bar → KPI strip → charts → Financing & upcoming → Key performance
   indicators → Data check.

## Consequences

- The filter bar holds filters only. The warning sits where the eye starts, and it shows
  only when there is something to review.
- Every chart has the same size and the page reads in pairs. The value chart is 60 px
  shorter than the hero was. Its table view and markers are unchanged.
- No computed number, stored data or export changes. Dictionary: new
  `dataCheck.reviewPill` (en, cs, ru); `dashboard.moreCharts` and `dataCheck.toReview`
  (the button's text) removed.
- The ux capture checks the pill (beside the title, opens and focuses the Data check) and
  the grid (six cards, 2 per row from 640 px, else one per row, no empty cell). At
  1280 × 800 the first chart row ends inside the first viewport.

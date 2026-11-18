# 0210. Fixation ends marked on the 30-year value chart

- Status: Accepted
- Date: 2026-11-16
- Source: issue #382 (UX/UI review 2026-11, tracking #392); direction approved by the
  owner on 2026-11-15 (the issue's marker); acceptance delegated by the owner for the
  2026-11-15 run (comment on #392)
- Related: [0117](0117-property-loan-outlook.md) (a reset's status; only "upcoming" is
  marked), [0204](0204-financing-timeline.md) (the same resets in the Financing panel),
  [0202](0202-dashboard-hierarchy.md) (the hero chart), [0150](0150-one-asof-resolver.md) (the
  as-of-to-year rule)

## Context

The 30-year "Value vs debt vs equity" chart and the financing dates were separate: nothing
on the chart showed when a fixation ends, although after that date the projection assumes
the reset rate, which is where its uncertainty sits.

## Decision

1. **Markers.** The Dashboard's hero chart and Property detail's value chart mark each
   projection year that holds an upcoming fixation end (`FixationReset.status` "upcoming",
   as of the page's as-of date) with a thin dashed vertical line topped by a diamond.
   Several resets in one year share one marker, listed by date, then in the portfolio's
   property order. The year of a reset is the projection year whose months hold its
   fixation-end payment (`FixationReset.gridMonth`; year t holds grid months
   (t−1)·12+1 … t·12, the same span as the table's period, never the opening point), so
   the marked year is the one whose debt service the new rate first touches; a reset
   beyond the horizon is not marked. Shaping: `resetMarkers`
   (`src/ui/model/financing.ts`).
2. **Which resets.** The Dashboard marks the resets of the properties in its filter
   (`engine.financing`), Property detail those of its own loan.
3. **Tooltip.** The hovered year's tooltip lists its resets under `charts.rateReset`
   ("Rate reset"): property, fixation end and the debt at reset. The debt at reset is
   nominal in both lenses, as in the Financing panel; in the real lens the heading reads
   `charts.rateResetNominal` ("Rate reset · debt in nominal Kč").
4. **Legend.** A legend entry with the marker's swatch names it (`charts.rateReset`, in
   both lenses) when a line chart has a marker.
5. **Not colour only, hidden from assistive technology.** The marker is a dashed line
   and a diamond in the soft ink colour (at least 3:1 on the plot in both themes). The
   chart surface is already one labelled image pointing to the table; the dates are in
   the Financing panel and the property's loan outlook, so the table view is unchanged.

## Consequences

- With the sample portfolio at today the Dashboard chart has markers at 2029 and 2031;
  none when no reset is ahead.
- "Upcoming" is as of the page's as-of date while the chart always starts at the base
  date: with a later as-of, resets between the two still shape the curve but are not
  marked (the engine gives a passed reset no debt at reset).
- No computed number, stored data or export changes.
- New dictionary entries in en, cs and ru: `charts.rateReset`, `charts.rateResetNominal`.

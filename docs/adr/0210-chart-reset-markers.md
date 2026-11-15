# 0210. Fixation ends marked on the 30-year value chart

- Status: Accepted (delegated, owner review pending)
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
   Several resets in one year share one marker. The year of a reset is the projection
   year its date rounds to, by the as-of rule (`projectionYearForAsOf`); a reset beyond
   the horizon is not marked. Shaping: `resetMarkers` (`src/ui/model/financing.ts`).
2. **Which resets.** The Dashboard marks the resets of the properties in its filter
   (`engine.financing`), Property detail those of its own loan.
3. **Tooltip.** The hovered year's tooltip lists its resets under `charts.rateReset`
   ("Rate reset"): property, fixation end and the debt at reset. The debt at reset is
   nominal in both lenses, as in the Financing panel; in the real lens the heading reads
   `charts.rateResetNominal` ("Rate reset · debt in nominal Kč").
4. **Legend.** A legend entry with the marker's swatch names it (`charts.rateReset`) when
   the chart has a marker.
5. **Not colour only, hidden from assistive technology.** The marker is a dashed line
   and a diamond in the soft ink colour (at least 3:1 on the plot in both themes). The
   chart surface is already one labelled image pointing to the table; the dates are in
   the Financing panel and the property's loan outlook, so the table view is unchanged.

## Consequences

- With the sample portfolio at today the Dashboard chart has markers at 2029 and 2031;
  none when no reset is ahead.
- No computed number, stored data or export changes.
- New dictionary entries in en, cs and ru: `charts.rateReset`, `charts.rateResetNominal`.

# 0204. Financing & upcoming: headline figures and a fixation timeline

- Status: Accepted
- Date: 2026-11-16
- Source: issue #377 (UX/UI review 2026-11, tracking #392); direction approved by the
  owner on 2026-11-15 (the issue's layout); acceptance delegated by the owner for the
  2026-11-15 run (comment on #392)
- Amends: [0103](0103-financing-exposure.md) §7 and §8 (what the panel shows, and the
  12-month window of its dates)
- Related: [0117](0117-property-loan-outlook.md) (remaining-term text),
  [0124](0124-pre-purchase-debt-service.md) and [0162](0162-floating-block-rate.md)
  (figures and floating blocks, unchanged),
  [0176](0176-refinance-cash-successor-principal-event-order.md) (same-day order),
  [0087](0087-real-lens-multiple-cumulative-cf.md) (balances stay nominal), [0202](0202-dashboard-hierarchy.md),
  [0203](0203-one-disclosure.md) (the disclosures)

## Context

1. "Financing & upcoming" answers when each fixation ends and how much debt is exposed,
   but it was a label-left / value-right list about 900 px wide, and it named only the
   **next** reset. The other loans' fixation ends were not shown anywhere on the
   Dashboard, although the engine already has them (`LoanExposure.nextFixation`).
2. The 1 / 3 / 5-year toggle changed one row. The dates below it were a text list fixed at
   12 months and five rows (`EVENT_MONTHS`, `MAX_EVENTS`).

## Decision

1. **Headline figures** on top, as a row of figures (label above value, each as wide as
   its label up to 22 rem): next rate reset
   (date, with its property's link under it), debt at that reset, debt resetting within
   the window (amount, with the number of loans under it), total interest of the lens. They
   use the existing labels (`dashboard.financingNextReset`, `financingBalanceAtReset` /
   `…Nominal`, `financingResettingWithin` / `…Nominal`, `financingTotalInterest` /
   `…Real`). Interest saved by prepayments joins them when there is a figure, and its "By
   property" breakdown stays the disclosure under the figures (ADR 0203).
2. **Fixation timeline:** one row per loan (`fx.loans`) in a list, earliest upcoming
   fixation end first (`nextFixation`), then the loans with none ahead (a floating block, or
   every fixation end passed), then the properties that have a date in the window but no
   loan. Ties follow the portfolio's property order (ADR 0176). Each row:
   - the property's name, a link to the property;
   - a bar from the as-of date to the fixation end and a diamond at the end. A fixation
     end after the window runs the bar off the right edge, without the diamond;
   - its text: the date, the time left (`dashboard.financingIn`, the remaining-term text
     of ADR 0117; `financingInUnderMonth` under a month) and the debt at the reset,
     exact. The diamond and the legend name the kind, so `financingEventFixationEnd` is
     read only by assistive technology there. The loan with the next reset is flagged
     ("next", `dashboard.financingNextFlag`) and its bar is the accent colour. An amount
     or a time left never breaks across lines;
   - a loan with no fixation end ahead says so (`dashboard.financingNoFixationAhead`)
     and has no bar.
3. **Other dates in the window are markers on their property's row:** a loan's modelled
   payoff (circle), a development loan's completion (square), a lease end with no next
   lease (ring), and a later fixation end of the same loan (diamond). Each is also a line of
   the row's text (its existing label, date and time left). A legend names the kinds
   present, in the axis row above the text column.
4. **The window sets the timeline's span:** the axis runs from the as-of date to as-of + 1,
   3 or 5 years (default 3, as before), with a tick at each 1 January. The other dates are
   the engine's `upcomingEvents` for that span (amends ADR 0103 §7: the 12-month window
   goes). Positions are fractions of the window, shaped in `financingTimeline`
   (`src/ui/model/financing.ts`); no clock is read.
5. **Table view:** a "Table" toggle, as on the charts (`aria-pressed`, `charts.table`),
   shows the same dates as a table: Property, Event, Date, In, Debt at reset.
6. **More than 8 rows:** the first 8 show; the rest are in a "Show all ({n})" disclosure
   (`dashboard.financingShowAll`) under them.
7. **Text for assistive technology:** the timeline is a list (named
   `dashboard.financingTimeline`); each row's text carries the name, event, date, time left
   and amount, so the bars, markers, axis and legend are hidden from assistive technology
   and nothing needs the Table view.
8. **Notes:** one line, the existing disclaimer (`financingDisclaimer`, text unchanged),
   beside the Table toggle under the timeline. In the real lens a line says the debt in
   the rows is nominal (`dashboard.financingRowsNominal`). Without a loan the panel keeps its note
   (`financingNoLoans`) and still lists a property's other dates in the window.
9. **Layout:** at 1280 the row is name · track · text in one line, rows 25 px apart so
   each name link keeps 24 px to the next (WCAG 2.2 target size). When the panel is
   narrower than 720 px (container query) the text wraps under the bar. The keys
   `financingUpcoming`, `financingNoEvents` and `financingMoreEvents` and the constants
   `EVENT_MONTHS`, `MAX_EVENTS` are removed.

## Consequences

- For the sample portfolio at 1280 × 800 the panel shows all three fixation ends (Lipova's
  in the 3-year window; Javorova's and Dubova's running off its edge, with their dates)
  without interaction, in about 285 px (en and cs 284 px, ru 286 px on macOS). The
  capture harness checks the height (at most 300 px, room for Linux CI's wider fonts)
  and that no figure or row text is clipped; screens cover 20 loans, a development loan with a lease ending in the
  window, and the real lens.
- Dates and amounts are the engine's, unchanged: the figures, `debtResettingWithin`,
  `upcomingEvents` and the balances at reset. No computed number, stored data or export
  changes. The upcoming dates now follow the window instead of 12 months, so the panel
  can show more of them (up to 5 years ahead); none is dropped.
- The window toggle stays the panel's action and is shown whenever the timeline has a
  row.

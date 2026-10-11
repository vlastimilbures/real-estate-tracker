# 0176. Refinance cash counts the successor's principal; same-day events in portfolio order

- Status: Accepted
- Date: 2026-10-11
- Source: issues #288, #207, #289 (code review 2026-10); owner decisions (2026-10-11, Track 14:
  #288 option B, #207 option A, #289 close with a tripwire test); Track 14 PR E3
- Amends: [0027](0027-one-active-block.md) (D-47 point 2: "successor principal" is its initial
  principal), [0103](0103-financing-exposure.md) (point 7: the order of same-day events),
  [0161](0161-cash-to-owner.md) (the "Not changed here" items are settled)
- Related: [0168](0168-development-loan-is-the-acquisition-loan.md) (a development loan funds
  the purchase), [0127](0127-opaque-property-ids-sample-match.md) (random property ids,
  properties loaded by name), [0134](0134-acquisition-cash-gaps.md)

## Context

1. **#288 — a handover-month tranche counts as refinance cash.** A development successor can
   draw a tranche in its own draw month. The engine books net refinance cash as the
   successor's balance at the end of that month less the predecessor balance it pays off, so
   the tranche reaches the owner as cash. The same tranche one month later is new debt in the
   row's `drawn` (DR-092), not owner cash. Example (Javorová, successor from 17.01.2031,
   initial principal 1 386 000 Kč, tranche 100 000 Kč on 30.01.2031, predecessor balance paid
   off 1 386 249.89 Kč): refinance cash in year 5 is **+99 750.11 Kč**, while the row shows a
   refinance difference of −249.89 Kč and 100 000 Kč drawn. `SPEC.md` already says
   "successor principal − predecessor balance paid off"; the code contradicts it.
2. **#207 — same-day events tie-break on the property id.** Upcoming events sort by date, then
   kind, then property id. Property ids are random since ADR 0127, so two flats' lease ends on
   the same day show in a random (but stable) order.
3. **#289 — a later first loan dated on or before baseDate on a future buy.** ADR 0161 left
   open that such a loan would put its cash in year 0, which the KPIs do not read. Since
   ADR 0168 this cannot happen: a development loan always funds the purchase, and a plain
   first loan counts as a later loan only when it starts more than 90 days after the purchase
   (ADR 0119 §3), which is after baseDate for a future buy. A first loan dated on or before
   baseDate is therefore always the acquisition loan.

## Decision

1. **Net refinance cash = the successor's initial principal − the predecessor balance paid
   off.** Every successor tranche, also one drawn in the handover month, is new debt in the
   row's `drawn` (DR-092), never owner cash. `Refinance.drawn` holds the successor's initial
   principal (the field keeps its name). Javorová year 5: +99 750.11 Kč → **−249.89 Kč**, equal
   to the row's refinance difference; cash to owner in year 5 and the cumulative cash flow
   fall by 100 000 Kč. A plain successor draws no tranche, so nothing else moves.
2. **Same-day upcoming events of one kind follow the portfolio's property order** (by name,
   Czech collation, ADR 0127). The property id no longer decides the order.
3. **#289: no change.** A future buy's later first loan starts more than 90 days after the
   purchase, so its cash lands in or after the turn-on year. A test pins this.

## Consequences

- Parity targets unchanged: the seed has no successor tranche and no same-day events. No row
  in the target change log.
- The golden master does not move (no fixture has a handover-month tranche or same-day
  events of one kind); the KPI reference model has no refinances or development loans.
- Levered IRR and cash to owner move only for a development successor that draws in its
  handover month. At the extreme, a successor with no initial principal that pays off the
  predecessor from a handover-month tranche books the whole payoff as a pay-down (refinance
  cash = −the balance paid off) and the tranche as new debt.
- The upcoming-events order no longer depends on random ids: two portfolios with the same
  data list same-day events alike.

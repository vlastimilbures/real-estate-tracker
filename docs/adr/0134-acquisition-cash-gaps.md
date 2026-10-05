# 0134. Acquisition cash gaps: a later first loan on an owned property

- Status: Accepted
- Date: 2026-10-05
- Source: issue #181 (independent review of PR #180, ADR 0119)
- Amends: SPEC §4.5 (acquisition outflows) and §4.6 (what enters cumulative net cash flow
  and levered IRR)
- Related: [0119](0119-acquisition-funding.md) (§5, the same rule for a future buy),
  [0124](0124-pre-purchase-debt-service.md), D-47 in [0027](0027-one-active-block.md)
  (refinance cash), [0039](0039-golden-master.md)

## Context

A property already owned at the projection start can get its **first** loan after
baseDate: a mortgage on a flat bought for cash, or a loan drawn shortly after a purchase
made just before baseDate. The engine books the loan as new debt in the grid month it is
drawn ([0033](0033-loan-first-grid-month.md)): equity falls by the principal and the
instalments lower net cash flow. The loan's money never showed up as cash. Its equity at baseDate already holds the whole
value, so levered IRR and cumulative net cash flow were understated by the principal.

ADR 0119 §5 already counts this cash for a **future buy**: a first loan that starts more
than 90 days after the purchase brings its initial principal as cash in, in the year it is
drawn. A refinance successor's net cash counts too (D-47). Only the owned property's first
loan was left out.

## Decision

The owner chose option A of #181 on 2026-10-05.

1. **Owned property, first loan after baseDate.** For a property bought on or before
   baseDate, its earliest block, when it starts after baseDate, pays its **initial
   principal** to the owner as **cash in**, in the projection year it is drawn
   (`turnOnYear(startDate)`, the year the schedule draws it). It counts in cumulative net
   cash flow and in both levered IRRs, like the refinance cash.
2. **Its tranches do not count.** As in ADR 0119 §5, a development loan's tranches pay the
   builder, not the owner.
3. **Not counted:** a loan drawn on or before baseDate (opening debt, already inside
   equity0), a loan drawn after the horizon, a deactivated property, and a later block
   (a successor: only its net refinance cash counts, D-47).
4. The 90-day window of ADR 0119 §3 plays no part here. A property bought shortly before
   baseDate whose acquisition loan is drawn after baseDate is owned at baseDate with no
   debt, so the loan comes back as cash.
5. The projection and schedule rows do not change. Only the KPIs move.

## Consequences

- **Parity targets do not change:** every sample loan starts before baseDate.
- **Golden master** (KPIs only, "edge loans inside a portfolio"): the three cases that give
  Javorova a single 3,000,000 Kč block drawn after baseDate (`firstGridMonth` 2026-06-20,
  `futureMonthEnd` 2027-01-31, `devFuture` 2026-09-01, all in projection year 1) gain
  exactly 3,000,000 Kč of cumulative net cash flow, and their levered IRRs rise (nominal
  5.66 % → 6.18 %, 5.68 % → 6.21 %, 7.29 % → 8.24 %). The seed, mixed and scenario cases
  and every projection or schedule hash are unchanged.
- ADR 0119's "still open" item (#181) is closed.

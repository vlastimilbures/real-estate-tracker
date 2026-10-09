# 0134. Acquisition cash gaps: an owned property's later first loan, principal repaid before baseDate

- Status: Accepted
- Date: 2026-10-05
- Source: issues #181 (independent review of PR #180, ADR 0119) and #193 (planning of
  #104, ADR 0124 §7)
- Amends: SPEC §4.5 (acquisition outflows) and §4.6 (what enters cumulative net cash flow
  and levered IRR)
- Amended by: [0166](0166-development-committed-debt.md) (a development loan on a flat owned
  at baseDate is committed debt from baseDate, not cash in)
- Related: [0119](0119-acquisition-funding.md) (§5, the same rule for a future buy),
  [0124](0124-pre-purchase-debt-service.md), D-47 in [0027](0027-one-active-block.md)
  (refinance cash), [0039](0039-golden-master.md)

## Context

A property already owned at the projection start can get its **first** loan after
baseDate: a mortgage on a flat bought for cash, or a loan drawn shortly after a purchase
made just before baseDate. The engine books the loan as new debt in the grid month it is
drawn ([0033](0033-loan-first-grid-month.md)): equity falls by the principal and the
instalments lower net cash flow. The loan's money never showed up as cash. Its equity at
baseDate already holds the whole value, so levered IRR and cumulative net cash flow were
understated by the principal.

ADR 0119 §5 already counts this cash for a **future buy**: a first loan that starts more
than 90 days after the purchase brings its initial principal as cash in, in the year it is
drawn. A refinance successor's net cash counts too (D-47). Only the owned property's first
loan was left out.

A future buy's acquisition loan can also start **before** baseDate (an off-plan contract
signed before today, handover after today). The down payment nets off the whole loan
(price − loan, ADR 0119 §5), but the property turns on with the running balance (DR-092),
which is lower by the principal the loan repaid before baseDate. That principal showed as
equity at turn-on with no owner cash against it. In the #104 probe (baseDate 2026-06-07; a
4,000,000 Kč loan at 5 %, 25,000 Kč a month, drawn 2026-01-10; purchase 2029-01-15) it is
33,542 Kč. ADR 0124 §7 left it open.

## Decision

The owner chose option A of #181 and option B of #193 on 2026-10-05.

### #181: an owned property's first loan after baseDate

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

### #193: principal repaid before baseDate

5. **Charged at turn-on.** For a future buy turning on inside the horizon, whose
   acquisition loan (ADR 0119 §3) was drawn on or before baseDate and is still the block in
   force at baseDate, the turn-on year's outflow adds **the principal it repaid before
   baseDate**: initial principal + tranches dated on or before baseDate − its balance at
   baseDate (`openingBalance`). Prepayments before baseDate are included, since they lower
   that balance. A development loan in its interest-only phase adds about 0.
6. **On top of a recorded own cash.** Own cash is the money paid at purchase; this is debt
   service paid since, like the pre-purchase payments of ADR 0124. It is added with or
   without a funding record.
7. **Booked in the turn-on year, not before baseDate.** That is where the down payment is
   booked; year 0 (option A, beside −equity0) would change the multiple's and CAGR's base
   and depends on how a pending property is costed at the start (#126). The money was in
   fact paid earlier, so levered IRR is still a little flattered, but no longer by the
   whole principal.
8. **Not traced: a successor in force at baseDate.** When a refinance successor already
   replaced the acquisition loan by baseDate, the chain drops the predecessor (`blockChain`)
   and refinance cash before baseDate is not modelled, so nothing is added. Neither the
   principal repaid nor that refinance's cash-out or pay-down is traced, so the owner's
   cash can be off either way. This is a documented limitation.

### Both

9. The projection and schedule rows do not change. Only the KPIs move: cumulative net cash
   flow (nominal and real) and both levered IRRs.

## Consequences

- **Parity targets do not change:** every sample loan starts before baseDate.
- **Golden master** (KPIs only, "edge loans inside a portfolio"): the three cases that give
  Javorova a single 3,000,000 Kč block drawn after baseDate (`firstGridMonth` 2026-06-20,
  `futureMonthEnd` 2027-01-31, `devFuture` 2026-09-01, all in projection year 1) gain
  exactly 3,000,000 Kč of cumulative net cash flow, and their levered IRRs rise (nominal
  5.66 % → 6.18 %, 5.68 % → 6.21 %, 7.29 % → 8.24 %). The seed, mixed and scenario cases
  and every projection or schedule hash are unchanged.
- #193 moves no golden case: no fixture has a future buy whose loan was drawn before
  baseDate (the mixed fixture's loan starts on its purchase date).
- In the #104 probe, cumulative net cash flow falls by 33,542.25 Kč. The ADR 0124 tests
  that pinned the old outflow now include it, and the owner-cash conservation identity
  (cumulative CF + equity_N − Σ NOI + total interest + fees = value_N − price) now holds
  for a loan drawn before baseDate too; a test pins it.
- ADR 0119's "still open" item (#181) and ADR 0124 §7 (#193) are closed.

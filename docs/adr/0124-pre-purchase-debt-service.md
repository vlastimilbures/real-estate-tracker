# 0124. Debt service before a future purchase is owner cash

- Status: Accepted
- Date: 2026-10-04
- Source: issue #104 (2026-10 code review, finding R2-02)
- Amends: [0119](0119-acquisition-funding.md) (its open point on a loan that runs before a
  future purchase date), [0103](0103-financing-exposure.md) (rule 6, total interest)
- Related: [0033](0033-loan-first-grid-month.md), [0109](0109-loan-prepayments-and-recasts.md),
  DR-092

## Context

A property can be bought after baseDate while its mortgage started earlier. This is the
normal off-plan case: the bank draws the loan when the contract is signed, and the owner
enters the handover date as the purchase date. ADR 0119 §3 already treats such a loan as the
acquisition loan, so the down payment (price − loan + costs + works, or the recorded own cash)
is right.

The projection turns the property on in the year that holds its purchase date. Every earlier
year is an empty row. The loan's schedule, however, runs from the loan's own start. So every
instalment due before the turn-on year was dropped:

- Its interest and principal never reached cumulative net cash flow or the levered IRR.
- In the turn-on year the running balance is carried in as a draw (DR-092), so the balance
  itself was right, and the principal paid before it showed up as equity no cash paid for.
- `totalInterest` sums the projection rows, while `totalPrincipalRepaid` walks the raw
  schedule. The two KPIs disagreed: one left the pre-purchase payments out, the other
  counted them.

Probe (seed assumptions, horizon 10 years): a flat bought 2029-01-15 for 6,000,000 Kč with a
4,000,000 Kč loan at 5 % and a 25,000 Kč instalment, drawn 2026-01-10. Years 1 and 2 hold 24
instalments: 386,597 Kč of interest and 213,403 Kč of principal were missing from net cash
flow, cumulative cash flow, IRR and total interest. Nothing rejected or flagged the input.

The owner chose option C of #104 (2026-10-04): model the payments, do not reject the input.

## Decision

1. **Which years.** For an active property bought after baseDate, with turn-on year
   `tStart > 0`, the years before the turn-on year are years 1 … min(tStart − 1, N).
2. **What counts.** In those years the loan's schedule still runs. Its interest, scheduled
   principal, prepaid principal and prepayment fees are **owner cash out**, booked in the
   year they are paid. They sit outside net cash flow, beside the down payment, prepayments
   and refinance cash, and they lower the cumulative net cash flow and the levered IRR,
   nominal and real (each real year divided by its own CPI_t, ADR 0087).
3. **What does not change.**
   - The projection rows before the turn-on year stay empty: the property is not owned yet
     (SPEC §4.5). No chart or table row changes.
   - The turn-on year's row already holds all twelve schedule months, including those
     before the purchase date in that year.
   - A tranche drawn before the purchase is the bank's money, not owner cash. The balance it
     builds still arrives as the turn-on year's draw (DR-092).
   - The net cash of a refinance before the purchase already counted, in its year.
   - The down payment and the acquisition loan of ADR 0119 do not change. With the
     principal repaid before the purchase now paid by the owner in its own years, the
     equity the property turns on with is paid for.
4. **A purchase after the horizon** (tStart = N + 1): every year of the horizon is before
   the purchase, so every payment in the window counts, as refinance cash does. The
   property and its debt never enter the horizon's equity, so its levered IRR carries the
   payments without the asset. This is the conservative reading.
5. **Total interest** (ADR 0103 rule 6) = Σ projection interest of years 1 … N plus the
   interest paid before a future purchase in those years. The real figure deflates each
   year's interest by that year's CPI_t, as before.
6. **Σ principal repaid** keeps walking the schedule rows of months 1 … 12N of the active
   properties, which already counted the pre-purchase principal and prepaid. It now equals
   Σ projection (principal + prepaid) plus the same pre-purchase years, so both KPIs read
   the same payments. A test pins this identity.
7. **Not covered: principal repaid before baseDate.** When the loan started before
   baseDate, the principal it repaid before baseDate (33,542 Kč in the probe) still shows as
   equity at turn-on with no cash against it. Its place would be the year-0 investment,
   beside −equity0, which is how a not-yet-owned property is costed at the start (#126),
   and a refinance chain before baseDate cannot be traced. Issue #193 holds it.

## Consequences

- An off-plan purchase now pays its instalments before handover in the returns: in the
  probe, cumulative net cash flow falls by 600,000 Kč (24 × 25,000) and total interest rises
  by 386,597 Kč.
- `totalPrincipalRepaid` does not change for any input. `totalInterest` changes only for a
  future buy whose loan runs before its turn-on year.
- **Parity targets do not change**: the sample portfolio has no future buy. The golden
  master does not change: no case has a loan running before a future purchase, and its
  projection hashes never see the payments.
- The test of ADR 0119 §3 with an off-plan loan drawn a year before the purchase now also
  counts the five instalments paid in the year before the turn-on year.
- The Property detail projection still shows empty years before the purchase; the payments
  appear in the portfolio KPIs only. How a not-yet-owned property is shown stays with #126,
  including the baseDate snapshot, which leaves out the debt such a loan already carries
  (the portfolio totals list only owned properties).
- The input is not flagged: with the payments counted, the figures no longer depend on it.
- The total interest help text (three languages) now says it covers all loan interest in
  the horizon, including a loan that runs before a purchase date.

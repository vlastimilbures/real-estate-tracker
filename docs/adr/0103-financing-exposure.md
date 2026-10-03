# 0103. Financing exposure and upcoming events

- Status: Accepted
- Date: 2026-10-03
- Source: issue #31 (pre-release review 2026-10, F5 and §6)

## Context

The app shows each block's fixation length and warns after a fixation has ended, but it does
not show when the next rate reset is, how much debt each reset exposes, the remaining term,
the total interest over the horizon, or which leases end soon. All of it can be derived from
existing data. The owner decided the open points on 2026-10-03.

## Decision

1. A loan is one property's block chain (the block in force at baseDate, then each successor;
   `blockChain`). Inactive properties are not counted, as in the projection.
2. **Fixation end** of a block = `blockEndDate` (start + fixation years, EDATE). The payment due
   on that date is still at the fixed rate (D-21), so the reset row is the next schedule row and
   the **balance at fixation end** is the schedule's end balance of the fixation-end payment.
   A block with 0 fixation years floats at the reset rate and has no fixation end.
3. Each block's fixation end has a status relative to the as-of date, and the **next
   fixation** of a loan is its earliest upcoming fixation end:
   - passed: on or before as-of (this covers an expired fixation, ADR 0030);
   - replaced: a successor block starts on or before it, or in the schedule month of its
     fixation-end payment;
   - repaid: the loan is repaid by then;
   - upcoming: otherwise.
4. **Debt resetting within N years** (N = 1, 3 or 5; default 3) = Σ balances at the upcoming
   fixation ends in (as-of, as-of + N years], over all loans, successor blocks included.
5. **Payoff** = the due date of the schedule's last payment (the modelled payoff, not the
   contract maturity, ADR 0029). **Remaining term** = schedule months from as-of to that payment.
6. **Total interest** = Σ projection interest of years 1..N. It follows the lens: the real figure
   deflates each year's interest by that year's CPI, as the real cumulative cash flow does
   (ADR 0087). Balances at reset and debt resetting stay nominal and are labelled so in the real
   lens.
7. **Upcoming events** = these dates in (as-of, as-of + 12 months], sorted by date:
   - a fixation end with its balance;
   - the end date of the lease in force at as-of, only when no later lease is entered for the
     property (an open-ended lease has no end date);
   - a loan's modelled payoff;
   - a development loan's completion (end of interest-only).
8. The Dashboard shows a compact "Financing & upcoming" panel after the monthly cash-flow
   panel: next reset (date, property, balance), debt resetting in 1/3/5 years, total interest
   and up to five upcoming events, each linking to its property. The panel says the dates are
   modelled from the entered data and are not lender deadlines.
9. The property detail Financing section is a separate change (#31b).

## Consequences

New engine outputs (`financingExposure`, `debtResettingWithin`, `upcomingEvents`) and two new
KPI fields (`totalInterest`, `totalInterestReal`). They are added to the golden master's
`ADDED_FIELDS` and pinned in their own tests; no existing number, parity target or golden hash
changes. New strings in en, cs and ru, with Czech and Russian plurals.

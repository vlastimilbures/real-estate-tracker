# 0117. Property loan outlook: each block's reset and the remaining term

- Status: Accepted
- Date: 2026-10-04
- Source: issue #31 (#31b)
- Related: [0103](0103-financing-exposure.md), [0116](0116-prepayments-ui-and-review-fixes.md)

## Context

ADR 0103 (#31a) added the financing exposure: each loan's next fixation, the balance at
each reset and the modelled payoff. It shows them on the Dashboard. ADR 0116 (#32b) added
the **Loan outlook** panel to the property page's Financing section. That panel shows the
modelled payoff and the interest that prepayments save. It does not show when each loan
block's fixation ends, what balance moves to the new rate, or how long the loan has left.
#31b adds these to the same panel. The owner decided the open points on 2026-10-04.

## Decision

1. **Remaining term, one row for the loan.** The Loan outlook adds a **Remaining term**
   row. It counts the schedule months from the page's as-of date to the modelled payoff
   (`LoanExposure.remainingMonths`). It reads "25 yrs", "24 yrs 8 months" or "7 months".
   The row is hidden when the loan is repaid (the payoff row already says "Repaid") or when
   there is no payment left to count.
2. **Every block, with a status.** Below the rows, a table lists every loan block of the
   property, oldest start first: start, fixation end, balance at reset and status.
   - **Upcoming**: the fixation end is after the as-of date and the block still has a
     balance then. The balance cell shows the schedule balance after the fixation-end
     payment, nominal (as on the Dashboard, ADR 0103).
   - **Next reset**: the upcoming row that is the loan's next fixation. It is highlighted.
   - **Passed**: the fixation end is on or before the as-of date.
   - **Replaced by a later loan**: a later block takes over before the fixation end. A
     block that a later block replaced before baseDate (outside the chain, D-27) gets this
     status too.
   - **Repaid before the reset**: the loan has no balance left at the fixation end.
   - **Floating rate**: a 0-year block in the chain. It has no fixation end ("—").
   - The balance cell shows "—" unless the row is upcoming.
3. **Wording.** The panel note says that the payoff and fixation dates are modelled, not
   deadlines from the lender, and that balances at reset are nominal.
4. **Delivery: the engine hands the page its resets.** `propertyLoanExposure` returns the
   whole property view, `PropertyLoan { loan, resets, chain }`, where `resets` are the
   same `FixationReset` rows the Dashboard reads and `chain` lists the block ids that drive
   the schedule, in order. `PropertyEngineOutput.loan` becomes `financing`. The UI does
   not rebuild the chain or the resets. A block outside the chain shows its contractual
   fixation end (`blockEndDate`).

Rejected:

- A remaining term per block: a block's term ends at its successor or at the payoff, so
  per-block figures repeat the loan's term or invent a contract term the schedule does not
  use.
- Rebuilding the resets in the UI from `blockChain`: a second copy of engine logic.
- A second panel: the Loan outlook already holds the property's loan figures.

## Consequences

- User-visible addition under ADR 0001; no computed number, parity target, golden-master
  field, schema or backup format changes. The Dashboard reads `financingExposure`, which is
  unchanged.
- The `PropertyLoan` refactor is behaviour-neutral and ships in its own commit.
- UX capture adds screen `30-property-loan-outlook`.

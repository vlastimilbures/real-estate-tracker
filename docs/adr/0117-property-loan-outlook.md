# 0117. Property loan outlook: each block's reset and the remaining term

- Status: Accepted
- Date: 2026-10-04
- Source: issue #31 (#31b)
- Amends: [0103](0103-financing-exposure.md) §3 and §5 (decisions 5 and 6)
- Related: [0116](0116-prepayments-ui-and-review-fixes.md)

## Context

ADR 0103 (#31a) added the financing exposure: each loan's next fixation, the balance at
each reset and the modelled payoff. It shows them on the Dashboard. ADR 0116 (#32b) added
the **Loan outlook** panel to the property page's Financing section. That panel shows the
modelled payoff and the interest that prepayments save. It does not show when each loan
block's fixation ends, what balance moves to the new rate, or how long the loan has left.
#31b adds these to the same panel. The owner decided the open points on 2026-10-04.

## Decision

1. **Remaining term, one row for the loan.** The Loan outlook adds a **Remaining term**
   row: the loan's payments still due after the page's as-of date
   (`LoanExposure.remainingMonths`, decision 6). It reads "25 yrs", "24 yrs 8 months" or
   "7 months". The row is hidden when no payment is left: the payoff row then shows the
   payoff date, or "Repaid" when the schedule has no payment at all.
2. **Every block, with a status.** Below the rows, a table lists every loan block of the
   property, oldest start first: start, fixation end, balance at reset and status.
   - **Upcoming**: the fixation end is after the as-of date and the block still has a
     balance then. The balance cell shows the schedule balance after the fixation-end
     payment, nominal (as on the Dashboard, ADR 0103).
   - **Next rate reset**: the upcoming row that is the loan's next fixation. It is highlighted.
   - **Replaced by a later loan**: a later block starts on or before the fixation end, or
     in the schedule month of its fixation-end payment (ADR 0103 §3). A block that a later
     block replaced before baseDate (outside the chain, D-27) gets this status too.
   - **Repaid before the reset**: the loan has no balance left at the fixation end.
   - **Passed**: the fixation end is on or before the as-of date, and the reset happened
     in the model (neither replaced nor repaid, decision 5).
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
5. **Replaced and repaid outrank passed** (amends ADR 0103 §3). A fixation end's status
   is replaced first, then repaid, then passed, then upcoming. Before, passed came first,
   so a block refinanced mid-fixation read "Replaced" until its fixation end and "Passed"
   after it, although that reset never happened in the model. A fixation end on or before
   baseDate cannot be repaid from the schedule (the grid starts at baseDate), so it is
   passed unless replaced, as before (ADR 0030). Upcoming resets, their balances and every
   Dashboard figure are unchanged: a reset is upcoming only when none of the three apply.
6. **Remaining term counts the payments due after as-of** (amends ADR 0103 §5): the
   schedule months with a payment whose due date (the paying block's own payment day) is
   after the as-of date. Before, it counted grid months from the as-of grid month, and the
   grid runs on baseDate's day. So a payment already made this month still counted, the
   row read "1 month" for up to a month after the payoff date, and a loan not yet drawn
   counted the months before its first payment.

Rejected:

- A remaining term per block: a block's term ends at its successor or at the payoff, so
  per-block figures repeat the loan's term or invent a contract term the schedule does not
  use.
- Rebuilding the resets in the UI from `blockChain`: a second copy of engine logic.
- A second panel: the Loan outlook already holds the property's loan figures.

## Consequences

- User-visible addition under ADR 0001; no parity target, golden-master field, schema or
  backup format changes, and no Dashboard figure changes.
- The `PropertyLoan` refactor is behaviour-neutral and ships in its own commit.
- Decisions 5 and 6 change `FixationReset.status` for some past fixation ends and
  `LoanExposure.remainingMonths`; no parity target or golden-master field holds them, and
  only this panel shows them.
- The stat list's last key no longer draws a bottom border (a CSS selector that never
  matched); every stat list loses that stray line.
- UX capture adds screen `29b-property-loan-outlook` (the property screens fill 20–29).

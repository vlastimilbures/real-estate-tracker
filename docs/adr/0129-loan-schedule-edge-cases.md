# 0129. Loan schedule edge cases: late tranches, interest-only date, last draw, refix gap

- Status: Accepted
- Date: 2026-10-04
- Source: issue #135 (2026-10 code review, findings R1-03, R1-04, R1-11, G2-1-08; R1-13 is
  a fix without a behaviour change)
- Amends: [0109](0109-loan-prepayments-and-recasts.md) §3 and §8 (what a late-window event
  sees), [0116](0116-prepayments-ui-and-review-fixes.md) §1 (late window),
  [0021](0021-schedule-calendar.md) (D-21: interest-only is read on the due date too),
  [0079](0079-engine-edge-cases.md) (DR-074: the last draw date),
  [0030](0030-expired-fixation.md) (D-30: the "Fixation ended" warning)
- Related: [0024](0024-draw-timing.md) (D-41, D-44: tranches around baseDate),
  [0039](0039-golden-master.md) (golden snapshot in the same commit),
  [0117](0117-property-loan-outlook.md) (loan outlook)

## Context

The 2026-10 code review found five defects in how loan events are placed around baseDate
and how loan inputs are checked. Each gives a wrong or less helpful result only in an edge
case. They share one theme: the history part of the schedule (up to baseDate) and the
projection grid (after it) did not apply the same rules.

- **R1-03.** A development-loan tranche dated after the last payment due by baseDate and on
  or before baseDate joins grid month 1 (D-41). A prepayment or recast in the same late
  window settles right after that last payment (ADR 0116 §1), against a balance that does
  not include the tranche. A 300,000 Kč prepayment was clamped to 99,494.13 Kč
  (`PREPAYMENT_EXCEEDS_BALANCE`) when baseDate was on the 28th, and applied in full with
  baseDate on the 22nd or the 20th of the next month. ADR 0116 accepts that a late event's
  placement moves by less than one period; it does not accept that the amount moves.
- **R1-04.** The history part read interest-only on the payment's due date, the projection
  grid on the grid date. A payment due two days before completion amortized with baseDate
  on the 7th and was interest-only with baseDate on the 9th: after the next payment the
  balance differed by 3,861.78 Kč. The reference model read it on the grid date too, so the
  cross-check could not see it. The contract says the borrower pays interest only up to and
  including the completion date.
- **R1-11.** A draw dated after the last-but-one payment passed validation. It lands on the
  final payment, which must clear the balance, so it was repaid in one 522,786 Kč
  instalment, the one-shot payoff DR-074 meant to rule out.
- **G2-1-08.** The "Fixation ended" warning (D-30) was silenced by any later block, even one
  that starts months after the first payment at the assumed reset rate. Those months run at
  the global reset rate with no warning.
- **R1-13.** The errors the engine raises for a loan dropped the index of the prepayment or
  recast at fault. That is a fix without a behaviour change; this ADR only records it.

## Decision

The owner chose option A of #135 on 2026-10-04: all five in one change.

1. **A late-window event sees the late tranches dated on or before it (R1-03).** In the
   late settle (events dated after the last payment due by baseDate and on or before
   baseDate), every check that depends on the balance counts the late tranches dated on or
   before the event's own date:
   - a prepayment is clamped to the balance plus those tranches;
   - the bank's answer to a `shortenTerm` prepayment (`ceil(NPER)`) runs on the balance
     after the prepayments plus the tranches dated on or before the last of them;
   - a recast checks "after payoff", the instalment against the next interest, and its
     `NPER` on the balance plus the tranches dated on or before the recast.

   Nothing else moves. The tranche still joins grid month 1 and re-amortizes there (D-41),
   the baseDate debt still counts it once (D-44), and the opening balance is still the
   balance after the last payment due, less what the late events took off. Money is not
   counted twice: the tranche is added once, in grid month 1.

2. **Interest-only is read on the payment's due date (R1-04).** A development loan's
   payment is interest-only when its due date `EDATE(start, p)` is on or before the
   completion date, in the history part and in the projection grid alike, as the rate
   already is (D-21). The first draw of a future loan reads it on the loan start (payment
   0). Tranche landing stays on the grid (D-41, D-44). The independent reference model reads
   interest-only where it reads the rate, so its `gridDueDate` calendar follows this rule;
   it is changed from this wording, in the same commit as the engine.
3. **The last draw date is the last-but-one payment (R1-11).** A draw dated after
   `EDATE(start, term · 12 − 1)` raises `DRAW_AFTER_SCHEDULE_END`. A draw on that date is
   still accepted: it lands on the last-but-one payment and is repaid over the last two.
   The message says so in en, cs and ru.
4. **The "Fixation ended" warning sees a refix gap (G2-1-08).** When the block in force at
   baseDate has a fixation that ended on or before baseDate, the warning shows unless the
   next block starts on or before the first payment after the fixation end
   (`EDATE(start, fixationYears · 12 + 1)`). When a later block exists, the warning carries
   its start as `until` and reads "from … until …": the months in between run at the
   assumed reset rate. The Data check inherits the warning and its text.
5. **Event index in raised errors (R1-13).** `assertLoanInputs` and `assertLoanRows` keep
   the index of the prepayment or recast at fault, as `validateInputs` does (ADR 0116).

### What stays as it is

- **An ordinary payment period** adds every tranche landing in it before the payment, and
  its events settle after the payment (ADR 0109 §3). An event dated before a tranche in the
  same period therefore still sees that tranche. Only the late window follows the dates,
  because only there the events settle before the tranche is added.
- **A tranche dated after baseDate** is new debt in its grid month (D-44). A late-window
  event, dated on or before baseDate, never sees it.
- **Placement in the late window** still depends on baseDate by less than one period
  (ADR 0116 §1). Only the amount applied no longer does.

## Consequences

- Parity targets do not change: the sample loans have no tranches, no completion date and
  no events.
- The golden master changes in one place: the edge portfolio's future development loan
  (`devFuture`), whose payment due just before completion is now interest-only. The
  snapshot is updated in the R1-04 commit (ADR 0039).
- User-visible: a draw in the final payment period is refused by the form, CSV import and
  restore; a stored one makes the engine raise the code until the owner corrects it (no
  migration, as ADR 0128 §8). The property page and the Data check warn about a refix gap.
- `model-limitations.md` records the two cases that stay (ordinary periods, tranches after
  baseDate).

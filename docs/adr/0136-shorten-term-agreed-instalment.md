# 0136. Shorten term keeps the instalment the next payment pays

- Status: Proposed
- Date: 2026-10-05
- Source: issue #228 (found by the baseDate-shift invariant, #130 R1-07, PR #231)
- Amends: [0109](0109-loan-prepayments-and-recasts.md) §5 (effect of a `shortenTerm`
  prepayment), as reached through the late window of §3
- Related: [0116](0116-prepayments-ui-and-review-fixes.md), [0120](0120-tranche-on-recast-payment.md)
  (decision 4, kept by #187), [0129](0129-loan-schedule-edge-cases.md) (§1: the late window);
  follow-up #235

## Context

ADR 0109 §5 says a `shortenTerm` prepayment keeps the instalment. It sets the maturity to
payment `p` plus `ceil(NPER)` at the rate and instalment of payment `p`, the payment the
prepayment follows.

An instalment recast does not change payment `p`. It sets an agreed instalment that the
next payment pays (ADR 0109 §6). In an ordinary period the recast settles after the
prepayments (§3), so the prepayment never sees it. The late window is different (§3, ADR 0116,
ADR 0129 §1). It settles events dated after the last payment due and on or before baseDate
right after that payment, which a recast dated on its due date has already followed. A
`shortenTerm` prepayment there sized NPER on the old instalment. The next payment then paid
the agreed, lower instalment, the term ran out first, and the last payment was a balloon.

#228 loan: start 2025-06-07, 300,000 Kč at 4.5 %, instalment 2,000. Recast to 1,600 dated
2026-05-07, prepayment 3,000 `shortenTerm` dated 2026-06-06. With baseDate 2026-06-06 the
loan ended at grid month 207 with a 125,586.21 Kč payment. With baseDate 2026-05-07 or
2026-06-07 it ended normally (1,194.91 Kč). A development loan variant ended in a
222,632.40 Kč balloon. The reference model had the same rule, so the cross-check agreed.

## Decision

The owner chose option A of #228 on 2026-10-05.

1. A `shortenTerm` prepayment keeps the instalment **the next payment pays**:
   - an agreed instalment still to pay (from an instalment recast already settled after
     payment `p`), at the rate of payment `p+1`, as the recast itself sized its maturity;
   - otherwise the instalment of payment `p`, at the rate of payment `p` (unchanged).
2. An owed re-amortization (`reamortizeNext`) is not read. A maturity recast, or a tranche
   on the payment of an instalment recast (ADR 0120 decision 4, kept by #187), leaves no
   instalment of its own to keep. In both cases the prepayment still sizes on payment `p`'s
   instalment.
3. Only the late window can reach rule 1. In an ordinary period the payment clears the
   agreed instalment before its prepayments settle (`paidTerms`), and the recast of that
   period settles after them. The rule is stated in general all the same.
4. The reference model (`reference/mortgageReference.ts`) follows this wording.

## Consequences

- Parity targets and the golden master do not change: no fixture has a recast.
- The #228 loan ends on payment 310 under all three baseDates. Under 2026-06-06 the
  3,000 Kč is repaid one payment earlier, so the last payment is 1,160.59 Kč instead of
  1,194.91 Kč. The development loan variant ends on payment 373 under both baseDates.
- Known limitation (rule 2, #235): with a maturity recast the term still depends on
  baseDate's day. The #228 comment loan (development loan from 2023-02-07, maturity
  recast to 2034-02-07 dated 2025-08-07, `shortenTerm` 3,000 on 2025-09-06) ends at grid
  month 102 with baseDate 2025-08-07 and at month 90 with 2025-09-06. There is no
  balloon.
- Tests:
  - `loan-event-invariants.test.ts`: the `it.fails` pin is now a passing test with all
    three baseDates, plus the development loan variant and a pin of the maturity
    variant (#235).
  - The `hits228` exclusion is gone from both properties.
  - `loanEvents.crossCheck.test.ts` gains the plain and development loan cases and a
    recast on the fixation end, which checks the rate of payment `p+1`.
  - `recast-tranche.test.ts` ("a shortenTerm prepayment on q keeps the recast maturity")
    and the cross-check case "dev loan, tranche on the recast's payment, then shorten
    (ADR 0120)" are unchanged.

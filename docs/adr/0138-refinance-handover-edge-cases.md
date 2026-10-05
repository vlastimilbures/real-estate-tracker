# 0138. Refinance handover edge cases

- Status: Proposed
- Date: 2026-10-05
- Source: issues #229 (random loans, #130 R1-08), #221 (review of PR #219), #223 (DR-168
  mutant work)
- Related: [0079](0079-engine-edge-cases.md) §2 (DR-126, handover tranches),
  [0109](0109-loan-prepayments-and-recasts.md) (prepayments at a handover),
  [0130](0130-interest-saved-refinance.md) (`drawn` apart from `refinanced`), D-47

## Context

A successor block replaces its predecessor (the owner) from the grid month `d` it draws in
(D-47). `spliceSuccessor` (`src/engine/schedule.ts`) merges the owner's month-`d` row with the
successor's draw row. Three rare inputs went wrong there:

1. **#229 (= #221 item 2).** ADR 0079 §2 keeps an owner tranche dated on or before the
   successor's start. When it lands in month `d > 1` and the owner's payment there is due
   after the start (so the owner's row is dropped), the successor paid off only the balance
   before month `d`. The tranche was neither `drawn` nor in `paidOff`. In grid month 1 the
   same tranche was paid off, so the result depended on the grid month.
   Example: a development loan of 1,000,000 Kč, a 200,000 Kč tranche dated 2026-09-08, a
   successor starting 2026-09-09 (grid month 4): `paidOff` was 1,000,000, not 1,200,000.
2. **#221 item 1.** Two successors drawn in grid month 1: the second splice took the balance
   carried into the merged row from the first handover's row, which already held its
   refinance difference. The row broke ADR 0130's identity
   `endBalance = previous − principal − prepaid + drawn + refinanced`.
3. **#223.** Two successors drawn in one grid month: the second merged row started from the
   second successor's draw row, which dropped the prepayment and fee that the first handover
   paid there. The event outcome still reported them as applied.

## Decision

The owner chose on 2026-10-05: #229 / #221 item 2 option A, #221 item 1 fix, #223 option 1.

1. **The successor pays off an owner tranche dated on or before its start in every grid
   month.** When the owner's month-`d` row is dropped (`d > 1`), the balance paid off is the
   balance before month `d` plus the tranches that row drew. The handover row shows them as
   `drawn`. This follows ADR 0079 §2 and matches the grid-month-1 path.
2. **A second grid-month-1 splice carries in the row's opening balance**, before the earlier
   handover's refinance difference: `carriedIn = before − drawn − refinanced`. For a row no
   handover merged, `refinanced` is 0 and nothing changes.
3. **A second successor in the handover month keeps that month's prepayment and fee.** The
   merged row adds the first merged row's `prepaid` and `prepaymentFee` to the successor's
   draw row. The refinance difference nets the prepayment, so the row identity holds.

## Consequences

- Decision 1 moves the handover's `paidOff`, `drawn` and `refinanced` in the example (paid
  off 1,000,000 → 1,200,000 Kč; `drawn` 0 → 200,000; `refinanced` 300,000 → 100,000). Net
  refinance cash (D-47: the successor's principal less the balance paid off) falls by the
  tranche, which the owner's lender now receives back.
- Decision 1 also raises the cap on a prepayment paid at such a handover (ADR 0109): it can
  now use the tranche too. A prepayment above the balance before month `d` but within the
  balance with the tranche was capped with `PREPAYMENT_CAPPED`; it is now applied in full
  with no issue. Example (`loanEvents.crossCheck.test.ts`): a development loan owing
  2,000,000 Kč before the handover month and drawing a 1,500,000 Kč tranche in it; a
  2,500,000 Kč prepayment was capped at 2,000,000 and is now applied in full.
- Decision 2 changes only `refinanced` in that row (Javorová + successors on 2026-06-10 and
  2026-06-20: 100,000 → 157,092.69 Kč). The balance does not move.
- Decision 3 changes the row's `prepaid`, `prepaymentFee` and `refinanced`; the balance does
  not move. Rows now agree with the event outcomes, so yearly prepaid cash and fees are no
  longer understated.
- Parity targets and the golden master do not change: no fixture has a tranche at a
  handover or two successors in one grid month.
- The independent reference model already paid the tranche off (PR #231), so it needs no
  change. The random refinance chains drop their #229 exclusion, and the `it.fails` pin
  becomes a passing test.
- **Limitation:** the reference model does not model two successors in one grid month (it
  throws), and `reference/loanGen.ts` never generates that shape. Decisions 2 and 3 are
  covered by fixed tests only (`refinance-difference.test.ts`, `loan-events.test.ts`).
- Tests: `refinance-difference.test.ts` (decisions 1 and 2), `loan-events.test.ts` "two
  successors in one grid month" and its variant after a kept payment (decision 3),
  `loanEvents.crossCheck.test.ts` (a development loan's tranche and a 100,000 or 2,500,000 Kč
  prepayment before a refinance that drops the payment, engine = reference),
  `loanEvents.property.test.ts` (#229 pin).

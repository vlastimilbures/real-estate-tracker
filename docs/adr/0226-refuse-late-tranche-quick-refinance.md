# 0226. Refuse a last-months tranche and two refinancings in one month

- Status: Accepted
- Date: 2026-11-16
- Source: issue #448 (code review 2026-11, tracking #435); owner decision and approved
  boundaries 2026-11-16
- Supersedes: [0139](0139-last-tranche-cap.md) (the cap that moved a late tranche to the
  final grid month is deleted)
- Amends: [0138](0138-refinance-handover-edge-cases.md) §2 and §3 (two successors in one
  grid month are refused, their handling is deleted),
  [0129](0129-loan-schedule-edge-cases.md) §3 (the last draw date moves from payment T−1
  to payment T−2)
- Related: [0120](0120-tranche-on-recast-payment.md), [0137](0137-agreed-instalment-pays-interest.md)
  (combinations that stay modelled), [0166](0166-development-committed-debt.md) (committed
  debt follows the schedule's grid; its ADR 0139 bullet no longer applies)
- Amended by: [0258](0258-leftover-block-hint.md) (stored data: the invalid-data notice
  names a leftover block's two start dates and links to Financing)

## Context

The 2026-11 code review (#435) found four rare loan combinations that the engine models
with special code paths. The owner's real loans include combination 1 (a tranche and a
prepayment or recast both in the late window) and combination 3 (a tranche on the payment
from which an agreed instalment applies). Those two stay modelled. Combination 2 (a
tranche in the loan's last two payment months) and combination 4 (two refinancing blocks
starting in one month) do not occur in real use, and each needs its own handling: the
ADR 0139 cap and the ADR 0138 two-successor path.

## Decision

**0226. Refuse a last-months tranche and two refinancings in one month.** Amends 0139
(whole) and 0138 (the "two successors in one grid month" part). 0120, 0129 §1 and 0137 are
**not** amended.

1. A development tranche dated after the loan's last-but-two payment date is refused
   (today: after the last-but-one, ADR 0129 §3). The ADR 0139 cap that moved such a tranche
   to the final grid month is deleted.
2. A refinancing block whose start falls in the same month as the start of the block it
   replaces is refused. The ADR 0138 code that chained both handovers in one merged row is
   deleted.
3. Each refusal has its own rule code and message (en/cs/ru), raised by forms, CSV import
   and restore through the shared validation; stored data that already has one shows on
   Property detail as invalid data, never as a figure.
4. Parity targets and golden master do not move. Tests of the removed paths are deleted; one
   test per new refusal is added, written failing first.

## Boundaries

Approved by the owner on 2026-11-16 (implementation plan on #448).

1. **Tranche:** valid only on or before `EDATE(start, T−2)` (T = term in months). Proof: for
   every baseDate B and m ≥ 1, `EDATE(B,m) > EDATE(S, o+m−1)`, so a valid draw lands at grid
   month ≤ T−1−o, and the ADR 0139 cap never binds, month-end clamps included. New code
   `DRAW_IN_LAST_TWO_PAYMENTS` for (T−2, T−1]; `DRAW_AFTER_SCHEDULE_END` stays for > T−1,
   with its text updated to name the last-but-two date.
2. **Refinancing:** a block whose start is ≤ `EDATE(previous start, 1)` (same property, the
   next-earlier start) is refused, as `REFINANCE_WITHIN_A_MONTH` on both blocks. A
   calendar-month reading would not be enough (20 Jan → 5 Feb can share a grid month), and
   neither would a clamped EDATE (31 Jan → 28 Feb). Proof: two chain blocks in one grid
   bucket imply Y ≤ EDATE(X,1).
3. **Texts:** `inputRules.DRAW_IN_LAST_TWO_PAYMENTS`, `inputRules.REFINANCE_WITHIN_A_MONTH`
   and the updated `inputRules.DRAW_AFTER_SCHEDULE_END`, in en, cs and ru. The English
   wording is the one the owner approved on #448.

Two blocks on the same start date stay `DUPLICATE_BLOCK_START` only. Each draw reports one
code: `INVALID_DATE`, then `DRAW_BEFORE_START`, then `DRAW_AFTER_SCHEDULE_END`, then
`DRAW_IN_LAST_TWO_PAYMENTS`. The refinancing check runs on all of a property's blocks, so it
does not depend on baseDate.

## Consequences

- The rules live in `src/engine/validate.ts` only (`checkMortgages`, `LOAN_ERROR_CODES`,
  `assertBlockStarts`). Forms, CSV import and restore reach them through the shared
  validation; there is no copy in forms, CSV parsing, SQL checks or migrations.
- `undrawnPrincipal` checks its development loans (`assertLoanInputs`) as the schedule does,
  so a caller that skips validation is refused rather than given a figure.
- Stored data: no migration and no rewritten rows. A stored row in a refused shape shows on
  Property detail as invalid data, and its records stay editable and deletable. A backup
  that contains a refused shape is refused on restore.
- No computed number changes for accepted input: below T−2 the ADR 0139 cap never binds,
  and outside one month the two-successor path is unreachable. Parity targets and the golden
  master do not move; no row is added to the target change log.
- Deleted: `firstStepOnOrAfter`, `devLastDrawMonth` and the `maxStep` of `bucketDraws`; the
  two-successor `ownerDrawn` path of `spliceSuccessor` / `handoverRow` and the second
  grid-month-1 splice's `.minus(own.refinanced)`. Kept: `handoverDrawn` (ADR 0138 §1) and
  the `seen` plumbing (combination 1).
- The reference model (`mortgageReference.ts`) keeps its ADR 0139 cap, now unreachable; #505
  drops it.
- Tests: deleted `last-tranche-clamp.test.ts` and the cases of the removed paths in
  `dev-committed-debt.test.ts`, `refinance-difference.test.ts` and `loan-events.test.ts`.
  Added: boundary cases in `validate.test.ts`, the fail-safe in `input-errors.test.ts`,
  `loan-edge-refusals.property.test.ts`, and store, CSV, stored-event, restore, Property
  detail and form cases.

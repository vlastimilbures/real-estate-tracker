# 0247. A loan with an invalid start date skips the event checks that need its start

- Status: Accepted (owner-delegated, night run 2026-11-16; owner review pending)
- Date: 2026-11-18
- Source: issue #543 (found by the differential dump for #479; code review 2026-11,
  tracking #435); non-critical decisions delegated by the owner for the 2026-11-16 night
  run
- Related: [0017](0017-reject-invalid-loan-inputs.md) and
  [0036](0036-validation-error-list.md) (validation returns a list instead of a NaN or an
  endless loop), [0037](0037-data-integrity-codes.md) (`INVALID_DATE`),
  [0109](0109-loan-prepayments-and-recasts.md) and
  [0116](0116-prepayments-ui-and-review-fixes.md) (the prepayment and recast rules),
  [0150](0150-one-asof-resolver.md) (an as-of date outside the window is a caller bug, raised
  as a `RangeError`)

## Context

A mortgage block can reach the engine with an invalid start date (an Invalid Date) only
from stored data, for example through a restore: every form and the CSV import refuse it
before it is stored. Validation reports it as `INVALID_DATE` on `startDate`.

When such a block also has a recast to a maturity, and both the recast's date and its
maturity are valid, `validateInputs` never returns (#543). `checkLoanEvents` already
treats the schedule end as unknown for an invalid start, but it still runs
`checkRecastMaturity`, which counts the payments due by the maturity with
`lastGridMonthOnOrBefore`. That walk starts from `monthsBetween(start, maturity)`, which
is NaN for an invalid start, and steps `k++` until a due date passes the maturity: no
NaN date ever does, so the loop never ends. Every entry point that validates a block runs
the same check (`validatePortfolio`, `assertInputs`, `assertLoanInputs`,
`assertLoanRows`, `propertySchedules`, `portfolioOutputs`), so each of them hangs, and so
would the app.

The same walk loops on any invalid date. The other engine callers get only validated
dates, except the as-of date: `portfolioOutputs`, `portfolioSnapshot` and `cpiAt` with an
invalid as-of date also never return (`assertAsOf` compares dates, and a NaN comparison
is false). The as-of resolver never produces one (ADR 0150).

## Decision

1. **An invalid start date is reported as today:** `INVALID_DATE` on `startDate`.
2. **The checks of the block's events and draws that need a valid start are skipped** for
   such a block. These codes are never reported on a block whose start date is invalid:
   - `INVALID_RECAST_MATURITY`: the maturity check now returns before it walks the payment
     grid (the change; before it, this case never returned);
   - `EVENT_BEFORE_START` and `EVENT_AFTER_SCHEDULE_END` (prepayments and recasts): the
     comparison with the start is false against an invalid date, and the schedule end is
     unknown (no change; the check now names the invalid start explicitly);
   - `DRAW_BEFORE_START`, `DRAW_AFTER_SCHEDULE_END`, `DRAW_IN_LAST_TWO_PAYMENTS` and
     `COMPLETION_BEFORE_START`: each compares with the start or a due date counted from
     it, and every comparison with an invalid date is false (no change).
3. **Every other check of the block still runs**, as today: `INVALID_DATE` on any other
   invalid date (an event or draw date, a recast maturity, the completion, the contract
   maturity), the amount and sign codes, `INVALID_TERM`, the term codes from the
   instalment, `INVALID_RECAST` and `RECAST_INSTALMENT_BEFORE_COMPLETION` (which compares
   with the completion, not the start).
4. **The user sees the start-date error and fixes it**; the block is invalid already, so
   nothing is lost. Once the start is valid, the event and draw checks run again.
5. **The payment-grid walk refuses an invalid date.** `lastGridMonthOnOrBefore` raises
   `RangeError("lastGridMonthOnOrBefore: an invalid date")` when either date is invalid,
   instead of looping. For two valid dates `monthsBetween` is a finite whole number, so the
   guard never fires and no result changes. An invalid as-of date is a caller bug, as an
   as-of past the horizon is (ADR 0150): it raises instead of freezing the app.
6. **Tests are written failing first** (`validate-invalid-start.test.ts`): each case runs in
   a child process killed after 1.5 s, so a case that does not return fails fast instead of
   hanging the suite.

## Owner review

If the owner prefers the maturity check to report something on such a block, the
fallback is to report nothing more: the start-date error already blocks the computation.

## Consequences

- A restored loan with an invalid start date and a recast to a maturity reports
  `INVALID_DATE` on its start date instead of freezing the app.
- No figure, export, stored data, dictionary entry, message or layout changes; valid input
  validates and computes exactly as before; parity and the golden master do not move.

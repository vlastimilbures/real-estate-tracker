# 0139. A projection tranche lands no later than payment term−1

- Status: Proposed
- Date: 2026-10-05
- Source: issue #218 (found by the review gate of PR #217, ADR 0129)
- Amends: [0129](0129-loan-schedule-edge-cases.md) §3 (the month-end corner of the last
  draw date)
- Related: [0024](0024-draw-timing.md) (D-41, D-44: tranches around baseDate),
  [0021](0021-schedule-calendar.md) (D-21: the baseDate grid), [0079](0079-engine-edge-cases.md)
  (DR-074)

## Context

ADR 0129 §3 rejects a development-loan draw dated after the last-but-one payment,
`EDATE(start, term · 12 − 1)`, so that no tranche lands on the final payment and is repaid
in one shot (DR-074). A draw on that date is accepted and is meant to be repaid over the
last two payments.

The projection buckets tranches on the baseDate grid: a tranche joins the first grid month
dated on or after it (`bucketDraws` in `buildDevSchedule`, `src/engine/schedule.ts`).
Payments are numbered on the loan's own due dates, and grid month `m` carries payment
`offset + m`. With month-end clamping (start day 29–31, DR-070) the grid month that carries
the last-but-one payment can be dated **before** that payment's due date. A draw on the
due date then skips that grid month and lands on the final payment. This needs a loan
already running at baseDate: a loan starting after baseDate draws on the first grid date on
or after its start, so each later grid month falls on or after its payment's due date.

Example: a development loan from 2026-01-31 over 2 years, 100,000 Kč at 5 %, a 500,000 Kč
tranche on 2027-12-31 (payment 23's due date, accepted). With baseDate 2026-02-28 or
2026-04-30, the grid month carrying payment 23 is dated 2027-12-28 or 2027-12-30. The
tranche landed on payment 24 with a principal of 504,359.06.

The independent reference model bucketed the same way, so the cross-check did not see it.

## Decision

The owner chose option B of #218 on 2026-10-05.

1. **The development projection caps a tranche's grid month at the one carrying payment
   `term − 1`.** `buildDevSchedule` computes
   `lastDrawMonth = min(builtMonths, termMonths − 1 − offset)` and passes it as the
   maximum step to both draw buckets (the tranches that re-amortize and the new debt
   recorded in `drawn`), so the two stay aligned. `offset` is the payment offset already
   used for the grid (`paymentOffset`), negative for a loan that starts after baseDate.
2. **Everywhere else the baseDate grid stays.** A tranche still joins the first grid month
   dated on or after it; only a tranche that would land past the cap moves back to it.
   Validation already rejects any draw that could land past the cap other than through a
   month-end clamp.
3. **The reference model follows the same rule.** On its baseDate grid, the row that
   carries payment `term − 1` takes every tranche dated up to its grid date or the due date
   of that payment, whichever is later; later rows take only tranches dated after that.

Option A (bucket tranches on the loan's own cadence, as events are) is not taken: it would
move tranche landing for every clamped month-end loan and possibly the golden master. It
stays open for a later change if tranches and events are aligned (ADR 0109 §3).

## Consequences

- Parity targets do not change: the sample loans have no tranches.
- The golden master does not change: the edge portfolio's development loans draw far from
  the end of their terms.
- A draw on the last-but-one due date of a loan starting on day 29–31 now joins that
  payment and is repaid over the last two payments, as ADR 0129 §3 states. No user input
  is refused that was accepted before.
- The cap is a targeted rule: a clamped month-end loan still lands its other tranches on
  the baseDate grid, which can differ by a payment from the loan's own cadence.
- Tests: `src/engine/__tests__/last-tranche-clamp.test.ts` (engine and cross-check for
  two running loans, plus a future loan where the cap stays inactive) and a reference unit test in `reference/mortgageReference.test.ts`,
  because a cross-check alone passed while both models were wrong.

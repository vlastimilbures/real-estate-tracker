# 0120. A tranche on an instalment recast's payment

- Status: Accepted
- Date: 2026-10-04
- Source: issue #109 (2026-10 code review, finding R1-01)
- Amends: [0109](0109-loan-prepayments-and-recasts.md) §6
- Related: [0024](0024-draw-timing.md) (D-24), [0116](0116-prepayments-ui-and-review-fixes.md)

## Context

An instalment-form recast (ADR 0109 §6) agrees a new instalment from the next payment,
called `q`. The engine computes the recast maturity by NPER on the balance at that point.
A development-loan tranche re-amortizes the instalment in the month it lands (D-24).

When a tranche landed on `q`, the agreed instalment won and the tranche's re-amortization
was dropped. It was not deferred to `q+1`. The loan then carried the larger balance with
an instalment sized for the smaller one, up to the recast maturity:

- With no fixation reset before that maturity, the last payment repaid the rest at once.
  In the issue's example (2,000,000 Kč at 4.9 % from 2026-03-01, 30-year fixation, a
  1,000,000 Kč tranche on 2027-01-15, an agreed 15,000 Kč from 2027-01-01), that was a
  2,164,813.15 Kč balloon on 2042-11-07.
- With a reset before the maturity, the instalment was too low until the reset and too high
  after it.

The same tranche one month later, on `q+1`, re-amortized normally. No loan warning was raised.
The reference model had the same precedence, so the cross-check agreed with the bug.

## Decision

1. **Payment `q` pays the agreed instalment.** This is unchanged from ADR 0109 §6.
2. **A tranche landing on `q` re-amortizes from `q+1`.** A tranche that lands while an agreed
   instalment is still to be paid does not change that payment. The next amortizing payment
   re-amortizes over the payments left to the maturity in force (the recast maturity, or
   the contract term when ADR 0116 decision 2 applies). D-24 is deferred by one payment,
   not dropped.
3. A rate reset on `q` stays as ADR 0109 §6 says: the agreed instalment is paid, and the
   recast maturity already reflects that payment's rate. Only a tranche owes the extra
   re-amortization.
4. The reference model follows this wording, written independently of the engine. The
   cross-check adds a tranche on `q`, the same with a later reset, the same replayed before
   baseDate, and a tranche on `q+1`.

## Consequences

The issue's example after the change:

| Fixation | Tranche on        | `q`    | `q+1`     | At the 2031 reset | Last principal | Σ interest |
| -------- | ----------------- | ------ | --------- | ----------------- | -------------- | ---------- |
| 30 y     | `q` (before)      | 15,000 | 15,000    | 15,000            | 2,164,813.15   | 2,090,328  |
| 30 y     | `q` (now)         | 15,000 | 22,597.71 | 22,597.71         | 22,505.81      | 1,367,643  |
| 30 y     | `q+1` (unchanged) | 15,000 | 22,566.66 | 22,566.66         | 22,474.89      | 1,361,775  |
| 5 y      | `q` (before)      | 15,000 | 15,000    | 25,902.35         | 25,805.58      | 1,458,004  |
| 5 y      | `q` (now)         | 15,000 | 22,597.71 | 22,121.49         | 22,038.84      | 1,300,972  |

A tranche on `q` now lands close to the same tranche on `q+1`. The instalment on `q+1` is
higher because payment `q` paid the lower agreed instalment on the larger balance. Debt
service, cash flow, DSCR and the payoff year follow from the corrected schedule.

No parity target and no golden-master hash changes: the sample portfolio and the golden
fixtures have no recasts.

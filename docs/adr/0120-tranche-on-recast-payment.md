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
  In the issue's example, that was a 2,164,813.15 Kč balloon on the last payment, due
  2042-11-01. The loan was 2,000,000 Kč at 4.9 % from 2026-03-01 with a 30-year fixation.
  A recast dated 2027-01-01 agreed 15,000 Kč for `q`, the payment due 2027-02-01, and a
  1,000,000 Kč tranche on 2027-01-15 landed on `q`.
- With a reset before the maturity, the instalment was too low until the reset and too high
  after it.

The same tranche one month later, on `q+1`, re-amortized normally. No loan warning was raised.
The reference model had the same precedence, so the cross-check agreed with the bug.

## Decision

1. **Payment `q` pays the agreed instalment.** This is unchanged from ADR 0109 §6.
2. **A tranche landing on `q` re-amortizes from `q+1`.** A tranche that lands on the payment
   that pays an agreed instalment does not change that payment. The next payment
   re-amortizes over the payments left to the maturity in force: the recast maturity, or
   the contract term when ADR 0116 decision 2 applies. D-24 is deferred by one payment,
   not dropped.
3. Only a tranche on `q` owes the extra re-amortization. Nothing else changes:
   - A rate reset on `q` stays as ADR 0109 §6 says: the agreed instalment is paid, and the
     recast maturity already reflects that payment's rate.
   - A `lowerInstalment` prepayment settled between the recast and `q` still yields to the
     agreed instalment, as before.
4. Events settled after `q` meet the owed re-amortization and are not changed.
   - A recast after `q` replaces it: an instalment recast pays its own instalment, and a
     maturity recast re-amortizes anyway.
   - A `shortenTerm` prepayment after `q` keeps the instalment `q` paid, the agreed one. On
     the larger balance that ends no earlier than the maturity in force, so the maturity
     stays and `q+1` re-amortizes the lower balance, the same as `lowerInstalment`. This is
     a known limitation: a tranche on `q` leaves no instalment of its own to keep yet.
5. The reference model follows this wording, written independently of the engine, in both
   draw timings. The cross-check covers:
   - a tranche on `q`;
   - the same with a later reset, and the same replayed before baseDate;
   - a tranche on `q+1`;
   - a reset and a tranche both on `q`;
   - an instalment recast, a maturity recast and a `shortenTerm` prepayment after `q`;
   - a recast and a tranche between the last payment and baseDate (D-41);
   - a tranche on a `q` that is the recast maturity;
   - a plain and a development loan with a `lowerInstalment` prepayment before `q` and no
     tranche (unchanged).

## Consequences

The issue's example after the change (the 2031-04 column is the payment where the 5-year
fixation resets):

| Fixation | Tranche on        | `q`    | `q+1`     | 2031-04 (grid 58) | Last principal | Σ interest |
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

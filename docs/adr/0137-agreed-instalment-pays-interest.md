# 0137. Payment q pays at least its interest

- Status: Proposed
- Date: 2026-10-05
- Source: issue #225 (found by the DR-168 mutant work, PR #224)
- Amends: [0109](0109-loan-prepayments-and-recasts.md) §6 (payment `q` pays exactly the
  agreed instalment); [0120](0120-tranche-on-recast-payment.md) decision 1 and the wording of
  decision 4 (the instalment `q` paid)
- Related: [0136](0136-shorten-term-agreed-instalment.md)

## Context

An instalment recast sets an agreed instalment that the next payment, `q`, pays (ADR 0109 §6).
ADR 0120 decision 1 keeps that when a development tranche lands on `q`; payment `q+1` then
re-amortizes the larger balance.

A large tranche can lift `q`'s interest above the agreed instalment. `splitPayment` then
clamps the principal to 0. The row reported the agreed instalment, while the interest and
principal columns, which the projection charges as debt service, came to more. The row, the
cash flow and the snapshot's `monthlyInstalment` (`metrics.ts:226`) disagreed.

#225 example (`recast-tranche.test.ts`): 2,000,000 Kč at 4.9 % from 2026-03-01, agreed
instalment 15,000 Kč from 2027-01-01, a 2,000,000 Kč tranche dated 2027-01-15 on `q`.
Interest on `q` is 16,231.52 Kč; the row said 15,000 Kč.

The interest can exceed the agreed instalment only through a tranche on `q`. A recast sizes
its instalment on the balance and rate that `q` sees, and `RECAST_INSTALMENT_BELOW_INTEREST`
rejects an instalment below that interest. A `shortenTerm` prepayment before `q` only lowers
the balance.

## Decision

The owner chose option 2 of #225 on 2026-10-05.

1. **Payment `q` pays the agreed instalment or its interest, whichever is higher.** When the
   interest is higher, `q` pays interest only: principal is 0, the balance after `q` is the
   balance before it plus the tranche, and the row's instalment equals its interest.
2. Payment `q+1` re-amortizes over the maturity in force, as ADR 0120 decision 2 says.
3. ADR 0120 decision 4: a `shortenTerm` prepayment after `q` keeps the instalment `q` paid,
   which is now the higher of the agreed instalment and `q`'s interest.
4. The floor is written for any payment that pays an agreed instalment. Only a tranche on
   `q` reaches it today, and that tranche also makes `q+1` re-amortize. If a later change
   let the floor bite without a tranche, `q+1` would not re-amortize and the loan would pay
   interest only until maturity; such a change must add the re-amortization.
5. The reference model (`reference/mortgageReference.ts`) follows this wording:
   `max(agreed instalment, rounded interest)`.

## Consequences

- Without a `shortenTerm` prepayment after `q`, only the instalment column of payment `q`
  changes. The interest and principal columns, the balance, and every later payment were
  already as they are now, so cash flow, debt service, DSCR and the payoff year do not move.
  The row's instalment and `monthlyInstalment` now agree with the cash charged.
- With a `shortenTerm` prepayment after `q`, decision 3 sizes the new term on the higher
  instalment, so the loan can end earlier. In the #225 example with 2,500,000 Kč
  `shortenTerm` dated 2027-01-20 (30-year fixation), `q+1` goes from 14,998.95 to
  16,209.51 Kč and the last payment from grid month 134 to 122.
- #225 example, before → after:

  | Fixation | `q` instalment     | `q+1`     | 2031-04 (grid 58) | Last principal      | Σ interest   |
  | -------- | ------------------ | --------- | ----------------- | ------------------- | ------------ |
  | 30 y     | 15,000 → 16,231.52 | 30,222.38 | 30,222.38         | grid 197, 30,099.47 | 1,809,936.56 |
  | 5 y      | 15,000 → 16,231.52 | 30,222.38 | 29,585.48         | grid 197, 29,474.95 | 1,720,770.51 |

- Parity targets and the golden master do not change: no fixture has a recast.
- Tests:
  - `recast-tranche.test.ts`: the "today … (#225)" pin becomes "q pays its interest, not the
    lower agreed instalment (#225)". It checks the instalment equals the interest
    (16,231.52), principal 0, the end balance, and Σ principal = debt. The comment on "a
    shortenTerm prepayment on q keeps the recast maturity" now names the kept instalment.
    A new test pins the 2,500,000 Kč `shortenTerm` on `q` (last payment at grid month 122).
  - `loanEvents.crossCheck.test.ts` gains the #225 tranche with a 30-year and a 5-year
    fixation, and the 30-year case with the 2,500,000 Kč `shortenTerm`.

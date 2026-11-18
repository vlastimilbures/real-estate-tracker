# 0235. A loan's opening balance is always replayed

- Status: Accepted
- Date: 2026-11-18
- Source: issue #449 (code review 2026-11, tracking #435); owner decisions 2026-11-16
  (option A, always replay) and 2026-11-18 (option A, replay accepted for both odd cases)
- Amends: [0109](0109-loan-prepayments-and-recasts.md) §8 (a plain loan with no past event
  is replayed too), [0162](0162-floating-block-rate.md) §2 (a started floating block is
  replayed at its entered rate)
- Related: [0039](0039-golden-master.md) (golden master re-recorded in the same commit),
  [0021](0021-schedule-calendar.md) and D-40 (the payment at maturity clears the balance),
  [0174](0174-golden-master-loan-events-regression-layers.md) (the reference models)

## Context

The engine had two ways to open a running plain loan at the projection start (baseDate):

- **The closed form** (`currentBalance`): one future-value formula at the original rate
  and the entered instalment, floored at zero. It was used while every payment due so far
  was at the original rate and no prepayment or recast was dated by baseDate (the parity
  path).
- **The replay** (`simulateToBaseDate`): every payment due so far, month by month. It was
  used for development loans, for plain loans whose fixation had ended (D-30) and for
  plain loans with a past event (ADR 0109 §8).

Two methods for one balance meant two code paths to keep in step. The night run of
2026-11-16 measured them on origin/main before any change:

- **Ordinary loans** agree to far below a hellér. The largest difference was 2.8e-28 Kč
  over the seed, the fixtures, the golden edge loans and 30,000 random plain loans.
- **Two kinds of loan the app accepts** differ by up to millions of Kč. Both are plain loans
  entered with an explicit loan term, which skips the derived-term check:
  - **A.** The instalment is at or below the month's interest. The closed form adds the
    unpaid interest to the balance; the replay floors the principal at 0, so the balance
    stays at the principal.
  - **B.** The instalment is too small to repay the loan by its term, and the projection
    starts on or after maturity. The closed form keeps a residual and the engine pays it as
    a balloon in month 1; in the replay the payment at maturity clears the balance (D-40,
    ADR 0021), so the loan opens at 0.

The independent mortgage reference model takes the two cases differently:

- For **B** the reference model gives 0, as the replay does.
- A loan of **A** is refused by the reference model as invalid input
  (`mortgageReference.ts:246-253`: an instalment at or below the first month's interest
  never amortizes). Its step rule (`:406-410`: principal floored at 0, the payment at
  maturity clears the balance) gives the replay's figure: the review of #551 lifted the
  guard in a scratch copy and matched 1,103 of 1,103 case A openings exactly, and
  `reference/openingCaseA.reference.test.ts` pins it on the reference's development-loan
  path, which runs the same step rule without the plain-loan guard.

## Decision

1. **Every plain loan is replayed.** The balance of every plain loan on the projection
   start date is computed by replaying its past instalments month by month, the method
   already used for loans with past rate changes or events. The closed-form shortcut is
   deleted from the engine, including its floor at zero.
2. **The closed form moves to the reference model.** `closedFormBalance` in
   `src/engine/__tests__/reference/mortgageReference.ts` holds the formula; a test pins
   replay = closed form within 1e-6 Kč on the seed loans and on random ordinary plain loans
   (`reference/openingReplay.crossCheck.test.ts`).
3. **No parity target moves** at the shown precision (±1 Kč, ±0.0001). The target change
   log gets one row: "opening balances: closed form → replay, difference below 1e-20 Kč, no
   target changed". The golden-master hashes that change in the last digits are re-recorded
   in the same commit (ADR 0039).
4. **Ordinary loans show no change** on any screen, export or chart.
5. **A plain loan whose instalment cannot repay it by its explicit term** (owner decision
   2026-11-18, #449, option A): its opening balance follows the payments as scheduled, by
   the reference model's step rule (`mortgageReference.ts:406-410`). For B the reference
   model gives 0; a loan of A it refuses as invalid input (`:246-253`), and with that
   guard lifted its step rule gives the replay's figure. Such loans can show a different
   debt:
   - **A.** An instalment at or below the month's interest opens before its maturity at
     the principal (no payment repaid any principal, and none added interest to the
     balance), and on or after its maturity at 0 (as B).
   - **B.** A loan viewed on or after its maturity opens at 0: the payment at maturity
     cleared it, so there is no month-1 balloon.

   Debt, debt service, equity, net worth and the IRR of such a loan change accordingly,
   and so does the interest its prepayments save (`prepaymentInterestSaved`), even when a
   past prepayment keeps its own opening unchanged: the comparison loan without the
   prepayments is a case A or B loan with no past event, which is now replayed.

## Measured

Full-precision dump of every engine output, origin/main (a771048c) against the change,
over the seed, the mixed, cash-outside, refinance and event fixtures, the golden edge
loans (each in three scenarios and at five baseDates), and 32,000 random plain loans:

- Fixtures and edge loans: 9.9 million values, the largest difference 3.2e-31 Kč; nothing
  structural changes.
- Ordinary random loans (19,102, plus 3,322 that are short of their term but not yet
  matured): the largest difference 2.3e-28 Kč, far below 1e-20 Kč.
- Case A (8,314 random loans, 4,766 differ materially): up to 75.9 M Kč, a loan whose
  closed form had compounded the unpaid interest for decades.
- Case B (1,262 random loans, 593 viewed after maturity): up to 9.57 M Kč, the residual
  the closed form kept.
- 15 golden-master snapshots change in their last digits (16 when #449 was parked; ADR
  0234 since removed one golden case).

## Consequences

- One opening method for every running loan: `plainOpening` is the replay without the
  tranche count; its unused `prevRate` is dropped (#532 review).
- `currentBalance` is deleted from `amortization.ts` and moves unchanged to the test-only
  `src/engine/__tests__/support/closedForm.ts`, for the tests that pin it (the frozen
  golden v1 edge-loan balances, `asof-snapshot.test.ts`, `reference/edgeCases.test.ts`);
  the v1 snapshot stays byte-identical.
- Two full-precision characterisation pins move in their last digits and are re-recorded:
  the cash-outside cumulative cash flows (`cash-outside-net-cf.test.ts`); the floating
  block's opening (ADR 0162) is pinned against the same loan still in its fixation
  instead of the closed form (`amortization.test.ts`).
- Recompute p99 rises (the replay walks every past payment) and stays under its 150 ms
  budget.
- A user with a loan of case B sees the debt the reference model gives (0); one with a
  loan of case A sees the figure of the reference model's step rule, a loan the reference
  model itself refuses as invalid input. A real
  Czech annuity loan always has an instalment that repays it by maturity, so this takes a
  typo or an interest-only arrangement entered as a plain loan.

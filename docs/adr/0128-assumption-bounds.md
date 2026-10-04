# 0128. Assumption bounds: reset rate, growth floor, shocked levels

- Status: Accepted
- Date: 2026-10-04
- Source: issue #114 (2026-10 code review, findings R2-06, R2-12)
- Amends: [0038](0038-range-codes.md) (growth, indexation and inflation were finite only),
  [0123](0123-scenario-rules-every-entry-point.md) §1 (scenario rules no longer all
  independent of the base) and §3 (fields the scenario form marks)
- Related: [0017](0017-reject-invalid-loan-inputs.md) (no NaN),
  [0075](0075-input-rejection-gaps.md) §1–2 (a new rule on stored data),
  [0119](0119-acquisition-funding.md) §6 (acquisition cost rate, already 0–1)

## Context

`validateInputs` checked most assumption rates for finiteness only. Probes on the sample
portfolio, one changed assumption each, all passed validation:

| Input                   | Result                                                   |
| ----------------------- | -------------------------------------------------------- |
| Inflation −100 %        | Real net worth `Infinity`, real total interest `NaN`     |
| Appreciation −150 %     | Value −14,365,000 Kč in year 1, +7,182,500 Kč in year 2  |
| Reset rate −5 %         | Interest −351,383 Kč in year 6 (the bank pays the owner) |
| Reset rate 300 %        | Interest 24,559,755 Kč a year, IRR −10.5 %               |
| Rate shock −10 pp       | Interest −384,140 Kč in year 6                           |
| Inflation shock −120 pp | Real net worth −260,199,022 Kč                           |

ADR 0038 already says interest lies within 0–100 %, but only the loan's own rate was
checked, not the post-fixation reset rate or a scenario's rate shock on top of it. ADR 0038
let growth, indexation and inflation be negative without considering −100 % or less: a
price index of zero divides by zero, and a factor below zero flips the sign every year. The
same gap applied to a property's own growth overrides. A value crash's percentage was only
range-checked when finite, so `NaN` passed.

The only property test that asserts "every KPI is finite" (R2-12) varied the loan, never the
assumptions, shocks or horizon. ADR 0126 fixed the NaN CAGR that test missed.

The acquisition cost rate (item 3 of #114) is already bounded to 0–1 by ADR 0119 §6.

## Decision

The owner chose option A of #114 in full on 2026-10-04.

1. **Reset rate 0–100 %.** `postFixationResetRatePa` outside 0–1 raises
   `RATE_OUT_OF_RANGE`, as the loan's own rate does (ADR 0038).
2. **Growth floor.** Appreciation, rent indexation, inflation and a property's appreciation
   and rent-index overrides must be above −100 % (−0.9999 passes, −1 fails). A value at or
   below −1 raises the new code `GROWTH_OUT_OF_RANGE` on that field. There is no upper bound.
3. **Shocked levels.** When the base level is valid, two cross-field rules apply:
   - reset rate plus the rate shock's delta must lie within 0–1, else
     `SHOCKED_RATE_OUT_OF_RANGE` on field `rateShock`;
   - inflation plus the inflation shock's delta must be above −1, else
     `SHOCKED_INFLATION_OUT_OF_RANGE` on field `inflationShock`.

   An invalid base level reports only its own rule, so one typo gives one message. The rule
   applies whenever the shock is set, whatever its duration.

4. **Non-finite value crash.** A value crash percentage that is not finite raises
   `NON_FINITE_NUMBER` on `valueShock`.
5. **Every entry point.** The new codes are range codes (ADR 0038): every engine entry point
   raises them, and the forms, CSV import and restore report them through the engine's own
   rules with a translated message (en/cs/ru). There are no separate form-level percent
   ranges: the engine's error lands on the field that broke it.
6. **Cross-field rules both ways.** A scenario sets the shocks; the base sets the levels.
   - Saving a scenario refuses it when its overrides, on top of the saved assumptions, break
     a cross-field rule (ADR 0123 §2). The form shows the message on the shock's delta
     field, and a level rule on that level's field (ADR 0123 §3 named only Vacancy and
     Value crash).
   - Saving the assumptions refuses an edit that **newly** breaks a saved scenario, and names
     the scenario on the base field that caused it ("This value would break the scenario
     “Rate cut”: …"). A scenario that already broke a rule before the edit does not block
     it; the compare keeps leaving that scenario out (ADR 0123 §5). When several scenarios
     break, the first in the list is named.
   - This replaces ADR 0123 §1's "every rule on a scenario field is independent of the base
     assumptions": the cross-field rules are the exception, and the check above covers it.
7. **Restore.** The new assumption and property rules apply to a restored file, as every
   engine rule does (ADR 0052, DR-019). The cross-field rules do not: restore only needs a
   scenario row to be readable (ADR 0123 §4), and the saved assumptions never carry shocks.
8. **No migration** (precedent: ADR 0075 §1–2). A database that already holds such a value
   loads; the engine raises the code and the app shows the existing invalid-input message
   until the owner corrects the value. A saved scenario that breaks a new rule is left out
   of the compare and refused on its next save, as in ADR 0123 §8.
9. **R2-12 property test.** A randomised test draws valid assumptions, shocks, a value crash,
   property growth overrides and a horizon of 1–50 years, and asserts that the inputs pass
   validation and every KPI present is finite.

## Consequences

- Valid inputs compute the same numbers: parity, the golden master and the bench budgets do
  not change.
- User-visible: the Assumptions page, the scenario form, the property form, CSV import and
  restore refuse values they accepted before; the Assumptions page can refuse an edit because
  of a saved scenario, naming it.
- ADR 0038's "growth, indexation and inflation may be negative (finiteness only)" now reads
  "may be negative, above −100 %".
- The texts say "a fraction from zero to one" for the reset rate, as for the loan rate;
  rewording the shared rule text in percent terms is left to the forms' clean-up.

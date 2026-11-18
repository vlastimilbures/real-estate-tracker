# 0251. Validation: one error per non-finite field

- Status: Accepted
- Date: 2026-11-18
- Source: owner decision 2026-11-18 (#435 comment 6965976270) on the items #479 parked
  (1, 3, 4 and 5); the loan-gate choice in §2 delegated by the owner; plan comment on #479
  ("Plan: the #479 follow-ups")
- Related: [0017](0017-reject-invalid-loan-inputs.md) and
  [0036](0036-validation-error-list.md) (validation returns a list; `assertLoanInputs`
  refuses an invalid loan), [0037](0037-data-integrity-codes.md) (`NON_FINITE_NUMBER`,
  `NEGATIVE_AMOUNT`), [0128](0128-assumption-bounds.md) (the shock ranges),
  [0247](0247-invalid-loan-start-skips-event-checks.md) (the differential dump of #479)

## Context

The #479 split of `validate.ts` kept every output as it was, and parked the changes that
would move one. Four of them the owner decided on 2026-11-18:

1. **A non-finite principal, instalment or price reports twice.** `initialPrincipal`,
   `monthlyInstalment` and `purchasePrice` were checked for a negative value without the
   finite guard every other amount has (`isNegative`, `validate/check.ts`). A −Infinity
   value reported `NON_FINITE_NUMBER` and `NEGATIVE_PRINCIPAL` or `NEGATIVE_AMOUNT` on the
   same field. NaN and +Infinity are not negative, so they reported once.
2. **A shock reports twice too.** A non-finite shock delta (`inflationShock`,
   `rateShock`) with a bad duration, or a non-finite value-crash percentage with a bad
   year, reported `NON_FINITE_NUMBER` and `SHOCK_OUT_OF_RANGE` on the same field.
3. **`field` is any string.** `EngineValidationError.field` was typed `string`, so a
   misspelt field compiled, and nothing tied a field to its entity.
4. **`scenarioRules.ts` sat outside `validate/`**, although it is validation.

None of these inputs can come from the app: the forms, the CSV import and the stored-text
parsers refuse ±Infinity and NaN before the engine sees them. Only a direct engine call
can pass one.

## Decision

1. **One error per non-finite amount (finite guard).** `initialPrincipal`,
   `monthlyInstalment` (`validate/loan.ts`) and `purchasePrice` (`validate/rows.ts`) use
   `isNegativeAmount`, as every other amount does. A non-finite value reports
   `NON_FINITE_NUMBER` alone; a finite negative one still reports its sign code. −0 and NaN
   report as before. `isNegative` is deleted. The checks stay pass-major (all finite
   checks of a row, then its sign rules), so `checkAmount`, which checks one field to the
   end, is not used at these sites.
2. **The loan gate keeps refusing such a loan (delegated choice).** Before, a −Infinity
   principal made `assertLoanInputs` throw `[NEGATIVE_PRINCIPAL]`. Dropping that code
   alone would let the block entry points that rely on the assert (`effectiveMaturity`,
   `openingBalance`, `undrawnPrincipal`) take a −Infinity principal as they take
   +Infinity. So `NON_FINITE_NUMBER` on a loan's own amounts, `initialPrincipal` and
   `monthlyInstalment`, is also a "loan" problem (`raisedByLoanGate`,
   `validate/codes.ts`): `assertLoanInputs` throws `[NON_FINITE_NUMBER]` instead, still
   one error and still a refusal. The code sets of the gates (`RAISED_BY`) do not change:
   `NON_FINITE_NUMBER` on any other field is not a loan problem.

   **Scope (delegated, accepted 2026-11-18):** the gate takes both amounts and every
   non-finite value, so it also refuses a +Infinity or NaN principal or instalment, which
   the base let through. Of the 232 `assertLoanInputs` outputs that change, 170 returned
   at the base and now throw, 33 replace `NEGATIVE_PRINCIPAL` (with any other loan code
   kept) and 29 add `NON_FINITE_NUMBER` before the loan codes the base already threw. At
   the base the block entry points then returned a value (272
   outputs in the dump), returned NaN (68), threw a `TypeError` (14) or threw another loan
   code (202, for example `INSTALMENT_BELOW_INTEREST` from the NPER term); each of these
   is now a `NON_FINITE_NUMBER` refusal (D2 below).

3. **A shock stops at `NON_FINITE_NUMBER`.** The shock bands and the value crash go
   through `checkAmount`: a non-finite delta or percentage reports `NON_FINITE_NUMBER`
   only; a finite one with a bad duration or year, or a percentage outside 0–1, reports
   `SHOCK_OUT_OF_RANGE` as before.
4. **`field` is typed per entity.** `VALIDATION_FIELDS` (`validate/codes.ts`, internal)
   lists each entity's fields; `ValidationField` is their union and `FieldOf<E>` one
   entity's. `EngineValidationError` stays one flat interface with
   `field?: ValidationField`. The reporters are generic in the entity, so a check can only
   name a field of the row it checks. On the UI side the scenario form rewrites a field to
   its own form keys; `writeErrorTexts` and `formWriteErrors` take a `FormWriteError`
   whose errors may name any string. Type-only: no output changes. Two existing test
   helpers change their annotations to match (`support/loan.ts`: `onLoan`'s field takes
   the error's field type; `writeError.test.ts`: the event helper's field `as const`); no
   assertion, test name or count changes.
5. **`scenarioRules.ts` moves to `validate/`** and is exported from its barrel; the
   engine's public exports are unchanged. The mutation shard table lists it in
   `validate-b`.

**Rejected: one per-field order.** Reporting each field to the end (finite, then sign)
before the next would also give one error per field, but it changes the order of the
errors on every row with several problems. The owner kept the pass-major order.

**Not changed (parked, owner):**

- **P2.** A −Infinity instalment on a loan whose term comes from its instalment still
  also reports `INSTALMENT_BELOW_INTEREST`: the derived-term check does not guard the
  instalment.
- **P3.** `NON_FINITE_NUMBER` on an assumption default names the bare key (for example
  `mgmtPctRent`), not `defaults.mgmtPctRent` as its range check does, so a restore names
  the wrong column. `VALIDATION_FIELDS` lists both forms. Changing it needs its own ADR.
- **A non-finite rate or draw (follow-up).** A non-finite `interestRatePa` or draw
  amount (and, through them, a non-finite fee or term) still passes `assertLoanInputs`,
  and `openingBalance` (or once `undrawnPrincipal`) returns NaN for it: 66 dump cases, all
  present at the base, none new. Only a direct engine call can pass such a value; it is
  out of scope here.

## Proof

A differential dump (not committed) of every validator (`validateInputs` with and
without an as-of date, `validatePortfolio`, `leaseOverlapErrors`, the asserts,
`scenarioRuleErrors`, `scenarioErrorsAddedBy`) and the block entry points
(`effectiveMaturity`, `openingBalance`, `undrawnPrincipal`), run in child processes with a
timeout, at full precision, over the boundary grid (every amount, rate and whole-number
field × 0, −0, ±1, ±1e-30, ±1e30, NaN, ±Infinity), the shock grids (delta or percentage
× duration or year) and 5,000 fast-check cases × seeds 424242 and 20261118. Compared
with the base (815ee623), the only differences are the allowed ones:

- D1: `NEGATIVE_PRINCIPAL` / `NEGATIVE_AMOUNT` no longer follow `NON_FINITE_NUMBER` on
  the same field;
- D2: `assertLoanInputs` throws `NON_FINITE_NUMBER` on a non-finite principal or
  instalment, and the block entry points refuse that loan;
- D3: `SHOCK_OUT_OF_RANGE` no longer follows `NON_FINITE_NUMBER` on the same shock;
- D4: the error messages that list one code fewer.

The counts are in "Results" below. The §4 and §5 commits show no difference.

## Results

11,618 cases (1,618 grid and order probes, 10,000 fast-check), each through every
validator and, for an edited loan, the block entry points. No case hung in any dump.

| Commit             | Cases that differ | D1  | D2 (assert) | D2 (entry points) | D3  | D4  | Other |
| ------------------ | ----------------- | --- | ----------- | ----------------- | --- | --- | ----- |
| §1 finite guard    | 257               | 530 | 232         | 556               | 0   | 168 | 0     |
| §3 shocks          | 103               | 0   | 0           | 0                 | 341 | 104 | 0     |
| §5 `scenarioRules` | 0                 | 0   | 0           | 0                 | 0   | 0   | 0     |
| §4 typed `field`   | 0                 | 0   | 0           | 0                 | 0   | 0   | 0     |

The D columns count outputs (one error dropped, one assert or entry-point result), not
cases. The D2 entry-point outputs are the block entry points refusing a loan with a
non-finite principal or instalment with `NON_FINITE_NUMBER`: at the base 272 returned a
value and 68 a NaN, 202 threw another loan code (`INSTALMENT_BELOW_INTEREST`,
`NEGATIVE_PRINCIPAL`, …) and 14 a `TypeError`. A non-finite interest rate or draw amount still gives
`openingBalance` a NaN, as at the base (66 cases, none new): see "Not changed". The
branch was rebased onto 9648016f between §5 and §4; the dump before and after the
rebase is identical.

## Consequences

- An engine caller that passes a non-finite amount or shock gets one error on that field
  instead of two; a banner, the restore issues or the CSV problems would show one line
  fewer, if such a value ever reached them.
- A loan with a non-finite principal or instalment is refused by every loan entry point,
  never computed.
- No figure, export, stored data, dictionary entry or layout changes; parity and the
  golden master do not move.

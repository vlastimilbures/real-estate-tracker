# 0135. A loan term must be whole years

- Status: Proposed
- Date: 2026-10-05
- Source: issue #226 (found by the DR-168 mutant work, PR #224)
- Amends: [0017](0017-reject-invalid-loan-inputs.md) (invalid loan inputs are rejected)
- Related: [0075](0075-input-rejection-gaps.md), [0086](0086-restore-int-bounds.md) (whole-number
  bounds), [0118](0118-data-check.md)

## Context

The engine accepted a fractional `loanTermYears` (for example 1.5). `validate.ts` checked
only `loanTermYears > 0`, while `fixationYears` must be an integer. The term checks then
treated the loan as having no contract term (`Number.isInteger` in `lastDrawDate` and
`contractTerm`), so `DRAW_AFTER_SCHEDULE_END` and the recast-maturity check were skipped.
The schedule still ran over `1.5 × 12` = 18 months (`termMonths`). A draw after the 18th
month, or a recast maturity before the next payment, passed validation on such a loan.

The form (`parseIntField`, `mortgageForm.ts`) and CSV import (`optInt`, `csv.ts`) accept
whole years only, so a user cannot enter 1.5. `INT_RANGES` holds only the bounds. A direct
engine caller, a restored backup or a corrupt row can still carry a fractional term.

## Decision

The owner chose option 1 of #226 on 2026-10-05.

1. A `loanTermYears` that is not a positive integer is rejected as `INVALID_TERM` on
   `loanTermYears`, like `fixationYears`. The existing code and message ("The term in years
   is not valid") are reused.
2. No database migration: the column keeps its `> 0` CHECK. A stored fractional term now
   reaches the validation error list ([ADR 0036](0036-validation-error-list.md)), and restore refuses it through the engine
   rules it already applies.

## Consequences

- Parity targets and the golden master do not change: every fixture term is whole years.
- Restore changes: a backup with a fractional term restored without complaint before (the
  bounds check passed it and the engine accepted it). `checkInputRules` runs the engine
  rules, so restore now refuses it with `INVALID_TERM`.
- The property-test generator (`reference/loanGen.ts`) now draws contract terms in whole
  years; before, most of its development loans had a fractional term.
- The term checks no longer have a silent gap: every accepted term gives a whole number of
  payments.
- Tests: `validate-fields.test.ts` ("loan amounts and draws") and
  `loan-events-validation.test.ts` ("an invalid contract term …") now expect
  `INVALID_TERM` for 1.5 (and 0.5).

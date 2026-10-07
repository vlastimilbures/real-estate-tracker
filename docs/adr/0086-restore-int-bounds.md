# 0086. Backup restore applies the whole-number bounds

- Status: Accepted
- Date: 2026-10-03
- Source: issue #38 (found while validating the pre-release review 2026-10, #26)
- Amends: [0075](0075-input-rejection-gaps.md)
- Amended by: [0148](0148-restore-rules-vs-stored-data.md) (§4: restore rules versus stored data)

## Context

ADR 0075 bounded the whole-number form fields and ADR 0076 applied the same bounds to CSV
import (`src/lib/intRanges.ts`). Backup restore checks only the engine rules, which have no
upper bound, so a hand-edited backup or one written by another tool can bring in a horizon
of 150 years, a fixation or term of 60 years, or a property size of 20 000 m².

## Decision

Owner, 2026-10-03:

1. **The bounds apply at every user-data entry point:** the forms, CSV import and backup
   restore refuse the same values (projection horizon 1–100, fixation 0–50 years, loan term
   1–50 years, property size 1–10 000 m²).
2. **The engine and the database stay open-ended.** The engine rules (`HORIZON_NOT_POSITIVE`,
   `INVALID_TERM`) and the DB CHECK constraints are unchanged, so tests and fixtures may still
   use other values. The check lives in the restore rule set (`src/import/inputRules.ts`).
3. **Restore-only rule `OUT_OF_RANGE`.** It is not added to the engine's `ValidationCode`.
   The restore issue table names the table, record and column and shows the allowed range
   ("Must be a whole number from 1 to 100"); like every restore issue, it never shows the
   value. When an engine rule already reports the same field (for example a horizon of 0),
   only the engine rule is listed.
4. **No migration.** A database that already holds an out-of-range value keeps loading; only
   new restores are refused, and nothing changes when a restore is refused.

## Consequences

Valid input computes the same numbers: parity, the golden master and the bench budgets are
unchanged. Restore refuses files it accepted before (user-visible). DB CHECK upper bounds stay
out of scope: they would need a table-rebuild migration and every entry point now checks.

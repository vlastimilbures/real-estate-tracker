# 0037. Data-integrity validation codes raise

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-37, J-27

## Context

Six data-integrity codes from validateInputs were defined but not wired (J-27).

Options considered for J-27 (Wire the data-integrity validation codes (P4a `validateInputs`)): INVALID_DATE, NON_FINITE_NUMBER, NEGATIVE_AMOUNT, ORPHAN_ROW, END_BEFORE_START, DUPLICATE_HOLDING_COST: (a) the engine raises a typed error and every entry point rejects the row; (b) report as a warning only; (c) leave unchecked (today). Recommendation at planning: (a) — each is a corrupt-data case that today yields NaN, a rolled-over date or a silent first-row pick (DR-035, DR-071). Messages in P7

## Decision

**Data-integrity codes (answers J-27):** option (a) — INVALID_DATE, NON_FINITE_NUMBER, NEGATIVE_AMOUNT, ORPHAN_ROW, END_BEFORE_START, DUPLICATE_HOLDING_COST make the engine raise a typed error, and every entry point (form, CSV, restore) rejects the row.

## Consequences

P4b engine error with a failing test first; P5b CSV/restore; P7 forms and messages. User-visible under D-01.

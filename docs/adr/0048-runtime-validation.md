# 0048. Hand-rolled runtime validation

- Status: Accepted
- Date: 2026-10-01
- Source IDs: D-48, J-07

## Context

Rows from the DB and JSON backups need runtime checks; zod would be a new runtime dependency (J-07).

Options considered for J-07 (Runtime validation): (a) hand-rolled type guards; (b) `zod` (runtime dependency, needs D-02 approval). Recommendation at planning: (a), unless guard code exceeds ~300 lines

## Decision

**Runtime validation (answers J-07):** option (a) — hand-rolled guards at the DB/JSON mapper boundary; value rules reuse the engine `validateInputs`. No `zod`.

## Consequences

P5a implements the DR-037 guards without a new runtime dependency.

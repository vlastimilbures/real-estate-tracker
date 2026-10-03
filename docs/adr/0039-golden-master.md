# 0039. Keep the engine golden-master test

- Status: Accepted
- Amended by: ADR 0081
- Date: 2026-09-30
- Source IDs: D-39, J-29

## Context

A golden-master snapshot of engine output catches unintended changes during refactors (J-29).

Options considered for J-29 (Keep the P4a golden-master test (`src/engine/__tests__/golden.test.ts`)): (a) keep: every approved P4b fix updates its snapshot in the same commit as the target change log rows; (b) delete at the P4a gate. Recommendation at planning: (a) — it pins 40-digit outputs for refactors in P4b/P9; snapshot updates stay reviewable per decision

## Decision

**Golden master (answers J-29):** option (a) — keep `src/engine/__tests__/golden.test.ts`. An approved behaviour change updates its snapshot in the same commit as its target change log rows (`vitest -u` for that decision only); a refactor never updates it.

## Consequences

Applies from P4b on (also P9 performance work).

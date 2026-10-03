# 0015. Keep exceljs with dependency overrides

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-15, J-16

## Context

exceljs pulls in transitive packages with advisories; replacing it would change a runtime dependency (J-16).

Options considered for J-16 (Excel export library): (a) keep it if no high advisories; (b) upgrade or replace it (may change a runtime dependency under D-02). Recommendation at planning: Decide from the P1 evidence

## Decision

**Excel library (answers J-16):** keep `exceljs@4.4.0`; add `pnpm.overrides` for `brace-expansion` (1.x ≥1.1.18, 2.x ≥2.1.4) and `uuid` (^11.1.1). D-02 approval is given for the `uuid` version change, which ships in the bundle.

## Consequences

DR-001 becomes Medium. P5b applies the overrides, re-runs `pnpm audit --prod` and the export tests. `write-excel-file` stays a backlog alternative.

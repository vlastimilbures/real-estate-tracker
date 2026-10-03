# 0036. The engine's typed validation error list

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-36

## Context

The engine lacked a single typed list of input errors to share between form, CSV and restore.

## Decision

**Validation error list (P4a gate):** the 19 `validateInputs` codes in P04a-engine-refactor.md §7 are approved as the engine's typed error list. Codes covered by D-17 / D-19 / D-27 are wired in P4b; DUPLICATE_BLOCK_START stands in for the D-27 overlap rule until DR-116 defines overlap.

Related follow-up decisions:

- **D-54**: **Holding-cost value rules (answers DR-127, extends D-36):** a holding-cost row with `mgmtPctRent`/`maintPctRent` outside 0–1 reports RATE_OUT_OF_RANGE and a negative cost reports NEGATIVE_AMOUNT; the engine raises them and restore rejects the row.

## Consequences

P4b wires the engine side; P5b/P7 add entry-point rejection and wording (en/cs/ru), user-visible under D-01.

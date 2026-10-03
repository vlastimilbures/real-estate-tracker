# 0029. Optional contract maturity date as a consistency check

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-29, Q-06

## Context

Under ADR 0008 the term is derived from the instalment; the owner wanted a warning when that disagrees with the contract (Q-06).

Options considered for Q-06 (Record each loan's contract maturity date? (D-08)): Yes (app warns when the instalment implies a different maturity) / no. Recommendation at planning: —. P02 recommendation: see P02-mortgage-audit.md §7

## Decision

**Contract maturity date (answers Q-06):** yes — an optional contract maturity date per mortgage block; warn when the instalment-implied maturity differs from it by more than 1 month (wording in P02 report §5). Not applied to development loans. The term stays derived from the instalment (D-08).

## Consequences

P4b adds the optional field and the engine-reported implied maturity; the warning is a UX change under D-01 (P7). Needs a migration (P5a rules).

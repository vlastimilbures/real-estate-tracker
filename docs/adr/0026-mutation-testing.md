# 0026. Mutation testing on the engine, nightly

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-26, J-09

## Context

Coverage alone does not prove the engine tests catch wrong numbers (J-09).

Options considered for J-09 (Mutation testing (Stryker) on the engine): (a) adopt locally and in nightly CI; (b) skip. Recommendation at planning: (a), nightly only. P02 recommendation: see P02-mortgage-audit.md §7

## Decision

**Mutation testing (answers J-09):** option (a) — Stryker on `src/engine`, nightly CI only (dev-only tool), using the independent reference cross-check as a strong check.

## Consequences

P10 adds the nightly job; record the dev tool in that phase report.

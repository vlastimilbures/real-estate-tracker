# 0073. Scenario-compare budget and nightly bench assertion

- Status: Accepted
- Date: 2026-10-02
- Source IDs: DR-172 (P11 follow-up F-10, D-71); extends ADR 0066

## Context

ADR 0066 set a budget for one engine recompute (20 properties, p99 ≤ 150 ms, Node bench) but
none for the scenario comparison, which runs three recomputes. The P11 bench measured the
compare at 20 properties at p99 165 ms. No budget was asserted anywhere in CI.

## Decision

Owner, 2026-10-02 (P12 plan):

1. **Compare budget:** 3 scenarios × 20 properties, p99 ≤ **450 ms** in the Node bench
   (`pnpm bench`, "scenario compare (3 scenarios) / synthetic, 20 properties") — three times
   the single-recompute budget.
2. **Nightly assertion:** the nightly workflow runs `pnpm bench` and fails when a p99 exceeds
   **2 × its budget** (recompute 300 ms, compare 900 ms). The factor absorbs the slower,
   noisier Linux runner; the budgets themselves are checked locally on the owner's machine and
   recorded in phase reports.

## Consequences

A large engine slowdown fails the nightly run; small drifts are caught only by the local
budget check. The nightly bench follows the same skip rule as mutation testing (no commit on
main in 24 h ⇒ skip).

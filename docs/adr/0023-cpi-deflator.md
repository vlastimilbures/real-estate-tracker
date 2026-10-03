# 0023. Real terms use a cumulative CPI index

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-23, J-05

## Context

Real terms were deflated by a constant (1+inflation)^t while CPI is built per year under an inflation shock (spec finding H, J-05).

Options considered for J-05 (Real terms under an inflation shock): (a) constant deflator, as today; (b) cumulative CPI index per year (also for real CAGR and real IRR). Recommendation at planning: (b); only scenario outputs change. P02 recommendation: see P02-mortgage-audit.md §7

## Decision

**Real terms under an inflation shock (answers J-05):** option (b) — cumulative per-year CPI everywhere. The engine KPIs already do this; the UI constant deflator is removed by emitting real rows from the engine.

## Consequences

P7 fixes DR-031 (only scenario / real-lens outputs change; seed parity unchanged). User-visible under D-01.

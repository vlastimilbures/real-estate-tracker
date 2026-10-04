# 0066. Performance budgets and measurement

- Status: Accepted
- Date: 2026-10-01
- Source IDs: D-66, J-11

## Context

The spec asked for 'well under a second' without budgets or a way to measure cold start (J-11).

Options considered for J-11 (Engine off the UI thread (Web Worker)): (a) only if the budget is missed; (b) always. Recommendation at planning: (a)

## Decision

**P9 plan (owner, 2026-10-01):** (1) Cold start is measured in the release build by a small Rust command `perf_report` that logs ms since process start when the frontend reaches `dashboard-rendered` (own capability entry). (2) DR-134 is fixed in P9: a Rust command reads all portfolio tables inside one read transaction on one pooled connection (same pool access as D-14). (3) Lazy-loaded pages with an empty `Suspense` fallback count as behaviour-neutral. (4) Budgets as proposed in PLAN.md §10 Phase 9 (engine 20 properties p99 ≤ 150 ms Node bench; edit → dashboard ≤ 250 ms; cold start ≤ 2 s; initial JS gzip ≤ baseline − 20 %), confirmed at the P9 gate.

Related follow-up decisions:

- **D-67**: **P9 gate (2026-10-01):** (1) Budgets confirmed as proposed (D-66 item 4). Release-build results: cold start → `dashboard-rendered` 719 ms (first, cold) / 363–368 ms (4 warm launches); assumption edit → dashboard 55 / 57 ms; Node bench 20 properties p99 66.3 ms. (2) DR-159: option (a) — accept the 288.5 kB gzip startup bundle; revisit only if cold start misses 2 s. (3) J-11 closed: (a) not needed (engine within budget).
- **DR-009 (owner, 2026-10-04):** Item 3 also covers the date picker calendar: `DateInput` loads it on the first open and shows the popover once it has loaded, with no placeholder. Projections and Property detail became lazy pages under item 3 (PR #192).
- **DR-009 (owner, 2026-10-04):** Item 3 also covers the UI dictionaries: startup loads only the active language before the first render, and a language switch shows the new language once its dictionary has loaded, with no placeholder. A failed switch keeps the current language; a failed startup load shows English for the session (PR #212).

## Consequences

P9 scope; J-11 only if the engine budget is still missed.

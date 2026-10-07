# 0018. Re-order the plan for a data-safety hotfix

- Status: Superseded by 0081
- Date: 2026-09-30
- Source IDs: D-18, J-20

## Context

The architecture review found critical data-safety bugs that should not wait for the later database phase (J-20).

Options considered for J-20 (Plan re-ordering proposed in P01 §9): Accept / reject: data-safety hotfix after P3; P3 characterises Critical engine bugs; P5a gains a Rust transaction command; P9 targets IRR. Recommendation at planning: Accept

## Decision

**Plan re-ordering (answers J-20):** accept P01 §9 — a data-safety hotfix phase right after P3 (DR-017, DR-019, DR-024, DR-026); P3 characterises the Critical engine bugs and tightens DR-033; P5a gains the D-14 Rust command; P9 targets IRR first.

## Consequences

Hotfix branch `refactor/p03b-data-safety-hotfix`; each fix still needs its failing test and decision reference.

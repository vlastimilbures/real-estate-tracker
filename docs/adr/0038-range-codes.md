# 0038. Assumption and scenario range codes

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-38, J-28
- Amended by: [0128](0128-assumption-bounds.md) (reset rate 0–100 %, growth above −100 %,
  shocked levels)

## Context

Range codes for horizon, rates and shocks were defined but not wired (J-28).

Options considered for J-28 (Wire the assumption / scenario range codes (P4a `validateInputs`)): HORIZON_NOT_POSITIVE (DR-043), RATE_OUT_OF_RANGE for vacancy and cost shares (outside 0–1) and interest (outside 0–100 %), SHOCK_OUT_OF_RANGE (negative/fractional duration, haircut outside 0–1, DR-094): (a) reject; (b) clamp; (c) leave as today. Recommendation at planning: (a). Growth, indexation and inflation may be negative and are only checked for finiteness

## Decision

**Range codes (answers J-28):** option (a) — reject HORIZON_NOT_POSITIVE, RATE_OUT_OF_RANGE and SHOCK_OUT_OF_RANGE. Ranges: interest 0–100 %; vacancy, cost shares and value haircut 0–1; shock durations whole years ≥ 0; horizon a whole number ≥ 1. Growth, indexation and inflation may be negative (finiteness only).

## Consequences

P4b engine error with a failing test first; P7 forms and messages. User-visible under D-01.

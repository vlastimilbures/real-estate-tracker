# 0020. No instalment rounding

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-20, J-01

## Context

Banks round instalments to whole koruna by varying methods; no bank statements were available to confirm one (J-01).

Options considered for J-01 (Instalment rounding): (a) none, as today; (b) round to whole Kč using the method on the bank statement, with the final instalment absorbing the residual. Recommendation at planning: Decide from the Q-03 statements (verify); (a) if none available. P02 recommendation: see P02-mortgage-audit.md §7

## Decision

**Instalment rounding (answers J-01):** option (a) — no rounding; re-amortized instalments stay unrounded. Revisit only if bank statements (Q-03) show a method; P02 impact of whole-Kč ceiling ≤ 93 Kč.

## Consequences

No change. C-04 stays documented as an accepted simplification (OWNER TO VERIFY).

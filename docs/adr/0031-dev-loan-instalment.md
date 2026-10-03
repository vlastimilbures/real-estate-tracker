# 0031. Development-loan instalment derived from the term

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-31, J-22

## Context

The development-loan re-amortization trigger fired on non-events and the entered instalment was inconsistent with draws (J-22).

Options considered for J-22 (Development-loan instalment (DR-102)): (a) fix the trigger; entered instalment applies until an event; (b) fix the trigger and derive the dev-loan instalment from the term (field read-only for dev loans). Recommendation at planning: (b) — P02 §7

## Decision

**Development-loan instalment (answers J-22):** option (b) — fix the trigger and derive the dev-loan instalment from the (required) term; the instalment field is read-only for development loans.

## Consequences

P4b (engine, with D-24); P7 (form, user-visible under D-01). No seed parity change.

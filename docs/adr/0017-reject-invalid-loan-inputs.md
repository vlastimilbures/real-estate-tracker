# 0017. Reject invalid loan inputs everywhere

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-17, J-19

## Context

Invalid loan inputs produced NaN, Infinity or an unbounded loop in the engine (J-19).

Options considered for J-19 (Invalid loan inputs (DR-014, DR-018, DR-043, P01)): (a) reject in form/CSV/restore + engine throws a typed error; (b) engine clamps silently. Recommendation at planning: (a)

## Decision

**Invalid loan inputs (answers J-19):** reject them at every entry point (form, CSV, restore) with a precise message, and have the engine raise a typed error instead of producing NaN, Infinity or an unbounded loop.

## Consequences

P3 characterises today's output (DR-014, DR-018, DR-043); P4b fixes the engine; P5b fixes CSV/restore. User-visible change under D-01.

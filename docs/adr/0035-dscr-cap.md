# 0035. DSCR display cap

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-35, J-26

## Context

DSCR explodes when debt service is near zero; the spec mentioned a 99× cap that was not implemented (J-26).

Options considered for J-26 (DSCR 99× display cap (DR-108)): (a) implement the cap (">99×"); (b) drop it from SPEC. Recommendation at planning: (a) — a tiny debt service otherwise shows absurd multiples

## Decision

**DSCR 99× display cap (answers J-26):** option (a) — implement the SPEC cap: DSCR above 99 displays as ">99×" (display only; the engine value is unchanged).

## Consequences

P7 implements in the display layer (DR-108) with a failing test first; UX change under D-01.

# 0022. Year labelling: projection year and calendar year

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-22, J-04

## Context

Projection years count from baseDate while KPIs report calendar years, so labels were ambiguous (spec finding F, J-04).

Options considered for J-04 (Year labelling): (a) projection year 1…30; (b) calendar year; (c) both ("Y5 · 2031"). Recommendation at planning: (c). P02 recommendation: see P02-mortgage-audit.md §7

## Decision

**Year labelling (answers J-04):** option (c) — show both ("Y5 · 2031"). Engine side: keep `year` + `calendarYear`, add each year's period start/end dates and return the projection year alongside calendar-year KPIs (additive).

## Consequences

P4b adds the engine fields (no number changes); P6/P7 applies the labels (UX change under D-01).

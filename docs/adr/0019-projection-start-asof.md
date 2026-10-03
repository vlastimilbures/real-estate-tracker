# 0019. Projection start and the As-of lens

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-19, J-17

## Context

An as-of date before baseDate produced inconsistent numbers between the snapshot and the projection (J-17).

Options considered for J-17 (As-of date before baseDate (DR-015, P01)): (a) clamp the as-of lens to the projection window [baseDate, baseDate + horizon]; baseDate stays the user's "projection start" (Settings → Assumptions); default as-of = max(today, baseDate); engine rejects asOf < baseDate with a typed error; (b) also support a separate read-only history view (backlog). Recommendation at planning: (a) — see P01-review §8.1

## Decision

**As-of lens vs projection start (answers J-17):** `baseDate` is the owner-set **Projection start** (Settings → Assumptions); properties bought earlier enter at their state on that date. The **As-of** picker is bounded to [baseDate, baseDate + horizonYears], defaults to max(today, baseDate), and clamps a stale value after a baseDate change; a hint points to Assumptions for earlier dates. The engine raises a typed error for asOf < baseDate. A read-only History view is backlog only.

Related follow-up decisions:

- **D-62**: **P7c plan (owner, 2026-10-01):** (1) DR-054 anchor = "projection grid": today's view stays the effective-dated snapshot at today on both Dashboard and Property detail; a future as-of uses the nearest projection-year row on both; real terms always deflate from the base date with the engine CPI (D-23). (2) Remaining P7-tagged debt: fix S-effort rows that are behaviour-neutral or already decided; re-tag the rest P9/P11 with a reason. (3) Scenario compare honours the Nominal/Real lens (DR-093).

## Consequences

P3 characterises DR-015 then adds failing tests; P4b adds the engine error after DR-016/DR-029 are fixed; P7 implements the picker (UX change under D-01). No parity change.

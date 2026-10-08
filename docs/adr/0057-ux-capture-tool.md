# 0057. Permanent UX capture tool

- Status: Accepted
- Date: 2026-10-01
- Source IDs: D-57
- Amended by: [0157](0157-accessibility-batch.md) (the axe scan adds the `best-practice`
  rule set)

## Context

The UX audit needed reproducible screenshots of every screen, language, theme and viewport, plus an accessibility scan.

## Decision

**Permanent UX capture tool (owner, P6 plan, 2026-10-01):** the P6 screenshot harness is kept and committed as `pnpm ux:capture` (`ux-capture/`, Vite + in-memory sql.js seed, own port, frozen clock), with an axe WCAG 2.2 AA scan per screen; output to git-ignored `ux-screens/`. Overrides PLAN P6 "throwaway, do not commit". Dev dependencies `@axe-core/playwright` and `@types/node` approved.

## Consequences

Reused for before/after evidence in P7 and later UX rounds; not part of CI.

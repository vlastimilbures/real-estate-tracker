# 0070. Decisions are recorded as ADRs

- Status: Accepted
- Amended by: ADR 0081, ADR 0152 (the index is generated and checked; numbering checks
  open PRs)
- Date: 2026-10-02
- Source IDs: D-70

## Context

The refactor programme kept decisions in an internal decision log; once it ends, decisions need a permanent home.

## Decision

New decisions are recorded as ADRs in `docs/adr/` (numbered after the refactor-programme decision IDs; the next free number above 0070 for new ones). A parity-target change needs an accepted ADR under ADR 0003 plus an old → new row in the target change log in `.claude/rules/engine-parity.md`. The programme archive was later retired and the backlog moved to `docs/roadmap.md` and GitHub issues (ADR 0081).

## Consequences

CLAUDE.md §8 and CONTRIBUTING.md describe the process. Code comments keep citing programme IDs (D-/J-/DR-/UX-); this index maps D-/J-/Q- IDs to ADRs.

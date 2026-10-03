# 0003. Czech banking practice decides disputed formulas

- Status: Accepted
- Amended by: ADR 0081
- Date: 2026-09-30 (taken before the refactor programme; recorded in P0)
- Source IDs: D-03

## Context

The engine's first parity targets came from an earlier spreadsheet model, and parts of it
disagreed with how Czech banks actually compute mortgages (fixation resets, due dates). Copying
a known-wrong formula forever is not acceptable, nor is silently drifting from verified targets.

## Decision

**Czech banking practice wins** where a formula is in doubt. Parity targets are re-baselined
with owner sign-off, and old → new values are recorded in the target change log.

## Consequences

The rule is part of the auto-loaded parity rule (`.claude/rules/engine-parity.md`). Each
re-baseline is an ADR (for example ADR 0021, ADR 0080).

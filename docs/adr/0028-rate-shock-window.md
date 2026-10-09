# 0028. Rate-shock window starts at each loan's fixation end

- Status: Accepted
- Amended by: [0162](0162-floating-block-rate.md) (a floating block)
- Date: 2026-09-30
- Source IDs: D-28, J-15

## Context

The start of the rateShock durationYears window was undefined (spec finding K, J-15).

Options considered for J-15 (`rateShock` window start): (a) from the base date; (b) from each loan's next refix. Recommendation at planning: (b) (matches "at refix"). P02 recommendation: see P02-mortgage-audit.md §7

## Decision

**Rate-shock window (answers J-15):** option (b) — the window starts at each loan's own fixation end (today's behaviour).

## Consequences

No change; document in SPEC (P11).

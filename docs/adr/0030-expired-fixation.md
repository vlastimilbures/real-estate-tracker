# 0030. Expired fixation without a successor block

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-30, J-21
- Amended by: [0129](0129-loan-schedule-edge-cases.md) (the "Fixation ended" warning)

## Context

A fixation that ended before baseDate with no successor block kept compounding at the original rate (J-21).

Options considered for J-21 (Expired fixation with no successor block (C-19, DR-100)): (a) keep FV at the original rate; (b) replay the opening with the reset at the true fixation end + warning "enter the refix terms". Recommendation at planning: (b) — P02 §7

## Decision

**Expired fixation without a successor block (answers J-21):** option (b) — replay the opening balance on the loan's own due dates with the reset applied from the true fixation end, and warn the owner to enter the refix terms as a new block.

## Consequences

P4b fixes DR-100 with a failing test first; the warning is user-visible under D-01. No seed parity change.

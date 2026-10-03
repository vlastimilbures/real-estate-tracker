# 0009. Ad-hoc code signing

- Status: Accepted
- Date: 2026-09-30 (taken before the refactor programme; recorded in P0)
- Source IDs: D-09, Q-01

## Context

The app runs on the owner's own Mac. A Developer ID costs money and notarisation adds release steps with no benefit for one machine.

## Decision

**Signing: ad-hoc signing** (free; fine for the owner's own Mac). Developer ID signing and notarisation stay documented as an optional future step.

## Consequences

Q-01 is closed. P8 implements ad-hoc signing plus a written notarisation plan.

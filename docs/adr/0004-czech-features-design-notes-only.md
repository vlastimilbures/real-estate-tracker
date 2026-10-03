# 0004. Unmodelled Czech mortgage features: design notes only

- Status: Accepted
- Date: 2026-09-30 (taken before the refactor programme; recorded in P0)
- Source IDs: D-04

## Context

Several Czech mortgage features (prepayment at fixation end, the annual penalty-free allowance, first-month interest, payment day) are not modelled. Building them would change numbers and widen scope during a hardening programme.

## Decision

**Czech features not modelled today** (prepayment at fixation end, an annual penalty-free prepayment allowance, first-month interest, payment day) are **flagged, with design notes; nothing is built**.

## Consequences

P2 outlines them; P4c writes `docs/design/` notes only.

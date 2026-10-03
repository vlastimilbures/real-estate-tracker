# 0058. Remove the Currency tab; CZK is locked

- Status: Accepted
- Date: 2026-10-01
- Source IDs: D-58, Q-04

## Context

A Currency settings tab existed although CZK is locked and FX is out of scope (Q-04).

Options considered for Q-04 (Purpose of the **Currency** settings tab (CZK locked)): Keep / simplify / remove. Recommendation at planning: **Remove** (P06 UX-017: choosing €/$/£ relabels CZK amounts without conversion). P06-ux-audit.md §3.7

## Decision

**P6 gate (2026-10-01, answers Q-04):** Q-04 — remove the Currency tab and lock CZK (UX-017). Quick-win list approved as proposed: Tier 1 + Tier 2 of P06-ux-audit.md §3.9 (UX-017…UX-022, UX-024…UX-035, UX-038, UX-040, UX-044 within their QW scope). DR-054 (one "today" anchor) is decided in P7, with a test written first. The manual check sheet is still to be run by the owner.

## Consequences

P7 scope = these quick wins + the PLAN P7 state refactor; each change gets a UX row when implemented.

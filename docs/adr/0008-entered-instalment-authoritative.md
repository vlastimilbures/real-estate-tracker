# 0008. The entered instalment is authoritative for loan term

- Status: Accepted
- Date: 2026-09-30 (taken before the refactor programme; recorded in P0)
- Source IDs: D-08, J-02

## Context

Seed instalments do not match any round contract term; the term is derived as ceil(NPER(rate, instalment, principal)) (spec finding B).

## Decision

**The entered instalment is authoritative for loan term.** The term stays derived from the instalment (NPER). A contract maturity date, if the owner enters one, is used only as a consistency check with a warning.

## Consequences

J-02 is closed. Finding B causes no parity change. P2 reports each loan's implied term; P4b may add an optional maturity field and warning (a UX change under D-01).

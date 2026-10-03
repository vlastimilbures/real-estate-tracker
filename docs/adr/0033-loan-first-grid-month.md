# 0033. Loan starting in the first grid month after baseDate

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-33, J-24

## Context

A loan starting just after baseDate was counted as drawn at baseDate (J-24).

Options considered for J-24 (Loan starting in the first grid month after baseDate (DR-106)): (a) opening balance 0, loan appears as new debt in month 1; (b) keep today's (drawn at baseDate). Recommendation at planning: (a) — restores the conservation identity; no seed parity change

## Decision

**Loan starting in the first grid month after baseDate (answers J-24):** option (a) — the opening balance is 0; the loan appears as new debt in the month it is drawn.

Related follow-up decisions:

- **D-44**: **Tranche dated after baseDate within grid month 1 (answers DR-121):** option (b) — the D-33 rule applies to tranches too: the opening (baseDate) debt includes only tranches dated on or before baseDate; a later tranche is new debt in the month it lands.

## Consequences

P4b fixes DR-106; the `it.fails` conservation test becomes a normal test. Year-0 debt/equity/LTV change only for that case; seed parity unchanged.

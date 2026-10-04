# 0024. Draw re-amortization timing

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-24, J-06
- Amended by: ADR 0120 (a tranche on an agreed instalment's payment re-amortizes the next payment)

## Context

The spec contradicted itself: re-amortize on landing vs the first month after a draw (spec finding I, J-06).

Options considered for J-06 (Draw re-amortization timing): (a) on landing; (b) the first month after the draw. Recommendation at planning: Decide from P2 evidence. P02 recommendation: see P02-mortgage-audit.md §7

## Decision

**Draw re-amortization timing (answers J-06):** option (a) — re-amortize in the month the draw lands (today's behaviour, matches the reference). The trigger must fire only on real events (DR-102).

Related follow-up decisions:

- **D-41**: **Tranche landing between the last payment and baseDate (answers the P4b D-17 gate, DR-016):** option (a) — a development-loan tranche dated after the last payment due by baseDate and on/before baseDate joins the payment period it lands in (the one closing at grid month 1), is added before that month's split and re-amortizes there (D-24). The baseDate debt includes it. The P02 reference model gets the same rule (its opening fold skipped the D-24 trigger).
- **D-42**: **Tranche dated on the loan start (answers the P4b D-41 gate, DR-120):** reject it. A development-loan draw must be dated strictly after the loan's start date; money drawn on the start date belongs in the initial principal. `DRAW_BEFORE_START` becomes "on or before start" and makes the engine raise a typed error.
- **D-44**: **Tranche dated after baseDate within grid month 1 (answers DR-121):** option (b) — the D-33 rule applies to tranches too: the opening (baseDate) debt includes only tranches dated on or before baseDate; a later tranche is new debt in the month it lands.
- **D-46**: **Tranche in a future development loan's draw month (answers DR-122):** option (a) — a tranche dated after the start and landing in the same grid month as the loan's first draw joins that draw: the draw row's balance includes it, and the instalment is sized over the full term on the combined amount (D-24/D-31, the D-41 rule applied to a future loan). The P02 reference model gets the same rule under `openingDraws: "nextPeriod"`.

## Consequences

P4b fixes DR-102 (`greaterThan(ZERO)`) together with D-31. No seed parity change.

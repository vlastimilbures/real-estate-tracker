# 0016. Seed the sample portfolio only on first run

- Status: Accepted
- Amended by: ADR 0081
- Date: 2026-09-30
- Source IDs: D-16, J-18

## Context

The app re-seeded the sample flats whenever the portfolio became empty, bringing deleted data back (J-18).

Options considered for J-18 (Sample-portfolio re-seed when empty (DR-024, P01)): (a) seed only on first run (flag in DB); (b) never seed, show onboarding; (c) keep. Recommendation at planning: (a)

## Decision

**Sample seed (answers J-18):** seed the sample portfolio **only on first run**, recorded by a flag in the DB; an empty portfolio later stays empty.

## Consequences

Data-safety hotfix after P3 (D-18) implements DR-024 with a failing test first. User-visible change under D-01.

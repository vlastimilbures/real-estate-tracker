# 0084. Horizon-dependent labels name the configured horizon

- Status: Accepted
- Date: 2026-10-03
- Source: issue #12 (pre-release review 2026-10)

## Context

The projection horizon is set in Settings → Assumptions (1–100 years, ADR 0075), but several
labels hardcoded 30: the Dashboard "30-year trajectory" heading, the KPI rows "Cumulative net
cash flow (Yrs 1–30)" and "Σ principal repaid (Yrs 1–30)", and the Property detail "30-year
projection" panel. With any other horizon the labels misstated the period of the numbers. The
Czech and Russian "Net worth in N years" tile and IRR foot also used one plural form for every N
("za 2 let", "через 21 лет").

## Decision

Owner, 2026-10-03:

- These labels take the horizon in years and print it, in all three languages.
- "Net worth in N years" and the Czech/Russian IRR foot pick the plural form for N
  (`enPlural`, `csPlural`, `ruPlural`).
- The Guide and About texts, which are static, describe "the horizon (30 years by default)"
  instead of a fixed 30. The Guide's worked examples ("1.0M in 30 years ≈ 477k",
  "5× over 30 yrs ≈ 5.5%/yr") stay: they are arithmetic examples, not labels of the
  user's numbers.

## Consequences

Copy only; no computed number changes. With the default horizon (30) the Dashboard and
Property detail read as before.

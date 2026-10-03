# 0087. Real lens: real net-worth multiple and cumulative cash flow

- Status: Accepted
- Date: 2026-10-03
- Source: issue #11 (pre-release review 2026-10, finding A01)

## Context

In the Real lens the Dashboard shows the deflated net worth at the horizon, but the net-worth
multiple and the cumulative net cash flow stay nominal under the hint "real terms where
applicable". On the sample portfolio the hero tile reads a real net worth next to "4.85x",
although the real multiple is about 2.31x. Scenario compare labels its cumulative cash-flow
row "(nominal)" in the Real lens and its multiple row does not change at all.

## Decision

Owner, 2026-10-03: compute the real values in the engine, not only relabel them.

1. **`netWorthMultipleReal = netWorthReal / equity₀`.** CPI₀ = 1, so equity₀ is already in
   base-date Kč; this is the base `cagrReal` uses. Like the nominal multiple it is 0 when
   equity₀ is 0.
2. **`cumulativeNetCashFlowReal = Σ_{t=1..N} (netCF_t − acqOutflow_t) / CPI_t`.** Each year is
   deflated by its own index (the one the real IRR uses), not the total by the horizon index.
3. **Every Dashboard KPI row follows the lens or says it is nominal.** The multiple and the
   cumulative cash flow follow the lens; Σ principal repaid stays nominal and is labelled
   "(nominal)" in the Real lens. The hint reads "real terms (base-date Kč)".
4. **The hero tile foot reads "×N from projection start · {lens}"** with the lens-matched
   multiple.
5. **Scenario compare** shows the lens-matched multiple and cumulative cash flow; the
   "(nominal)" cash-flow label is dropped.
6. **Guide:** real values are deflated to the projection start (base date), so a Today
   snapshot dated after it reads slightly below nominal (ADR 0023).

## Consequences

Nominal figures, the parity targets and the bench budgets are unchanged. The two new
`PortfolioKPIs` fields are listed in the golden test's `ADDED_FIELDS`, so the golden-master
hashes stay comparable. Real-lens Dashboard and scenario-compare figures change
(user-visible).

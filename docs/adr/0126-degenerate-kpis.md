# 0126. Degenerate KPIs: no growth base, debt-free from, no-debt badge

- Status: Accepted
- Date: 2026-10-04
- Source: issue #129 (2026-10 code review, findings G1-1-04, R2-04, G2-1-06, R2-05, G2-1-01)
- Amends: [0034](0034-cagr-null.md) (CAGR null), [0087](0087-real-lens-multiple-cumulative-cf.md)
  §1 (real multiple 0 when equity₀ = 0)
- Related: [0017](0017-reject-invalid-loan-inputs.md) (no NaN), [0022](0022-year-labelling.md),
  [0089](0089-compare-owner-loss.md), [0121](0121-first-positive-cash-flow-strict.md)

## Context

Five headline figures told the owner the opposite of the truth when their inputs were
degenerate. Probes on the sample portfolio:

- **Negative multiple.** A 70 % crash at Today leaves equity₀ at −896,405 Kč. Net worth grows
  to 27.95 M Kč by the horizon, and the multiple read **−31.19x**. The multiple only guarded
  equity₀ = 0.
- **"NaN %" CAGR.** A 90 % crash in year 1 with a 3-year horizon leaves net worth at
  −5.30 M Kč. A negative base to the power 1/N is NaN in decimal.js, and a NaN `Decimal` is a
  truthy object, so the tile and the compare row printed "NaN %". ADR 0017 promises that the
  engine never produces NaN. With a 1-year horizon the CAGR was a finite −132 %.
- **0,00x.** A Dashboard filtered to a planned purchase has equity₀ = 0. The multiple read
  "0,00x" (a total loss) next to CAGR "—".
- **Stale debt-free year.** The sample is debt-free from 2052. A planned loan drawn in 2053
  still showed "Debt fully repaid: 2052" with 4.68 M Kč owed in 2056: the search stopped at
  the first year at zero.
- **"Shortfall" with no debt.** DSCR is null with no debt service, and its band word is null
  on purpose. The Dashboard and Property detail tiles replaced the missing word with
  "Shortfall" / "Short", so every debt-free flat (and the whole sample from 2052) showed a
  warning. The Properties table showed a plain "—" for the same state.

The sixth finding of #129 (LTV and yields read 0 % when the value is 0) needs a wider type
change and has its own ADR (0130).

## Decision

The owner chose option A of #129 on 2026-10-04, split in two PRs. This ADR covers items 1–4
and 6.

1. **Multiple.** `netWorthMultiple` and `netWorthMultipleReal` are `null` when equity₀ ≤ 0:
   there is no growth base, as for the CAGR (ADR 0034). With equity₀ > 0 the multiple keeps
   any sign: a negative multiple then means the owner lost more than the starting equity.
   This replaces "0 when equity₀ = 0" (ADR 0087 §1). The tile, the KPI list and the compare
   show "—".
2. **CAGR.** `cagrNominal` and `cagrReal` are `null` when equity₀ ≤ 0 **or** the end value
   (net worth at N, nominal or real) ≤ 0. A growth rate to or below nothing is undefined.
   This extends ADR 0034.
3. **Debt-free year.** `debtFreeYear` is the first year t ≥ 1 from which the portfolio
   balance stays at or below half a haléř through year N, provided the portfolio carried
   debt in some year up to t. It is `null` when debt is still owed at N, or when the
   portfolio never carried debt. For a portfolio that repays once and never borrows again
   (the sample) the year does not change.
4. **No debt, no badge.** A null DSCR shows "—" with no badge on the Dashboard and Property
   detail tiles, as the Properties table does. One helper (`dscrBadge` in
   `src/ui/model/health.ts`) builds the badge for all tiles; the unused "Short" text is
   removed.

## Consequences

- `PortfolioKPIs.netWorthMultiple` and `netWorthMultipleReal` become `Decimal | null`. The
  Dashboard hero foot reads "— from projection start" when there is no base.
- Parity targets do not change: the sample's equity₀ and net worth at N are positive and it
  borrows once (debt-free 2052). The golden master does not change: no fixture has a
  multiple of 0 or below, a CAGR with a non-positive end, or debt drawn after a repaid year.
- Scenario compare: a "—" multiple or CAGR on Base gives the Δ note "Base has no value".
- LTV and yields at a value of 0 stay as they are until ADR 0130.

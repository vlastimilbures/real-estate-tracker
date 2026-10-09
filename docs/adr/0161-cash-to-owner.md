# 0161. Cash to owner: the row the cumulative cash flow tile sums

- Status: Proposed
- Date: 2026-10-09
- Source: issue #117 (2026-10 code review, finding R8-04; R2-17 done in PR #287); owner
  decision D2 (2026-10-08: option A, the projection carries the row); Track 11 PR 11.12
- Amends: [0109](0109-loan-prepayments-and-recasts.md) (§11: the cumulative cash flow is
  named cash to owner, and the projection shows it as its own row)
- Related: D-47 (refinance cash), [0087](0087-real-lens-multiple-cumulative-cf.md) (real
  lens), [0124](0124-pre-purchase-debt-service.md) (debt service before a future buy),
  [0134](0134-acquisition-cash-gaps.md) (acquisition outflow)

## Context

The Dashboard tile "Cumulative net cash flow (Yrs 1–N)" and the projection grid column
"Net CF" used the same words for different numbers. The column is operating cash only
(NOI − debt service). The tile also subtracts acquisitions, prepayments with their fees and
the debt service paid before a future buy, and adds net refinance cash (SPEC §4.6). On the
sample portfolio they agree. After one prepayment they do not: with a 1,000,000 Kč
`shortenTerm` prepayment and a 5,000 Kč fee on Byt Lipova (2027-01-15), the tile is
1,005,000 Kč lower than Σ Net CF, and nothing on screen says why. The numbers are correct;
the name and the missing row are the problem. The Guide sentence "Prepayments are your own
cash, kept outside net cash flow and DSCR" invited the wrong reading.

## Decision

1. **Name.** The KPI is "cash to owner": net cash flow minus the cash outside it. The tile
   is "Cumulative cash to owner (Yrs 1–N)" (`dashboard.kpiCumulativeCashToOwner`), and the
   Scenarios compare row is "Cumulative cash to owner" (`scenarios.kpiCumulativeCashToOwner`).
   The KPI field names (`cumulativeNetCashFlow`, `cumulativeNetCashFlowReal`) stay.
2. **Engine row.** Each projection year carries `cashToOwner` =
   `netCashFlow − cashOutsideNetCf` (`src/engine/ownerCash.ts`). Year 0 is 0. A property's
   row carries its own share; in years before a future buy turns on it is minus the debt
   service paid on a loan drawn before the purchase (ADR 0124). The portfolio row is
   Σ net cash flow − the portfolio's cash outside it, not Σ of the property rows, so the KPI
   values keep every digit; the two agree to far below 1 haléř. The KPIs read the
   portfolio row: cumulative cash to owner = Σ_{t=1..N} cashToOwner_t, and the levered IRR
   vector uses it for years 1..N. The real lens deflates it by CPI_t like the other money
   fields, and its Σ is the real KPI.
3. **Grid and Excel.** The projection grid and its Excel export, on the Projections page and
   on a property's page, show a "Cash to owner" column right after "Net CF", always (it is
   not an optional column). Σ of the portfolio column over years 1..N is the tile.
4. **Guide.** The mortgages section says prepayments are "kept outside net cash flow and
   DSCR, but counted in cash to owner and the IRR".

## Consequences

- No KPI value, parity target or golden-master value changes. The golden master leaves the
  new field out (`ADDED_FIELDS`), so there is no snapshot change; `cash-to-owner.test.ts`
  pins it against the KPIs.
- An owner can reconcile the tile with the grid: Σ Cash to owner = the tile, and
  Net CF − Cash to owner in a year is that year's acquisition, refinance, prepayment and
  pre-purchase cash.
- The projections take the property schedules with their refinances (`PropertySchedule`),
  since refinance cash cannot be read from the rows.
- Not changed here (separate decision issues): a development successor's handover-month
  tranche counts as refinance cash while its other tranches do not; and a later first loan
  dated on or before baseDate on a future buy puts its cash in year 0, which the KPIs do not
  read.

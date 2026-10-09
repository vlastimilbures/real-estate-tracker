# 0165. Future purchases: acquired value, holding costs from the base date, pending debt

- Status: Proposed
- Date: 2026-10-09
- Source: issue #126 items 2 and 3 (2026-10 code review, findings R2-08 and R2-09) and its
  hand-off (d) from #104; owner decision D10 items 2, 3 and (d) = A (2026-10-09); Track 11
  PR 11.17
- Amends: [0124](0124-pre-purchase-debt-service.md) (its open point on the baseDate
  snapshot, which left out the debt a loan before a future purchase already carries),
  [0156](0156-pending-purchase-display.md) (§3: a pending row shows a debt it already owes;
  §5: the only-pending Dashboard totals include that debt)
- Related: [0134](0134-acquisition-cash-gaps.md) (principal repaid before baseDate),
  [0032](0032-value-reanchor.md) (the value curve), DR-092 (`draws`)

## Context

A property with a purchase date after the base date (a future purchase, for example an
off-plan flat) is supported (SPEC §4.5). Item 1 of #126 (how a pending property is shown) was
decided in ADR 0156. Three points remained:

- **Item 2, equity-change chart.** The Dashboard chart splits each year's equity change into
  appreciation, debt paydown and new debt drawn. Appreciation is the residual. In a future
  purchase's turn-on year the whole value of the flat enters equity and its loan enters
  `draws`, so the flat's value showed as appreciation (7.3 M Kč instead of 1.2 M Kč in the
  review's probe). The total was right; the split was not.
- **Item 3, holding costs.** The projection charged a future purchase's fixed holding costs
  at base-date prices in its turn-on year (`fixed0 × CPI_t ÷ CPI_tStart`). SPEC §4.5 says
  `fixed0 × CPI_t`: the costs are entered at today's prices and inflate from the base date.
  No ADR recorded the rebasing, and it undercharged future purchases.
- **(d), debt that already exists.** A pending property whose loan started before the as-of
  date (a loan drawn at contract) already owes that loan. The portfolio totals list owned
  properties only, so its debt was left out of total debt and net worth (about 3.9 M Kč in
  the #104 probe). ADR 0124 counts that loan's payments before the purchase; it left the
  snapshot open.

## Decision

1. **A projection year carries the value a purchase brings in.** `ProjectionYear` gets
   `acquiredValue`: in a future purchase's turn-on year it is the property's value at its
   purchase date, on the same value curve as `value` (the basis is anchored at the purchase
   date; a value shock or development ramp in force in that year applies as it does to
   `value`, so a shock starting in the turn-on year lowers the bought-in value and is not
   shown as negative appreciation). It is 0
   in every other year and for a property owned at baseDate, whose value is opening stock.
   The portfolio sums it and the real lens deflates it like every money field.
2. **The equity-change chart shows purchases apart from appreciation.** A fourth stack,
   "Purchases" (cs "Nákupy", ru "Покупки"), carries `acquiredValue`, and appreciation is the
   residual less it. The four stacks still sum exactly to the equity change. In the turn-on
   year appreciation is only the growth after the purchase; the Purchases bar and the new
   debt bar together show the owner's equity put in. The stack is shown only when some year
   has a purchase, so a portfolio owned at baseDate looks as before. A development
   property's construction ramp after its purchase stays in appreciation (#120). The
   chart subtitle `dashboard.subEquityChange` now names the parts: "appreciation,
   purchases and debt" (cs "zhodnocení, nákupy a dluh", ru "рост стоимости, покупки и
   долг"); the old "appreciation + debt repayment" already left out new debt.
3. **Fixed holding costs inflate from the base date, as SPEC §4.5 says.** Year `t` charges
   `fixed0 × CPI_t`, pro-rated by the months owned in the turn-on year, for every property.
   A future purchase is no longer rebased to its turn-on year. Variable costs (a share of
   rent) are unchanged.
4. **A pending property's existing debt counts in the portfolio totals.** The baseDate (and
   any as-of) snapshot adds the debt of every active property that is not owned yet to
   `totalDebt`, so `totalEquity` (net worth), LTV and the weighted rate include it. Its debt
   is non-zero only when its loan is already drawn at the as-of date, so a loan that starts
   at the purchase adds nothing. Its value is not counted: the owner owes the loan but does
   not own the flat yet. This is the conservative reading, like ADR 0124. Value, rent,
   costs, NOI, debt service, net cash flow and DSCR stay owned-only: the payments before the
   purchase are already owner cash in the projection KPIs (ADR 0124).
5. **Properties shows that debt.** A pending row keeps "—" in its figure columns (ADR 0156
   §3) except debt, which shows the loan when it is already owed, so the rows add up to
   the Dashboard's total debt. A Dashboard with only such a pending purchase active shows
   that debt, net worth of minus that debt and LTV "n/a" (ADR 0156 §5 said 0 Kč and 0 %).

## Consequences

- **Golden master moves** for the mixed fixture's future buy (decision 3): its projection
  rows and the mixed runs' cumulative cash flow and IRR (the base, acquisition-cost, funding,
  scenario and horizon-5 runs). Net worth, CAGR and the seed runs do not move. The snapshot
  is updated in the same commit as this ADR (ADR 0039). `acquiredValue` joins the golden
  `ADDED_FIELDS`. The #117 pin in `cash-outside-net-cf.test.ts` moves with it.
- **Parity targets do not change**: the sample portfolio has no future purchase, so no row
  is added to the target change log.
- Decision 4 moves no golden hash: no golden case has a loan drawn before a future purchase.
  `pending-debt-totals.test.ts` pins it on the `mixedCashOutside` fixture.
- Not changed: the projection treats a pending property as an empty year in year 0 and
  every year before its turn-on year, so equity₀ (the growth base of the multiple and CAGR,
  and the IRR's opening outflow) leaves the pending debt out, and that debt enters the
  projection as drawn in the turn-on year (DR-092). The Dashboard reads today and dates
  inside the records' window from the snapshot (debt included) and later as-of dates from
  projection years (debt left out until the purchase), so net worth can rise by that debt
  when the as-of moves from the snapshot to a projection year before the purchase. Those
  year tiles keep today's weighted rate, which weights the pending debt. Recorded in
  `docs/model-limitations.md`.
- Tests: `acquired-value.test.ts`, `pending-debt-totals.test.ts`, the holding-cost cases in
  `future-rent-gating.test.ts`, the purchases cases in `chartData.equityChange.test.ts` and
  `DashboardEquityChange.test.tsx`, and the pending-debt cases in
  `LifecycleStates.test.tsx`.

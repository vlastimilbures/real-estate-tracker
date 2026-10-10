# 0170. Equity-change chart: a development loan's value and debt follow its draws

- Status: Accepted
- Date: 2026-10-10
- Source: owner report (2026-10-10). In the Dashboard's "Equity change by year" chart, a
  development flat bought after baseDate shows its whole completed value and its whole loan
  in the purchase year, although the bank draws the loan over about two years. Owner
  decision: plan approved on 2026-10-10. Each draw shows as value and new debt of equal size
  in its year, in the Purchases stack, renamed "Purchases & construction".
- Amends: [0169](0169-development-drawn-debt-display.md) (decision 6: the equity-change
  chart keeps committed debt), [0166](0166-development-committed-debt.md) (decision 5: the
  chart's new-debt stack is `committedDraws`)
- Related: [0165](0165-future-purchases.md) (the Purchases stack),
  [0003](0003-czech-practice-decides.md), [0001](0001-behaviour-change-gate.md)

## Context

ADR 0169 shows the drawn debt `B` and the value less the undrawn tranches `V − U` in the
value and debt chart, the Projection grid and the tiles. The equity-change chart kept ADR
0166's committed view (ADR 0169 decision 6):

- A future development buy shows its completed value `V` as a purchase, and the whole loan
  `L` as new debt, in its turn-on year. The later tranche years show no bars.
- On a development flat owned at baseDate, the draws never show.

Czech banks pay a development loan in tranches against construction progress, which their
technical supervision checks against the invoices. The bank reports the drawn balance as
debt and the undrawn part as a commitment. The collateral's value grows with the
construction. So a draw is value and debt added in the same year, with no equity effect.

## Options

- **A: the stacks follow the shown figures (chosen).** The new-debt stack shows the drawn
  new debt (`draws`, as in the grid's New debt column). The Purchases stack adds the value
  each development draw releases, `draws − committedDraws` (the fall in the undrawn
  tranches). The two cancel, so the bar's total stays the equity change.
- B: keep the committed view (ADR 0169 decision 6). The chart would disagree with the value
  and debt chart beside it.
- C: a separate "Construction" stack. One more colour and legend item for the same value
  that a purchase brings.

## Decision

1. **The fall in the undrawn tranches is split by what it is.** It is
   `released = draws − committedDraws`, zero for a plain loan, whose draw is still cash in
   and not value. The part that is value, `built`, is `released` kept between
   `−acquiredValue` and `draws`:
   - a development draw releases its value (up to the year's draws);
   - a purchase brings in its value less the tranches it has not drawn yet (a negative
     `released`, down to the value bought in).

   The rest is a commitment change with no value, such as a refinance handover into a
   development loan, which commits its tranches before any is drawn.

2. **Purchases = value bought in + `built`; new debt = `−(draws + refinanced)` plus the
   commitment change `released − built`.** A handover that commits tranches shows them as
   new debt in its year, as ADR 0166 did. The Purchases stack is never negative.
3. **Appreciation stays the residual**, and does not change: purchases + new debt still
   equal `acquiredValue − committedDraws − refinanced`. The four stacks still sum exactly
   to the equity change, under both lenses: `draws` and `committedDraws` are flows
   deflated by one year factor, so no inflation residual shows as a bar.
4. **The stack's legend** `dashboard.seriesPurchases` reads "Purchases & construction" (cs
   "Nákupy a výstavba", ru "Покупки и строительство"). It shows whenever some year has a
   purchase or a development draw, so also for a development flat owned at baseDate.
5. **The Guide's development-loan text** says the equity-change chart shows each draw as
   construction value and new debt of the same size.

## Consequences

- A future development buy's turn-on year shows `V − U` as a purchase and the amount drawn
  as new debt. Each later tranche year shows the tranche in both stacks.
- No computed figure changes: equity, the KPIs and the value and debt chart do not move.
  The golden master and the parity targets do not change.
- Own funds have no payment dates (ADR 0119, ADR 0166), so the chart cannot show the owner's
  own payments as construction progress. Bars are yearly: a draw shows at the end of its
  projection year.
- A handover into a development loan shows its tranches twice as new debt: committed in
  the handover year, and drawn in their own year, with the value beside it. Equity is
  right in both years.
- Tests: `chartData.equityChange.test.ts` (the tranche years of an owned flat and of a future
  buy, under both lenses; a handover into a development loan; a plain draw adds no purchase; Σ purchases = Σ value bought in);
  `DashboardEquityChange.test.tsx` (the legend).

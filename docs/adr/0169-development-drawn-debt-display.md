# 0169. Development loans: show the drawn debt, and the value less the undrawn tranches

- Status: Accepted
- Date: 2026-10-10
- Source: owner report (2026-10-10). A development loan drawn in tranches over two years
  shows its whole amount as debt from its start in the charts and the projection grid,
  which is misleading. Owner decision: plan approved on 2026-10-10, with these choices:
  the value is the completed value less the undrawn tranches, the LTV stays the bank's,
  and the undrawn amount stays visible (a dashed line, a grid column and the tile
  sub-line).
- Amends: [0166](0166-development-committed-debt.md) (decision 5: the UI shows committed
  debt)
- Amended by: [0170](0170-equity-change-drawn-debt.md) (decision 6: the equity-change
  chart follows the draws)
- Related: [0003](0003-czech-practice-decides.md), [0039](0039-golden-master.md),
  [0001](0001-behaviour-change-gate.md), [0167](0167-drawdown-schedule.md)

## Context

ADR 0166 values a development flat at its completed value `V` and counts the whole loan
`L` as committed debt: the drawn balance `B` plus the tranches not drawn yet `U`. Equity
is `V − (B + U)`. This keeps the return KPIs honest: a tranche draw creates no equity.
The UI shows `B + U` wherever debt sits beside equity, so a loan drawn over two years
appears in full on its first day.

A bank reports the drawn (outstanding) balance as debt and the undrawn facility as a
separate commitment. During construction it measures LTV as the whole loan ÷ the completed
value (loan to gross development value).

## Options

- **A: show the drawn debt `B` and the value `V − U` (chosen).** Each draw lifts the
  debt and the value by the same amount, so the equity `(V − U) − B = V − (B + U)` and
  every KPI stay exactly as in ADR 0166.
- B: carry the property at cost paid so far (own funds + drawn debt) and revalue it to `V`
  at completion (IAS 40, property under construction). Own funds have no payment dates
  (ADR 0119), and the uplift would move to completion, which changes the multiple, CAGR
  and IRR. Rejected for now: it needs a dated own-funds payment schedule.
- C: show the drawn debt beside the full value `V`. Value − debt would no longer equal
  equity. Each draw would look like an equity loss.

## Decision

1. **The engine reports two more figures.** `ProjectionYear.undrawnDebt` =
   `committedDebt − balance` and `ProjectionYear.reportedValue` = `value − undrawnDebt`.
   The same pair is on `PropertySnapshot`. `PortfolioSnapshot` has `totalUndrawnDebt` and
   `totalReportedValue`; only an owned property has undrawn debt. The real lens deflates
   them like the other money fields. `value`, `committedDebt`, `equity` and `ltv` do not
   change. So `reportedValue − balance = equity`.
2. **Debt shown = the drawn balance; value shown = `reportedValue`.** This applies to the
   value and debt chart, the Projection grid and its export, the Dashboard hero foot, the
   Property detail value and debt tiles, and the Properties list.
3. **The undrawn amount stays visible.**
   - The value and debt chart adds a dashed "Committed debt (incl. undrawn)" line
     (`committedDebt`) only for a portfolio or property with a tranche ahead. It is
     plotted in each year with a tranche ahead and in the year after, so it ends on the
     drawn line.
   - The Projection grid and its export add an "Undrawn" column (cs "Nečerpáno", ru "Не
     выбрано") after Debt, shown only when some year has a tranche ahead.
   - The debt tiles' sub-line now reads "plus {amount} still to draw" (cs "plus {amount}
     k dočerpání", ru "плюс {amount} к выборке"). The Dashboard hero foot puts it in brackets right after the debt. The
     Properties list shows it under the debt. The Property detail value tile adds
     "completed value {amount}" (cs "hodnota po dokončení {amount}", ru "стоимость после
     завершения {amount}") while a tranche is ahead.
4. **New debt is the drawn new debt.** The grid's "New debt" column shows `draws`, so the
   Debt column reconciles year to year with the drawn balance.
5. **LTV stays the bank's:** the whole loan ÷ the completed value (ADR 0166 §3). Beside the
   shown figures it is therefore higher than debt ÷ value while a tranche is ahead. The
   Guide's LTV text says so.
6. **The equity-change chart does not change.** Equity does not change, and its new-debt
   stack stays `committedDraws`.
7. **The Guide** updates the Value, Debt and LTV definitions and the development-loan
   prose.

## Consequences

- No computed KPI changes. The golden master does not move: the four new fields join the
  golden `ADDED_FIELDS`, and every existing hash is unchanged.
- Parity targets do not change: the sample portfolio has no development loan.
- The charts are yearly (year end), so a drawdown over two years shows as steps at the
  year ends.
- Tests: `dev-committed-debt.test.ts` (the identity, the draw steps, the snapshot totals);
  the snapshot = projection invariant for both new fields in `invariants.test.ts`;
  `devDrawnDebt.test.ts` (chart rows, the committed line, the grid columns);
  `CommittedDebt.test.tsx` (tiles); `Properties.test.tsx` (the list).

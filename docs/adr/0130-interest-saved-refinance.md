# 0130. Interest saved only when a prepayment applied; refinance difference apart from draws

- Status: Accepted
- Date: 2026-10-04
- Source: issue #172 items 1 and 2 (2026-10 code review, findings R9-01, R1-05, R9-02);
  item 3 (R8-03) stays open in #172
- Amends: [0116](0116-prepayments-ui-and-review-fixes.md) §9 (interest saved) and §12
  (optional columns), DR-092 (what `drawn` / `draws` hold),
  [0027](0027-one-active-block.md) and [0021](0021-schedule-calendar.md) (D-47: the handover row)
- Related: [0109](0109-loan-prepayments-and-recasts.md) (event outcomes),
  [0039](0039-golden-master.md) (golden master added fields)

## Context

The 2026-10 code review found two problems with figures that the prepayment UI (ADR 0116)
shows for the first time.

- **R9-01, R1-05: interest saved can be negative, or 0 instead of hidden.** ADR 0116 §9
  keeps recasts on both sides of the comparison. A recast to a lower instalment that does
  not cover the next month's interest is ignored (`RECAST_INSTALMENT_BELOW_INTEREST`).
  Without the prepayment the balance is higher, so the recast is ignored; with it the same
  recast applies and stretches the loan. The figure then measures the recast, not the
  prepayment: −2,879,388 Kč (seed `lipova`) and −433,551.87 Kč (seed `javorova`, a
  300,000 Kč prepayment and a 5,000 Kč instalment on 17.01.2031) were found. The engine
  also tested the blocks as entered: when every prepayment was dropped (for example
  `PREPAYMENT_REPLACED`), both chains were equal and the figure was 0, not null. The
  property page then showed "0 Kč" while the Dashboard hid the line, and the Dashboard
  summed negative figures into its total.
- **R9-02: a planned refix makes the "Drawn" and "Draws" columns appear.** A successor
  block's handover row carried the net new debt in `drawn` (D-47, DR-092): the successor's
  principal less the predecessor balance it pays off. With the payoff balance typed to the
  haléř the residue was 0.0000287 Kč, so the column showed "0 Kč" cells; with a rounded
  1,386,000 Kč it showed −249.89 Kč; with a 200,000 Kč paydown at the refix, −200,000 Kč. It
  read as borrowing that never happened, on screen and in both Excel exports.

## Decision

The owner chose option A for both items on 2026-10-04.

1. **Interest saved needs an applied prepayment (R9-01, R1-05).** The engine computes
   interest saved as ADR 0116 §9 says, but returns null unless one of the chain's
   prepayments repaid some principal: an event outcome of kind `prepayment` with
   `applied > 0`. A prepayment that was replaced, came after payoff or met a zero balance
   no longer gives 0.
2. **A negative figure is not shown as saved.** The engine keeps the sign. One display
   rule in `ui/model/financing.ts` (`interestSavedShown`) serves the property page and the
   Dashboard financing panel:
   - null stays hidden;
   - a figure of 0 or more is shown;
   - a negative figure shows the note "n/a: a recast depends on the prepayment" instead
     of an amount.

   The Dashboard total sums only the figures shown. A property with the note is listed
   after the others, with the note. When no property has a figure, the total shows the
   note too.

3. **The refinance difference has its own field (R9-02).** `AmortizationRow` and
   `ProjectionYear` gain `refinanced`: on a handover row, the successor's principal less
   the predecessor balance it pays off (after the prepayments paid at the handover,
   ADR 0109); zero in every other month. `drawn` and `draws` hold only real new debt: a
   loan's draw, a tranche, the debt a property comes online with (DR-092). On a handover
   row that is a tranche drawn in that month, or the predecessor's own draw when it draws
   in the handover month. The row identity becomes
   `endBalance = previous − principal − prepaid + drawn + refinanced`; the projection
   year's balance moves by `draws + refinanced` the same way.
4. **A "Refinance difference" column.** The amortization table, the projection grid and
   both Excel exports show it as an optional column (en "Refinance difference",
   cs "Rozdíl při refinancování", ru "Разница при рефинансировании").
5. **Optional columns hide sub-haléř values.** ADR 0116 §12's columns (Drawn, Prepaid,
   Prepayment fee, and now Refinance difference) are shown when some row has
   |value| ≥ 0.005 Kč, the same on screen and in the export. A refix typed to the haléř no
   longer shows a column of "0 Kč".

### What stays as it is

- Net refinance cash in cumulative net cash flow and the levered IRR (D-47) is read from
  the refinance handovers, not from `drawn`, so no KPI moves.
- The equity-change chart's drawdown bar carries `draws + refinanced`: its bars do not
  change.
- Interest saved keeps ADR 0116 §9's window, lens and fee rules; item 3 of #172 (the
  Dashboard label's time window) stays open there.

## Consequences

- Parity targets and golden values do not change: the sample loans have no successor block
  and no prepayment. The golden master hashes rows and years without `refinanced` (an added
  field, as `drawn` and `draws` are).
- User-visible: the "Drawn" / "Draws" columns no longer appear for a refix; a "Refinance
  difference" column appears instead when the difference is at least half a haléř. A
  negative interest saved shows the note, a replaced prepayment hides the line.
- `model-limitations.md` records that interest saved is not shown when a recast depends on
  the prepayment (option C of #172, dropping such recasts from the comparison, is not done).

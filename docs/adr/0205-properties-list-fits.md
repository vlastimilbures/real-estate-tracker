# 0205. Properties list: plain figures, a health marker and a totals row

- Status: Accepted
- Date: 2026-11-16
- Source: issue #379 (UX/UI review 2026-11, tracking #392); direction approved by the
  owner on 2026-11-15 (the issue's layout); acceptance delegated by the owner for the
  2026-11-15 run (comment on #392)
- Amends: [0085](0085-properties-long-names.md) (columns fit at 1280; a long name is cut
  sooner), [0156](0156-pending-purchase-display.md) (the Pending badge's place),
  [0158](0158-layouts-hold-in-czech-and-russian.md) (the two-line band pill and
  `bandPillParts` are retired), [0169](0169-development-drawn-debt-display.md) (the
  undrawn note's text and wrapping), [0189](0189-outcome-regions-pending-purchase-a11y.md)
  (its wrapped band badge rule is retired with the pill; the pending cells are unchanged)
- Related: [0195](0195-health-marker.md) (the marker), [0199](0199-icon-only-row-actions.md)
  (icon-only row actions), [0150](0150-one-asof-resolver.md) (the as-of rule the totals follow)

## Context

1. At 1280 × 800 the Properties table did not fit its own window: NOI was cut under the
   pinned actions, and with a long name Equity and NOI were gone.
2. LTV and DSCR were two-line pills ("28,1 % · / Conservative"), about 90 px wide, which
   made every row 64 px tall and broke the right alignment of the figures.
3. A development loan's "plus 3,0 M Kč still to draw" sat in a `nowrap` cell and widened
   the Debt column.
4. There was no totals row.

## Decision

1. **LTV and DSCR are plain figures** followed by the health marker of ADR 0195 (shape and
   colour, `HealthMarker`): the figure right-aligned, the marker after it. The band word
   stays in the cell for assistive technology and as the marker's tooltip
   (`ltvBandWord`, `dscrBandWord`). No debt (DSCR) or no value (LTV) reads as before, with
   no marker.
2. **A legend** under the table, hidden from assistive technology (each cell already says
   its band): "LTV ● Conservative ▲ Moderate ◆ High · DSCR ● ▲ Covers debt ◆ Shortfall",
   from the existing words and column labels.
3. **Undrawn debt** is a short second line under the debt figure that wraps inside the
   column: `common.undrawnDebt` reads "+3,0 M Kč to draw" (cs "+3,0 M Kč k dočerpání", ru
   "+3,0 M Kč к выборке"), on the Dashboard net-worth tile and the Property detail debt
   tile too (wording log). ADR 0169's meaning is unchanged.
4. **Rows** are one line, about 44 px (7 px above and below, 8 px each side of a cell: 16 px between columns); a
   pending purchase's badge and date or an undrawn note add a line under the figure. A
   long name is cut sooner (`clamp(6.5rem, 12vw, 22rem)`, full name on hover and as the
   button's name, ADR 0085), so Value stays in view beside the pinned actions in a
   narrow window.
5. **Totals row** (`tfoot`) when the list has two or more active properties: Net cash
   flow, LTV, DSCR, Value, Debt (with the portfolio's undrawn note), Equity and NOI, from
   the engine's portfolio snapshot under the page's as-of basis, as the Dashboard reads
   its tiles at Today with the "All" filter (`propertiesTotal`,
   `src/ui/model/properties.ts`, over `tilesForAsOf`). Nothing is summed or divided in
   the component. The figures are nominal Kč: the Properties page has no lens, as its
   rows; with the real lens on, the Dashboard's tiles differ by the deflator. The label
   says what is counted (issue #379): `properties.totalRow` ("Total"); with an inactive
   property listed, `properties.totalRowActive` ("Total, active properties"), since the
   portfolio leaves it out; with a pending purchase listed, `properties.totalRowOwned`
   ("Total, owned active properties"), since its value and flows are not owned yet. A
   pending purchase's drawn debt is in the Debt total, as on the Dashboard (ADR 0165).
   The legend shows only when some row has a marker.
6. **A pending purchase's badge** moves from beside the name to the line under it, before
   the purchase date ("Pending · Purchase on 15.03.2028"), and that line wraps inside the
   name column instead of widening it; the Inactive badge stays beside the name. The badge
   text, the date and ADR 0156's meaning are unchanged.
7. **Unchanged:** column order (risk and cash flow first, ADR 0085), the pinned name and
   actions columns, icon-only row actions (ADR 0199), the "not owned yet" cells (ADR
   0189), row click, the name button and keyboard drill-in.
8. **Retired:** the two-line band pill in the table and `bandPillParts`.

## Consequences

- At 1280 × 800 every column is visible without horizontal scroll in en, cs and ru, with
  the sample, a long name, a pending purchase and a development loan with tranches ahead
  (a new capture screen); the capture harness asserts it. At 900 × 600 the table still
  scrolls with pinned columns, with LTV, Net cash flow, DSCR and Value in view.
- The totals equal the Dashboard tiles at Today / All (a test).
- No computed number, stored data or export changes.

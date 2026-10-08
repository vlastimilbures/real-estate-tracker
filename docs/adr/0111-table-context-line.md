# 0111. Table context line and a visible export label

- Status: Accepted
- Date: 2026-10-03
- Source: issue #21 (pre-release review 2026-10, finding A06)
- Amended by: [0150](0150-one-asof-resolver.md) (Properties uses the Today basis of Property detail and names it),
  [0159](0159-excel-exports-carry-their-context.md) (the projection exports carry the
  context line as notes)

## Context

The Properties and Projections tables show amounts with no currency, period or date. The
Properties headers read "Value", "Debt", "NOI", "Net cash flow"; the cells drop the "Kč"
suffix, and nothing says that values are in force today while flows are per year. The
Projections grid mixes yearly flows with year-end balances without saying so. In Real mode
its subtitle reads "Year-by-year · real terms" and does not name the base date; that date
appears only in the sidebar footer ("Projection start 07.06.2026"). The Excel export is an
icon-only button: it has an accessible name, but no visible text.

Two ways to give the context were considered: units in each column header ("Value (Kč)",
"NOI (Kč/yr)") or one context line per page. Headers with units widen the 15-column
projection grid, and the grid headers are also the Excel column headers.

## Decision

Owner, 2026-10-03 (#21 plan): **a context line**, used the same way on both pages. Column
headers and the Excel column headers do not change.

1. **Properties subtitle:** "3 apartments · as of 03.10.2026 · amounts in Kč, flows per
   year". The date is the date the snapshot is evaluated at (today, or the projection start
   when today is earlier).
2. **Projections subtitle:**
   - Nominal: "Year-by-year · nominal Kč · flows per year, balances at year end".
   - Real: "Year-by-year · real terms (Kč at projection start 07.06.2026) · flows per year,
     balances at year end".
3. **The Excel export button shows its text**, "Export to Excel", next to the icon. It is
   the same component everywhere it appears (Projections, property projection and
   amortization, scenario compare), so all of them change. The visible text is the
   accessible name.

## Consequences

Text and layout only: no computed number, parity target, golden master, export content or
data change. New and changed strings in en, cs and ru. The export button is wider than the
icon it replaces; panel headers keep it on the title row.

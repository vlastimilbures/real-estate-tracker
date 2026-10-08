# 0108. Scenario compare: export to Excel

- Status: Accepted
- Date: 2026-10-03
- Source: issue #56 (Scenarios critical review after #15)
- Amended by: [0159](0159-excel-exports-carry-their-context.md) (the Real lens note names
  the base date; no opening-year net cash flow)

## Context

Projections and Property detail export their tables to xlsx (ADR 0064 save path, D-10 cell
rounding). Scenario compare has no export, so the user cannot take the key figures or the
yearly scenario series into a spreadsheet. The compare shows a Key figures table (money in
M Kč, one column per scenario, a Values / Δ vs Base toggle, ADR 0097), a (*) footnote for
rebased returns (ADR 0089), n/a IRR cells with a reason (UX-079), and three charts (net
worth, net cash flow, LTV) whose Table view lists whole Kč and percentages (UX-075). All of
it follows the Nominal / Real lens.

## Decision

1. **One Export to Excel button** in the Key figures panel header, next to the Values / Δ
   toggle. It writes one workbook for the whole compare: `scenario-compare-<lens>.xlsx`.
2. **Four sheets**, named in the UI language:
   - **Key figures**: a Metric column, then one column per compared scenario. The rows are
     the Values-view rows in screen order, including Δ net worth vs Base when Base is
     compared.
   - **Net worth**, **Net cash flow**, **LTV**: a Year column (calendar year), then one
     column per scenario, holding the rows the charts plot.
3. **Always values.** The export does not follow the Values / Δ toggle; a Δ is one formula
   in Excel.
4. **Typed cells, rounded as the app shows them in whole units** (D-10): money is whole Kč
   (`#,##0 "Kč"`, as in the Projection export and the chart Table view, not the M Kč of
   the screen table), the net-worth multiple 0.00x, CAGR, IRR and LTV 0.0 %, years as
   whole numbers. Every exported figure rounds to the text the compare shows.
5. **Missing values:** a figure without a value is an empty cell. An IRR without a value is
   the text "n/a", as on screen.
6. **Notes under the table**, after one blank row: the lens on every sheet; on Key figures
   also the rebased-returns footnote (when shown) and one "Scenario: reason" line per n/a
   IRR.
7. The workbook is built in the pure UI model and saved through the existing `src/state`
   platform facade (ADR 0064, ADR 0072). No new runtime dependency (exceljs is already
   used and lazy-loaded).

## Consequences

Display and export only: no computed number, parity target, golden master or engine output
changes. The xlsx writer gains multi-sheet workbooks, note lines and per-row cell kinds
(behaviour-neutral for the existing exports). New strings in en, cs and ru: four sheet
names and the Metric header; the existing sheet-name test checks the Excel limits. The
compare ux-capture screens show the new header button.

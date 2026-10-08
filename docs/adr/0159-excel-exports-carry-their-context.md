# 0159. Excel exports carry their context and open readable

- Status: Accepted
- Date: 2026-10-08
- Source: issue #123 (2026-10 code review, findings G2-2-03, R4-07, G2-2-13, G2-2-06,
  G2-2-05, G2-2-07); owner decision D9 (2026-10-08: option A, the whole batch); Track 11
  PR 11.10
- Amends: [0111](0111-table-context-line.md) (the context line now also goes into the
  projection exports), [0108](0108-scenario-compare-xlsx-export.md) (the Real lens note names
  the base date; the net cash flow sheet and chart have no opening-year value)
- Related: [0010](0010-excel-export-rounded.md) (cells hold what the app shows),
  [0015](0015-excel-library.md) (exceljs)

## Context

The numbers in the Excel exports were correct, but the files did not say what they held and
did not open cleanly:

1. **No context.** A projection export had no lens, base date or period note. Only the
   `-real` / `-nominal` file-name suffix told the lens apart, and a renamed file lost it. On
   screen the same table sits under the ADR 0111 context line.
2. **`####` columns.** Column width came from the header length only, so 7 of 11 money
   columns in English (6 in Czech) were narrower than their widest value.
3. **No frozen header.** The amortization sheet runs to 360+ rows under one header; the
   screen keeps the Year column sticky.
4. **Black negatives.** The money format had no negative section, so a loss year showed as
   black `-57 334 Kč`; the screen shows it red in parentheses (CLAUDE.md §5).
5. **Empty file names.** The slug kept only `[a-z0-9]`, so the Russian "Portfolio" or a
   Cyrillic property name gave `-projection-nominal.xlsx`. Projections and Property detail
   named one property's file differently (`javorova-…` vs `byt-javorova-…`).
6. **Fake opening-year flow.** The compare "Net cash flow" sheet and chart showed `0` in
   year 0, where the projection grid and export leave flows blank.

## Decision

Owner, 2026-10-08 (D9 = A): fix the whole batch.

- **Notes.** A projection export lists the entity name, then the page's context line
  (`projectionsSubtitle`: lens, base date in Real, and "flows per year, balances at year
  end"), under the table. The amortization export (always nominal, dated per row) lists the
  property name. The compare workbook's lens note names the base date in Real
  (`projections.realTermsDated`).
- **One lens label.** `lensLabel(t, mode, baseDate?)` (`src/ui/model/tableContext.ts`)
  replaces the per-page copies. The duplicate keys `propertyDetail.realTermsLens` and
  `propertyDetail.nominalKcLens` are removed; `projections.realTerms` and
  `projections.nominalKc` hold the same text in every language, so no shown text changes.
- **Widths.** Each column is as wide as its header or its widest shown cell (by the screen's
  formatters, a negative with its parentheses) plus 2, at least 10 and at most 40.
- **Frozen panes.** Every sheet freezes the header row and the first column.
- **Negatives.** Money cells use `#,##0" Kč";[Red](#,##0" Kč")`: a loss is red in
  parentheses, as on screen.
- **File names.** `exportFilename(name, fallback, kind, mode?)` (`src/lib/slug.ts`)
  lowercases, folds decomposable Latin diacritics (`á` → `a`; `ł`, `ø`, `ß` stay as they
  are), keeps other scripts (`й` stays `й`), drops marks not on a letter (an emoji's
  variation selector) and joins the rest with dashes. The name part is at most 100
  characters. A name with no letter or digit uses the fallback (the property id, or
  `portfolio`). Projections names a property by its full name, so both pages give
  the same file name.
- **Opening-year flows.** `mergeCompareMetric(…, { flow: true })` leaves year 0 empty for
  net cash flow, in the compare sheet and chart.

Rejected: notes, widths and freeze only (B; leaves the negative, name and year-0 items
open), and the lens in the sheet or file name only (C; sheet names cap at 31 characters and
a renamed file loses it).

## Consequences

No computed number changes. Exported files gain note rows under the table, wider columns, a
frozen header row and first column, and red negatives. File names change: Czech names keep
their words without diacritics as before, Cyrillic names keep their letters, and the
Projections export of one property now starts with the full name (`byt-…`). The compare Net
cash flow chart has no year-0 point, and its table view shows "—" there. ADR 0111's "no export content change" no longer holds for
the projection exports.

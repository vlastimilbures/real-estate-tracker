# 0211. The year-by-year grid fits a 1280 px window

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-16
- Source: issue #386 (UX/UI review 2026-11, tracking #392); direction approved by the
  owner on 2026-11-15 (the issue's decision); acceptance delegated by the owner for the
  2026-11-15 run (comment on #392)
- Amends: [0159](0159-excel-exports-carry-their-context.md) (the projection export's
  note line is the screen's context line without the years' span, §5)
- Related: [0111](0111-table-context-line.md) (the context line above a table),
  [0205](0205-properties-list-fits.md) (the same compact rows on the Properties list)

## Context

At 1280 × 800 the year-by-year grid on Projections and Property detail shows nine figure
columns and cuts the tenth; Interest through DSCR need horizontal scrolling. When
projection years are not calendar years, a "Period" column ("Jul 2026 – Jun 2027") takes
about 150 px to say the same thing on every row, and 40 px rows make the 31 rows about
1,240 px tall.

## Decision

1. **Period folds into Year.** The grid has no Period column. When the projection years
   are not calendar years (`showPeriodColumn`), each Year cell carries its span
   (`periodLabelLocalized`, "opening" for the opening row) as its tooltip and, after the
   year, as screen-reader text, so the cell reads "Y1 · 2027, Jul 2026 – Jun 2027".
2. **The span is stated once** above the grid, `projections.yearSpan(from, to)` ("years
   run Jul – Jun, named by the year they end", so "Y1 · 2027" reads without hovering): at the end of the Projections subtitle (`projectionsPageSubtitle`)
   and of Property detail's projection panel hint (`projectionPanelHint`). Shaping:
   `yearSpanNote` (`src/ui/model/tableContext.ts`). With calendar years there is no note.
3. **Compact grid** (`table.data.compact`): cells have 6 px vertical padding, so a row
   is about 31 px and 31 rows take under 1,000 px. To fit twelve figure columns at 1280 × 800
   in Russian too, the issue's 8 px horizontal padding was not enough (measured: 8 px
   with 13 px figures needs about 1,070 px against a 982 px panel), so:
   - figures are 12 px (the app's other tables keep 13 px);
   - cells have 5 px horizontal padding, figures at least 10 px apart;
   - a header wraps at word breaks into balanced lines, aligned to the bottom, with
     letter spacing 0.02 em instead of 0.04 em (two lines for Russian "Валовая аренда",
     "Обсл. долга" at 1280 px; a long optional header such as the prepayment fees may
     take more in a narrow window).

   Measured at 1280 × 800 (macOS fonts): the twelfth figure column (Net CF) ends
   82 px (en), 94 px (cs) and 8 px (ru) inside the panel.

4. **Unchanged:** the header, the pinned Year column, the opening and final rows'
   emphasis, the optional columns (draws, refinanced, prepaid, fees, undrawn, purchases),
   the column order.
5. **The export is unchanged.** The workbook keeps its Period column and its note lines
   (`projectionExportNotes` still uses `projectionsSubtitle`, without the span note: the
   file's Period column already states it), so the same data gives the same file.

## Consequences

- At 1280 × 800 with the sample portfolio at least 12 figure columns are in view without
  scrolling, in en, cs and ru (checked by the ux capture on screens 20, 30 and 32; CI
  runs cs and ru on screen 20 with Linux fonts). Russian has the least room; a longer
  Russian header would need a shorter label. At the 1200 × 800 the app opens at, one or
  two fewer are in view.
- No computed number, stored data or export changes.
- New dictionary entry in en, cs and ru: `projections.yearSpan`. `projGrid.period` stays
  (the export's header); the `.proj-period` style is removed.

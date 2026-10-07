# 0145. Excel cells: an empty cell for a non-finite number, the Text format instead of an apostrophe

- Status: Accepted
- Date: 2026-10-07
- Source: issue #139 (review findings G2-2-01, G2-2-02, G2-2-11); Track 10 PR 10.6
- Amends: [0010](0010-excel-export-rounded.md) (formula-injection protection)
- Related: [0108](0108-scenario-compare-xlsx-export.md) §5 (a figure without a value is an empty cell)

## Context

Every Excel export goes through one cell writer, `src/ui/model/xlsxExport.ts`. It had two
faults.

- **No finite guard (G2-2-01).** `cellValue()` turned any number or `Decimal` into a JS number
  and wrote it. A `NaN` or `Infinity` reached the file as `<v>NaN</v>`, which is not a valid
  OOXML number. The chart sheets were safe only because `tableValue()` already blanks
  non-finite values; the scenario compare's Key figures sheet is not. Example: the CAGR when
  horizon equity turns negative (engine finding R2-04).
- **A visible apostrophe (G2-2-02).** ADR 0010 says formula-injection protection applies to
  text cells. The writer did this by putting `'` in front of text that starts with
  `= + - @`, tab or CR (DR-087). In an xlsx file a shared-string cell is always literal text: a
  formula exists only in an `<f>` element, which the writer never emits. So the apostrophe
  protected nothing when the file opened, and Excel, LibreOffice and Numbers showed it as part
  of the text, because the `quotePrefix` style that hides a typed apostrophe was not set. A
  scenario named `+2 % rates` was exported as `'+2 % rates`.

The real risk is narrower: a user who re-edits such a cell in Excel (F2, Enter) makes Excel
parse the text again, and `=…` or `+…` then becomes a formula.

## Decision

1. **A non-finite number is an empty cell.** For every numeric kind (money, percent, rate,
   multiple, int), the writer rounds as before and writes `null` when the result is `NaN`,
   `Infinity` or `-Infinity`. This matches ADR 0108 §5 and the chart path
   (`src/ui/model/chartData.ts`).
2. **Text is written as typed.** Headers, text cells, strings in number columns and note lines
   keep their exact text, with no prefix.
3. **Formula-like text gets the Text number format.** A text cell that starts with
   `= + - @`, tab or CR gets `numFmt = '@'`, so re-entering it in Excel keeps it as text. This
   replaces the apostrophe of DR-087 and defines the xlsx threat model for ADR 0010: the file
   itself never holds a formula; the guard covers re-entry only.

## Consequences

- Exports show scenario names and notes exactly as on screen. A cell whose figure has no
  finite value is empty, so the workbook opens without a repair prompt and `SUM` still works.
- No computed number, parity target or golden-master change; no screen changes.
- The engine cause of the CAGR `NaN` (R2-04) is separate work; this guard is defence in depth.
- Tests: non-finite cases for each numeric kind, a `+2 % rates` header read back without an
  apostrophe and with the `'@'` format, and literal expected values for the compare's chart
  sheets in place of a check that repeated the code under test.

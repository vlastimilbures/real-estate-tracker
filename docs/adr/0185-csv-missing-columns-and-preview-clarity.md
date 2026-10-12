# 0185. CSV missing columns and preview clarity

- Status: Accepted
- Date: 2026-10-13
- Source: issues #142 (2026-10 review R3-07, R3-08; owner chose option B on 2026-10-12:
  duplicate header is an error, a missing optional column keeps the stored value) and #143
  items 1, 2, 3 and 6 (owner chose them on 2026-10-12); Track 14 PR N5c
- Amends: [0096](0096-csv-import-preview.md) (what the preview shows, and how a commit-time
  problem is reported); SPEC.md §6 (header row, matching)
- Related: [0001](0001-behaviour-change-gate.md) (behaviour-change gate),
  [0119](0119-acquisition-funding.md) §8 (a blank funding cell keeps the amount; unchanged),
  DR-129 (a blank `contract_maturity_date` keeps the stored date; unchanged)

## Context

The CSV importer maps each cell by its header name. Four gaps came out of the 2026-10 review:

- A header name that appears twice was silently overwritten: the right-hand column won.
- A column missing from the header read exactly like an empty cell. On an update, a missing
  optional column cleared the stored value, so re-importing a trimmed export planned an
  update that cleared every matched property's address, garage and growth overrides, and an
  older mortgages file without `loan_term_years` cleared a loan's term.
- The preview compares values at full precision but shows money in whole Kč and rates with
  two decimals, so an update could read `7 908 Kč → 7 908 Kč`. A file with no data rows
  showed a green "0 rows ready" badge and "Every record in these files is already up to date."
- A row's natural key was recorded only when the whole row parsed, so a duplicate behind an
  invalid first row needed a second upload round to be reported. A problem found only at
  commit (stored data changed after the preview) was shown in a second table that stayed on
  screen after a corrected re-upload.

## Decision

1. **A duplicate header is a file error.** After trimming, a header name that appears more
   than once rejects the file (`duplicateHeader`, on the header line, naming the column;
   `importPage.errDuplicateHeader`). No row of that file is read.
2. **A missing optional column keeps the stored value.** An optional column absent from the
   header is not written on an update; a new record gets no value (NULL). An empty cell in a
   column that is present still clears, except where a blank already keeps (DR-129, ADR 0119
   §8). A missing required column still makes that cell _Required_ on every row.
3. **A natural key is registered from its key cells alone.** When the key cells of a row are
   valid, its key counts for the duplicate check even if another cell of the row has an
   error, so all errors are reported in one round.
4. **The preview shows the difference.** When both sides of a change format to the same
   text, both are shown at full precision: money with two decimals, rates with four.
5. **A file with no data rows says so.** Its badge is a neutral `importPage.noDataRows`, and
   "already up to date" is shown only when the preview has at least one record.
6. **A problem found at commit is shown as a changed plan.** The import refuses with the new
   preview (the existing "data changed since the preview" path), whose problems table
   replaces the old one; the separate refused-rows state is removed.

## Consequences

- Re-importing a trimmed export changes only the columns it holds; the preview no longer
  lists "before → empty" lines for columns that are not in the file.
- No computed number changes; golden master and parity targets are unchanged.
- New strings `importPage.errDuplicateHeader` and `importPage.noDataRows` (en, cs, ru;
  wording approved by the owner 2026-10-12).

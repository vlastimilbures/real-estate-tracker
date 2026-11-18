# 0257. Shock years and merged CSV rows are range-checked at the write

- Status: Accepted
- Date: 2026-11-18
- Source: issue #464 (code review 2026-11, tracking #435: the input rules in one place);
  owner decision 2026-11-18 (#435 comment 6965976270: "yes to limits on shock and crash
  years, the range check on merged CSV rows, and one range message (copy). No to range
  checks on restore, engine maxima or SQL CHECK changes."); plan on #464 (comment
  6976571703), items A and B. Item C, the one range message, is a later amendment.
- Amends: [0245](0245-store-refuses-added-out-of-range.md) (§2 and §6: scenario writes are now
  range-checked, for the shock and crash years only)
- Related: [0140](0140-one-form-parser.md) §4 (the scenario form's bounds on the shock and
  crash years), [0076](0076-csv-int-bounds-and-app-name.md) §1 (CSV import applies the
  bounded ranges to the parsed cells), [0185](0185-csv-missing-columns-and-preview-clarity.md) §2 (a
  missing optional column keeps the stored value), [0148](0148-restore-rules-vs-stored-data.md)
  §1 (restore brings an out-of-range value in after "Restore anyway"),
  [0086](0086-restore-int-bounds.md) §2 (the engine and the database stay open-ended)

## Context

Two gaps were left open by ADR 0245.

- **Shock and crash years.** Only the scenario form checks them: a shock lasts 1–100 years
  (`SHOCK_YEARS`) and the crash lands at year 0–100 (`CRASH_YEAR`, ADR 0140 §4). The store
  checks a scenario with the engine rules only, which refuse a negative count and are
  open-ended above. So a store write with a shock of 0 or 500 years saves
  (`storeRangeToday.test.ts` pins it), and restore can bring one in.
- **Merged CSV rows.** CSV import checks the bounded ranges on the parsed cells only
  (ADR 0076). `checkMerged` runs the engine rules on the merged portfolio but not the
  ranges. No in-range cell can produce an out-of-range merged value today, so this guards
  against a later change to the merge (a column kept from the stored row, a derived value).

Both follow ADR 0245's rule: a database may already hold such a value, and refusing every
write while one is stored would lock the owner out of unrelated edits.

## Decision

1. **The store range-checks the shock and crash years.** Before it adds or saves a
   scenario, the store checks the inflation shock's and the rate shock's years against
   `SHOCK_YEARS` and the crash year against `CRASH_YEAR`, as whole numbers, as the scenario
   form does.
   - **Only what the write adds or changes is refused** (ADR 0245 §2). A save is compared
     with the stored scenario of the same id; an add with nothing. A duplicate is compared
     with its source, so duplicating a scenario never adds a problem.
   - **Order:** the engine rules first, unchanged (a shock of −1 years is still refused as
     `SHOCK_OUT_OF_RANGE` and nothing else), then the ranges (ADR 0245 §3).
   - **The refusal is an input error** (ADR 0245 §4), of its own type
     (`ScenarioRangeProblem`): the Data check and restore read `RangeProblem` only and are
     unchanged.
   - **Text and field are the form's own:** `forms.intRange` with the year range, on the
     form's field (`inflationShockYears`, `rateShockYears`, `valueShockYear`). No dictionary
     entry is added or changed.
   - **Stored values still load**, and a scenario holding one saves when the write leaves
     the value as it is, or fixes it.
2. **`checkMerged` range-checks the merged rows.** After the engine rules pass, the plan
   compares the bounded-range problems of the stored rows with those of the merged rows
   (`rangeProblemsAddedBy(rangeProblems(stored), rangeProblems(merged))`) and refuses the
   ones the import adds or changes.
   - **Each is mapped to the CSV file, row and column** of the row that wrote it, and shows
     the CSV range text the parse step already uses (`importPage.errOutOfRange`,
     `importPage.errSizeRange`). No dictionary entry is added or changed.
   - **A stored out-of-range value that carries through still imports:** a row that leaves
     it as it is, or another row of the same file, is not refused.
3. **Out of scope** (owner decision): restore keeps asking about an out-of-range value
   (ADR 0148); the engine gains no maxima and the database no new CHECKs (ADR 0086 §2); the
   years stay at 1–100 and 0–100, not tied to the portfolio's horizon; a stored
   out-of-range shock year is not flagged in the Data check.

## Consequences

- No form or flow changes for a user: the scenario form already refuses these years before
  it calls the store, with the same message on the same field, and no CSV cell can produce
  an out-of-range merged value today.
- A store write that adds a shock or crash year outside the limits, or changes a stored one
  to another out-of-range value, is refused before anything is written.
- `storeRangeToday.test.ts` flips its pinned acceptances of a shock lasting 0 and 500 years
  to refusals; the refusal of −1 is unchanged.
- No figure, export, stored data, dictionary entry or layout changes; parity and the golden
  master do not move.

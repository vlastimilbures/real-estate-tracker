# 0229. A CSV import writes the plan built at the click

- Status: Accepted
- Date: 2026-11-17
- Source: issue #447 (code review 2026-11, tracking #435); owner decision 2026-11-16
  (option A, drop the comparison); the plan posted on #447
- Amends: [0096](0096-csv-import-preview.md) §5 (the plan-change guard),
  [0185](0185-csv-missing-columns-and-preview-clarity.md) §6 (a commit-time problem is shown
  as a changed plan), [0127](0127-opaque-property-ids-sample-match.md) §1 (the preview and
  the import plan the same ids; delegated point S1)
- Related: [0240](0240-import-preview-cleared-on-change.md) (Import is disabled while a new
  preview is pending; required by this decision)

## Context

ADR 0096 §5 made the commit re-read the database, re-plan, and compare the new plan with
the previewed one through a fingerprint. When they differed, nothing was written and the
page said the data had changed. To keep the two plans equal for the same files, ADR 0127 §1
kept one set of new property ids per batch object in a `WeakMap`, shared by the preview and
the import.

Since ADR 0240, every change to the chosen files or to the stored data clears the preview,
and Import waits for the new one. The page can no longer press Import on a plan it is not
showing, so the comparison guards only against an outside change in the moment between the
shown preview and the click. In a single-user offline app that change cannot come from the
page itself. The comparison, its error, the id-keeping map and the page's banner are code
and texts kept for a case that the page now prevents.

## Decision

1. Import builds the plan from the chosen files and the stored data at the click and
   writes it in one transaction. It no longer compares it with the previewed plan.
2. If that plan has problems (an invalid row or a clash with stored data), nothing is
   written and the page shows the problems as the preview does. This is the one
   commit-time refusal that stays (0185 §6).
3. New property ids are created when the import is written, not when the preview is built.
4. Removed: the plan fingerprint, `CsvPlanChangedError`, the id-keeping `WeakMap`, the
   page's `planChanged` state and banner and its texts (en/cs/ru), with their tests.
5. Tests, written failing first: an import writes exactly what the preview listed; a
   commit-time problem writes nothing and shows the problems. Parity targets and golden
   master do not move.

## Consequences

- Stored data does not change: nothing stored the fingerprint, and no migration is needed.
- Rows of one plan that name the same new property still share its id: each plan makes its
  ids fresh, one per new name. The id a preview lists for a new property is not the id the
  import writes; nothing shows or keeps it.
- A commit-time refusal throws `CsvImportProblemsError` with the plan's problems; the page
  shows them in the problems table and Import is disabled, as for a preview with problems.
- The dictionary entry `importPage.planChanged` is removed in en, cs and ru.
- **S2:** the removed banner was the only `role="alert"` for a commit-time refusal. With
  it gone, such a refusal shows the problems table without an announcement. A refusal at
  commit needs an outside change between the shown preview and the click, which is very
  rare in a single-user offline app.
- No computed number, parity target, golden master or export changes. No ux-capture screen
  reaches the banner, so the capture does not change.

## Owner review

Two points were delegated within the approved decision text and are open for the owner's
review:

- **S1:** ADR 0127 §1 says the preview and the import of the same files plan the same ids.
  §3 changes that, so this ADR also amends 0127 §1, and 0127 links back here.
- **S2:** a commit-time refusal is no longer announced (see Consequences).

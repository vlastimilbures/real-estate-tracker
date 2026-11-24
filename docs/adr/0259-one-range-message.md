# 0259. One range message for forms, CSV import and restore

- Status: Accepted
- Date: 2026-11-24
- Source: issue #464 (code review 2026-11, tracking #435); owner decision 2026-11-18 (#435
  comment 6965976270: "one range message (copy)"); plan on #464 (comment 6976571703),
  item C; copy and test edits approved by the owner 2026-11-18 (#464 comment
  6978842455); ADR accepted on owner review 2026-11-24 (recorded on #464)
- Amends: [0257](0257-shock-years-merged-rows-range-checked.md) (§1 and §2 named the old
  form and CSV texts), [0236](0236-size-one-decimal.md) §1 (the size's three texts become
  one), [0075](0075-input-rejection-gaps.md) and [0076](0076-csv-int-bounds-and-app-name.md)
  (the whole-number bounds' form and CSV texts)
- Related: [0086](0086-restore-int-bounds.md) (the restore issue text, which this keeps),
  [0245](0245-store-refuses-added-out-of-range.md) §4 and
  [0243](0243-hidden-field-save-error.md) (a store refusal on a field the form does not
  show goes above the buttons), [0152](0152-wording-log-and-generated-index.md) (copy and
  live-region text)

## Context

The bounded fields (horizon, fixation, loan term, size, and the scenario's shock and crash
years) are refused with the same range in three places, each in its own phrasing:

| Where   | Keys                                                   | en today                                     |
| ------- | ------------------------------------------------------ | -------------------------------------------- |
| Forms   | `forms.intRange`, `forms.sizeRange`                    | "Enter a whole number from 1 to 100"         |
| CSV     | `importPage.errOutOfRange`, `importPage.errSizeRange`  | "\"51\" must be a whole number from 0 to 50" |
| Restore | `backup.issueOutOfRange`, `backup.issueOutOfRangeSize` | "Must be a whole number from 0 to 50"        |

The owner chose one message (#435). This is copy, but it is not copy-only under ADR 0152:
`forms.intRange` and `forms.sizeRange` are also live-region text. A store refusal of a
range on a field the form is not showing goes above the buttons (ADR 0243, ADR 0245 §4,
`formWriteErrors` in `src/ui/model/writeError.ts:221-239`), and that line is
`role="alert"`: in the record form (`src/ui/components/forms.tsx:275-279`), the scenario
form (`src/ui/pages/ScenarioForm.tsx:215-219`) and the property form's error banner
(`src/ui/components/PropertyFormModal.tsx:476-477`, `ErrorBanner` in
`src/ui/components/primitives.tsx:499`). Every form shows these fields today, so the path is
practically never taken, but the text can be announced. Hence this ADR.

How likely a user sees the change: often on the form fields (a refused value), rarely in
CSV import (a file with an out-of-range cell), never in restore (its text does not change).

## Decision

1. **One message per kind, in the restore wording, already translated.** The bounded
   whole-number fields use `forms.intRange`, the size uses `forms.sizeRange`, everywhere:
   form fields, store refusals, CSV import (parsed and merged rows) and restore issues.
   - en: "Must be a whole number from {min} to {max}" / "Must be a number from {min} to
     {max} with at most one decimal place"
   - cs: "Musí být celé číslo od {min} do {max}" / "Musí být číslo od {min} do {max} s
     nejvýš jedním desetinným místem"
   - ru: "Должно быть целым числом от {min} до {max}" / "Должно быть числом от {min} до
     {max} не более чем с одним знаком после запятой"
2. **The four other keys are deleted:** `importPage.errOutOfRange`,
   `importPage.errSizeRange`, `backup.issueOutOfRange`, `backup.issueOutOfRangeSize`.
   `csvErrorText` (`src/ui/pages/ImportPanels.tsx`) and `restoreIssueText`
   (`src/ui/model/restoreIssue.ts`) call the form keys.
3. **The CSV message no longer quotes the value.** The error table already shows the file,
   row and column, and the cell's value is in the file; the restore table never showed it.
   The CSV error codes (`outOfRange`, `sizeRange`) keep their `value` field, unchanged.
4. **Unchanged:** the ranges, what is refused and where, the field each message lands on,
   the Data check's stored-value findings (`dataCheck.outOfRange*`), and every other CSV,
   restore and form message.

## Consequences

- Visible: form field and store-refusal texts change from "Enter…" to "Must be…"; CSV range
  errors lose the quoted value; restore texts are unchanged.
- Dictionary: 2 keys reworded (en/cs/ru), 4 keys deleted. Entry in
  `docs/decisions/wording.md`.
- Tests that pin the old texts are edited (owner-approved list on #464, plus the two files
  added by #567 after that list: `ImportMergedRange.test.tsx:61,65` and
  `storeScenarioRanges.test.ts:205-207`).
- No figure, parity target, golden master, schema, export or backup-format change.
- ux-capture: only screens that show a range message may differ.

# 0236. A property's size may have one decimal place

- Status: Accepted
- Date: 2026-11-16
- Source: issue #455 (code review 2026-11, tracking #435), owner decision 2026-11-16,
  item 1 option A
- Amends: [0075](0075-input-rejection-gaps.md) (size range),
  [0180](0180-data-check-restore-asof-polish.md) §2 (non-integer finding, for size)
- Related: [0076](0076-csv-int-bounds-and-app-name.md) (CSV applies the form bounds),
  [0086](0086-restore-int-bounds.md) (restore applies them),
  [0152](0152-wording-log-and-generated-index.md) (keys, not strings)

## Context

ADR 0075 bounds the property size to a whole number from 1 to 10 000 m² in the forms, and
CSV import and restore apply the same rule (ADR 0076, ADR 0086). Czech floor areas are
commonly given to a tenth of a square metre (a flat of 54,5 m² in a purchase contract or
the cadastre), so the owner had to round the size to enter it. ADR 0180 §2 then made a
stored size with any fraction a Data check finding and a restore question.

The column `size_m2 INTEGER` has no STRICT and no CHECK. SQLite's INTEGER affinity keeps
54.5 as REAL, the Rust read path decodes a value by its storage class (`db.rs`) and the
guards pass the number through, so a fraction already round-trips without a schema step.

No calculation reads the size: it is shown in the property's subtitle only.

## Decision

1. Size in m² accepts a number from 1 to 10,000 with at most one decimal place, in the form, CSV import and restore. Two or more decimals are refused with a message naming the limit.
2. It is stored exactly as entered (a schema step is added only if the current `size_m2 INTEGER` column refuses fractions) and shown with Czech formatting, e.g. "54,5 m²".
3. The Data check no longer flags a size with one decimal place.
4. No calculation uses size, so no figure changes. Tests, written failing first: 54.5 accepted in form, CSV and restore and shown as "54,5 m²"; 54.55 refused.

## Consequences

- One rule, `oneDecimal` in `src/lib/intRanges.ts`, is the size's precision in
  `outOfRangeFields`; the horizon, fixation and loan term stay whole numbers. Restore (via
  `checkInputRules`) and the Data check use it, so a stored 54.5 neither warns nor is listed;
  54.55 still warns `OUT_OF_RANGE` at restore and is listed in the Data check.
- The property form has a new field kind `size` (`parseSizeField`): digits with an optional
  fraction after a comma or a dot, spaces ignored. The field's input mode is `decimal`.
- Decimals are counted by value in the form and CSV import: trailing zeros do not count, so
  54.50 (what a spreadsheet column formatted with two decimals exports) is accepted and
  stored as 54.5, while 54.55 is refused (delegated decision, 2026-11-17, in the owner's
  favour under "at most one decimal place").
- CSV import reads `size_m2` with `optSize`: a plain decimal (a decimal comma keeps the
  `decimalComma` error). Every refusal of a number, whether outside the range (including
  a whole or negative number) or with two or more decimals, gets the new code `sizeRange`,
  so CSV names the same rule as the form and restore.
- No migration. The DB round trip is pinned by `src/data/__tests__/size-fraction.test.ts`.
- New or changed user-visible text (en, cs, ru; ADR 0152 §2):
  - new `forms.sizeRange` (the form's size message, with the range);
  - new `forms.invalidHint.size` (the size kind's format hint);
  - new `importPage.errSizeRange` (the CSV `sizeRange` error);
  - new `backup.issueOutOfRangeSize` (the restore table's text for a size);
  - `dataCheck.notWholeSize` (ADR 0180 §2) is removed and replaced by
    `dataCheck.sizeDecimals` (a size with two or more decimals);
  - `propertyDetail.sizeM2` now takes the size formatted with `fmtNumber`: 54.5 reads
    "54,5 m²", a whole size shows no decimals, and thousands are grouped, so 1234 m², which
    used to read "1234 m²", now reads "1 234 m²".
- Because this ADR records the new texts, no wording-log entry is needed (ADR 0152 §1).
- `src/engine`, figures, parity targets and the golden master do not change.

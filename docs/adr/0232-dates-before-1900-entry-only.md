# 0232. Dates before 1900 are refused at entry only

- Status: Accepted
- Date: 2026-11-16
- Source: issue #452 (code review 2026-11, tracking #435; finding ED-08), owner decision
  2026-11-16, option A
- Amends: [0149](0149-calendar-days.md) §5 (stored dates before 1900 no longer warn),
  [0180](0180-data-check-restore-asof-polish.md) §3 (the early-date finding it refined is
  removed)
- Related: [0148](0148-restore-rules-vs-stored-data.md) (restore rules vs stored data),
  [0118](0118-data-check.md) (data check)

## Context

ADR 0149 §5 set a 01.01.1900 floor for new dates: the form and CSV import refuse an earlier
date, which is almost certainly a typo (`0226` for `2026`). It also handled a date already
stored before the floor, which only an earlier CSV import could have written: restore listed
it as a warning ("Restore anyway"), and the Data check listed it under "Needs attention" with
a link to the record that holds it.

That second half is machinery for a case that does not happen. The owner has never seen an
early-date finding in the Data check or a restore. It costs a date walker over every stored
record (`earlyDateFields` in `src/lib/day.ts`), a restore problem type (`DateProblem` /
`EARLY_DATE`), a Data check finding with its own fix map and two message variants (ADR 0180
§3), their dictionary entries in three languages, two capture screens and their tests.

The floor is a typing guard. The place where a typo enters is the form or the CSV file, and
both keep refusing it. A stored date before 1900 is a real calendar date the engine computes
with; the database guard already loads it (years 0100–9999).

## Decision

1. The form and CSV import keep refusing a date before 01.01.1900 with today's messages,
   through one shared check (#464).
2. A stored date before 1900 is no longer looked for: restoring a backup with one gives no
   warning, and the Data check no longer lists it. Editing such a record in a form still
   requires a valid date.
3. The whole-number ranges restore applies (horizon, fixation, term, size; owner decision
   2026-10-03) are unchanged.
4. Removed: `earlyDateFields`, the `DateProblem` / `EARLY_DATE` restore problem, the Data
   check's early-date finding and its fix link, their texts (en/cs/ru), and their tests.
5. Tests: form and CSV still refuse 01.06.0226; a backup with a 1899 date restores without an
   early-date warning (written failing first). Parity targets and golden master do not move.

## Consequences

- Stored data is not refused, rewritten or migrated. Loading is unchanged. A backup holding a
  date before 1900 goes through the ordinary "Restore now" confirm step, with its overwrite
  warning and safety copy.
- ADR 0149 §5: its two bullets on restore ("Restore anyway") and the Data check no longer
  apply; the floor for the form and CSV import and the database guard's accepted years stay.
- ADR 0180 §3 no longer applies: the early-date finding it refined is removed, and with it
  `dataCheck.earlyDateLoan`.
- Removed dictionary keys (en, cs, ru): `dataCheck.earlyDate`, `dataCheck.earlyDateLoan`,
  `dataCheck.earlyDateRecord.*` and `backup.issueEarlyDate`. Kept: `importPage.errEarlyDate`
  and `forms.invalidHint.date`.
- Capture screens `69-restore-early-date` and `69b-data-check-early-date` are removed.
- The shared floor check for the form and CSV import is left to #464.
- No figure, parity target or golden-master change; `src/engine` does not change.

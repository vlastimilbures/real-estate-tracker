# 0148. Restore rules vs stored data: out-of-range values ask, flags and names are checked

- Status: Accepted
- Date: 2026-10-07
- Source: issue #133 (review findings G2-4-01, R3-04, R6-08), options B + C + D (owner
  decision D5, 2026-10-06); decimal grammar (owner, 2026-10-07); Track 10 PR 10.9
- Amends: [0086](0086-restore-int-bounds.md) §4
- Related: [0052](0052-restore-safety-backup.md) (safety backup), [0094](0094-sample-portfolio-clear.md)
  (Clear sample), [0118](0118-data-check.md) (data check), D-55 (name matching), DR-036 (CSV
  decimals)

## Context

ADR 0086 made restore refuse whole-number values outside the form bounds (horizon 1–100,
fixation 0–50, loan term 1–50, size 1–10 000 m²), with no migration (§4): a database that
already holds such a value keeps loading. The engine, the loader and the database stay
open-ended (§2). So such a database writes safety backups and exports that the same app then
refuses. The safety backup is the undo path of Restore and Clear sample (ADR 0052, ADR 0094);
it silently depended on the data never having been accepted under older rules (G2-4-01).

Restore also checks less than the database (R3-04): `garage` and `active` are never read by a
mapper, so a bad flag passes the confirm step and fails inside the write, after the safety
backup. The stored-decimal parser takes whatever decimal.js accepts (`0x10`, `0b101`, `1_000`,
`+5`, `1e3`), wider than CSV import. And the restore duplicate check compares property names
exactly, while every other entry point matches them trimmed and case-insensitively (R6-08), so
a backup with "Byt A" and "byt a" restores and later CSV rows land on one of them.

## Decision

1. **An out-of-range value asks instead of refusing (B).** At restore, `OUT_OF_RANGE` issues
   are warnings. The confirm step lists them in the issue table (table, record, column,
   allowed range; never the value), says the app computes with them and the Data check lists
   them, and the restore button reads "Restore anyway". Shape problems, unreadable values,
   duplicate keys, a missing assumptions row and the engine's input rules stay blocking. When
   a file's blocking issues are duplicates or engine rules, the refusal lists its
   out-of-range values too, so one table names everything to fix (a file that cannot be read
   as a whole stops before the rules run, as before). So a file the app writes from data it
   loads no longer fails on a bound alone (see Consequences for the remaining cases).

   **A hard limit stays a refusal** (owner, 2026-10-07, after review): a value above ten
   times the form maximum (horizon above 1 000 years, fixation or loan term above 500 years,
   size above 100 000 m²) is not legacy data but a broken file, so restore refuses it as
   `BEYOND_LIMIT` with the same "Must be a whole number from … to …" text. Without it a
   hand-edited horizon of 2 000 000 000 years would pass as one warning and make every
   projection loop for ever after the restore. The engine and the database stay open-ended.

2. **The Data check lists stored out-of-range values (C).** Under "Needs attention", with the
   value and the range: a property's size (fix: the property form), a mortgage's fixation or
   loan term (fix: Financing), and on the Dashboard the projection horizon as a portfolio row
   (fix: Settings → Assumptions). The forms already refuse to save them, so the owner fixes
   them there.
3. **Restore checks the property flags (D).** No mapper reads `garage`, and the mapper
   collapses any `active` other than 0 to active. `properties.garage` must be 0, 1 or
   empty; `properties.active` must be 0 or 1 (the column is NOT NULL; a backup without the
   column still gets 1). Anything else is "A value cannot be read" for that record and column,
   at the confirm step, before anything is written.
4. **One decimal grammar for stored text (D).** A stored decimal is plain notation (the CSV
   grammar: optional minus, digits, optional `.` fraction) **or** the exponent form decimal.js
   writes for very small or large values (`1e-7`, `-1.5e-7`, `1e+21`: one leading digit, a
   signed exponent). The app writes decimals with `toString()`, which uses that form, and the
   parser also reads the live database, so plain notation alone would make data the app wrote
   unreadable. Hex, binary, `_` grouping, a leading `+`, an unsigned exponent (`1e3`), `.5` and
   `5.` are refused, at load and at restore alike.
5. **Property names repeat case-insensitively at restore (D).** The restore duplicate check
   compares property names as `propertyKey` does (trimmed, lower case), like CSV import and the
   property form (D-55). It stays blocking.
6. **Still no migration.** No unique index on the normalised name; the restore check covers
   new files. The index stays a later decision.

## Consequences

- ADR 0086 §4 now reads: a database holding an out-of-range value keeps loading, and its
  backups restore after a confirmation; the Data check lists the values.
- New user-visible text: the confirm-step warning, "Restore anyway", and the Data check
  out-of-range findings (en, cs, ru).
- A database that already holds a case-only name clash (possible only through an earlier
  restore of a hand-edited file) writes a safety backup that restore refuses. This is
  accepted: the clash is the bug R6-08 describes, and the issue table names the record.
- A database holding a decimal in a refused form (only possible through an earlier restore of
  a hand-edited file) no longer loads; the load error names the table, record and column.
  The startup error screen has no Restore, so the owner fixes that cell in the database file
  by hand (`docs/data-safety.md`), then presses Try again.
- Computed numbers do not change: parity, the golden master and the bench budgets are
  unchanged.

# 0149. Calendar days: the local day on every screen, one day module, a 1900 floor for new dates

- Status: Accepted
- Date: 2026-10-07
- Source: issue #119 (review findings G1-3-01, G1-3-04, G1-3-03, G1-3-07, G1-3-05, G1-4-12,
  G1-3-06), owner decision D6 (2026-10-06: item 1 A, item 2 B, item 5 A), item 5 refined by
  the owner on 2026-10-07 (new input refuses, stored data warns); Track 10 PR 10.10
- Amends: [0110](0110-backup-recency-indicator.md) (the backup date on the restore screen)
- Related: [0148](0148-restore-rules-vs-stored-data.md) (restore rules vs stored data),
  [0118](0118-data-check.md) (data check), DR-068 (local-day file name), DR-072 (injectable
  today), DR-035 and UX-052 (form dates, 1900 floor)
- Implementation: decisions 1–3 in PR 10.10a; decisions 4–6 in PR 10.10b

## Context

The engine works with calendar days stored as UTC midnight. The UI boundary turns a local
moment (now, a picked calendar cell, a backup time stamp) into the local calendar day before
it crosses into UTC. Each earlier fix of that crossing (DR-068, DR-072, the DateInput
off-by-one) was made in one copy of the helper, and five copies exist.

- The restore confirm screen formats the backup's `exportedAt` with the UTC day. A backup
  made between local midnight and UTC midnight (00:00–02:00 in Prague in summer) shows the
  previous day, while its file name and the "Last backup" line show the local day. This is
  the screen where the owner decides which copy replaces all data.
- CI runs the tests in UTC and in Pacific/Pago_Pago (UTC−11). A local-versus-UTC mix-up
  shows only on the side of midnight where the two days differ, which depends on the
  offset's sign, so the screen above and a regression of DR-068 pass both runs.
- The as-of picker keeps the text of "today" from its first render. Left open over
  midnight, it shows yesterday, and a blur saves yesterday as an explicit as-of date.
- One backup export reads the clock three times (file name, `exportedAt`, and "Last backup"
  after the save dialog), so the first two can name different days.
- The form refuses years before 1900 (a two-digit year would otherwise save as 19xx). CSV
  import and restore check only that the text is a real calendar date, so `1026-09-01`, a
  typo, imports and becomes the earliest lease. The engine's `utc()` turns year 99 into 1999;
  it is safe today only because every caller checks first.

## Decision

1. **The restore screen shows the local day** of `exportedAt`, the same day as the file name
   and the "Last backup" line: `fmtDate(localDay(exported))` (D6 item 1 A). No time of day.
2. **CI tests the layers that read local time in a positive zone too** (D6 item 2 B): a
   Pacific/Kiritimati (UTC+14) step runs `src/lib`, `src/ui` and `src/state`. The engine never
   reads local time and stays covered in UTC; Pago_Pago keeps running the full suite. The
   local-day fixtures sit at 00:30 and 23:30 local, where the two zones catch opposite slips.
3. **One day module.** `src/lib/day.ts` holds the conversions between an instant, its local
   calendar day and the UTC-midnight day; the copies become calls to it. No behaviour change.
4. **The as-of picker follows the day.** Its text re-syncs whenever the shown day changes,
   not only when the picked value does, so "Today" after midnight shows the new day.
5. **A 1900 floor for new dates; stored dates only warn** (D6 item 5 A, owner 2026-10-07):
   - One date constructor builds every calendar day from year, month and day with the full
     year (no two-digit mapping) and refuses a day that does not exist. There is one per
     layer: the engine's (`utc`, `calendarDay`) and a twin in `src/lib/day.ts`, because lib
     and the engine may not import each other; a test checks that the two agree.
   - The form and CSV import refuse a date before 01.01.1900, with a message that names the
     floor.
   - Loading the database does not apply the floor: the database guard checks only that a
     stored date is a real calendar date, with the same accepted years as before (0100–9999).
     A database that already holds an earlier date (possible through an earlier CSV import)
     keeps loading; the startup error screen has no Restore, so a refusal there would lock
     the owner out.
   - Restore treats a date before 1900 as a warning, like an out-of-range number (ADR 0148
     §1): the confirm step lists it and the button reads "Restore anyway". A rule only
     restore applies must not refuse a file the app wrote from data it loads.
   - The Data check lists such dates under "Needs attention", so the owner fixes them in the
     form, which refuses to save them.
6. **One clock per export.** The export reads the time once and uses it for the file name
   and `exportedAt`. "Last backup" keeps its meaning: the time the file was saved.

## Consequences

- ADR 0110: the restore screen's "Exported on" date is the local calendar day.
- New user-visible text: the date-floor messages for the form and CSV import, the restore
  warning and the Data check finding (en, cs, ru).
- CI runs part of the suite a third time (about a third of the tests).
- A CSV file with a date before 1900 is refused where it imported before.
- The engine's date constructors change only for years 0–99, which no caller passes; golden
  and parity results do not move.

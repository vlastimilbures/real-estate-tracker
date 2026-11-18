# 0252. A missing assumptions row stops startup

- Status: Accepted
- Date: 2026-11-18
- Source: issue #444 (code review 2026-11, tracking #435); owner decision 2026-11-18 (#435
  comment 6965976270); plan on #444 (comment 6969436685)
- Related: [0016](0016-first-run-seed.md) (the sample is seeded on the first run only),
  [0148](0148-restore-rules-vs-stored-data.md) §1 (a missing assumptions row stays blocking
  at restore), [0052](0052-restore-safety-backup.md) and
  [0153](0153-honest-startup-failures.md) §3 (the safety backup before a restore, and
  restore from the startup error screen), [0231](0231-unreadable-scenario-invalid.md)
  (`READ_FAILURES`)

## Context

On every launch `seedIfEmpty` (`src/data/seed.ts`) re-created a missing assumptions row
(`id = 1`) from the sample values, before it looked at the seed flag. A user whose row was
lost would start with the sample's assumptions in place of their own and not be told. No
ADR promised this; only a code comment did ("guards against partial restores").

The app itself never removes the row:

- restore refuses a backup without exactly one assumptions row (`MISSING_ASSUMPTIONS`,
  `src/data/backup.ts`) before it changes anything;
- a save runs as one transaction;
- Clear sample and Load sample leave assumptions alone (ADR 0094, ADR 0112);
- no migration deletes the row.

So the row goes missing only through a hand-edited database or a future bug. Then the
loader (`toAssumptions`, `src/data/repositories.ts`) threw a plain `Error`, which the
startup screen showed without a code and with Try again.

## Decision

1. **Created on a true first run only.** `seedIfEmpty` writes the assumptions row only when
   there is no `sample_seeded` flag and no property, and only when no row `id = 1` exists,
   just before the sample transaction. An existing row is never replaced, and a first seed
   that failed can run again. When the flag is set, or properties exist without the flag (a
   pre-flag database, ADR 0016), the row is never inserted.
2. **A missing row is a typed read failure.** `toAssumptions` throws
   `DataError("ROW_INVALID", …, ["assumptions 1: row not found"])`, in the details style of
   the mapper guards (`table id: problem`). The message keeps the old text
   "assumptions row not found (id = 1)".
3. **Existing screen, no new copy.** `ROW_INVALID` is in `READ_FAILURES`, so the startup
   error screen lists the record, offers Restore a backup… (`boot.restoreBackup`,
   `boot.nextRowInvalid`) and no Try again (ADR 0153, ADR 0231). `bootFailure.ts`,
   `BootFailure.tsx` and `errors.ts` do not change, and no dictionary key is added.
4. **Restore keeps its rules.** Restoring from that screen still writes the safety backup
   first (ADR 0052, ADR 0153 §3), and a backup that is also missing assumptions is refused
   with `MISSING_ASSUMPTIONS` (ADR 0148 §1) before anything is written, the safety backup
   included. The safety copy of such a database has no assumptions either, so it cannot
   itself be restored: the way out is a backup made before the row went missing.

Tests, written failing first in new files:
`src/data/__tests__/missingAssumptionsAtStartup.test.ts` and
`src/state/__tests__/missingAssumptionsBoot.test.ts`.

## Consequences

- No figure, parity target, golden master or migration changes; no stored data is rewritten.
- A database without its assumptions row now stops at startup with `ROW_INVALID` instead of
  silently running on the sample's assumptions. The way out is Restore a backup….
- A first run still seeds the sample with `SEED_ASSUMPTIONS`; an emptied portfolio that
  keeps its row loads as before.
- Parked (owner, only if wanted): a dedicated message for this case (for example a new
  `dataErrors` key, which is new copy) and a "re-create defaults" button on the error
  screen.

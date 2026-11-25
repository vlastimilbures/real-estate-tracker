# 0230. The database schema starts at version 8

- Status: Accepted
- Date: 2026-11-25
- Source: issue #450 (code review 2026-11 edge-case decision ED-06, tracking #435, table in
  #444); owner decision 2026-11-16, option A with the decision text
  ([comment](https://github.com/vlastimilbures/real-estate-tracker/issues/450#issuecomment-6911496840));
  the plan posted on #450; owner decisions 2026-11-25 (point 3: no Restore on the refusal
  screen; the cs/ru texts)
- Amends: [0153](0153-honest-startup-failures.md) §1 and §2 (`MIGRATION_CONFLICT` and
  `boot.partialConflict` are removed; `DB_TOO_OLD` joins the per-code table)
- Related: [0014](0014-rust-transaction-command.md) (the Rust transaction command loses its
  foreign-keys-off mode), [0183](0183-selling-costs-in-irr-terminal.md) (step 11, the newest step)

## Context

`src/data/migrations.ts` carried every schema step since version 1 and the tools only the
oldest steps needed: the version 7 table rebuild with its frozen table spec and constraint
pre-check (`MIGRATION_CONFLICT`), a "foreign keys off" transaction mode in every `Sql`
adapter and in the Rust command, and the version 8 rewrite of old scenario overrides. On a
new install all eleven steps ran on empty tables. The schema was at version 8 when the
repository went public (1.4.0); later releases added 9, 10 and 11. Every database the owner
still needs has been opened with 1.4.0 or later.

## Decision

**0230. The database schema starts at version 8.**

1. A new install creates the version 8 schema in one step from a single table definition (tested against the schema description of #470), then runs steps 9–11 as today.
2. A database at version 8 or later upgrades as today, including the "how far did the upgrade get" report on the start-up error screen.
3. A database below version 8 is refused at start-up, without being modified, with the message: "This database was last opened with a version older than 1.4.0. Open it once with version 1.5.0, then update." The screen still offers Restore a backup and Show data folder.
   Owner decision 2026-11-25 (#450): no Restore on this screen; restore requires a current-version database (ADR 0153 §3). The screen shows the message and Show data folder only, and the old file is never touched.
4. Removed: steps 1–8, the step 7 table rebuild and its constraint pre-check with its error code and texts (en/cs/ru), the foreign-keys-off transaction mode in TypeScript and Rust (with its Rust tests), and the tests that build version 1–7 databases.
5. JSON backup restore is unchanged: it fills missing fields itself and runs no schema steps.
6. `docs/data-safety.md` and `docs/release.md` say which versions can be upgraded.
7. Tests, written failing first: a version 8 database upgrades to the latest; a version 7 one is refused with the message and is byte-for-byte unchanged; a fresh install ends at the same schema as today. Parity targets and golden master do not move.

### How it is built

- **The baseline.** `BASELINE` in `src/data/migrations.ts` is the version 8 DDL exactly as
  steps 1–8 left it in `sqlite_master` (the tables as SQLite rewrote them after the version 7
  rename, and `app_meta`). A new install runs it, the `schema_migrations` table and its rows
  in one transaction, then steps 9–11, each in its own transaction as before. The schema
  description of #470 does not hold the CHECK expressions, so the DDL is frozen text, and
  tests pin it: a fresh install at head equals the `sqlite_master` of a fresh install before
  this change, byte for byte; the #470 drift test still compares `src/data/schema.ts` with a
  fresh install; each column's `addedIn` is checked against the baseline (8 or less: in the
  baseline) and against steps 9–11.
- **Stored data stays as before.** A new install still records `schema_migrations` rows 1–11
  under their old names; the baseline step writes rows 1–8.
- **The refusal writes nothing.** `migrate` reads first: whether `schema_migrations` exists,
  its versions, and `PRAGMA integrity_check`. A database newer than head is refused as before
  (`DB_NEWER`); one at versions 1–7 is refused with the new code `DB_TOO_OLD` before any
  write, backup or transaction. Only a database without versions (a new install) gets the
  baseline step, which creates `schema_migrations` itself. `DB_TOO_OLD` repeats on every
  start, so the screen shows no Try again, and it lists no details; the log-side message
  names the version.
- **Dictionary keys.** Added: `dataErrors.DB_TOO_OLD` (en, cs, ru); the cs/ru texts were
  approved by the owner on 2026-11-25. Removed: `dataErrors.MIGRATION_CONFLICT`,
  `boot.partialConflict` (en, cs, ru).
- **ADR 0153.** §1: only `MIGRATION_FAILED` carries the upgrade report now; there is no
  pre-check left. §2: the `MIGRATION_CONFLICT` row is removed; `DB_TOO_OLD` is lasting (no
  Try again) and its details heading would be `boot.detailsOther`.
- **No Restore a backup on the refusal screen (point 3, owner decision 2026-11-25).** ADR
  0153 §3 offers it only where the database is at head, because a restore writes head-schema
  rows into the open database and runs no schema steps (point 5). On a refused database the
  store holds no open database and the file must stay unchanged, so `bootView` gives
  `DB_TOO_OLD` no restore (pinned in `src/ui/model/__tests__/bootFailure.test.ts`). To use a
  JSON backup instead, the owner opens a current-version database and restores in Settings.

## Consequences

- No figure, parity target or golden-master change. A new install ends at the same schema and
  the same `schema_migrations` rows as before.
- A database last opened with an app older than 1.4.0 no longer opens: the owner opens it
  once with 1.5.0, which upgrades it to version 11, then updates. Nothing is written to it.
- The `Sql.transaction` interface, the three adapters and the Rust `db_transaction` command
  lose the foreign-keys-off option; `AppError::ForeignKeyCheck` goes with it.
- The Rust migration test (`src-tauri/tests/migrations_sql.rs`) runs the baseline and steps
  9–11 on the bundled SQLite.
- No ux-capture screen shows the removed `MIGRATION_CONFLICT` screen, so no capture changes.

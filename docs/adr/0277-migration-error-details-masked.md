# 0277. A stopped upgrade's error details are logged with their numbers masked

- Status: Accepted
- Date: 2026-11-27
- Source: owner decision 2026-11-27 (in session): mask the `MIGRATION_*` details in the
  log like every other free-text log line
- Amends: [0147](0147-failure-messages-and-log.md) (decision 5: a `DataError`'s details
  stay as they are, except a `MIGRATION_*` error's)
- Topic: Logging: migration error details
- Trigger: a migration fails on stored data
- Likelihood: rare (a migration runs once per upgrade, and each one is tested on
  synthetic data from every supported version)

## Context

ADR 0147 decision 5 masks every number in free text the webview logs, and lets a
`DataError`'s details through unmasked, because they name tables, ids, columns and rules,
never amounts. The startup upgrade's two errors break that assumption.
`MIGRATION_FAILED` and `MIGRATION_BACKUP_FAILED` (`src/data/migrations/index.ts`) carry
the failed step's message as their only detail: the SQLite driver's or Rust's own text.
That text can quote a stored value, so `describeFailure` (`src/data/errorLog.ts`) wrote it
to `app.log` with the raw digits, while every other free-text line is masked.

## Decision

1. **A `MIGRATION_*` error's details are masked in the log** by the existing
   `maskNumbers`, as other free text is (ADR 0147 decision 5). The OS or SQLite error code
   stays (ADR 0175), and so does the Rust code prefix (ADR 0270 point 7). Synthetic example: the
   driver's `(code: 275) bad value '7500000.50'` is logged as `(code: 275) bad value '#'`.
2. **Other `DataError`s log their details as before.** They hold names and ids, and an id
   such as `l1` keeps its digit.
3. **The screen does not change.** The startup error screen shows the details as they came
   (`startupDetails`, `src/ui/model/bootFailure.ts`); only the log line is masked.
4. **Rust needs no change.** It does not log a failed migration itself: `log_error`
   (`src-tauri/src/error_log.rs`) writes the line the webview sends, already masked.

## Consequences

- A pasted log excerpt from a failed upgrade no longer carries an amount from the database.
  Diagnosis relies on the code, the step and the words, as for other failures.
- Tests: `src/data/__tests__/migrations.test.ts` (both `MIGRATION_*` errors, details on the
  error unchanged, log line masked).

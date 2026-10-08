# 0153. Startup failures say what changed and offer a step that works

- Status: Accepted
- Date: 2026-10-07
- Source: issue #115 (2026-10 code review, findings G2-5-01, G2-5-03, G2-5-06, G2-5-13);
  owner decision D6 (2026-10-07: upgrade message A, screen B, per-code heading); Track 11
  PR 11.4
- Amended by: [0154](0154-one-outcome-path.md) (Continue keeps the safety copy's name in
  the app)
- Related: [0014](0014-rust-transaction-command.md) (migrations run through the Rust
  transaction command), [0064](0064-file-io-in-rust.md) §P8(2) (an open failure keeps the
  in-app error screen), [0072](0072-layer-map-platform-and-type-edges.md) (the UI reaches platform code through
  `src/state`), [0123](0123-scenario-rules-every-entry-point.md) (unreadable scenarios are listed, not
  fatal)

## Context

`migrate()` commits each pending migration in its own transaction. When a later step stops
(a precheck conflict or a failed statement), the earlier steps stay committed. Every message
still said nothing was changed and that the previous app version still opens the database,
which then refuses it as newer. A pre-migration copy existed, but no message named it.

The startup error screen had one action, **Try again**. For a damaged file or an unreadable
row, the retry fails the same way every time. The text said to restore a backup, but Restore
lives in Settings, which the screen never reaches. Every code listed its details under
"Records involved", including version strings, `PRAGMA integrity_check` lines and driver
errors.

Since ADR 0123, an unreadable scenario no longer stops the load, so `SCENARIO_INVALID` does
not reach this screen. The store already keeps the open `sql` when loading fails after
`open()`.

## Decision

1. **Honest upgrade report (D6 upgrade A).**
   - `migrate()` tracks the last committed version.
   - `MIGRATION_CONFLICT` and `MIGRATION_FAILED` carry
     `DataError.upgrade = { from, reached, stoppedAt, backupPath }`. The store keeps it in
     `startupError.upgrade`.
   - A precheck that throws becomes `MIGRATION_FAILED` too, instead of escaping as a raw
     error.
   - When `reached > from`, the screen shows `boot.partialConflict` or
     `boot.partialFailed`, then `boot.copyAt` with the copy's file name. A brand-new
     database (`from` 0) shows `boot.partialNew` instead: no previous version, no copy.
   - Pending prechecks are not run ahead of the first commit. That would need a
     minimum-schema guard for every precheck.
2. **Per-code actions.** One table, `bootView` in `src/ui/model/bootFailure.ts`:

   | code                                                       | Try again + `app.bootRetryHint` | Restore a backup… | details heading             |
   | ---------------------------------------------------------- | ------------------------------- | ----------------- | --------------------------- |
   | `DB_INTEGRITY`                                             | –                               | –                 | `boot.detailsOther`         |
   | `DB_NEWER`                                                 | –                               | –                 | `boot.detailsOther`         |
   | `MIGRATION_CONFLICT`                                       | –                               | –                 | `dataErrors.detailsHeading` |
   | `MIGRATION_BACKUP_FAILED`                                  | ✓                               | –                 | `boot.detailsOther`         |
   | `MIGRATION_FAILED`                                         | ✓                               | –                 | `boot.detailsOther`         |
   | `ROW_INVALID`                                              | –                               | ✓                 | `dataErrors.detailsHeading` |
   | `ROW_MISSING`, `SCENARIO_INVALID` (not reached at startup) | ✓                               | –                 | `dataErrors.detailsHeading` |
   | untyped failure                                            | ✓                               | –                 | –                           |
   - Every case shows **Show data folder** (`boot.showDataFolder`).
   - `DB_INTEGRITY` adds `boot.nextIntegrity`; `ROW_INVALID` adds `boot.nextRowInvalid`.
   - `app.bootRetryHint` no longer claims nothing changed on disk. `dataErrors.DB_INTEGRITY`
     loses its next step, which moves to `boot.nextIntegrity`.
   - Every move-aside step names `portfolio.db-wal` and `portfolio.db-shm` too.

3. **Restore on the screen, `ROW_INVALID` only (D6 screen B).**
   - There the database migrated to head and only reading it failed, so a restore can
     write to it.
   - `restoreAtStartup` runs the same checked restore as Settings, using the shared
     `RestoreConfirm` step. The safety copy is taken from the raw rows. The action refuses
     any other code.
   - Afterwards the screen names the safety copy (`backup.restored`) and offers
     `boot.continue`. `continueAfterRestore` leaves the screen only when the data loaded.
     Otherwise `boot.restoredReloadFailed` offers Try again.
   - For the `MIGRATION_*` codes the database is not at head, so no restore is offered.
4. **`reveal_data_dir`** (`src-tauri/src/files.rs`).
   - It takes no arguments from the webview. It runs `/usr/bin/open` (no shell) on
     `app_config_dir`, with `portfolio.db` selected when it exists.
   - It is a command of the app's own, granted through the default capability as
     `allow-reveal-data-dir`. No new plugin, webview permission or crate is added.
   - The wrapper `src/platform/revealDataDir.ts` is reached through `src/state/platform`. It
     does nothing outside the desktop app.
   - A failure shows `boot.revealFailed` with the folder path and is logged under
     `REVEAL`.
5. `docs/data-safety.md` describes the partly upgraded case and the per-code steps. It adds
   "Restore a JSON backup when the app cannot start".

## Consequences

- A user who skipped a release and hit a stopped upgrade is told which version the database
  reached, and which copy restores the previous one.
- Try again appears only where a retry can succeed. A lasting failure gets a step the user
  can take from the screen.
- The database can still be left partly upgraded. That is consistent (each step is atomic),
  and it is now reported. Running prechecks first stays open; it needs a minimum-schema rule
  for every future precheck.
- New tests:
  - a v6 → head upgrade stopping at v8;
  - one screen test per code;
  - a restore from the screen against a real database;
  - `log_error` payloads with Tauri on;
  - `ErrorBoundary` logging;
  - the Rust `reveal_args` path handling.

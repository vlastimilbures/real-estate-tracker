# 0175. File writes verify before replace; error-log codes; backup folder button

- Status: Accepted
- Date: 2026-10-11
- Source: issues #151 (items 1–7, code review 2026-10), #258 (items 1–7, review of PR #257),
  #171 (option A, tripwire part); owner decisions (2026-10-11, Track 14: #151 item 7 option C,
  #258 item 5 keep the codes, #258 item 7 not dismissable, #171 option A); Track 14 PR N4
- Amends: [0052](0052-restore-safety-backup.md) (the safety backup is checked byte for byte
  before the rename, not by row counts after it), [0147](0147-failure-messages-and-log.md)
  (decision 5 and its consequence: OS and SQLite error codes stay in the log; decision 4: the
  preview failure banner has no dismiss; decision 7: the panic line is capped), [0153](0153-honest-startup-failures.md) (decision 4: `reveal_data_dir` is also
  reached from Settings → Backup)
- Amended by: [0193](0193-kept-banners-purchases-column-save-errors.md) (a panic message cut at 500 characters ends with "…")
- Related: [0014](0014-rust-transaction-command.md) (multi-step writes go through the Rust
  transaction command), [0064](0064-file-io-in-rust.md) (file IO in Rust),
  [0080](0080-close-out.md) decision 6 (0600/0700), [0154](0154-one-outcome-path.md) (one
  outcome path for failures)

## Context

1. **#151 — file writes promise more than they do.** `write_verified` compares the bytes after
   the rename, so a mismatch has already replaced the old file. The temp file is opened with
   `create + truncate`, so it follows a file or symlink planted at its predictable name. The
   folder is not fsynced after the rename. `write_app_backup` verifies differently: it returns
   the whole file over IPC and the webview compares only row counts per table, so a changed
   amount passes. It is a synchronous command (main thread) and renames over an existing
   file, while `db_backup` refuses one. Safety and pre-migration backups are never shown in
   the app; the owner has to know the folder.
2. **#258 — the error log and its follow-ups.** The panic hook can deadlock when a panic fires
   while the logger holds its lock, and its line has no cap. Masking every number also hides
   `os error 13` and SQLite's `(code: 2067)`, which say what failed. A dismissed import
   preview failure leaves Import greyed out with no reason, the original #122 symptom.
3. **#171 — atomicity is a convention.** Multi-step writes must go through `transaction`
   (ADR 0014). Nothing stops a caller from sending `BEGIN` … `COMMIT` as separate `execute`
   calls on the pooled plugin connection, the H-14 bug shape.

## Decision

1. **One write helper.** Write the temp file exclusively (`O_EXCL`; on `AlreadyExists`, retry
   with a counter), fsync it, read it back through the same handle and compare the bytes
   (a guard against a short or garbled write), then rename it over the target. On a failure
   before the rename the target is left as it was. After the rename the folder is fsynced,
   best effort: some file systems a save may target (exFAT, network shares) refuse it, and
   the file is already in place, so that failure is not reported. `save_file` and
   `write_app_backup` both use it. The Rust-side compare replaces ADR 0052's webview
   read-back, which compared only row counts per table. A crash between create and rename
   can still leave a `.{name}.tmp-…` file behind, as before.
2. **`write_app_backup`** is async, returns nothing and refuses an existing name
   (`BACKUP_EXISTS`, checked before the write, as `db_backup` does). Two safety backups in
   the same second: the second fails with `BACKUP_EXISTS` instead of replacing the first,
   so its restore or Clear sample does not start. Practically unreachable: each needs a
   dialog, and the webview runs them one at a time; the check is not atomic against a
   concurrent write of the same name.
3. **Panic hook.** The panic line's message is capped at 500 characters, like
   `log_error`'s context. It is still not masked (ADR 0147, consequence). No re-entry
   guard (#258 item 1 proposed one): std aborts on a panic inside a panic hook without
   running the hook again ("thread panicked while processing panic"), so a guard could
   never fire. A panic inside the logger while it holds its own lock can still block the
   hook's log call; the hook cannot see that lock. Accepted as a known limit: the logger
   is tauri-plugin-log, and a hang there needs a panic inside its own write.
4. **Error codes stay in the log.** Masking keeps a run of 1–5 digits right after `os error `
   or `code: ` / `code ` (sqlx prints `(code: 2067) …`). Every other number is masked as
   before; a longer run after `code` is masked too. Amends ADR 0147 decision 5 and its
   consequence that `os error #` is masked.
5. **The import preview failure banner has no dismiss.** It clears when the files or the
   saved data change, which starts a new preview (ADR 0147 decision 4). The banner for a plan
   that changed before import (`importPage.planChanged`) keeps its dismiss.
6. **Settings → Backup shows the data folder.** The Export panel gets a hint
   (`backup.folderHint`) that the safety and pre-migration copies are in the `backups`
   folder inside the data folder, and **Show data folder** (the startup screen's
   `boot.showDataFolder`), which calls `reveal_data_dir` unchanged (ADR 0153 decision 4: the
   app folder in Finder, `portfolio.db` selected). A failure is logged under `REVEAL` and
   shown in the outcome banner (ADR 0154) with the folder's path (`boot.revealFailed`).
   Nothing is listed, counted or deleted.
7. **`execute` refuses transaction control.** `tauriSql.execute` rejects a statement that
   starts with `BEGIN`, `COMMIT`, `END`, `ROLLBACK`, `SAVEPOINT` or `RELEASE`, with a message
   naming `transaction` (ADR 0014). No caller sends one today; this is a tripwire.

## Consequences

- A failed check on a save leaves the old file in place. A power loss right after a save keeps
  the rename. A planted file at the temp name is neither followed nor truncated.
- The safety backup no longer crosses IPC twice; the webview's JSON read-back and count loop
  go away.
- The error log shows which OS or SQLite error happened (`os error 13`, `code: 2067`).
- Visible changes: the Import preview failure banner loses its ✕; Settings → Backup gets a
  button and a hint (one new key, `backup.folderHint`, in `en`, `cs`, `ru`).
- No engine, parity, golden-master, stored-data, export or CSV change.
- Out of scope: the ADR 0064 / `docs/release.md` wording of the raw-SQL risk (#171, a docs
  PR) and an `ATTACH` deny (#171 option B, not chosen). Backup retention (#151 option D, not
  chosen).

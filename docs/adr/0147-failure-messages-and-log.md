# 0147. Failure messages and the error log: right labels, right messages, masked numbers

- Status: Proposed
- Date: 2026-10-07
- Source: issue #122 (review findings G2-5-02, G2-5-08, G2-5-09, G2-5-10, G2-5-12), log
  policy option B (owner decision D4, 2026-10-06); Track 10 PR 10.8
- Related: [0080](0080-close-out.md) decision 6 (0600/0700 for the app folder and
  backups), [0096](0096-csv-import-preview.md) (import preview), [0125](0125-committed-write-reload-failure.md)
  (a failed reload after a write)

## Context

The local error log (`app.log`, written through `log_error` and tauri-plugin-log) is what the
bug form asks users to paste. The 2026-10 review found five weaknesses.

- **Content and docs (G2-5-02).** `maskNumbers` masks only runs of four or more digits, so
  `850 Kč` and `4.59 %` pass through, against its own comment. `README.md` says the files are
  readable only by the user (`0600`), but nothing restricts the log folder: `restrict_app_dir`
  covers only the app config folder and `backups/`. The bug form says only "remove anything
  personal", and does not say that record ids are often built from property names.
- **Wrong backup messages (G2-5-08).** A backup file that cannot be read (an unplugged disk,
  an iCloud file not downloaded) is reported as "not a valid backup of this app". A failure
  while reading the data for the pre-restore safety copy is reported as "the restore failed
  and was rolled back", although nothing started: `exportToJson` runs before the `try` in
  `writeSafetyBackup`, so its error is not a `SafetyBackupError`.
- **A silent import preview (G2-5-09).** A failed preview is logged but not shown. Import
  stays disabled with no reason on screen.
- **Rust launch failures and panics (G2-5-10).** An error from the setup closure (menu
  creation) comes back from `build()` and reaches only stderr, which is discarded when the
  app is opened from Finder. There is no panic hook. A comment claims tauri-plugin-log "has
  already recorded the cause"; it has not.
- **Free-string, wrong labels (G2-5-12).** A failed reload after a write is logged as
  `WRITE_FAILED`; Clear sample, Load sample and restore failures all log as `BACKUP_FAILED`.

Option A would also replace names and ids in the log with hashes. The owner chose option B:
keep names in the log, where they help diagnosis, and fix everything else.

## Decision

1. **Failure sites are a typed union** (`FailureSite` in `src/data/errorLog.ts`), with three
   new labels: `RELOAD` (the reload after a write, ADR 0125), `RESTORE` (choosing or
   confirming a restore) and `SAMPLE` (loading or clearing the sample). Backup export keeps
   `BACKUP`.
2. **An unreadable backup file says so.** Any `open_backup_file` failure other than
   `BACKUP_TOO_LARGE` becomes a `BackupReadError`, shown as "The file could not be read. Check
   that the disk is connected and the file is downloaded. (detail)". A file that reads but is
   not a backup keeps "not a valid backup".
3. **Reading the data for the safety backup is part of the safety backup.** `exportToJson`
   moves inside the `try` of `writeSafetyBackup`, so its failure is a `SafetyBackupError`:
   "Nothing was restored/cleared: a safety backup … could not be saved".
4. **A failed import preview shows an error banner** in the Import panel ("The files could not
   be checked against your saved data, so nothing can be imported yet. (detail)"). It clears
   when the files or the saved data change, or when a later preview succeeds.
5. **Every number in free text is masked.** `maskNumbers` replaces every digit run, with its
   separators, by `#`: `rent 850 Kč` → `rent # Kč`, `2026-10-03` → `#-#-#`. A `DataError`'s
   details stay as they are: by design (`src/data/errors.ts`) they name tables, ids, columns
   and rules, never amounts. Names stay in the log (option B).
6. **The log folder is private.** At startup, after the log plugin has opened `app.log`, the
   log folder becomes `0700` and its files `0600`, like the app folder (ADR 0080). A file the
   plugin rotates in mid-session is created with the default mode inside the `0700` folder,
   and is made `0600` at the next start. `README.md` says this.
7. **Rust failures reach the log.** A panic hook writes `PANIC <message> at <file:line>`
   through `log`, then runs the default hook. A `build()` error is logged as
   `STARTUP_SETUP_FAILED <error>` and the app exits with status 1, instead of panicking with
   the error on stderr only.
8. **The bug form names what to replace** in a log excerpt: property and scenario names,
   record ids built from them (for example `byt-lipova-12`), and folder paths with the
   user name. Amounts are already masked.

## Consequences

- The log line for a failure names where it happened, and a short number such as a row or an
  OS error code is masked too (`os error #`). Diagnosis relies on the code and the words.
- Two new on-screen messages (`backup.errUnreadable`, `importPage.previewFailed`) in `en`,
  `cs` and `ru`.
- Names and name-like ids still reach the log. The bug form, not the log, protects a public
  report. Random property ids (review findings R3-02 / R6-01) would remove most of them.
- A launch that fails in setup now exits with status 1 rather than a panic; the cause is in
  `app.log`.

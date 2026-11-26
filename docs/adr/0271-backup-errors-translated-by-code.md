# 0271. A backup failure from Rust is shown in the user's language, chosen by its code

- Status: Proposed
- Date: 2026-11-26
- Source: issue #463, ADR 0270 resolved question 5 (the owner, 2026-11-26, comment on #664:
  the untranslated `BACKUP_*` details are to be translated, so Czech and Russian users do
  not see English error text, in a follow-up ADR)
- Amends: [0175](0175-verified-file-writes-error-codes-backup-folder.md) (point 2: a
  refused safety backup, `BACKUP_EXISTS`, is shown by a translated text that names the file,
  not by Rust's text with the full path)
- Related: [0270](0270-error-codes-from-rust.md) (the `code` this matches on),
  [0153](0153-honest-startup-failures.md) (the startup error screen),
  [0154](0154-one-outcome-path.md) (the outcome banner), [0147](0147-failure-messages-and-log.md)
  (what the log keeps), [0052](0052-restore-safety-backup.md) (the safety backup)

## Context

Line references are to main @ 96df5068.

Since ADR 0270 a failed command reaches the webview as a `CommandError` with a stable
`code` and Rust's `Display` text as `detail` (`src/platform/commandError.ts:53-69`). The
`BACKUP_*` `Display` arms are English and start with the code itself
(`src-tauri/src/error.rs:165-171`); `BACKUP_EXISTS` adds the full path of the file
(`error.rs:165`).

Four translated messages put a Rust detail into a sentence, as a `detail` argument:

| Where                       | Key                                                         | Set at                                                                |
| --------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Safety backup, restore      | `backup.safetyBackupFailed`                                 | `src/ui/components/restoreFailure.ts:55-56`                           |
| Safety backup, Clear sample | `sample.safetyBackupFailed`                                 | `src/ui/components/ClearSampleDialog.tsx:38`                          |
| Backup export               | `backup.exportFailed`                                       | `restoreFailure.ts:57-58`, `src/ui/components/OutcomeRegions.tsx:32`  |
| Unreadable backup file      | `backup.errUnreadable`                                      | `restoreFailure.ts:59-60`                                             |
| Upgrade stopped (startup)   | `dataErrors.MIGRATION_BACKUP_FAILED`, then the details list | `src/ui/components/BootFailure.tsx:101-111` (each detail in `<code>`) |

The detail is copied as text at three places: `SafetyBackupError`
(`src/data/backup/backupFiles.ts:118-127`), `BackupExportError` (`backupFiles.ts:27-36`) and
`BackupReadError` (`backupFiles.ts:73-82`) keep `messageOf(cause)` as `detail`;
`toActionError` passes only that string on (`src/state/actionError.ts:50-55`). The startup
path keeps `[messageOf(e)]` as the `MIGRATION_BACKUP_FAILED` details
(`src/data/migrations/index.ts:166-176`), and the store copies only `code`, `details` and
`upgrade` into `StartupError` (`src/state/portfolio/store.ts:77-84`). The `CommandError`
itself survives only as `cause`.

Which `BACKUP_*` codes reach which message (from the Rust that raises them):

- **Safety backup** (`write_app_backup`, `src-tauri/src/commands/backup.rs:15-26`):
  `BACKUP_EXISTS` (`src-tauri/src/fs_atomic.rs:30-34`). Its other failures are
  `INVALID_BACKUP_NAME`, `NO_FOLDER`, `NO_FILE_NAME`, `SAVED_FILE_MISMATCH` and `IO`
  (`fs_atomic.rs:40-87`).
- **Upgrade stopped** (`db_backup` → `backup_to`, `src-tauri/src/db.rs:198-227`, `:274-288`):
  `BACKUP_EXISTS`, `BACKUP_PATH_NOT_UTF8`, `BACKUP_FAILED` (SQLite's text, or the OS text when
  the folder cannot be made, `db.rs:281`), `BACKUP_UNREADABLE` (sqlx's text),
  `BACKUP_CORRUPT` (`PRAGMA integrity_check` output) and `BACKUP_MISMATCH`. Also
  `INVALID_LABEL`, `DB_NOT_LOADED`, `SQL`, `IO` and `OTHER`.
- **Backup export** (`save_file`, `src-tauri/src/commands/dialogs.rs:64-90`): no `BACKUP_*`
  code. It fails with `IO`, `OTHER`, `NO_FOLDER`, `NO_FILE_NAME`, `SAVED_FILE_MISMATCH` or
  one of the request codes (`EXPECTED_RAW_BODY`, `MISSING_HEADER`, `INVALID_PERCENT_ESCAPE`).
- **Unreadable file** (`open_backup_file`, `dialogs.rs:113-125`): no `BACKUP_*` code reaches
  the message. `BACKUP_TOO_LARGE` is already matched by code and shown as
  `backup.errTooLarge` (`backupFiles.ts:107`); the rest is `OTHER` or `IO`.

How likely each is in real use:

- **`BACKUP_FAILED`** is the realistic one: a full disk during `VACUUM INTO` before an
  upgrade.
- **`BACKUP_UNREADABLE`, `BACKUP_CORRUPT`, `BACKUP_MISMATCH`**: a failing disk; rare.
- **`BACKUP_EXISTS`**: needs two copies with the same name in the same second (ADR 0175
  point 2); practically unreachable.
- **`BACKUP_PATH_NOT_UTF8`**: macOS paths are UTF-8; practically unreachable.

The realistic safety-backup failure, a full disk, is `IO`, not a `BACKUP_*` code (see open
question 1).

## Decision

1. **The webview picks the text by code.** A new dictionary section `backupErrors` is keyed
   by `CommandErrorCode`, in the style of `dataErrors` (keyed by `DataErrorCode`). Where a
   message today takes a Rust detail, a pure function in `src/ui/model/` gives the text for
   that place: the `backupErrors` entry for the `CommandError`'s code when there is one, and
   today's detail, unchanged, for any other code or a failure that is not a `CommandError`.
   The code is found in the error or its `cause` chain, as the log does (ADR 0270 point 7).
   No production code reads or matches the `detail` text (ADR 0270, "No string matching").
2. **The codes covered** are the `BACKUP_*` codes that reach a message (Context):
   `BACKUP_EXISTS`, `BACKUP_PATH_NOT_UTF8`, `BACKUP_FAILED`, `BACKUP_UNREADABLE`,
   `BACKUP_CORRUPT` and `BACKUP_MISMATCH`. `BACKUP_TOO_LARGE` keeps `backup.errTooLarge`. A
   test checks that every `BACKUP_*` code in `COMMAND_ERROR_CODES` other than
   `BACKUP_TOO_LARGE` has an entry, so a new one cannot be missed.
3. **The proposed keys, English text** (cs and ru: see "Czech and Russian texts"):

   | Key                                 | English                                                                               |
   | ----------------------------------- | ------------------------------------------------------------------------------------- |
   | `backupErrors.BACKUP_EXISTS(file)`  | `A file named ${file} is already in the backups folder, so it was not replaced.`      |
   | `backupErrors.BACKUP_PATH_NOT_UTF8` | `The path of the backups folder holds characters the database cannot write to.`       |
   | `backupErrors.BACKUP_FAILED`        | `The copy could not be written to the backups folder.`                                |
   | `backupErrors.BACKUP_UNREADABLE`    | `The copy was written, but it could not be opened to check it.`                       |
   | `backupErrors.BACKUP_CORRUPT`       | `The copy was written, but it failed its integrity check.`                            |
   | `backupErrors.BACKUP_MISMATCH`      | `The copy was written, but it does not hold the same number of records as your data.` |

   The surrounding keys (`backup.safetyBackupFailed`, `sample.safetyBackupFailed`,
   `dataErrors.MIGRATION_BACKUP_FAILED`) keep their text; they already say what was stopped
   and that nothing changed. The `backupErrors` text says what went wrong with the copy.

4. **A path is shown as a file name.** `BACKUP_EXISTS` names the file by its last part, as
   `boot.copyAt` does (`src/ui/model/bootFailure.ts:52`), never the full path: the folder
   is "the backups folder", which `backup.folderHint` and Show data folder already name
   (ADR 0175 point 6), and a full path shows the user's home folder name on screen. The
   name comes from the webview, which chose it: `writeSafetyBackup`'s `filename`
   (`backupFiles.ts:142`) and the migration's `${label}.sqlite` (`db.rs:282`). The data layer
   keeps that name next to the error (on `SafetyBackupError`, and on the
   `MIGRATION_BACKUP_FAILED` `DataError` and `StartupError`), so nothing parses Rust's
   detail and the wire shape of ADR 0270 does not change.
5. **Library text in a detail is not shown.** `BACKUP_FAILED`, `BACKUP_UNREADABLE` and
   `BACKUP_CORRUPT` carry SQLite's, sqlx's or the OS's English text. The screen shows the
   translated text only. The original detail stays in the log line as today (ADR 0270
   point 7: the code, then the masked detail), which the startup screen points to
   (`dataErrors.logHint`).
6. **On the startup screen** a translated detail is a plain list item, not `<code>`; a detail
   with no `backupErrors` entry stays in `<code>` as today (`BootFailure.tsx:107-111`). The
   heading stays `boot.detailsOther`.
7. **What ADR 0175 point 2 now means on screen.** A second safety backup in the same second
   still fails with `BACKUP_EXISTS` and its restore or Clear sample still does not start;
   the message names the file with `backupErrors.BACKUP_EXISTS` instead of Rust's text.

## Visible effects

Only for a failure with one of the six codes. Every other failure, the export and the
unreadable-file messages included, looks as today.

| Message                                                                       | Before (en, cs, ru)                                                                                                                                 | After, en                                                               | After, cs and ru                                                    |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `backup.safetyBackupFailed`, `sample.safetyBackupFailed` with `BACKUP_EXISTS` | The translated sentence, then in brackets Rust's English code and the full path (`BACKUP_EXISTS: /Users/…/backups/portfolio-before-restore-….json`) | The sentence, then `backupErrors.BACKUP_EXISTS` with the file name only | The same, wholly in the user's language once the texts are approved |
| Startup screen, `dataErrors.MIGRATION_BACKUP_FAILED` with a covered code      | The translated message, then under `boot.detailsOther` Rust's English line in monospace (for example `BACKUP_FAILED: database or disk is full`)     | The message, then the `backupErrors` text as a plain list item          | The same, in the user's language                                    |
| `backup.exportFailed`, `backup.errUnreadable`                                 | Unchanged (no covered code reaches them)                                                                                                            | Unchanged                                                               | Unchanged                                                           |

- An English user also sees a change: the code (`BACKUP_FAILED:`) and the library text
  leave the screen, and a full path becomes a file name.
- Two messages that are live-region announcements change their text (the outcome banner,
  ADR 0154), which is why this is an ADR and not a wording-log entry (ADR 0152).
- The log does not change. Computed numbers, stored data, exports and the layout do not
  change, apart from the startup screen's list item for a covered code (point 6).

## Czech and Russian texts

Parked. Each of the six `backupErrors` keys needs a Czech and a Russian text **supplied or
approved by the owner**, recorded in `docs/decisions/wording.md` (ADR 0152) when they land.
This ADR proposes none.

| Key                                 | cs                        | ru                        |
| ----------------------------------- | ------------------------- | ------------------------- |
| `backupErrors.BACKUP_EXISTS(file)`  | owner to supply / approve | owner to supply / approve |
| `backupErrors.BACKUP_PATH_NOT_UTF8` | owner to supply / approve | owner to supply / approve |
| `backupErrors.BACKUP_FAILED`        | owner to supply / approve | owner to supply / approve |
| `backupErrors.BACKUP_UNREADABLE`    | owner to supply / approve | owner to supply / approve |
| `backupErrors.BACKUP_CORRUPT`       | owner to supply / approve | owner to supply / approve |
| `backupErrors.BACKUP_MISMATCH`      | owner to supply / approve | owner to supply / approve |

The implementation does not start before these are approved: the dictionaries have the same
keys in all three languages, so English cannot land alone without English text in cs and ru,
which is the problem this ADR fixes.

## Tests

Written first; each fails on main:

- **The shown text, wire to screen** (`src/ui/__tests__/commandErrorTexts.test.ts`, for en,
  cs and ru):
  - "a failed safety backup names Rust's detail" (`:63-72`) becomes "a safety backup that
    already exists names the file in the user's language": with a mocked `BACKUP_EXISTS`
    rejection, the text is `t.backup.safetyBackupFailed(t.backupErrors.BACKUP_EXISTS(name))`
    for the file name `writeSafetyBackup` chose, and it holds neither `BACKUP_` nor `/`.
  - The same for Clear sample with `t.sample.safetyBackupFailed`.
  - A new case: `migrate` on a database that needs an upgrade, with `db_backup` rejected as
    `BACKUP_FAILED`, gives a `StartupError` whose detail line is
    `t.backupErrors.BACKUP_FAILED` (and for `BACKUP_EXISTS`, with the `.sqlite` file name).
  - Stay green unchanged: the export (`:74-88`), unreadable-file (`:48-54`) and too-large
    (`:56-61`) cases. A new case keeps an `IO` safety-backup failure showing its detail as
    today.
- **The pure text function** (`src/ui/model/__tests__/`): each covered code gives its entry;
  an uncovered code, a plain `Error` and a string give today's detail; a code found only in
  `cause` is used.
- **The startup screen** (`src/ui/__tests__/BootFailure.test.tsx`): a covered code renders
  as a plain list item without `<code>`, and an uncovered one keeps `<code>`.
- **The data layer** (`src/data/__tests__/backupFiles.test.ts`, `migrations.test.ts`):
  `SafetyBackupError` and the `MIGRATION_BACKUP_FAILED` `DataError` carry the file name the
  webview chose.
- **Coverage of the codes** (`src/i18n/__tests__/dictionaries.test.ts`): every `BACKUP_*`
  code in `COMMAND_ERROR_CODES` except `BACKUP_TOO_LARGE` has a `backupErrors` entry in en,
  cs and ru.

Already green, and they must stay green unchanged: the error-log tests
(`src/data/__tests__/errorLog.test.ts`, the code and masked detail), the source test that no
production TypeScript matches a driver or Rust text (`src/__tests__/noErrorTextMatching.test.ts`), and the Rust `Display` table in
`error.rs`.

## Consequences

- A Czech or Russian user no longer sees an English code or library sentence for a backup
  copy that failed; no user sees their home folder's path in that message.
- The library text leaves the screen. A user reporting the problem finds it in the log,
  which the startup screen names, and the bug form already asks for an excerpt.
- Rust's `BACKUP_*` `Display` texts are no longer shown, only logged, so editing them is no
  longer a visible change.
- The cost: a new dictionary section of six keys in three languages, the file name kept on
  two error types and `StartupError`, and a second rendering of a startup detail.
- Not covered, and each still shows Rust's English text inside a translated sentence: `IO`
  (the OS text, for example a full disk), `SQL`, `OTHER`, `SAVED_FILE_MISMATCH`,
  `NO_FOLDER` and `NO_FILE_NAME` (the last two with a full path), and the request codes of
  `save_file`. See open question 1.
- No engine, parity, golden-master, stored-data, CSV or export change.

## Open questions for the owner

1. **Scope.** This ADR covers the six `BACKUP_*` codes, as resolved question 5 of ADR 0270
   says. The realistic failures are elsewhere: a full disk during a safety backup or an
   export is `IO` ("No space left on device (os error 28)"), and `SAVED_FILE_MISMATCH`,
   `NO_FOLDER` and `NO_FILE_NAME` are fixed English sentences, the last two with a full
   path. Options:
   - (A) Only the six `BACKUP_*` codes, as written.
   - (B) Also `SAVED_FILE_MISMATCH`, `NO_FOLDER` and `NO_FILE_NAME`: fixed texts, same
     method, three more keys.
   - (C) B, plus a translated generic text for `IO` that keeps the OS text after it
     (`os error 28`), since the OS text cannot be translated.
     Recommended: **B** now, and C as its own ADR if the owner wants the disk-full case
     covered, because it changes how every save failure reads.
2. **The library text** (point 5). Recommended: translated text only on screen, the library
   text in the log. The alternative is the translated text followed by the library text in
   brackets, which keeps a hint such as "database or disk is full" on screen but brings
   English back into a Czech or Russian message.
3. **Where the file name comes from** (point 4). Recommended: the webview keeps the name it
   chose, so the wire stays as ADR 0270 set it. The alternative is a `file` field on the
   wire for `BACKUP_EXISTS`, which amends ADR 0270 point 1 and its code-list test.
4. **The English texts** in point 3: accept as written, or reword before the Czech and
   Russian texts are made.
5. **The Czech and Russian texts** for the six keys: the owner to supply them, or to approve
   drafts made after this ADR is accepted.

# 0271. A backup failure from Rust is shown in the user's language, chosen by its code

- Status: Accepted
- Date: 2026-11-26
- Source: issue #463, ADR 0270 resolved question 5 (the owner, 2026-11-26, comment on #664:
  the untranslated `BACKUP_*` details are to be translated, so Czech and Russian users do
  not see English error text, in a follow-up ADR). The owner accepted this ADR on
  2026-11-27 (comment on PR #694), answering its five questions (see "Resolved
  questions").
- Amends: [0175](0175-verified-file-writes-error-codes-backup-folder.md) (point 2: a
  refused safety backup, `BACKUP_EXISTS`, is shown by a translated text that names the file,
  not by Rust's text with the full path)
- Related: [0270](0270-error-codes-from-rust.md) (the `code` this matches on),
  [0153](0153-honest-startup-failures.md) (the startup error screen),
  [0154](0154-one-outcome-path.md) (the outcome banner), [0147](0147-failure-messages-and-log.md)
  (what the log keeps), [0052](0052-restore-safety-backup.md) (the safety backup),
  [0193](0193-save-errors-panic-marker.md) (a failed save's detail inside a translated
  sentence)

## Context

Line references are to main @ 375377ec.

Since ADR 0270 a failed command reaches the webview as a `CommandError` with a stable
`code` and Rust's `Display` text as `detail` (`src/platform/commandError.ts:53-69`). The
`BACKUP_*` `Display` arms are English and start with the code itself
(`src-tauri/src/error.rs:165-171`); `BACKUP_EXISTS` adds the full path of the file
(`error.rs:165`). `NO_FOLDER` and `NO_FILE_NAME` are English sentences with the full path,
and `SAVED_FILE_MISMATCH` is a fixed English sentence (`error.rs:172-174`).

Seven translated messages put a Rust detail into a sentence, as a `detail` argument:

| Where                       | Key                                                         | Set at                                                                |
| --------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Safety backup, restore      | `backup.safetyBackupFailed`                                 | `src/ui/components/restoreFailure.ts:55-56`                           |
| Safety backup, Clear sample | `sample.safetyBackupFailed`                                 | `src/ui/components/ClearSampleDialog.tsx:38`                          |
| Backup export               | `backup.exportFailed`                                       | `restoreFailure.ts:57-58`, `src/ui/components/OutcomeRegions.tsx:32`  |
| Excel export                | `xlsx.exportFailed`                                         | `OutcomeRegions.tsx:37-38`, from `ExportXlsxButton.tsx:40-45`         |
| CSV template                | `importPage.templateFailed`                                 | `src/ui/pages/ImportPanels.tsx:171-173`                               |
| Unreadable backup file      | `backup.errUnreadable`                                      | `restoreFailure.ts:59-60`                                             |
| Upgrade stopped (startup)   | `dataErrors.MIGRATION_BACKUP_FAILED`, then the details list | `src/ui/components/BootFailure.tsx:101-113` (each detail in `<code>`) |

The detail is copied as text in one place for the three Backup & Restore file steps:
`FileStepError` (`src/data/errors.ts:151-164`), thrown with the step `export`, `read` or
`safety` (`src/data/backup/backupFiles.ts:54`, `:82`, `:112`), keeps `messageOf(cause)` as
`detail` (for `export`, `saveFailureDetail(cause)`); `toActionError` passes only that string
on (`src/state/actionError.ts:55-56`). A failed file save is a `SaveFileError` whose
`detail` is the same text (`src/platform/saveFileTypes.ts:10-27`), and the Excel export and
the CSV template take it with `saveFailureDetail`. The startup path keeps `[messageOf(e)]`
as the `MIGRATION_BACKUP_FAILED` details (`src/data/migrations/index.ts:166-177`), and the
store copies only `code`, `details` and `upgrade` into `StartupError`
(`src/state/portfolio/store.ts:78-85`). The `CommandError` itself survives only as
`cause`.

Which codes reach which message (from the Rust that raises them):

- **Safety backup** (`write_app_backup`, `src-tauri/src/commands/backup.rs:15-26`):
  `BACKUP_EXISTS` (`src-tauri/src/fs_atomic.rs:30-35`), then through `write_via_temp`
  `NO_FOLDER` (`fs_atomic.rs:41-43`), `NO_FILE_NAME` (`fs_atomic.rs:44-47`) and
  `SAVED_FILE_MISMATCH` (`fs_atomic.rs:83-85`). Its other failures are
  `INVALID_BACKUP_NAME` and `IO`.
- **Upgrade stopped** (`db_backup` → `backup_to`, `src-tauri/src/db.rs:198-228`, `:272-288`):
  `BACKUP_EXISTS`, `BACKUP_PATH_NOT_UTF8`, `BACKUP_FAILED` (SQLite's text, or the OS text when
  the folder cannot be made, `db.rs:281`), `BACKUP_UNREADABLE` (sqlx's text),
  `BACKUP_CORRUPT` (`PRAGMA integrity_check` output) and `BACKUP_MISMATCH`. Also
  `INVALID_LABEL`, `DB_NOT_LOADED`, `SQL`, `IO` and `OTHER`. It does not use
  `atomic_write`, so none of `SAVED_FILE_MISMATCH`, `NO_FOLDER` or `NO_FILE_NAME` reaches
  this screen.
- **A file save: backup export, Excel export, CSV template** (`save_file`,
  `src-tauri/src/commands/dialogs.rs:64-90`): no `BACKUP_*` code. `atomic_write`
  (`dialogs.rs:84`) raises `NO_FOLDER`, `NO_FILE_NAME` and `SAVED_FILE_MISMATCH` as above.
  The rest is `IO`, `OTHER` or one of the request codes (`EXPECTED_RAW_BODY`,
  `MISSING_HEADER`, `INVALID_PERCENT_ESCAPE`).
- **Unreadable file** (`open_backup_file`, `dialogs.rs:103-127`): no covered code reaches
  the message. `BACKUP_TOO_LARGE` is already matched by code and shown as
  `backup.errTooLarge` (`backupFiles.ts:81`); the rest is `OTHER` or `IO`.
- **Show data folder** (`reveal_data_dir`, `src-tauri/src/commands/reveal.rs:15`): can
  raise `NO_FOLDER`, but its failure is shown as the fixed `boot.revealFailed` with no
  detail (`OutcomeRegions.tsx:39-40`, `BootFailure.tsx:163`, `:203`), so nothing changes
  there.

How likely each is in real use:

- **`BACKUP_FAILED`** is the realistic one: a full disk during `VACUUM INTO` before an
  upgrade.
- **`BACKUP_UNREADABLE`, `BACKUP_CORRUPT`, `BACKUP_MISMATCH`, `SAVED_FILE_MISMATCH`**: a
  failing disk; rare.
- **`BACKUP_EXISTS`**: needs two copies with the same name in the same second (ADR 0175
  point 2); practically unreachable.
- **`BACKUP_PATH_NOT_UTF8`**: macOS paths are UTF-8; practically unreachable.
- **`NO_FOLDER`, `NO_FILE_NAME`**: only for a path with no parent or no last part (`/`, or
  one ending in `..`). Neither the save dialog nor the app's own backups folder gives one;
  practically unreachable.

The realistic safety-backup and export failure, a full disk, is `IO`, not a covered code;
it stays out of this ADR (resolved question 1).

## Decision

1. **The webview picks the text by code.** A new dictionary section `commandErrors` is
   keyed by `CommandErrorCode`, in the style of `dataErrors` (keyed by `DataErrorCode`).
   Where a message today takes a Rust detail, a pure function in `src/ui/model/` gives the
   text for that place: the `commandErrors` entry for the failure's code when there is one,
   and today's detail, unchanged, for any other code or a failure that is not a
   `CommandError`. The code is found in the error or its `cause` chain, as the log does
   (ADR 0270 point 7); the state layer reads it and hands it to the UI with the detail. No
   production code reads or matches the `detail` text (ADR 0270, "No string matching").
2. **The codes covered** are the `BACKUP_*` codes that reach a message, `BACKUP_EXISTS`,
   `BACKUP_PATH_NOT_UTF8`, `BACKUP_FAILED`, `BACKUP_UNREADABLE`, `BACKUP_CORRUPT` and
   `BACKUP_MISMATCH`, and the fixed file-write codes `SAVED_FILE_MISMATCH`, `NO_FOLDER` and
   `NO_FILE_NAME` (Context). `BACKUP_TOO_LARGE` keeps `backup.errTooLarge`. `IO` is not
   covered (resolved question 1). A test checks that every `BACKUP_*` code in
   `COMMAND_ERROR_CODES` other than `BACKUP_TOO_LARGE`, and each of the three file-write
   codes, has an entry, so a new `BACKUP_*` code cannot be missed.
3. **The keys, English text** (cs and ru: see "Czech and Russian texts"):

   | Key                                  | English                                                                               |
   | ------------------------------------ | ------------------------------------------------------------------------------------- |
   | `commandErrors.BACKUP_EXISTS(file)`  | `A file named ${file} is already in the backups folder, so it was not replaced.`      |
   | `commandErrors.BACKUP_PATH_NOT_UTF8` | `The path of the backups folder holds characters the database cannot write to.`       |
   | `commandErrors.BACKUP_FAILED`        | `The copy could not be written to the backups folder.`                                |
   | `commandErrors.BACKUP_UNREADABLE`    | `The copy was written, but it could not be opened to check it.`                       |
   | `commandErrors.BACKUP_CORRUPT`       | `The copy was written, but it failed its integrity check.`                            |
   | `commandErrors.BACKUP_MISMATCH`      | `The copy was written, but it does not hold the same number of records as your data.` |
   | `commandErrors.SAVED_FILE_MISMATCH`  | `The file was written, but it did not read back the same, so it was not kept.`        |
   | `commandErrors.NO_FOLDER`            | `There is no folder to save the file in.`                                             |
   | `commandErrors.NO_FILE_NAME`         | `There is no file name to save the file under.`                                       |

   The six `BACKUP_*` texts are the owner's accepted texts; the three file-write texts are
   drafted in the same style. `SAVED_FILE_MISMATCH` says "not kept" because the temp file is
   removed and the target is left as it was (`fs_atomic.rs:49-52`). The surrounding keys
   (`backup.safetyBackupFailed`, `sample.safetyBackupFailed`, `backup.exportFailed`,
   `xlsx.exportFailed`, `importPage.templateFailed`, `dataErrors.MIGRATION_BACKUP_FAILED`)
   keep their text; they already say what was stopped. The `commandErrors` text says what
   went wrong with the file.

4. **A path is shown as a file name, or not at all.** `BACKUP_EXISTS` names the file by its
   last part, as `boot.copyAt` does (`src/ui/model/bootFailure.ts:52`), never the full path:
   the folder is "the backups folder", which `backup.folderHint` and Show data folder
   already name (ADR 0175 point 6), and a full path shows the user's home folder name on
   screen. The name comes from the webview, which chose it: `writeSafetyBackup`'s
   `filename` (`backupFiles.ts:104`) and the migration's `${label}.sqlite` (`db.rs:282`,
   label from `src/data/migrations/index.ts:199-202`). The data layer keeps that name next
   to the error (on the `FileStepError` of the `safety` step, and on the
   `MIGRATION_BACKUP_FAILED` `DataError` and `StartupError`), so nothing parses Rust's
   detail and the wire shape of ADR 0270 does not change. `NO_FOLDER` and `NO_FILE_NAME` show no path or name: in a save the user may have
   renamed the file in the dialog, so the webview does not know the name Rust was given.
5. **Library text in a detail is not shown.** `BACKUP_FAILED`, `BACKUP_UNREADABLE` and
   `BACKUP_CORRUPT` carry SQLite's, sqlx's or the OS's English text. The screen shows the
   translated text only. The original detail stays in the log line as today (ADR 0270
   point 7: the code, then the masked detail), which the startup screen points to
   (`dataErrors.logHint`).
6. **On the startup screen** a translated detail is a plain list item, not `<code>`; a detail
   with no `commandErrors` entry stays in `<code>` as today (`BootFailure.tsx:107-111`). The
   heading stays `boot.detailsOther`.
7. **What ADR 0175 point 2 now means on screen.** A second safety backup in the same second
   still fails with `BACKUP_EXISTS` and its restore or Clear sample still does not start;
   the message names the file with `commandErrors.BACKUP_EXISTS` instead of Rust's text.

## Visible effects

Only for a failure with one of the nine codes. Every other failure, the unreadable-file
message and Show data folder included, looks as today.

| Message                                                                                       | Before (en, cs, ru)                                                                                                                                 | After, en                                                                | After, cs and ru                        |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------- |
| `backup.safetyBackupFailed`, `sample.safetyBackupFailed` with `BACKUP_EXISTS`                 | The translated sentence, then in brackets Rust's English code and the full path (`BACKUP_EXISTS: /Users/…/backups/portfolio-before-restore-….json`) | The sentence, then `commandErrors.BACKUP_EXISTS` with the file name only | The same, wholly in the user's language |
| The same two, with `SAVED_FILE_MISMATCH`, `NO_FOLDER` or `NO_FILE_NAME`                       | The sentence, then Rust's English sentence (`the saved file does not match`, `no folder for /Users/…`)                                              | The sentence, then the `commandErrors` text, with no path                | The same, in the user's language        |
| `backup.exportFailed`, `xlsx.exportFailed`, `importPage.templateFailed` with one of the three | The sentence, then Rust's English sentence, for `NO_FOLDER` and `NO_FILE_NAME` with the full path the user picked                                   | The sentence, then the `commandErrors` text, with no path                | The same, in the user's language        |
| Startup screen, `dataErrors.MIGRATION_BACKUP_FAILED` with a covered `BACKUP_*` code           | The translated message, then under `boot.detailsOther` Rust's English line in monospace (for example `BACKUP_FAILED: database or disk is full`)     | The message, then the `commandErrors` text as a plain list item          | The same, in the user's language        |
| `backup.errUnreadable`, `boot.revealFailed`                                                   | Unchanged (no covered code reaches the first; the second shows no detail)                                                                           | Unchanged                                                                | Unchanged                               |

- An English user also sees a change: the code (`BACKUP_FAILED:`) and the library text
  leave the screen, and a full path becomes a file name or goes.
- Five messages that are live-region announcements change their text: three in the
  outcome banner (ADR 0154: the safety backup at restore, the backup export and the Excel
  export), the Clear sample dialog's error (`role="alert"`,
  `src/ui/components/ClearSampleDialog.tsx:67`) and the startup screen
  (`role="alert"`, `BootFailure.tsx:198`); only the CSV template's message is not
  announced (`src/ui/pages/ImportPanels.tsx:253-254`). That is why this is an ADR and not
  a wording-log entry (ADR 0152).
- The log does not change. Computed numbers, stored data, exports and the layout do not
  change, apart from the startup screen's list item for a covered code (point 6).

## Czech and Russian texts

Approved by the owner on 2026-11-27 (comment on PR #694). Each text is recorded in
`docs/decisions/wording.md` (ADR 0152) when it lands, with that approval.

| Key                                  | cs                                                                                    | ru                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `commandErrors.BACKUP_EXISTS(file)`  | `Ve složce záloh už je soubor ${file}, proto nebyl nahrazen.`                         | `В папке резервных копий уже есть файл ${file}, поэтому он не заменён.`                                      |
| `commandErrors.BACKUP_PATH_NOT_UTF8` | `Cesta ke složce záloh obsahuje znaky, kvůli kterým do ní databáze nemůže zapisovat.` | `Путь к папке резервных копий содержит символы, из-за которых база данных не может записывать в неё данные.` |
| `commandErrors.BACKUP_FAILED`        | `Kopii se nepodařilo zapsat do složky záloh.`                                         | `Не удалось записать копию в папку резервных копий.`                                                         |
| `commandErrors.BACKUP_UNREADABLE`    | `Kopie byla zapsána, ale nepodařilo se ji otevřít a zkontrolovat.`                    | `Копия записана, но её не удалось открыть для проверки.`                                                     |
| `commandErrors.BACKUP_CORRUPT`       | `Kopie byla zapsána, ale neprošla kontrolou integrity.`                               | `Копия записана, но не прошла проверку целостности.`                                                         |
| `commandErrors.BACKUP_MISMATCH`      | `Kopie byla zapsána, ale neobsahuje stejný počet záznamů jako vaše data.`             | `Копия записана, но число записей в ней не совпадает с вашими данными.`                                      |
| `commandErrors.SAVED_FILE_MISMATCH`  | `Soubor byl zapsán, ale neodpovídal zapsaným datům, proto nebyl uložen.`              | `Файл записан, но при проверке после записи не совпал, поэтому не сохранён.`                                 |
| `commandErrors.NO_FOLDER`            | `Chybí složka, do které by se soubor uložil.`                                         | `Нет папки, в которую можно сохранить файл.`                                                                 |
| `commandErrors.NO_FILE_NAME`         | `Chybí název souboru, pod kterým by se uložil.`                                       | `Нет имени, под которым можно сохранить файл.`                                                               |

The words follow the dictionaries: "složka záloh" and "папка резервных копий" as in
`boot.copyAt`, "kontrola integrity" and "проверка целостности" as in
`dataErrors.DB_INTEGRITY`.

## Tests

Written first; each fails on main:

- **The shown text, wire to screen** (`src/ui/__tests__/commandErrorTexts.test.ts`, for en,
  cs and ru):
  - "a failed safety backup names Rust's detail" becomes "a safety backup that already
    exists names the file in the user's language": with a mocked `BACKUP_EXISTS`
    rejection, the text is `t.backup.safetyBackupFailed(t.commandErrors.BACKUP_EXISTS(name))`
    for the file name `writeSafetyBackup` chose, and it holds neither `BACKUP_` nor `/`.
  - The same for Clear sample with `t.sample.safetyBackupFailed`.
  - A safety backup rejected with `SAVED_FILE_MISMATCH` shows
    `t.commandErrors.SAVED_FILE_MISMATCH`.
  - A backup export, an Excel export and a CSV template save rejected with `NO_FOLDER`,
    `NO_FILE_NAME` or `SAVED_FILE_MISMATCH` show the `commandErrors` text inside their
    sentence, with no `/`.
  - A new case: `migrate` on a database that needs an upgrade, with `db_backup` rejected as
    `BACKUP_FAILED`, gives a `StartupError` whose detail line is
    `t.commandErrors.BACKUP_FAILED` (and for `BACKUP_EXISTS`, with the `.sqlite` file name).
  - Stay green unchanged: the export with `IO`, the unreadable-file and the too-large cases.
    A new case keeps an `IO` safety-backup failure showing its detail as today.
- **The pure text function** (`src/ui/model/__tests__/`): each covered code gives its entry;
  an uncovered code or no code gives today's detail; `BACKUP_EXISTS` names the file.
- **Finding the code** (`src/platform/__tests__/`): a code in the error itself, a code found
  only in `cause`, a plain `Error`, a string and a looping `cause` chain.
- **The startup screen** (`src/ui/__tests__/BootFailure.test.tsx`): a covered code renders
  as a plain list item without `<code>`, and an uncovered one keeps `<code>`.
- **The data layer** (`src/data/__tests__/backupFiles.test.ts`, `migrations.test.ts`):
  the `FileStepError` of the `safety` step and the `MIGRATION_BACKUP_FAILED` `DataError`
  carry the file name the webview chose.
- **Coverage of the codes** (`src/i18n/__tests__/dictionaries.test.ts`): every `BACKUP_*`
  code in `COMMAND_ERROR_CODES` except `BACKUP_TOO_LARGE`, and `SAVED_FILE_MISMATCH`,
  `NO_FOLDER` and `NO_FILE_NAME`, has a `commandErrors` entry in en, cs and ru.

Already green, and they must stay green unchanged: the error-log tests
(`src/data/__tests__/errorLog.test.ts`, the code and masked detail), the source test that no
production TypeScript matches a driver or Rust text (`src/__tests__/noErrorTextMatching.test.ts`), and the Rust `Display` table in
`error.rs`.

## Consequences

- A Czech or Russian user no longer sees an English code or library sentence for a backup
  copy or a file save that failed with a covered code; no user sees their home folder's
  path in that message.
- The library text leaves the screen. A user reporting the problem finds it in the log,
  which the startup screen names, and the bug form already asks for an excerpt.
- Rust's `Display` texts of the nine codes are no longer shown, only logged, so editing them
  is no longer a visible change.
- The cost: a new dictionary section of nine keys in three languages, the code and the file
  name kept next to the detail on the action errors and `StartupError`, and a second
  rendering of a startup detail.
- Not covered, and each still shows Rust's English text inside a translated sentence: `IO`
  (the OS text, for example a full disk), `SQL`, `OTHER` and the request codes of
  `save_file`. A translated text for `IO` would need its own ADR.
- No engine, parity, golden-master, stored-data, CSV or export change.

## Resolved questions

The owner answered on 2026-11-27 (comment on PR #694).

1. **Scope.** (B): the six `BACKUP_*` codes plus `SAVED_FILE_MISMATCH`, `NO_FOLDER` and
   `NO_FILE_NAME`, fixed texts by the same method; `NO_FOLDER` and `NO_FILE_NAME` do not
   show a full path. `IO` (disk full) stays out; a text for it would need its own ADR.
   Following the Rust (Context), the three file-write codes also reach the backup export,
   the Excel export and the CSV template messages, which this ADR therefore covers too.
2. **The library text.** Translated text only on screen; the library text stays in the log
   (point 5).
3. **Where the file name comes from.** The webview keeps the name it chose, so the wire
   shape from ADR 0270 does not change (point 4).
4. **The English texts.** The six texts are accepted as written. The three new ones are
   drafted in the same style (point 3).
5. **The Czech and Russian texts.** Approved on 2026-11-27 (comment on PR #694) as
   drafted here, with four changes: the Czech `SAVED_FILE_MISMATCH` and `NO_FILE_NAME`
   and the Russian `BACKUP_PATH_NOT_UTF8` and `SAVED_FILE_MISMATCH` ("Czech and Russian
   texts" shows the approved texts). Each gets a `docs/decisions/wording.md` entry.

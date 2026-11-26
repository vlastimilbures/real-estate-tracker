# 0270. Rust sends an error code with its text; TypeScript matches on the code

- Status: Accepted
- Date: 2026-11-26
- Source: issue #463 (code review 2026-11, CR-11, findings R12-03 and R03-07, tracking
  #435). The owner decided on 2026-11-26 (comment on #463) on the direction: Rust sends a
  stable error code alongside the display text, TypeScript matches on codes, and the visible
  texts do not change. The owner accepted this ADR on 2026-11-26 (comment on #664,
  "follow best practice and the customer-first principle"), answering its seven questions
  (see "Resolved questions").
- Amends: [0147](0147-failure-messages-and-log.md) (decision 7: a log line for a failed
  command also records its Rust code)
- Amends: [0064](0064-file-io-in-rust.md) (the webview no longer gets the SQL plugin's
  `execute`, see Consequences)
- Related: [0014](0014-rust-transaction-command.md) (writes in a Rust command),
  [0175](0175-verified-file-writes-error-codes-backup-folder.md) (the `BACKUP_*` texts).
  It replaces the rule in the header of `src-tauri/src/error.rs` that the display text is
  the contract.

## Context

Line references are to main @ df370635.

`AppError` (`src-tauri/src/error.rs:13-45`) has 22 variants. It crosses to the webview as
its `Display` string and nothing else (`error.rs:86-90`). The file's header (`:1-7`) says
what follows from that: the webview matches on the text, so editing a message is a
user-visible change.

Two places in TypeScript depend on the text:

- **A backup that is too large** is recognised by `e === "BACKUP_TOO_LARGE"`
  (`src/data/backup/backupFiles.ts:106`).
- **Constraint failures** are recognised by regular expressions over the driver's English
  message (`src/data/errors.ts:75-100`). They have to cover two dialects: better-sqlite3's
  bare text in the tests, and sqlx's `error returned from database: (code: 2067) …` in the
  app. `toWriteError` (`src/state/writeError.ts:68`) turns the result into the "name
  already used" style messages.

The same strings are copied into the Rust tests (`error.rs:111-160`), into the
better-sqlite3 test double (`src/data/__tests__/betterSqlite.ts:92-108`) and into several
TypeScript tests. A wording fix in Rust can therefore break error handling in TypeScript
without the compiler noticing. A driver upgrade that rewords its message would turn every
duplicate-name error into a generic one.

There is a second path that the issue does not mention. Single-statement writes do not go
through the app's own commands. `repositories.ts:89` calls `sql.execute`, which
`tauriSql.ts:46` sends to `@tauri-apps/plugin-sql`. That plugin's errors are strings the app
does not control. Many constraint failures arrive this way, for example a duplicate
property name. A code on `AppError` alone would not cover them.

## Decision

1. **The wire shape.** An `AppError` serialises as
   `{ code: string, detail: string }`, plus `constraint` for a constraint failure (point 3).
   - `detail` is exactly today's `Display` text.
   - `code` comes from one `fn code(&self) -> &'static str`, one code per variant, in
     upper snake case. The `BACKUP_*` variants keep their prefix as their code: for
     example, `BackupTooLarge` is `BACKUP_TOO_LARGE`, and `BackupExists(path)` is
     `BACKUP_EXISTS` with the path only in `detail`. The others are named after the
     variant, such as `SQL`, `IO`, `OTHER` and `DB_NOT_LOADED`.
   - **A code is the contract.** Renaming or removing a code needs an ADR. Editing a
     `detail` no longer breaks error handling. Where a detail is shown to the user, editing
     it is still a visible change under CLAUDE.md §8.
2. **`call()` rejects with `CommandError`.** `src/platform/commands.ts` catches the
   rejection and throws `CommandError extends Error { code: CommandErrorCode; detail;
constraint? }`.
   - Its `message` is `detail`. As a result, `messageOf(e)` and every detail shown or
     logged today keep their exact text.
   - `CommandErrorCode` is a union of the Rust codes.
   - A test reads the codes in `error.rs` and checks them against the TypeScript list. This
     follows `src/platform/__tests__/commands.test.ts`, which already checks command names
     against `command_list.rs`.
   - `backupFiles.ts:106` becomes a check on the code
     (`isCommandError(e, "BACKUP_TOO_LARGE")`).
3. **Constraint failures carry fields.**
   - **In Rust.** For a `sqlx::Error::Database`, the conversion reads SQLite's extended
     result code:
     - 2067 (UNIQUE) and 1555 (PRIMARY KEY) are unique;
     - 1299 is NOT NULL;
     - 275 is CHECK;
     - 787 is FOREIGN KEY.
   - **The constraint itself.** Rust takes the table and columns, or the CHECK constraint's
     name, from SQLite's own message, which no longer has sqlx's wrapper around it. The
     result is sent as `constraint`, in the shape of today's `ConstraintFailure` (unique or
     not-null with table and columns, check with its name, foreign key).
   - **In TypeScript.** `constraintOf` reads `e.constraint` from a `CommandError`, and the
     regular expressions over the driver's text are deleted.
4. **Single-statement writes go through an app command.** A new `db_execute` command
   (`db.rs`, on the same borrowed plugin pool as `db_transaction`, ADR 0014) runs one
   statement and returns `rowsAffected`. `tauriSql.execute` calls it instead of the plugin.
   - Every write then fails with an `AppError`.
   - Reads (`select`) stay on the plugin. A failed read is never a constraint failure, and
     it already shows as a generic error.
5. **The test double speaks the same contract.** The better-sqlite3 adapter turns its
   errors into the same `CommandError`.
   - **Constraints:** the code and `constraint` fields come from better-sqlite3's
     `SQLITE_CONSTRAINT_*` code and SQLite's message.
   - **Backups:** its backup refusals use the shared codes.
   - The tests stop copying Rust's texts and assert on codes.
6. **Rust and TypeScript change in one commit.** TypeScript that still expects a string
   would show a structured rejection as `[object Object]`, so the two sides land together.
7. **The error log also records the Rust code** (extends ADR 0147). `describeFailure`
   (`src/data/errorLog.ts:50`) finds the `CommandError` in the error itself or in its
   `cause` chain (`BackupExportError`, `BackupReadError` and `SafetyBackupError` keep the
   original rejection as `cause`, `backupFiles.ts:31`, `:77`, `:122`).
   - **What a line gains.** For such a failure, the context field starts with the Rust code
     and a colon, in the same shape as a `DataError`'s `STARTUP: …` context. The log code
     field stays the failure site (ADR 0147 point 1). For example,
     `WRITE_FAILED disk full at #` becomes `WRITE_FAILED IO: disk full at #`. A failure
     without a `CommandError` logs exactly as today.
   - **Where it comes from.** The prefix is the `code` value, one of the fixed
     `CommandErrorCode` constants; nothing from the message or the user goes into it. The
     rest of the context is today's masked text (`maskNumbers`, ADR 0147 point 5, with the
     OS and SQLite codes kept, ADR 0175 point 5). `log_error` keeps its caps (80 characters
     for the code field, 500 for the context, `src-tauri/src/error_log.rs:8`), and the
     prefix counts towards the 500.
   - **No personal data and no new free text.** A code is upper snake case (letters,
     digits, underscores) from a closed list, so it carries no amount, name, id or path.
     The prefix is written as it is, not masked, so a digit in a code stays
     (`BACKUP_PATH_NOT_UTF8`, which keeps its `BACKUP_*` prefix under point 1). The names
     and ids the log already holds (option B in ADR 0147) are neither added to nor
     removed. (Corrected 2026-11-26: the accepted text said "with no digits", which
     `BACKUP_PATH_NOT_UTF8` contradicts. The owner kept the point 1 name, and the reason,
     a closed list with no personal data or free text, is unchanged.)

## Visible effects

- **On screen: none.** Every message the user sees today stays the same in English, Czech
  and Russian, including the untranslated Rust details inside the safety-backup, export,
  unreadable-file and upgrade-stopped messages. Translating those details is out of scope
  here; a follow-up ADR after this one covers it (resolved question 5).
- **The local error log** (`~/Library/Logs/com.bures.realestate-tracker/app.log`) gains
  the Rust code in the context of a line for a failed command (point 7). The app does not
  show this file. The user sees it only by opening it, for example when the bug form
  (`.github/ISSUE_TEMPLATE/bug_report.yml`) asks for an excerpt, or by following the path
  the startup error screen names. The bug form's advice still holds: the code adds nothing
  to replace.
- Computed numbers, stored data and the layout are not affected.

## Tests

These tests are written first, and each fails on main:

- **Rust, `code()`:** every variant has its own code, and every code is distinct.
- **Rust, the wire shape:** an error serialises as `{code, detail}`, and `detail` equals
  `Display` (the existing table of display strings stays).
- **Rust, constraints:** in an in-memory SQLite database, a UNIQUE, NOT NULL, CHECK and
  FOREIGN KEY failure each give the expected `constraint`.
- **Rust, `db_execute`:** it returns `rowsAffected`.
- **TypeScript, `call()`:** an object rejection becomes a `CommandError` with the same code,
  detail and message.
- **TypeScript, the code list:** a test checks it against `error.rs`.
- **TypeScript, `constraintOf`:** it reads the fields, and it returns null for text that
  only looks like a constraint message.
- **TypeScript, the log line (point 7):** in `src/data/__tests__/errorLog.test.ts`, a new
  case "a failed command logs its Rust code before the masked detail" checks that
  `describeFailure("WRITE", e)`, for a `CommandError` with code `IO` and detail
  `disk full at 123456`, gives
  `{ code: "WRITE_FAILED", context: "IO: disk full at #" }`, that a `SafetyBackupError`
  whose `cause` is a `CommandError` gets the same prefix, and that a plain `Error` still
  logs without one. The existing cases stay green unchanged.
- **No string matching:** no production TypeScript compares an error to a string literal or
  matches a driver message. This is a source test, in the style of the existing
  boundary tests.

Already green, and they must stay green unchanged: the visible-text tests for the duplicate
name, restore, safety-backup and boot-failure messages in all three languages.

## Consequences

- Rust's wording can be fixed without breaking error handling, and the compiler and the
  code-list test catch a renamed code.
- An upgrade of sqlx or the SQL plugin that rewords a message no longer changes what the
  user sees for a constraint failure.
- The tests no longer copy Rust's texts.
- The cost is a wider contract: 22 codes, a `constraint` shape kept in two languages, and
  one new command, `db_execute`, which needs its `allow-*` grant and its entry in
  `command_list.rs`.
- A log line for a failed command says which kind of failure it was, which helps diagnose
  a reported problem.
- Out of scope, each with its own follow-up: translating the `BACKUP_*` details (a
  follow-up ADR) and consolidating the data-layer error classes (issue #677).
- **The SQL plugin's `execute` is no longer granted** (amends ADR 0064; decided
  2026-11-26 under the owner's standing direction on #463 (follow best practice, customer
  first); listed for the owner's morning review). Once `tauriSql.execute` calls
  `db_execute` (point 4), the webview calls the plugin only for `Database.load` and
  `select`, so `capabilities/default.json` drops `sql:allow-execute` and keeps
  `sql:allow-load` and `sql:allow-select`. `src-tauri/tests/commands.rs` checks that the
  plugin is granted exactly those two. This narrows what the webview can reach. It does
  not change ADR 0064's accepted risk: any SQL still runs through `db_transaction`,
  `db_execute` and `select`.

## Resolved questions

The owner answered on 2026-11-26 (comment on #664).

1. **Single-statement writes:** through a new `db_execute` command, as recommended
   (point 4).
2. **Where the constraint is parsed:** in Rust, which sends the finished fields, as
   recommended (point 3).
3. **How fine the codes are:** one code each for `Sql`, `Io` and `Other` for now, as
   recommended (point 1).
4. **How the code list is shared:** a TypeScript test reads `error.rs`, as recommended
   (point 2).
5. **The untranslated `BACKUP_*` details:** they are to be translated, so Czech and Russian
   users do not see English error text. That is a visible change, so it is out of scope
   for this ADR and gets its own follow-up ADR after this one.
6. **The data-layer classes** (one `FileStepError`, all classes in `src/data/errors.ts`,
   `DataError` codes for the remaining plain `Error`s): a separate refactor, issue #677.
7. **The error log:** it also records the Rust code (point 7, which extends ADR 0147).

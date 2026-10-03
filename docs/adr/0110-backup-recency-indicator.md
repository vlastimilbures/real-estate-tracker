# 0110. Backup recency indicator

- Status: Accepted
- Date: 2026-10-03
- Source: issue #36 (pre-release review 2026-10, §6)

## Context

The portfolio lives only in the SQLite database on this Mac. Settings → Backup exports the
whole database to a JSON file, but the app does not record when that last happened, so a
user can go months without a copy and lose years of records to a disk failure. The
`app_meta` table (migration v5) already holds app state that is not portfolio data and is
never backed up or restored (ADR 0094 keeps the sample markers there).

## Decision

1. **Record successful exports only.** When Export backup saves (or, in the browser test
   build, downloads) the file, the app stores `app_meta.last_backup_at` (ISO UTC timestamp)
   and `app_meta.last_backup_file` (file name only, no path). A cancelled dialog or a failed
   write records nothing. The clock is read in `src/state` (the UI boundary), never in the
   engine or data layer. If the file was saved but the record fails, the export still
   reports success and the failure is logged.
2. **Safety backups do not count.** The automatic copies written before a restore or Clear
   sample (D-52) sit next to the database on the same disk, so they do not protect against
   losing the Mac.
3. **Changed since the last backup.** `app_meta.changed_since_backup` is set after every
   successful data write (edits, CSV import, restore, Clear sample) and deleted when an
   export is recorded. A write saved while the export's save dialog is open is not in the
   file, so it keeps the flag. Dismissing the sample banner is not a data write. Setting the flag is
   best effort: a failure is logged and never fails the edit. No count is shown.
4. **Restore never imports these keys.** `app_meta` is not part of a backup file, so a
   restore keeps the local `last_backup_at`; a restored file cannot fake recency. A restore
   sets the changed flag, because the data was replaced.
5. **Settings → Backup** shows "Last backup: dd.mm.yyyy (N days/weeks ago)" or "No backup
   exported yet", and "Keep a copy somewhere other than this Mac." The wording never implies
   off-device protection.
6. **Sidebar hint.** A quiet line in the sidebar footer appears when the data changed since
   the last backup and there is no backup or the last one is more than 30 days old
   (`BACKUP_STALE_DAYS`). It opens Settings → Backup and can be dismissed for the session
   (not persisted). In the collapsed sidebar it is one icon button with the same text as its
   label. A fresh install with the untouched sample shows no hint.

## Consequences

No schema migration and no backup format change: only new `app_meta` keys. One extra small
write follows each data write. New strings in en, cs and ru. Out of scope: automatic or
scheduled backups and off-device copies (offline only, CLAUDE.md §7), and checking that a
backup restores.

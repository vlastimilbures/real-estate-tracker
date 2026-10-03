# Data safety & recovery

How to keep your portfolio data safe, how to restore it, and what to do if an upgrade or a
restore goes wrong. For what the figures mean, see
[Model assumptions & limitations](model-limitations.md).

## Where your data lives

- **On your Mac only.** The app works offline. It has no account, no cloud copy and no
  analytics, so no copy of your data exists anywhere else. If you lose the Mac and have no
  backup, you lose the data.
- **One folder.** The database is `portfolio.db` in
  `~/Library/Application Support/com.bures.realestate-tracker/`, next to its
  `portfolio.db-wal` and `portfolio.db-shm` files. Automatic backups are in the `backups/`
  folder inside it. The full list of locations is in
  [Where the app keeps data](release.md#where-the-app-keeps-data).
- **Private to your user, not encrypted.** Only your macOS user can read these files. The app
  does not encrypt them; turn on FileVault to encrypt the disk.

To open the folder, in Finder choose **Go → Go to Folder…** (⇧⌘G) and paste the path.

## Back up

- **Export a backup.** Open **Settings → Backup & Restore → Export backup…**. The app saves one
  JSON file (`portfolio-backup-yyyy-mm-dd.json`) with all properties, mortgages, valuations,
  leases, holding costs, assumptions and scenarios.
- **How often.** After a session of edits, before a large change (an import, a restore,
  deleting a property) and **before installing a new version**.
- **Keep copies off the Mac.** Save a copy to an external disk or other storage you control.
  The file holds your full financial records, so treat it like a bank statement.
- **Time Machine works too.** It also copies the app folder. Do not copy `portfolio.db` by hand
  while the app is running: recent changes can still sit in `portfolio.db-wal`. Quit the app
  first and copy all three files.

## Before upgrading

1. Export a backup (above).
2. Quit the app and install the new version.
3. Open it. If the new version changes how data is stored, it first writes a verified copy of
   the old database to `backups/pre-migration-v<old>-to-v<new>-<date>.sqlite`, then upgrades.

## Restore a backup

- **What it does.** **Settings → Backup & Restore → Choose backup file…** reads a JSON backup
  and **replaces all current data** with it. Backups from older versions are upgraded as they
  are restored. Restore accepts only the app's JSON backups.
- **Safety copy first.** Before it changes anything, the app saves your current data as
  `backups/portfolio-before-restore-<date>.json`. If that copy cannot be saved, the restore
  does not start. If the restore itself fails, it is rolled back and your data is unchanged.
- **Undo a restore.** Restore the safety copy. Click **Choose backup file…**, press ⇧⌘G in the
  file picker, paste
  `~/Library/Application Support/com.bures.realestate-tracker/backups/`, and pick the
  `portfolio-before-restore-…` file with the right date. The time in its name is UTC.

## If an upgrade fails

When the app cannot open or upgrade the database, it shows **Could not open the database**
with the reason and a **Try again** button.

- **"The database upgrade failed and was rolled back"**, **"…stopped before changing
  anything"** or **"…did not start because the safety backup could not be written"**: nothing
  was changed. The previous version of the app still opens the database. Reinstall that
  version and report the problem (below). For the safety-backup message, free some disk space
  first and try again.
- **"This database was saved by a newer version of the app"**: open it with that newer
  version.
- **"The database file failed its integrity check"**: the database file is damaged. Restore your
  latest JSON backup, or put back a pre-migration copy (next section).

The details are in the app log: `~/Library/Logs/com.bures.realestate-tracker/app.log`.

## Put back a pre-migration copy

A pre-migration copy (`backups/pre-migration-…sqlite`) is a full database file from just before
an upgrade. The app's Restore cannot read it; put it back by hand. Use it when the database
is damaged and you have no newer JSON backup, or to return to the previous app version after
an upgrade. Anything you changed after that upgrade is lost.

1. **Quit the app** (⌘Q). It must not be running.
2. Open `~/Library/Application Support/com.bures.realestate-tracker/` in Finder (⇧⌘G).
3. **Move aside, do not delete,** the current `portfolio.db`, `portfolio.db-wal` and
   `portfolio.db-shm` (some may not exist). Put them in a new folder outside the app folder,
   for example on the Desktop.
4. **Copy** (do not move) the `pre-migration-…sqlite` file you want from `backups/` into the
   app folder and rename the copy to `portfolio.db`.
5. **Open the app** that matches the copy. The previous version opens it as it was. A newer
   version upgrades it again, writing a new pre-migration copy first.
6. Check your properties, then export a fresh JSON backup. Delete the moved-aside files only
   once you are sure you do not need them.

## Reporting a problem

Use the
[bug report form](https://github.com/vlastimilbures/real-estate-tracker/issues/new?template=bug_report.yml).
**Do not attach your database, backups or bank statements.** Describe the inputs, or reproduce
the problem with the sample portfolio. If you include lines from `app.log`, remove anything
personal first.

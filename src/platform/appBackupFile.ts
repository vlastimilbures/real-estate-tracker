// The backup files Rust reads and writes for Backup & Restore (src-tauri/src/commands/):
// the restore pick through the open dialog, and the pre-restore safety backup.
import { call } from "./commands";

/** The picked file's name and text, or null when the dialog was cancelled. Rejects
 *  with a `BACKUP_TOO_LARGE` CommandError for a file over `maxBytes`, before reading it. */
export function openBackupFile(
  maxBytes: number,
): Promise<{ name: string; text: string } | null> {
  return call("open_backup_file", { maxBytes });
}

/** Write `json` to `<app config>/backups/<filename>`: a temp file, read back and
 *  compared, then renamed into place (ADR 0175). */
export function writeAppBackup(filename: string, json: string): Promise<void> {
  return call("write_app_backup", { filename, json });
}

// The Tauri file-dialog / filesystem orchestration around Backup & Restore: the export
// through the save dialog, the restore pick, the pre-restore safety backup and the
// restore itself. No React — the UI page only drives state/toasts off the results below.
// A restore writes and verifies a safety backup, and only then replaces the data in one
// transaction (ADR 0014): on any failure the current data stays.
import type { Sql } from "../sql";
import { stamp } from "../migrations";
import { messageOf } from "../errors";
import {
  saveFailureDetail,
  type SaveFileOptions,
  type SaveOutcome,
} from "../../platform/saveFileTypes";
import { openBackupFile, writeAppBackup } from "../../platform/appBackupFile";
import { isCommandError } from "../../platform/commandError";
import { BACKUP_MAX_BYTES, exportToJson, type BackupFile } from "./format";
import { backupTooLarge, parseBackupText, type RestoreIssue } from "./validate";
import {
  prepareRestore,
  type BackupSummary,
  type InputRules,
} from "./restorePlan";

export type ExportOutcome = SaveOutcome;

/** The file step of Backup & Restore that failed: the export through the save dialog,
 *  the read of a picked restore file (an unplugged disk, a file not downloaded from
 *  iCloud: nothing is known about its content, ADR 0147), or the pre-restore safety
 *  backup (nothing changed). */
export type FileStep = "export" | "read" | "safety";

/** The English message each step starts with: the log line's text (ADR 0147). */
const STEP_MESSAGE: Readonly<Record<FileStep, string>> = {
  export: "Could not save the backup",
  read: "Could not read the backup file",
  safety: "Could not save the safety backup",
};

/** A Backup & Restore file step failed. The failure stays its `cause`, so the error log
 *  finds a failed command's Rust code in it (ADR 0270 point 7). */
export class FileStepError extends Error {
  readonly step: FileStep;
  /** The underlying failure, for display: for an export, the save's OS text without
   *  its English wrapper (ADR 0193). */
  readonly detail: string;
  constructor(step: FileStep, cause: unknown) {
    const detail =
      step === "export" ? saveFailureDetail(cause) : messageOf(cause);
    super(`${STEP_MESSAGE[step]}: ${detail}`, { cause });
    this.name = "FileStepError";
    this.step = step;
    this.detail = detail;
  }
}

/** What `exportBackup` needs from outside the data layer (ADR 0072): the one
 *  clock read of the export, its local calendar day for the file name, and the
 *  file-save function. */
export interface ExportDeps {
  /** The export's moment, written as `exportedAt` (ADR 0149 §6). */
  now: Date;
  /** The local `yyyy-mm-dd` of `now` (lib/day `localIsoDay(now)`). */
  today: string;
  save: (opts: SaveFileOptions) => Promise<SaveOutcome>;
}

/**
 * Export the whole DB to JSON and hand it to the user via `deps.save`: a cancelled
 * dialog returns `cancelled`; a failed write — or a file that does not read back as
 * written — throws a `FileStepError` (step `export`).
 */
export async function exportBackup(
  sql: Sql,
  { now, today, save }: ExportDeps,
): Promise<ExportOutcome> {
  const backup = await exportToJson(sql, now);
  try {
    return await save({
      filename: `portfolio-backup-${today}.json`,
      data: JSON.stringify(backup, null, 2),
      mime: "application/json",
      filter: { name: "JSON backup", extensions: ["json"] },
    });
  } catch (e) {
    throw new FileStepError("export", e);
  }
}

/** A picked backup file, checked and ready for the confirm step. */
export interface PickedBackup {
  file: string;
  backup: BackupFile;
  summary: BackupSummary;
  /** Out-of-range values the confirm step lists before "Restore anyway" (ADR 0148). */
  warnings: RestoreIssue[];
}

/**
 * Prompt the user to pick a backup JSON file and check it completely, so the confirm
 * step only ever offers a restorable file. Returns `null` when the user cancels;
 * throws RestoreError for a file that cannot be restored and a FileStepError (step
 * `read`) for one that cannot be read.
 */
export async function chooseRestoreFile(
  rules: InputRules,
): Promise<PickedBackup | null> {
  // Rust opens the dialog and refuses an oversized file before reading it.
  let picked: { name: string; text: string } | null;
  try {
    picked = await openBackupFile(BACKUP_MAX_BYTES);
  } catch (e) {
    if (isCommandError(e, "BACKUP_TOO_LARGE")) throw backupTooLarge();
    throw new FileStepError("read", e);
  }
  if (picked === null) return null;

  const backup = parseBackupText(picked.text);
  const { summary, warnings } = prepareRestore(backup, rules);
  return { file: picked.name, backup, summary, warnings };
}

/**
 * Pre-restore snapshot, so a bad restore is still recoverable from the Restore screen
 * (ADR 0052): `<app config>/backups/portfolio-before-restore-<UTC stamp>.json`, next to
 * the database and its pre-migration backups. Rust writes a temp file, reads it back
 * and compares the bytes, then renames it into place (ADR 0175). Any failure
 * throws a `FileStepError` (step `safety`) — without a verified file a restore must not start.
 * `prefix` names the file for other destructive actions. Returns the file name.
 */
export async function writeSafetyBackup(
  sql: Sql,
  now: Date = new Date(),
  prefix = "portfolio-before-restore",
): Promise<string> {
  const filename = `${prefix}-${stamp(now)}.json`;
  try {
    // Reading the current data is part of the safety backup (ADR 0147).
    const safetyBackup = await exportToJson(sql, now);
    const json = JSON.stringify(safetyBackup, null, 2);
    // Verified temp file + rename in `<app config>/backups` (src-tauri/src/commands/backup.rs).
    await writeAppBackup(filename, json);
  } catch (e) {
    throw new FileStepError("safety", e);
  }
  return filename;
}

/** Full restore workflow: check the whole file, write and verify the safety backup,
 *  then replace everything in one transaction. Returns the safety backup's name. Any
 *  warnings were shown at the confirm step, so they do not stop it. */
export async function confirmRestore(
  sql: Sql,
  backup: BackupFile,
  rules: InputRules,
): Promise<{ safetyBackup: string }> {
  const { statements } = prepareRestore(backup, rules);
  const safetyBackup = await writeSafetyBackup(sql);
  await sql.transaction(statements);
  return { safetyBackup };
}

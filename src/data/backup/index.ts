// Whole-database Backup & Restore: the file format and export (format.ts), reading
// a file (validate.ts), the pure restore plan (restorePlan.ts) and the Tauri file
// orchestration (backupFiles.ts). This module is their public face.
import { BACKUP_COLUMNS, exportToJson } from "./format";
import { parseBackupText, validateBackup } from "./validate";
import { prepareRestore } from "./restorePlan";
import { writeSafetyBackup } from "./backupFiles";

export { BACKUP_MAX_BYTES, SCHEMA_HEAD, type BackupFile } from "./format";
export {
  RestoreError,
  type RestoreErrorCode,
  type RestoreIssue,
} from "./validate";
export { type BackupSummary, type InputRules } from "./restorePlan";
export {
  FileStepError,
  chooseRestoreFile,
  confirmRestore,
  exportBackup,
  type ExportOutcome,
  type PickedBackup,
} from "./backupFiles";

/**
 * The steps the app runs only inside the functions above, re-exported on this path for
 * the backup and restore tests, which import them from here.
 * @internal
 */
export {
  BACKUP_COLUMNS,
  exportToJson,
  parseBackupText,
  prepareRestore,
  validateBackup,
  writeSafetyBackup,
};

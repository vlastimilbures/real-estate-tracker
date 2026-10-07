// The UI's door to Backup & Restore (ADR 0072, DR-163): the backup file types and
// errors, and the restore-file pick checked against the app's input rules (the same
// rules the store's restore action uses). Exporting and restoring go through
// usePortfolioStore.
import { chooseRestoreFile as chooseWithRules } from "../data/backup";
import { checkInputRules } from "../import/inputRules";

export {
  BackupExportError,
  BackupReadError,
  RestoreError,
  SafetyBackupError,
  SCHEMA_HEAD,
  type BackupSummary,
  type PickedBackup,
  type RestoreIssue,
} from "../data/backup";
export { type BackupState } from "../data/repositories";
export { SampleNotEmptyError } from "../data/seed";

/** Pick a backup file and check it completely; `null` when the user cancels. */
export const chooseRestoreFile = () => chooseWithRules(checkInputRules);

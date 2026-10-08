// A failed backup, restore or sample action as translated text. Shared by Settings →
// Backup and the startup error screen (#115).
import {
  BACKUP_MAX_BYTES,
  BackupExportError,
  BackupReadError,
  RestoreError,
  SafetyBackupError,
  SampleNotEmptyError,
  type RestoreIssue,
} from "../../state/backup";
import { logFailure, type FailureSite } from "../../state/diagnostics";
import { toWriteError } from "../../state/writeError";
import type { Dictionary } from "../../i18n";
import { describeWriteError } from "../model/writeError";

/** A refused backup as a translated message; `issues` are listed separately. */
function restoreErrorText(t: Dictionary, e: RestoreError): string {
  const b = t.backup;
  switch (e.code) {
    case "BACKUP_TOO_LARGE":
      return b.errTooLarge(BACKUP_MAX_BYTES / (1024 * 1024));
    case "BACKUP_NOT_JSON":
      return b.errNotJson;
    case "BACKUP_INVALID":
      return b.errInvalid(e.detail);
    case "BACKUP_NEWER":
      return b.errNewer(e.detail);
    case "BACKUP_ROWS_INVALID":
      return b.errRowsInvalid;
  }
}

/** A refused backup or a non-empty portfolio is the user's to fix, not a failure to
 *  log; anything else is logged under `site`. Call once, where the failure is caught. */
export function logBackupFailure(site: FailureSite, e: unknown): void {
  if (e instanceof RestoreError || e instanceof SampleNotEmptyError) return;
  logFailure(site, e);
}

/** The text for a failure, translated: a refused backup with its records listed
 *  separately. Pure, so it can run at render. */
export function backupFailureText(
  t: Dictionary,
  e: unknown,
  other: (detail: string) => string,
): { text: string; issues: RestoreIssue[] } {
  if (e instanceof RestoreError)
    return { text: restoreErrorText(t, e), issues: e.issues };
  if (e instanceof SampleNotEmptyError)
    return { text: t.sample.errNotEmpty, issues: [] };
  const text =
    e instanceof SafetyBackupError
      ? t.backup.safetyBackupFailed(e.detail)
      : e instanceof BackupExportError
        ? t.backup.exportFailed(e.detail)
        : e instanceof BackupReadError
          ? t.backup.errUnreadable(e.detail)
          : other(describeWriteError(t, toWriteError(e)).message);
  return { text, issues: [] };
}

/** The text for a failure: a refused backup with its records, anything else translated
 *  and logged under `site`. */
export function backupFailure(
  t: Dictionary,
  e: unknown,
  site: FailureSite,
  other: (detail: string) => string,
): { text: string; issues: RestoreIssue[] } {
  logBackupFailure(site, e);
  return backupFailureText(t, e, other);
}

// A failed backup, restore or sample action as translated text. Shared by Settings →
// Backup and the startup error screen.
import { BACKUP_MAX_BYTES, type RestoreIssue } from "../../state/backup";
import { logFailure, type FailureSite } from "../../state/diagnostics";
import { toActionError, type ActionError } from "../../state/actionError";
import type { Dictionary } from "../../i18n";
import { describeWriteError } from "../model/writeError";
import { commandFailureText } from "../model/commandErrorText";

type RestoreRefused = Extract<ActionError, { kind: "restoreRefused" }>;

/** A refused backup as a translated message; `issues` are listed separately. */
function restoreErrorText(t: Dictionary, e: RestoreRefused): string {
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
  const { kind } = toActionError(e);
  if (kind === "restoreRefused" || kind === "sampleNotEmpty") return;
  logFailure(site, e);
}

/** The texts a caller picks: `other` for a failure no typed text covers, `safety` for a
 *  failed safety backup (default `t.backup.safetyBackupFailed`). */
export interface FailureTexts {
  other: (detail: string) => string;
  safety?: ((detail: string) => string) | undefined;
}

/** The text for a failure, translated: a refused backup with its records listed
 *  separately. Pure, so it can run at render. */
export function backupFailureText(
  t: Dictionary,
  e: ActionError,
  { other, safety = t.backup.safetyBackupFailed }: FailureTexts,
): { text: string; issues: RestoreIssue[] } {
  switch (e.kind) {
    case "restoreRefused":
      return { text: restoreErrorText(t, e), issues: e.issues };
    case "sampleNotEmpty":
      return { text: t.sample.errNotEmpty, issues: [] };
    // Rust's detail, or the text for its code (ADR 0271).
    case "safetyBackup":
      return { text: safety(commandFailureText(t, e)), issues: [] };
    case "backupExport":
      return {
        text: t.backup.exportFailed(commandFailureText(t, e)),
        issues: [],
      };
    case "backupUnreadable":
      return { text: t.backup.errUnreadable(e.detail), issues: [] };
    // Neither reaches these callers: a file save fails inside a backup export, and the
    // Import page shows a refused plan's problems itself (ADR 0229 §2).
    case "saveFailed":
      return { text: other(commandFailureText(t, e)), issues: [] };
    case "planRefused":
      return { text: other(""), issues: [] };
    default:
      return { text: other(describeWriteError(t, e).message), issues: [] };
  }
}

/** The text for a failure: a refused backup with its records, anything else translated
 *  and logged under `site`. */
export function backupFailure(
  t: Dictionary,
  e: unknown,
  site: FailureSite,
  texts: FailureTexts,
): { text: string; issues: RestoreIssue[] } {
  logBackupFailure(site, e);
  return backupFailureText(t, toActionError(e), texts);
}

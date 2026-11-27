// What a failed whole-database action tells the UI: a typed value the UI translates
// (ui/components/restoreFailure.ts), like a failed write's WriteError.
import {
  FileStepError,
  RestoreError,
  type RestoreErrorCode,
  type RestoreIssue,
} from "../data/backup";
import { SampleNotEmptyError } from "../data/errors";
import { SaveFileError, saveFailureDetail } from "../platform/saveFileTypes";
import { commandCodeOf, type CommandErrorCode } from "../platform/commandError";
import type { CsvImportPreview } from "../import/csvImport";
import { toWriteError, type WriteError } from "./writeError";

/** A failure whose Rust detail a message shows; `code` picks its translated text
 *  (ADR 0271), null when the failure was not an app command. */
interface CommandDetail {
  detail: string;
  code: CommandErrorCode | null;
}

/** A file could not be saved: the OS text, without the English wrapper (ADR 0193). */
export type SaveFailed = { kind: "saveFailed" } & CommandDetail;

export type ActionError =
  | WriteError
  /** The backup was refused before anything changed; `issues` lists its records. */
  | {
      kind: "restoreRefused";
      code: RestoreErrorCode;
      detail: string;
      issues: RestoreIssue[];
    }
  /** The safety backup could not be written, so nothing was changed; `file` is the name
   *  the webview chose for it. */
  | ({ kind: "safetyBackup"; file: string | null } & CommandDetail)
  /** Load sample needs an empty portfolio (ADR 0112). */
  | { kind: "sampleNotEmpty" }
  /** The backup file could not be saved. */
  | ({ kind: "backupExport" } & CommandDetail)
  /** The chosen backup file could not be read. */
  | { kind: "backupUnreadable"; detail: string }
  | SaveFailed
  /** The CSV import plan built at the click has problems; nothing was written. The
   *  Import page shows them as the preview does (ADR 0229 §2). */
  | { kind: "planRefused"; preview: CsvImportPreview };

/** A failed file save (an export, a template) as the UI shows it. */
export function toSaveFailed(e: unknown): SaveFailed {
  return {
    kind: "saveFailed",
    detail: saveFailureDetail(e),
    code: commandCodeOf(e),
  };
}

/** A Backup & Restore file step's failure as the UI shows it: the safety backup and the
 *  export with the Rust code that picks their text (ADR 0271). */
function fileStepFailure(e: FileStepError): ActionError {
  const { detail } = e;
  switch (e.step) {
    case "safety":
      return {
        kind: "safetyBackup",
        detail,
        code: commandCodeOf(e),
        file: e.file,
      };
    case "export":
      return { kind: "backupExport", detail, code: commandCodeOf(e) };
    case "read":
      return { kind: "backupUnreadable", detail };
  }
}

/** The typed failure for `e`. A refused CSV plan is converted where the CSV import is
 *  loaded, so its class stays out of the startup bundle. */
export function toActionError(e: unknown): ActionError {
  if (e instanceof RestoreError)
    return {
      kind: "restoreRefused",
      code: e.code,
      detail: e.detail,
      issues: e.issues,
    };
  if (e instanceof SampleNotEmptyError) return { kind: "sampleNotEmpty" };
  if (e instanceof FileStepError) return fileStepFailure(e);
  if (e instanceof SaveFileError) return toSaveFailed(e);
  return toWriteError(e);
}

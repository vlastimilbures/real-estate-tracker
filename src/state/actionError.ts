// What a failed whole-database action tells the UI: a typed value the UI translates
// (ui/components/restoreFailure.ts), like a failed write's WriteError.
import {
  FileStepError,
  RestoreError,
  type RestoreErrorCode,
  type RestoreIssue,
} from "../data/backup";
import { SampleNotEmptyError } from "../data/errors";
import { SaveFileError } from "../platform/saveFileTypes";
import type { CsvImportPreview } from "../import/csvImport";
import { toWriteError, type WriteError } from "./writeError";

export type ActionError =
  | WriteError
  /** The backup was refused before anything changed; `issues` lists its records. */
  | {
      kind: "restoreRefused";
      code: RestoreErrorCode;
      detail: string;
      issues: RestoreIssue[];
    }
  /** The safety backup could not be written, so nothing was changed. */
  | { kind: "safetyBackup"; detail: string }
  /** Load sample needs an empty portfolio (ADR 0112). */
  | { kind: "sampleNotEmpty" }
  /** The backup file could not be saved. */
  | { kind: "backupExport"; detail: string }
  /** The chosen backup file could not be read. */
  | { kind: "backupUnreadable"; detail: string }
  /** A file could not be saved: the OS text, without the English wrapper (ADR 0193). */
  | { kind: "saveFailed"; detail: string }
  /** The CSV import plan built at the click has problems; nothing was written. The
   *  Import page shows them as the preview does (ADR 0229 §2). */
  | { kind: "planRefused"; preview: CsvImportPreview };

/** The failure kind of each Backup & Restore file step. */
const FILE_STEP_KIND = {
  export: "backupExport",
  read: "backupUnreadable",
  safety: "safetyBackup",
} as const satisfies Record<FileStepError["step"], ActionError["kind"]>;

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
  if (e instanceof FileStepError)
    return { kind: FILE_STEP_KIND[e.step], detail: e.detail };
  if (e instanceof SaveFileError)
    return { kind: "saveFailed", detail: e.detail };
  return toWriteError(e);
}

// The data layer's typed errors, in one place. A DataError's code maps to an i18n
// message (`t.dataErrors`), and its `details` carry what the message lists: table names,
// row ids, property names and rule names — never money amounts, so a DataError is
// written to the log as it is. Names and ids built from names stay in it (ADR 0147). A
// MIGRATION_* error's details are the driver's or Rust's message, logged with its numbers
// masked (ADR 0277).
// Backup & Restore's errors (a refused backup, a failed file step) and the refused
// sample load follow; the UI reaches them through the state facades (ADR 0072).
import type { ValidationCode } from "../engine";
import type { IntRange } from "../lib/rules";
import {
  commandCodeOf,
  isCommandError,
  type CommandErrorCode,
  type ConstraintFailure,
} from "../platform/commandError";
import { saveFailureDetail } from "../platform/saveFileTypes";

export type DataErrorCode =
  /** `PRAGMA integrity_check` did not return ok at startup. */
  | "DB_INTEGRITY"
  /** The database was written by a newer app version. */
  | "DB_NEWER"
  /** The database is below the version 8 baseline (ADR 0230): refused unchanged. */
  | "DB_TOO_OLD"
  /** The pre-migration backup could not be written or verified. */
  | "MIGRATION_BACKUP_FAILED"
  /** A migration's own statements failed (rolled back). */
  | "MIGRATION_FAILED"
  /** A stored row has a value its column cannot hold (ADR 0037), or a required row is
   *  missing: the assumptions row id = 1 (ADR 0252). */
  | "ROW_INVALID"
  /** An update/delete by id matched no row. */
  | "ROW_MISSING"
  /** A saved scenario's overrides JSON is unreadable. */
  | "SCENARIO_INVALID";

/** A stored row the app cannot read, in any table, scenarios included (ADR 0231). The
 *  database opened and migrated to head and only reading it failed: start-up stops, Try
 *  again cannot help, and a backup can be restored from the startup screen (ADR 0153). */
export const READ_FAILURES: ReadonlySet<DataErrorCode> = new Set<DataErrorCode>(
  ["ROW_INVALID", "SCENARIO_INVALID"],
);

/** How far a stopped upgrade got (ADR 0153). Each step commits on its own, so the
 *  database is at `reached`, which is `from` only when nothing changed. */
export interface UpgradeStop {
  from: number;
  reached: number;
  stoppedAt: number;
  /** The pre-upgrade copy; null when none was written yet (or a brand-new database). */
  backupPath: string | null;
}

/** The app command whose Rust detail a DataError's `details` holds: its code, and the
 *  file name the webview gave it, for the message (ADR 0271). */
export interface FailedCommand {
  code: CommandErrorCode;
  file: string;
}

/** The failed app command behind `e`, with the file the webview named for it; undefined
 *  when `e` is not a command's failure (ADR 0271). */
export function failedCommandOf(
  e: unknown,
  file: string,
): FailedCommand | undefined {
  const code = commandCodeOf(e);
  return code ? { code, file } : undefined;
}

export class DataError extends Error {
  readonly code: DataErrorCode;
  /** One human-readable line per offending record, without financial values. */
  readonly details: string[];
  /** Set on MIGRATION_FAILED (ADR 0153). */
  readonly upgrade?: UpgradeStop;
  /** Set on MIGRATION_BACKUP_FAILED when Rust refused the copy (ADR 0271). */
  readonly failedCommand?: FailedCommand;
  constructor(
    code: DataErrorCode,
    message: string,
    details: string[] = [],
    options?: {
      cause?: unknown;
      upgrade?: UpgradeStop;
      failedCommand?: FailedCommand;
    },
  ) {
    super(message, options);
    this.name = "DataError";
    this.code = code;
    this.details = details;
    if (options?.upgrade) this.upgrade = options.upgrade;
    if (options?.failedCommand) this.failedCommand = options.failedCommand;
  }
}

/** The underlying message of anything thrown: a failed app command's Rust detail
 *  (`CommandError`, ADR 0270), or the text of a plain string rejection. */
export function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export type { ConstraintFailure } from "../platform/commandError";

/** The constraint behind a failed write: the fields Rust sends with a constraint
 *  failure (ADR 0270 point 3); null for anything else. No message is parsed. */
export function constraintOf(e: unknown): ConstraintFailure | null {
  return isCommandError(e) ? (e.constraint ?? null) : null;
}

/** Why a backup file was refused (a RestoreError). */
export type RestoreErrorCode =
  /** Larger than BACKUP_MAX_BYTES (ADR 0053). */
  | "BACKUP_TOO_LARGE"
  /** Not JSON at all. */
  | "BACKUP_NOT_JSON"
  /** Not a backup: wrong shape, missing table, unknown column, non-scalar cell. */
  | "BACKUP_INVALID"
  /** Written by a newer app version. */
  | "BACKUP_NEWER"
  /** Rows that the app cannot read or that break its rules; see `issues`. */
  | "BACKUP_ROWS_INVALID";

/** One offending row. Never carries a value — table, id, column and rule only. */
export interface RestoreIssue {
  table: string;
  id?: string;
  column?: string;
  rule:
    | ValidationCode
    | "UNREADABLE_VALUE"
    | "DUPLICATE_KEY"
    | "MISSING_ASSUMPTIONS"
    | "OUT_OF_RANGE"
    | "BEYOND_LIMIT";
  /** The allowed range of an OUT_OF_RANGE or BEYOND_LIMIT field. */
  range?: IntRange;
}

/** The backup was refused before anything was changed. */
export class RestoreError extends Error {
  readonly code: RestoreErrorCode;
  readonly issues: RestoreIssue[];
  /** BACKUP_INVALID: what is wrong · BACKUP_NEWER: "v<file> > v<app>". */
  readonly detail: string;
  constructor(
    code: RestoreErrorCode,
    message: string,
    {
      issues = [],
      detail = "",
    }: { issues?: RestoreIssue[]; detail?: string } = {},
  ) {
    super(message);
    this.name = "RestoreError";
    this.code = code;
    this.issues = issues;
    this.detail = detail;
  }
}

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
  /** The file name the webview chose, for the message: the safety backup's (ADR 0271
   *  point 4); null when the webview does not know it (a save dialog's pick). */
  readonly file: string | null;
  constructor(step: FileStep, cause: unknown, file: string | null = null) {
    const detail =
      step === "export" ? saveFailureDetail(cause) : messageOf(cause);
    super(`${STEP_MESSAGE[step]}: ${detail}`, { cause });
    this.name = "FileStepError";
    this.step = step;
    this.detail = detail;
    this.file = file;
  }
}

/** `loadSample` refused: the portfolio has properties, and the sample never merges with
 *  them (ADR 0112). */
export class SampleNotEmptyError extends Error {
  constructor() {
    super("The sample loads only into an empty portfolio");
    this.name = "SampleNotEmptyError";
  }
}

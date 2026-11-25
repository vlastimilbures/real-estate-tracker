// Reading a backup file's text (P5b): the size cap (D-53), the JSON parse and the
// top-level shape and version check, and the error a refused file raises. The rows are
// checked by the restore plan (restorePlan.ts).
import type { ValidationCode } from "../../engine";
import type { IntRange } from "../../lib/rules";
import { BACKUP_MAX_BYTES, SCHEMA_HEAD, type BackupFile } from "./format";

export type RestoreErrorCode =
  /** Larger than BACKUP_MAX_BYTES (D-53). */
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

export const invalid = (detail: string) =>
  new RestoreError(
    "BACKUP_INVALID",
    `Invalid backup: ${detail} — restore aborted`,
    {
      detail,
    },
  );

/** The D-53 size rejection (also raised by Rust before reading a picked file). */
export function backupTooLarge(): RestoreError {
  return new RestoreError(
    "BACKUP_TOO_LARGE",
    `The backup file is larger than ${BACKUP_MAX_BYTES / (1024 * 1024)} MB.`,
  );
}

/** Size check (D-53), JSON parse and shape check of a backup file's text. */
export function parseBackupText(text: string): BackupFile {
  if (new TextEncoder().encode(text).length > BACKUP_MAX_BYTES)
    throw backupTooLarge();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RestoreError("BACKUP_NOT_JSON", "The file is not a JSON backup.");
  }
  return validateBackup(data);
}

/** The last top-level check: `tables` is an object. Its rows are checked by
 *  `prepareRestore`, so the file is only shaped like a BackupFile so far. */
const hasTables = (
  b: Record<string, unknown>,
): b is Record<string, unknown> & BackupFile =>
  typeof b.tables === "object" && b.tables !== null;

/** The backup's top-level shape and version. Rows are checked by `prepareRestore`. */
export function validateBackup(data: unknown): BackupFile {
  if (typeof data !== "object" || data === null || Array.isArray(data))
    throw invalid("expected a JSON object");
  const b = data as Record<string, unknown>;
  if (typeof b.schemaVersion !== "number" || !Number.isInteger(b.schemaVersion))
    throw invalid("missing schemaVersion");
  if (b.schemaVersion > SCHEMA_HEAD)
    throw new RestoreError(
      "BACKUP_NEWER",
      `Unsupported schema version ${b.schemaVersion} (this app reads up to ${SCHEMA_HEAD}).`,
      { detail: `v${b.schemaVersion} > v${SCHEMA_HEAD}` },
    );
  if (b.schemaVersion < 1) throw invalid("missing schemaVersion");
  if (typeof b.exportedAt !== "string") throw invalid("missing exportedAt");
  if (!hasTables(b)) throw invalid("missing tables");
  return b;
}

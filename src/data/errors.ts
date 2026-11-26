// Typed data-layer errors. Each code maps to an i18n message (`t.dataErrors`), and
// `details` carries what the message lists: table names, row ids, property names and
// rule names — never money amounts, so a DataError is written to the log as it is.
// Names and ids built from names stay in it (ADR 0147).
import {
  isCommandError,
  type ConstraintFailure,
} from "../platform/commandError";

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

export class DataError extends Error {
  readonly code: DataErrorCode;
  /** One human-readable line per offending record, without financial values. */
  readonly details: string[];
  /** Set on MIGRATION_FAILED (ADR 0153). */
  readonly upgrade?: UpgradeStop;
  constructor(
    code: DataErrorCode,
    message: string,
    details: string[] = [],
    options?: { cause?: unknown; upgrade?: UpgradeStop },
  ) {
    super(message, options);
    this.name = "DataError";
    this.code = code;
    this.details = details;
    if (options?.upgrade) this.upgrade = options.upgrade;
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

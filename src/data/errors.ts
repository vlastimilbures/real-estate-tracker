// Typed data-layer errors (P5a). Each code maps to an i18n message (`t.dataErrors`), and
// `details` carries what the message lists: table names, row ids, property names and
// rule names — never money amounts, so a DataError is written to the log as it is.
// Names and ids built from names stay in it (ADR 0147).

export type DataErrorCode =
  /** `PRAGMA integrity_check` did not return ok at startup. */
  | "DB_INTEGRITY"
  /** The database was written by a newer app version (DR-022). */
  | "DB_NEWER"
  /** Existing rows would break a pending migration's new constraints. */
  | "MIGRATION_CONFLICT"
  /** The pre-migration backup could not be written or verified. */
  | "MIGRATION_BACKUP_FAILED"
  /** A migration's own statements failed (rolled back). */
  | "MIGRATION_FAILED"
  /** A stored row has a value its column cannot hold (DR-037). */
  | "ROW_INVALID"
  /** An update/delete by id matched no row (DR-082). */
  | "ROW_MISSING"
  /** A saved scenario's overrides JSON is unreadable (DR-037). */
  | "SCENARIO_INVALID";

export class DataError extends Error {
  readonly code: DataErrorCode;
  /** One human-readable line per offending record, without financial values. */
  readonly details: string[];
  constructor(
    code: DataErrorCode,
    message: string,
    details: string[] = [],
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DataError";
    this.code = code;
    this.details = details;
  }
}

/** The underlying message of anything thrown (Tauri `invoke` rejects with a string). */
export function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** A write SQLite refused because of a schema constraint (v7, DR-133). Names only the
 *  table, columns or constraint, never the values. */
export type ConstraintFailure =
  | { kind: "unique"; table: string; columns: string[] }
  | { kind: "notNull"; table: string; columns: string[] }
  | { kind: "check"; check: string }
  | { kind: "foreignKey" };

const UNIQUE_OR_NOT_NULL =
  /(UNIQUE|NOT NULL) constraint failed: ([\w]+\.[\w]+(?:, [\w]+\.[\w]+)*)/;
const CHECK = /CHECK constraint failed: (\w+)/;

/** The constraint behind a failed write, from SQLite's message (better-sqlite3 in tests,
 *  sqlx's "error returned from database: (code: …) …" in the app); null otherwise. */
export function constraintOf(e: unknown): ConstraintFailure | null {
  if (e === undefined || e === null) return null;
  const text = messageOf(e);
  const keyed = UNIQUE_OR_NOT_NULL.exec(text);
  if (keyed) {
    // Both groups are mandatory in the pattern, so a match always has them.
    const [, constraint, list = ""] = keyed;
    const cols = list.split(", ").map((c) => c.split("."));
    return {
      kind: constraint === "UNIQUE" ? "unique" : "notNull",
      table: cols[0]?.[0] ?? "",
      columns: cols.map(([, col = ""]) => col),
    };
  }
  const check = CHECK.exec(text);
  if (check) return { kind: "check", check: check[1] ?? "" };
  if (text.includes("FOREIGN KEY constraint failed"))
    return { kind: "foreignKey" };
  return null;
}

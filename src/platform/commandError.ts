// How an app command fails (ADR 0270). Rust rejects with `{ code, detail }`
// (src-tauri/src/error.rs): `code` is the contract the webview matches on, `detail` the
// text shown or logged as it is today. `call` (commands.ts) turns that rejection into a
// `CommandError`. Kept apart from the Tauri call, so the data layer and its test double
// can name the error without importing `@tauri-apps/api` (like saveFileTypes.ts).

/** Every code `AppError::code` returns. Renaming or removing one needs an ADR;
 *  `src/platform/__tests__/commands.test.ts` checks this list against error.rs. */
export const COMMAND_ERROR_CODES = [
  "SQL",
  "IO",
  "OTHER",
  "UNSUPPORTED_PARAM",
  "UNSUPPORTED_DATATYPE",
  "DB_NOT_LOADED",
  "INVALID_LABEL",
  "INVALID_BACKUP_NAME",
  "BACKUP_EXISTS",
  "BACKUP_PATH_NOT_UTF8",
  "BACKUP_FAILED",
  "BACKUP_UNREADABLE",
  "BACKUP_CORRUPT",
  "BACKUP_MISMATCH",
  "BACKUP_TOO_LARGE",
  "NO_FOLDER",
  "NO_FILE_NAME",
  "SAVED_FILE_MISMATCH",
  "MISSING_HEADER",
  "INVALID_PERCENT_ESCAPE",
  "EXPECTED_RAW_BODY",
  "INVALID_MENU_LABEL",
] as const;

export type CommandErrorCode = (typeof COMMAND_ERROR_CODES)[number];

const CODES: ReadonlySet<string> = new Set(COMMAND_ERROR_CODES);

function isCode(code: string): code is CommandErrorCode {
  return CODES.has(code);
}

/** A write SQLite refused because of a schema constraint (Rust's `Constraint`,
 *  src-tauri/src/error.rs). Names only the table, columns or constraint, never the
 *  values. */
export type ConstraintFailure =
  | { kind: "unique"; table: string; columns: string[] }
  | { kind: "notNull"; table: string; columns: string[] }
  | { kind: "check"; check: string }
  | { kind: "foreignKey" };

/** A failed app command: Rust's code, its text as the message, and for a constraint
 *  failure the constraint's fields. */
export class CommandError extends Error {
  readonly code: CommandErrorCode;
  /** Rust's `Display` text, word for word; also the message. */
  readonly detail: string;
  readonly constraint?: ConstraintFailure;
  constructor(
    code: CommandErrorCode,
    detail: string,
    constraint?: ConstraintFailure,
  ) {
    super(detail);
    this.name = "CommandError";
    this.code = code;
    this.detail = detail;
    if (constraint) this.constraint = constraint;
  }
}

/** True for a `CommandError`, with `code` when given. */
export function isCommandError(
  e: unknown,
  code?: CommandErrorCode,
): e is CommandError {
  return e instanceof CommandError && (code === undefined || e.code === code);
}

/** The Rust code of the failed command behind `e`: in `e` itself or in its `cause`
 *  chain (the data layer's errors keep the rejection as their cause). A looping chain
 *  ends. */
export function commandCodeOf(e: unknown): CommandErrorCode | null {
  const seen = new Set<unknown>();
  for (let at = e; at instanceof Error && !seen.has(at); at = at.cause) {
    if (isCommandError(at)) return at.code;
    seen.add(at);
  }
  return null;
}

/** Rust's rejection as a `CommandError`; anything else (Tauri's own refusals are plain
 *  strings) as it came. A code this list does not know is `OTHER`, so its detail is still
 *  the text the user sees, and the code stays one of the list. */
export function toCommandError(rejection: unknown): unknown {
  if (typeof rejection !== "object" || rejection === null) return rejection;
  const { code, detail, constraint } = rejection as Record<string, unknown>;
  if (typeof code !== "string" || typeof detail !== "string") return rejection;
  return new CommandError(
    isCode(code) ? code : "OTHER",
    detail,
    constraintFrom(constraint),
  );
}

const isNames = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/** The `constraint` Rust sent, checked field by field; undefined when absent or not in
 *  the shape of a `ConstraintFailure`. */
function constraintFrom(value: unknown): ConstraintFailure | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { kind, table, columns, check } = value as Record<string, unknown>;
  switch (kind) {
    case "unique":
    case "notNull":
      return typeof table === "string" && isNames(columns)
        ? { kind, table, columns }
        : undefined;
    case "check":
      return typeof check === "string" ? { kind, check } : undefined;
    case "foreignKey":
      return { kind };
    default:
      return undefined;
  }
}

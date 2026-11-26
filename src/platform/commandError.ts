// How an app command fails (ADR 0270). Rust rejects with `{ code, detail }`
// (src-tauri/src/error.rs): `code` is the contract the webview matches on, `detail` the
// text shown or logged as it is today. `call` (commands.ts) turns that rejection into a
// `CommandError`. Kept apart from the Tauri call, so the data layer and its test double
// can name the error without importing `@tauri-apps/api` (like saveFileTypes.ts).

/** Every code `AppError::code` returns, in its order. Renaming or removing one needs an
 *  ADR; `src/platform/__tests__/commands.test.ts` checks this list against error.rs. */
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

function isCode(code: unknown): code is CommandErrorCode {
  return typeof code === "string" && CODES.has(code);
}

/** A failed app command: Rust's code, and its text as the message. */
export class CommandError extends Error {
  readonly code: CommandErrorCode;
  /** Rust's `Display` text, word for word; also the message. */
  readonly detail: string;
  constructor(code: CommandErrorCode, detail: string) {
    super(detail);
    this.name = "CommandError";
    this.code = code;
    this.detail = detail;
  }
}

/** True for a `CommandError`, with `code` when given. */
export function isCommandError(
  e: unknown,
  code?: CommandErrorCode,
): e is CommandError {
  return e instanceof CommandError && (code === undefined || e.code === code);
}

/** Rust's rejection as a `CommandError`; anything else (Tauri's own refusals are plain
 *  strings) as it came. */
export function toCommandError(rejection: unknown): unknown {
  if (typeof rejection !== "object" || rejection === null) return rejection;
  const { code, detail } = rejection as Record<string, unknown>;
  if (!isCode(code) || typeof detail !== "string") return rejection;
  return new CommandError(code, detail);
}

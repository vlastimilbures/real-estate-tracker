// Local error log. Appends one structured line per failure to the app's
// rotating log file via the `log_error` command (src-tauri/src/db.rs →
// tauri-plugin-log; macOS: ~/Library/Logs/com.bures.realestate-tracker/app.log).
// Offline only: nothing leaves the machine.
//
// No personal financial values: a DataError contributes its code and details (table,
// row id, column, rule — never a value); any other error's message has every number
// masked, so an amount that slipped into a message is not recorded (ADR 0147), except an
// OS or SQLite error code, which says what failed (ADR 0175). Names are kept (they help
// diagnosis); the bug form says to replace them before pasting. A failed app command's
// context starts with its Rust code (ADR 0270 point 7), also when a DataError wraps it
// (the startup upgrade's MIGRATION_* errors): a closed list of upper snake case names,
// written as it is.
import { DataError, messageOf } from "./errors";
import { commandCodeOf } from "../platform/commandError";
import { isTauri } from "../lib/tauri";
import { writeErrorLine } from "../platform/errorLog";

/** A 1–5 digit code right after the word `os error ` or `code ` / `code: ` (sqlx prints
 *  `(code: 2067)`), kept; or any other digit run with its separators, masked. */
const NUMBER_OR_CODE =
  /(\b(?:os error |code:? )\d{1,5})(?![\s.,]*\d)|\d(?:[\d\s.,]*\d)?/g;

/** Mask every digit run (with its separators): amounts, never needed for diagnosis. An
 *  OS or SQLite error code stays: it says what failed (ADR 0175). */
export function maskNumbers(text: string): string {
  return text.replace(
    NUMBER_OR_CODE,
    (_run, code: string | undefined) => code ?? "#",
  );
}

/** Where a failure happened: the prefix of its log code (`<SITE>_FAILED`). */
export type FailureSite =
  | "STARTUP"
  | "WRITE"
  // The reload after a write, and Try again after a failed one (ADR 0125, ADR 0228).
  | "RELOAD"
  // Exporting a backup.
  | "BACKUP"
  // Choosing or confirming a restore.
  | "RESTORE"
  // Loading or clearing the sample.
  | "SAMPLE"
  | "IMPORT"
  | "EXPORT"
  | "TEMPLATE"
  | "RENDER"
  // Showing the data folder: the startup error screen (ADR 0153), Settings → Backup
  // (ADR 0175).
  | "REVEAL";

/** The code + context line written for a failure in `where`. */
export function describeFailure(
  where: FailureSite,
  e: unknown,
): { code: string; context: string } {
  const rust = commandCodeOf(e);
  const withRust = (text: string) => (rust ? `${rust}: ${text}` : text);
  if (e instanceof DataError)
    return {
      code: e.code,
      context: withRust(`${where}: ${e.details.join("; ")}`),
    };
  return {
    code: `${where}_FAILED`,
    context: withRust(maskNumbers(messageOf(e))),
  };
}

/** Fire-and-forget: logging must never turn into a second failure. */
export function logFailure(where: FailureSite, e: unknown): void {
  if (!isTauri()) return;
  writeErrorLine(describeFailure(where, e));
}

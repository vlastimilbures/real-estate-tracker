// Local error log (P5a step 5). Appends one structured line per failure to the app's
// rotating log file via the `log_error` command (src-tauri/src/db.rs →
// tauri-plugin-log; macOS: ~/Library/Logs/com.bures.realestate-tracker/app.log).
// Offline only: nothing leaves the machine.
//
// No personal financial values: a DataError contributes its code and details (table,
// row id, column, rule — never a value); any other error's message has every number
// masked, so an amount that slipped into a message is not recorded (ADR 0147). Names
// are kept (they help diagnosis); the bug form says to replace them before pasting.
import { invoke } from "@tauri-apps/api/core";
import { DataError, messageOf } from "./errors";
import { isTauri } from "../lib/tauri";

/** Mask every digit run (with its separators): amounts, never needed for diagnosis. */
export function maskNumbers(text: string): string {
  return text.replace(/\d(?:[\d\s.,]*\d)?/g, "#");
}

/** Where a failure happened: the prefix of its log code (`<SITE>_FAILED`). */
export type FailureSite =
  | "STARTUP"
  | "WRITE"
  // The reload after a write (ADR 0125).
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
  // Showing the data folder from the startup error screen (ADR 0153).
  | "REVEAL";

/** The code + context line written for a failure in `where`. */
export function describeFailure(
  where: FailureSite,
  e: unknown,
): { code: string; context: string } {
  if (e instanceof DataError)
    return { code: e.code, context: `${where}: ${e.details.join("; ")}` };
  return { code: `${where}_FAILED`, context: maskNumbers(messageOf(e)) };
}

/** Fire-and-forget: logging must never turn into a second failure. */
export function logFailure(where: FailureSite, e: unknown): void {
  if (!isTauri()) return;
  invoke("log_error", describeFailure(where, e)).catch(() => undefined);
}

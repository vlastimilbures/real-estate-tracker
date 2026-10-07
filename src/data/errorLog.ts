// Local error log (P5a step 5). Appends one structured line per failure to the app's
// rotating log file via the `log_error` command (src-tauri/src/db.rs →
// tauri-plugin-log; macOS: ~/Library/Logs/com.bures.realestate-tracker/app.log).
// Offline only: nothing leaves the machine.
//
// No personal financial values: a DataError contributes its code and details (table,
// row id, column, rule — never a value); any other error's message has digit runs
// masked, so an amount that slipped into a message is not recorded.
import { invoke } from "@tauri-apps/api/core";
import { DataError, messageOf } from "./errors";
import { isTauri } from "../lib/tauri";

/** Mask runs of 4+ digits (with separators) — amounts, never needed for diagnosis. */
export function maskNumbers(text: string): string {
  return text.replace(/\d(?:[\d\s.,]*\d){3,}/g, "#");
}

/** Where a failure happened: the prefix of its log code (`<SITE>_FAILED`). */
export type FailureSite =
  "STARTUP" | "WRITE" | "BACKUP" | "IMPORT" | "EXPORT" | "TEMPLATE" | "RENDER";

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

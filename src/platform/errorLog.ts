// The `log_error` command (src-tauri/src/db.rs → tauri-plugin-log): appends one line to
// the app's rotating log file. What the line holds is data/errorLog.ts's business.
import { call } from "./commands";

/** Fire-and-forget: a failed log write is swallowed, never a second failure. */
export function writeErrorLine(line: { code: string; context: string }): void {
  call("log_error", line).catch(() => undefined);
}

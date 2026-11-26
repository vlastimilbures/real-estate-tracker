// The app's own Tauri commands, typed: the one place the webview names a command, its
// arguments and its result. The Rust side keeps the same list once
// (src-tauri/src/command_list.rs), which registers each command, lists it in the app
// manifest and is checked against the `allow-*` grants in capabilities/default.json.
// `src/platform/__tests__/commands.test.ts` checks that this map and that list hold the
// same names.
//
// Argument keys are camelCase: Tauri turns them into the Rust snake_case parameters
// (`maxBytes` → `max_bytes`). Nothing else may import `@tauri-apps/api` (the
// `tauri-api-in-platform` depcruise rule).
import {
  invoke,
  type InvokeArgs,
  type InvokeOptions,
} from "@tauri-apps/api/core";
import { toCommandError } from "./commandError";
import type { NativeMenuLabels } from "./menuLabels";
import type { SaveOutcome } from "./saveFileTypes";

/** One SQL statement as the database commands take it (src-tauri/src/db.rs). */
interface WireStatement {
  query: string;
  params: unknown[];
}

/** Statements run on the app's database. */
interface DbStatements {
  statements: WireStatement[];
}

/** Each command's arguments (`undefined`: it takes none) and what it resolves to. */
export interface Commands {
  db_transaction: { args: DbStatements; result: void };
  db_select_snapshot: {
    args: DbStatements;
    result: Record<string, unknown>[][];
  };
  db_backup: { args: { label: string }; result: string };
  log_error: { args: { code: string; context: string }; result: void };
  perf_enabled: { args: undefined; result: boolean };
  perf_report: { args: { name: string; ms: number | null }; result: void };
  /** The file's bytes are the body; the dialog options go in a header. */
  save_file: { args: Uint8Array; result: SaveOutcome };
  open_backup_file: {
    args: { maxBytes: number };
    result: { name: string; text: string } | null;
  };
  write_app_backup: { args: { filename: string; json: string }; result: void };
  reveal_data_dir: { args: undefined; result: void };
  set_menu_labels: { args: { labels: NativeMenuLabels }; result: void };
}

export type CommandName = keyof Commands;

/** What follows the name: nothing for a command without arguments, else its arguments
 *  and, optionally, the request options (headers). */
type CallRest<K extends CommandName> = Commands[K]["args"] extends undefined
  ? []
  : [args: Commands[K]["args"], options?: InvokeOptions];

/** Call an app command. Rust's failure rejects as a `CommandError` (ADR 0270). */
export function call<K extends CommandName>(
  name: K,
  ...rest: CallRest<K>
): Promise<Commands[K]["result"]> {
  // Passed on as given, so a command without arguments is sent without any.
  const sent = rest as [InvokeArgs?, InvokeOptions?];
  return invoke<Commands[K]["result"]>(name, ...sent).catch(
    (rejection: unknown) => {
      throw toCommandError(rejection);
    },
  );
}

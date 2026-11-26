// The webview's typed command map (commands.ts) and the Rust command list
// (src-tauri/src/command_list.rs) hold the same names, so a command cannot be typed here
// and missing there, or registered there and untyped here. `call` sends what it is given.
import { readFileSync } from "node:fs";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { CommandName } from "../commands";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const { call } = await import("../commands");

afterEach(() => {
  invoke.mockReset();
});

/** Every command in the typed map: the type check fails if one is left out here. */
const TYPED = {
  db_transaction: true,
  db_select_snapshot: true,
  db_backup: true,
  log_error: true,
  perf_enabled: true,
  perf_report: true,
  save_file: true,
  open_backup_file: true,
  write_app_backup: true,
  reveal_data_dir: true,
  set_menu_labels: true,
} satisfies Record<CommandName, true>;

/** The `module::command` entries of the Rust list. */
function rustCommands(): string[] {
  const path = new URL(
    "../../../src-tauri/src/command_list.rs",
    import.meta.url,
  );
  const source = readFileSync(path, "utf8");
  return [...source.matchAll(/^\s*\w+::(\w+),$/gm)].map((m) => m[1] ?? "");
}

/** Never run: the type check refuses a wrong name or wrong arguments. */
export function typeChecks(): void {
  // @ts-expect-error not an app command
  void call("db_vacuum");
  // @ts-expect-error perf_enabled takes no arguments
  void call("perf_enabled", {});
  // @ts-expect-error the argument key is camelCase
  void call("open_backup_file", { max_bytes: 1 });
  // @ts-expect-error db_backup needs its label
  void call("db_backup", {});
}

describe("the command contract", () => {
  it("types exactly the commands Rust registers", () => {
    expect(rustCommands().sort()).toEqual(Object.keys(TYPED).sort());
  });

  it("sends a command without arguments with none", async () => {
    invoke.mockResolvedValueOnce(true);
    await expect(call("perf_enabled")).resolves.toBe(true);
    expect(invoke.mock.calls).toEqual([["perf_enabled"]]);
    expect(invoke.mock.calls[0]).toHaveLength(1);
  });

  it("sends the arguments and options it is given", async () => {
    invoke.mockResolvedValueOnce({ kind: "cancelled" });
    const body = new Uint8Array([1]);
    const options = { headers: { "x-save-options": "{}" } };
    await call("save_file", body, options);
    expect(invoke.mock.calls).toEqual([["save_file", body, options]]);
    expect(invoke.mock.calls[0]).toHaveLength(3);
  });
});

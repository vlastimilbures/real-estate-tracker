// The webview's typed command map (commands.ts) and the Rust command list
// (src-tauri/src/command_list.rs) hold the same names, so a command cannot be typed here
// and missing there, or registered there and untyped here. `call` sends what it is given.
// A rejection from Rust is `{ code, detail }` and becomes a `CommandError`, whose codes
// are the ones `AppError::code` lists in src-tauri/src/error.rs (ADR 0270).
import { readFileSync } from "node:fs";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { CommandName } from "../commands";
import {
  CommandError,
  COMMAND_ERROR_CODES,
  isCommandError,
  type CommandErrorCode,
} from "../commandError";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const { call } = await import("../commands");

afterEach(() => {
  invoke.mockReset();
});

/** Every command in the typed map: the type check fails if one is left out here. */
const TYPED = {
  db_execute: true,
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

/** The codes `AppError::code` returns, in its match order. */
function rustErrorCodes(): string[] {
  const path = new URL("../../../src-tauri/src/error.rs", import.meta.url);
  const source = readFileSync(path, "utf8");
  const body = /fn code\(&self\)[^{]*\{([\s\S]*?)\n {4}\}/.exec(source)?.[1];
  return [...(body ?? "").matchAll(/=> "([A-Z0-9_]+)",/g)].map(
    (m) => m[1] ?? "",
  );
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
  // @ts-expect-error not a Rust error code
  void isCommandError(new Error(), "BACKUP_TOO_BIG");
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

describe("a failed command", () => {
  it("lists exactly the codes Rust sends", () => {
    const rust = rustErrorCodes();
    expect(rust).toHaveLength(22);
    expect([...COMMAND_ERROR_CODES].sort()).toEqual([...rust].sort());
  });

  it("rejects with a CommandError holding Rust's code and detail", async () => {
    invoke.mockRejectedValueOnce({
      code: "BACKUP_TOO_LARGE",
      detail: "BACKUP_TOO_LARGE",
    });
    const err: unknown = await call("open_backup_file", { maxBytes: 1 }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CommandError);
    expect(err).toBeInstanceOf(Error);
    const e = err as CommandError;
    expect(e.code).toBe("BACKUP_TOO_LARGE");
    expect(e.detail).toBe("BACKUP_TOO_LARGE");
    expect(e.message).toBe("BACKUP_TOO_LARGE");
    expect(isCommandError(e, "BACKUP_TOO_LARGE")).toBe(true);
    expect(isCommandError(e, "IO")).toBe(false);
    expect(isCommandError(e)).toBe(true);
  });

  it("keeps the detail as the message, word for word", async () => {
    const detail = "No space left on device (os error 28)";
    invoke.mockRejectedValueOnce({ code: "IO", detail });
    await expect(call("reveal_data_dir")).rejects.toMatchObject({
      name: "CommandError",
      code: "IO" satisfies CommandErrorCode,
      detail,
      message: detail,
    });
  });

  it("carries a constraint failure's fields (ADR 0270 point 3)", async () => {
    const constraint = {
      kind: "unique",
      table: "properties",
      columns: ["name"],
    };
    invoke.mockRejectedValueOnce({ code: "SQL", detail: "x", constraint });
    const err: unknown = await call("db_transaction", { statements: [] }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CommandError);
    expect(err).toMatchObject({ code: "SQL", message: "x", constraint });
  });

  it.each([
    { kind: "unique", table: "t" },
    { kind: "unique", table: "t", columns: [1] },
    { kind: "notNull", columns: ["a"] },
    { kind: "check" },
    { kind: "primary" },
    "unique",
  ])("drops a malformed constraint %j, keeping code and detail", async (c) => {
    invoke.mockRejectedValueOnce({ code: "SQL", detail: "x", constraint: c });
    const err: unknown = await call("db_transaction", { statements: [] }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CommandError);
    expect((err as CommandError).constraint).toBeUndefined();
    expect((err as CommandError).message).toBe("x");
  });

  it("keeps the detail of a code it does not know, as OTHER", async () => {
    // The code-list test keeps both lists equal; this guards the user's text if one
    // slips anyway: never "[object Object]".
    invoke.mockRejectedValueOnce({ code: "NOT_A_RUST_CODE", detail: "boom" });
    const err: unknown = await call("perf_enabled").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CommandError);
    expect(err).toMatchObject({
      code: "OTHER",
      detail: "boom",
      message: "boom",
    });
  });

  it("passes any other rejection on unchanged", async () => {
    // Tauri's own refusals (an unknown command, a missing grant) are plain strings.
    invoke.mockRejectedValueOnce("Command perf_enabled not allowed by ACL");
    await expect(call("perf_enabled")).rejects.toBe(
      "Command perf_enabled not allowed by ACL",
    );
    const odd = { code: 7, detail: "x" };
    invoke.mockRejectedValueOnce(odd);
    await expect(call("perf_enabled")).rejects.toBe(odd);
    expect(isCommandError("BACKUP_TOO_LARGE", "BACKUP_TOO_LARGE")).toBe(false);
  });
});

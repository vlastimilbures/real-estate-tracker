// ADR 0175 (#171 option A): `execute` refuses transaction control. Each `execute` may run
// on another pooled connection, so `BEGIN` … `COMMIT` sent as separate calls would not be
// atomic (the H-14 bug shape); multi-step writes go through `transaction` (ADR 0014).
// ADR 0270 point 4: a single statement goes to the app's `db_execute` command, so its
// failure carries Rust's code; reads stay on the SQL plugin.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DB_URL, openTauriSql } from "../tauriSql";
import { CommandError } from "../../platform/commandError";

const db = vi.hoisted(() => ({
  execute: vi.fn(async () => ({ rowsAffected: 1 })),
  select: vi.fn(async () => []),
}));
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: vi.fn(async () => db) },
}));
const core = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => core);
vi.mock("../../lib/tauri", () => ({ isTauri: () => true }));

beforeEach(() => {
  db.execute.mockClear();
  core.invoke.mockReset();
});

describe("tauriSql.execute (ADR 0175)", () => {
  it.each([
    "BEGIN",
    "begin immediate",
    "  commit;",
    "END TRANSACTION",
    "ROLLBACK",
    "\nSAVEPOINT a",
    "RELEASE a",
  ])("refuses %j and names transaction", async (query) => {
    const sql = await openTauriSql();
    await expect(sql.execute(query)).rejects.toThrow(/transaction/);
    expect(core.invoke).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("runs an ordinary statement through db_execute, not the plugin", async () => {
    core.invoke.mockResolvedValue({ rowsAffected: 1 });
    const sql = await openTauriSql();
    await expect(
      sql.execute("INSERT INTO t (a) VALUES (?)", ["BEGIN"]),
    ).resolves.toEqual({ rowsAffected: 1 });
    expect(core.invoke.mock.calls).toEqual([
      [
        "db_execute",
        { query: "INSERT INTO t (a) VALUES (?)", params: ["BEGIN"] },
      ],
    ]);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("lets a statement through that only contains a keyword", async () => {
    core.invoke.mockResolvedValue({ rowsAffected: 0 });
    const sql = await openTauriSql();
    await sql.execute(
      "UPDATE notes SET text = 'BEGIN; COMMIT' WHERE id = ?",
      [1],
    );
    await sql.execute("DELETE FROM endpoints");
    expect(core.invoke.mock.calls).toEqual([
      [
        "db_execute",
        {
          query: "UPDATE notes SET text = 'BEGIN; COMMIT' WHERE id = ?",
          params: [1],
        },
      ],
      ["db_execute", { query: "DELETE FROM endpoints", params: [] }],
    ]);
  });

  it("fails with Rust's code and detail", async () => {
    const detail =
      "error returned from database: (code: 2067) UNIQUE constraint failed: properties.name";
    core.invoke.mockRejectedValue({ code: "SQL", detail });
    const sql = await openTauriSql();
    const err: unknown = await sql
      .execute("INSERT INTO properties (name) VALUES (?)", ["A"])
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CommandError);
    expect(err).toMatchObject({ code: "SQL", message: detail });
  });

  it("reads through the plugin", async () => {
    db.select.mockResolvedValueOnce([{ a: 1 }] as never);
    const sql = await openTauriSql();
    await expect(sql.select("SELECT a FROM t", [])).resolves.toEqual([
      { a: 1 },
    ]);
    expect(db.select).toHaveBeenCalledWith("SELECT a FROM t", []);
    expect(core.invoke).not.toHaveBeenCalled();
  });
});

// The wire format of the app's own database commands (src-tauri/src/db.rs): the command
// names and the argument keys. Rust runs them on the app's one database.
describe("tauriSql commands", () => {
  const statements = [
    { query: "DELETE FROM t WHERE id = ?", params: [1] },
    { query: "DELETE FROM u" },
  ];
  const sent = [
    { query: "DELETE FROM t WHERE id = ?", params: [1] },
    { query: "DELETE FROM u", params: [] },
  ];

  it("sends a transaction to db_transaction, every statement with its params", async () => {
    core.invoke.mockResolvedValue(undefined);
    const sql = await openTauriSql();
    await sql.transaction(statements);
    expect(core.invoke.mock.calls).toEqual([
      ["db_transaction", { statements: sent }],
    ]);
  });

  it("reads a snapshot through db_select_snapshot and returns its rows", async () => {
    const rows = [[{ a: 1 }], []];
    core.invoke.mockResolvedValue(rows);
    const sql = await openTauriSql();
    await expect(sql.selectSnapshot(statements)).resolves.toBe(rows);
    expect(core.invoke.mock.calls).toEqual([
      ["db_select_snapshot", { statements: sent }],
    ]);
  });

  it("backs up through db_backup and returns the file name", async () => {
    core.invoke.mockResolvedValue("portfolio-x.db");
    const sql = await openTauriSql();
    await expect(sql.backup("before-migration")).resolves.toBe(
      "portfolio-x.db",
    );
    expect(core.invoke.mock.calls).toEqual([
      ["db_backup", { label: "before-migration" }],
    ]);
  });

  it("passes a refused command on", async () => {
    const refused = new Error("database is locked");
    core.invoke.mockRejectedValue(refused);
    const sql = await openTauriSql();
    await expect(sql.transaction(statements)).rejects.toBe(refused);
  });
});

// #473: the webview opens the database on the connection the Rust commands run on.
describe("the database connection", () => {
  it("is the one the Rust database commands use", () => {
    const rust = readFileSync(
      join(__dirname, "../../../src-tauri/src/paths.rs"),
      "utf8",
    );
    expect(/pub const DB_URL: &str = "([^"]+)";/.exec(rust)?.[1]).toBe(DB_URL);
  });
});

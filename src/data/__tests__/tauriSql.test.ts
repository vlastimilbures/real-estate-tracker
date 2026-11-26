// ADR 0175 (#171 option A): `execute` refuses transaction control. Each `execute` may run
// on another pooled connection, so `BEGIN` … `COMMIT` sent as separate calls would not be
// atomic (the H-14 bug shape); multi-step writes go through `transaction` (ADR 0014).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openTauriSql } from "../tauriSql";

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
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("runs an ordinary statement through the plugin", async () => {
    const sql = await openTauriSql();
    await expect(
      sql.execute("INSERT INTO t (a) VALUES (?)", ["BEGIN"]),
    ).resolves.toEqual({ rowsAffected: 1 });
    expect(db.execute).toHaveBeenCalledWith("INSERT INTO t (a) VALUES (?)", [
      "BEGIN",
    ]);
  });

  it("lets a statement through that only contains a keyword", async () => {
    const sql = await openTauriSql();
    await sql.execute(
      "UPDATE notes SET text = 'BEGIN; COMMIT' WHERE id = ?",
      [1],
    );
    await sql.execute("DELETE FROM endpoints");
    expect(db.execute).toHaveBeenCalledTimes(2);
  });
});

// The wire format of the app's own database commands (src-tauri/src/db.rs): the command
// names, the argument keys and the connection they name.
describe("tauriSql commands", () => {
  const statements = [
    { query: "DELETE FROM t WHERE id = ?", params: [1] },
    { query: "DELETE FROM u" },
  ];
  const sent = [
    { query: "DELETE FROM t WHERE id = ?", params: [1] },
    { query: "DELETE FROM u", params: [] },
  ];

  beforeEach(() => {
    core.invoke.mockReset();
  });

  it("sends a transaction to db_transaction, every statement with its params", async () => {
    core.invoke.mockResolvedValue(undefined);
    const sql = await openTauriSql("sqlite:x.db");
    await sql.transaction(statements);
    expect(core.invoke.mock.calls).toEqual([
      ["db_transaction", { db: "sqlite:x.db", statements: sent }],
    ]);
  });

  it("reads a snapshot through db_select_snapshot and returns its rows", async () => {
    const rows = [[{ a: 1 }], []];
    core.invoke.mockResolvedValue(rows);
    const sql = await openTauriSql();
    await expect(sql.selectSnapshot(statements)).resolves.toBe(rows);
    expect(core.invoke.mock.calls).toEqual([
      ["db_select_snapshot", { db: "sqlite:portfolio.db", statements: sent }],
    ]);
  });

  it("backs up through db_backup and returns the file name", async () => {
    core.invoke.mockResolvedValue("portfolio-x.db");
    const sql = await openTauriSql();
    await expect(sql.backup("before-migration")).resolves.toBe(
      "portfolio-x.db",
    );
    expect(core.invoke.mock.calls).toEqual([
      ["db_backup", { db: "sqlite:portfolio.db", label: "before-migration" }],
    ]);
  });

  it("passes a refused command on", async () => {
    const refused = new Error("database is locked");
    core.invoke.mockRejectedValue(refused);
    const sql = await openTauriSql();
    await expect(sql.transaction(statements)).rejects.toBe(refused);
  });
});

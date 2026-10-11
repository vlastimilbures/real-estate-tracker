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
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
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

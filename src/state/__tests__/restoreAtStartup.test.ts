// #115 (ADR 0153): a stored row the app cannot read (ROW_INVALID) stops startup. The
// database is open and at head, so a JSON backup can be restored from the error screen;
// the safety copy is taken from the raw rows, bad value included.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { usePortfolioStore } from "../portfolioStore";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { exportToJson, type BackupFile } from "../../data/backup";
import type { Sql } from "../../data/sql";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((_command: string, args: { json: string }) =>
    Promise.resolve(args.json),
  ),
}));

let db: TestSql;
let good: BackupFile;
const store = () => usePortfolioStore.getState();

/** Every load fails, as when the restored file cannot be read back. */
const reloadFails = (real: Sql): Sql => ({
  ...real,
  selectSnapshot: (statements) =>
    statements.some((s) => s.query.includes("schema_migrations"))
      ? real.selectSnapshot(statements)
      : Promise.reject(new Error("database is locked")),
});

beforeEach(async () => {
  vi.mocked(invoke).mockClear();
  usePortfolioStore.setState({
    sql: null,
    portfolio: null,
    status: "idle",
    error: null,
    startupError: null,
    stale: false,
  });
  db = openMemorySql();
  await migrate(db);
  await seedIfEmpty(db);
  good = await exportToJson(db, new Date());
  // A value the CHECK lets through (it only refuses a leading minus) but the mapper
  // guard refuses: a hand-edited row.
  await db.execute(
    "UPDATE leases SET monthly_rent = 'abc' WHERE id = (SELECT id FROM leases ORDER BY id LIMIT 1)",
  );
  await store().init(async () => db);
});

describe("restoring from the startup error screen", () => {
  it("startup stopped on ROW_INVALID, with the database kept open", () => {
    expect(store().status).toBe("error");
    expect(store().startupError?.code).toBe("ROW_INVALID");
    expect(store().sql).toBe(db);
  });

  it("restores, saves the raw rows first, and continues into the app", async () => {
    const { safetyBackup, ready } = await store().restoreAtStartup(good);

    expect(safetyBackup).toMatch(/^portfolio-before-restore-.*\.json$/);
    expect(ready).toBe(true);
    const safety = vi
      .mocked(invoke)
      .mock.calls.find(([cmd]) => cmd === "write_app_backup");
    expect((safety?.[1] as { json: string }).json).toContain('"abc"');
    // The screen stays until the user has read where the safety copy is.
    expect(store().status).toBe("error");

    store().continueAfterRestore();
    expect(store().status).toBe("ready");
    expect(store().startupError).toBeNull();
    expect(store().error).toBeNull();
    expect(store().portfolio!.properties.length).toBeGreaterThan(0);
  });

  it("a restore whose reload fails stays on the error screen", async () => {
    usePortfolioStore.setState({ sql: reloadFails(db) });

    const { ready } = await store().restoreAtStartup(good);

    expect(ready).toBe(false);
    store().continueAfterRestore();
    expect(store().status).toBe("error");
  });

  it("is refused for any other startup failure", async () => {
    usePortfolioStore.setState({
      startupError: { code: "DB_INTEGRITY", details: [] },
    });
    await expect(store().restoreAtStartup(good)).rejects.toThrow(/ROW_INVALID/);
    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
  });
});

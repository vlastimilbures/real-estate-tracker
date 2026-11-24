// ADR 0252 (#444): a database without its assumptions row stops startup with ROW_INVALID
// on the existing error screen (ADR 0153, ADR 0231), and Restore a backup… is the way out.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import { READ_FAILURES } from "../diagnostics";
import { bootView } from "../../ui/model/bootFailure";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { exportToJson, RestoreError, type BackupFile } from "../../data/backup";
import { startupErrorOf, statusOf } from "../../__tests__/support/status";

vi.mocked(invoke).mockResolvedValue(undefined);

let db: TestSql;
let good: BackupFile;
const store = () => usePortfolioStore.getState();

/** The app's launch recipe (`defaultOpen`, src/data/open.ts), on the test database. */
const open = async () => {
  await migrate(db);
  await seedIfEmpty(db);
  return db;
};

const snapshot = async () => ({
  assumptions: await db.select("SELECT * FROM assumptions"),
  properties: await db.select("SELECT * FROM properties ORDER BY id"),
  leases: await db.select("SELECT * FROM leases ORDER BY id"),
});

beforeEach(async () => {
  vi.mocked(invoke).mockClear();
  db = openMemorySql();
  await open();
  good = await exportToJson(db, new Date());
  // A hand-edited database: the row is gone.
  await db.execute("DELETE FROM assumptions");
  await store().init(open);
});

describe("startup without the assumptions row", () => {
  it("stops on ROW_INVALID naming the record, with the database kept open", async () => {
    expect(statusOf(store())).toBe("error");
    expect(startupErrorOf(store())?.code).toBe("ROW_INVALID");
    expect(startupErrorOf(store())?.details).toEqual([
      "assumptions 1: row not found",
    ]);
    expect(portfolioDb.get()).toBe(db);
    // The launch did not put the sample values back.
    expect(await db.select("SELECT id FROM assumptions")).toEqual([]);
  });

  it("offers Restore a backup… and no Try again", () => {
    const view = bootView(startupErrorOf(store())?.code ?? null, READ_FAILURES);
    expect(view).toEqual({ retry: false, records: true, restore: true });
  });

  it("a valid backup restores and continues into the app", async () => {
    const { safetyBackup, ready } = await store().restoreAtStartup(good);

    expect(safetyBackup).toMatch(/^portfolio-before-restore-.*\.json$/);
    expect(ready).toBe(true);
    // The safety copy holds the database as it was: without assumptions.
    const safety = vi
      .mocked(invoke)
      .mock.calls.find(([cmd]) => cmd === "write_app_backup");
    const copy = JSON.parse(
      (safety?.[1] as { json: string }).json,
    ) as BackupFile;
    expect(copy.tables.assumptions).toEqual([]);
    store().continueAfterRestore();
    expect(statusOf(store())).toBe("ready");
    expect(startupErrorOf(store())).toBeNull();
    expect(store().assumptions).not.toBeNull();
  });

  it("a backup that is missing assumptions too is refused before anything is written", async () => {
    const before = await snapshot();
    const bad: BackupFile = {
      ...good,
      tables: { ...good.tables, assumptions: [] },
    };

    const refused = store().restoreAtStartup(bad);
    await expect(refused).rejects.toBeInstanceOf(RestoreError);
    await expect(refused).rejects.toMatchObject({
      issues: [{ table: "assumptions", rule: "MISSING_ASSUMPTIONS" }],
    });

    expect(await snapshot()).toEqual(before);
    expect(
      vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "write_app_backup"),
    ).toBe(false);
    expect(statusOf(store())).toBe("error");
    expect(startupErrorOf(store())?.code).toBe("ROW_INVALID");
  });
});

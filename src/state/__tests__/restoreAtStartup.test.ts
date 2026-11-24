// #115 (ADR 0153): a stored row the app cannot read (ROW_INVALID) stops startup. The
// database is open and at head, so a JSON backup can be restored from the error screen;
// the safety copy is taken from the raw rows, bad value included.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { exportToJson, type BackupFile } from "../../data/backup";
import type { Sql } from "../../data/sql";
import {
  readBackFailedOf,
  startupErrorOf,
  statusOf,
} from "../../__tests__/support/status";
import { unwrap } from "../../__tests__/support/result";

vi.mocked(invoke).mockResolvedValue(undefined);

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
    expect(statusOf(store())).toBe("error");
    expect(startupErrorOf(store())?.code).toBe("ROW_INVALID");
    expect(portfolioDb.get()).toBe(db);
  });

  it("restores, saves the raw rows first, and continues into the app", async () => {
    const { safetyBackup, ready } = unwrap(
      await store().restoreAtStartup(good),
    );

    expect(safetyBackup).toMatch(/^portfolio-before-restore-.*\.json$/);
    expect(ready).toBe(true);
    const safety = vi
      .mocked(invoke)
      .mock.calls.find(([cmd]) => cmd === "write_app_backup");
    expect((safety?.[1] as { json: string }).json).toContain('"abc"');
    // The screen stays until the user has read where the safety copy is.
    expect(statusOf(store())).toBe("error");

    store().continueAfterRestore();
    expect(statusOf(store())).toBe("ready");
    expect(startupErrorOf(store())).toBeNull();
    expect(store().error).toBeNull();
    expect(store().portfolio!.properties.length).toBeGreaterThan(0);
  });

  it("a restore whose read-back fails stops on the read-back screen (ADR 0228)", async () => {
    portfolioDb.set(reloadFails(db));

    const { ready } = unwrap(await store().restoreAtStartup(good));

    expect(ready).toBe(false);
    expect(readBackFailedOf(store())).toBe(true);
    // The ROW_INVALID failure no longer applies: the restore replaced the data.
    expect(startupErrorOf(store())).toBeNull();
    store().continueAfterRestore();
    expect(statusOf(store())).toBe("error");

    portfolioDb.set(db);
    await store().init();
    expect(statusOf(store())).toBe("ready");
    expect(store().portfolio!.properties.length).toBeGreaterThan(0);
  });

  it("is refused for any other startup failure", async () => {
    usePortfolioStore.setState({
      status: {
        kind: "startupFailed",
        error: { kind: "data", code: "DB_INTEGRITY", details: [] },
        startup: { code: "DB_INTEGRITY", details: [] },
      },
    });
    await expect(store().restoreAtStartup(good)).resolves.toMatchObject({
      ok: false,
      error: { kind: "other", message: expect.stringMatching(/ROW_INVALID/) },
    });
    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
  });

  it("is refused once the app is running, even with a stale ROW_INVALID", async () => {
    usePortfolioStore.setState({ status: { kind: "ready" } });
    await expect(store().restoreAtStartup(good)).resolves.toMatchObject({
      ok: false,
      error: { kind: "other", message: expect.stringMatching(/ROW_INVALID/) },
    });
    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
  });
});

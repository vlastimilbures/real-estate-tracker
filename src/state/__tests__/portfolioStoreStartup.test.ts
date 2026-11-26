// The portfolio store at startup: init and refresh, a relaunch, and the startup error
// screen with its way out, Restore a backup…. The store is driven through getState()
// (zustand works outside React), so no DOM is needed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import { READ_FAILURES } from "../diagnostics";
import { bootView } from "../../ui/model/bootFailure";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { exportToJson, type BackupFile } from "../../data/backup";
import { DataError } from "../../data/errors";
import { launchOn, openSeeded, reloadFails, text } from "./support/openSeeded";
import {
  errorOf,
  readBackFailedOf,
  startupErrorOf,
  statusOf,
} from "../../__tests__/support/status";
import { unwrap } from "../../__tests__/support/result";

const store = () => usePortfolioStore.getState();

// The setup file (src/__tests__/setup/stores.ts) resets both stores before every test;
// the Tauri spy goes back to the real pass-through, and each describe sets what it needs.
beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

describe("startup and reload", () => {
  it("a typed data-layer failure at startup is kept for the translated error screen", async () => {
    const details = ["disk I/O error"];
    await usePortfolioStore
      .getState()
      .init(() =>
        Promise.reject(
          new DataError("MIGRATION_FAILED", "upgrade stopped", details),
        ),
      );
    const s = usePortfolioStore.getState();
    expect(statusOf(s)).toBe("error");
    expect(errorOf(s)).toEqual({
      kind: "data",
      code: "MIGRATION_FAILED",
      details,
    });
    expect(startupErrorOf(s)).toEqual({ code: "MIGRATION_FAILED", details });
  });

  it("a stopped upgrade keeps how far it got for the screen (#115)", async () => {
    const upgrade = {
      from: 8,
      reached: 9,
      stoppedAt: 10,
      backupPath: "/a/backups/pre-migration-v8-to-v11.sqlite",
    };
    await usePortfolioStore.getState().init(() =>
      Promise.reject(
        new DataError("MIGRATION_FAILED", "upgrade stopped", ["x"], {
          upgrade,
        }),
      ),
    );
    expect(startupErrorOf(usePortfolioStore.getState())).toEqual({
      code: "MIGRATION_FAILED",
      details: ["x"],
      upgrade,
    });
  });

  it("any other startup failure keeps the raw message only", async () => {
    await usePortfolioStore
      .getState()
      .init(() => Promise.reject(new Error("boom")));
    expect(startupErrorOf(usePortfolioStore.getState())).toBeNull();
    expect(errorOf(usePortfolioStore.getState())).toEqual({
      kind: "other",
      message: "boom",
    });
  });

  it("init() loads the portfolio + assumptions and goes ready", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const s = usePortfolioStore.getState();
    expect(statusOf(s)).toBe("ready");
    expect(s.portfolio!.properties.length).toBe(3);
    expect(s.assumptions).not.toBeNull();
  });

  it("init() is a no-op once ready (does not reopen the DB)", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const sql = portfolioDb.get();
    let reopened = false;
    await usePortfolioStore.getState().init(async () => {
      reopened = true;
      return openSeeded();
    });
    expect(reopened).toBe(false);
    expect(portfolioDb.get()).toBe(sql);
  });

  it("init() surfaces an opener failure as status='error'", async () => {
    await usePortfolioStore
      .getState()
      .init(() => Promise.reject(new Error("boom")));
    const s = usePortfolioStore.getState();
    expect(statusOf(s)).toBe("error");
    expect(text(errorOf(s))).toMatch(/boom/);
  });

  it("refresh() reflects a row written directly to the DB", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const sql = portfolioDb.get()!;
    const pid = usePortfolioStore.getState().portfolio!.properties[0].id;
    const before = usePortfolioStore.getState().portfolio!.valuations.length;

    await sql.execute(
      "INSERT INTO valuations (id, property_id, valid_from, valid_to, market_value) VALUES (?, ?, ?, ?, ?)",
      ["val-direct", pid, "2029-01-01", null, "9000000"],
    );
    await usePortfolioStore.getState().refresh();

    expect(usePortfolioStore.getState().portfolio!.valuations.length).toBe(
      before + 1,
    );
  });
});

// DR-024: an emptied portfolio stays empty on relaunch.
describe("a relaunch over an emptied portfolio", () => {
  it("removing every property, then relaunching, does not bring the sample back", async () => {
    const launch = launchOn(openMemorySql());
    await usePortfolioStore.getState().init(launch);
    for (const p of usePortfolioStore.getState().portfolio!.properties) {
      const r = await usePortfolioStore.getState().removeProperty(p.id);
      expect(r.ok).toBe(true);
    }
    expect(usePortfolioStore.getState().portfolio!.properties).toHaveLength(0);

    // Relaunch: a fresh store over the same DB, via the app's open recipe.
    portfolioDb.set(null);
    usePortfolioStore.setState({
      portfolio: null,
      assumptions: null,
      status: { kind: "idle" },
      error: null,
    });
    await usePortfolioStore.getState().init(launch);
    expect(statusOf(usePortfolioStore.getState())).toBe("ready");
    expect(usePortfolioStore.getState().portfolio!.properties).toHaveLength(0);
  });
});

// ADR 0252 (#444): a database without its assumptions row stops startup with ROW_INVALID
// on the existing error screen (ADR 0153, ADR 0231), and Restore a backup… is the way out.
describe("startup without the assumptions row", () => {
  let db: TestSql;
  let good: BackupFile;

  const snapshot = async () => ({
    assumptions: await db.select("SELECT * FROM assumptions"),
    properties: await db.select("SELECT * FROM properties ORDER BY id"),
    leases: await db.select("SELECT * FROM leases ORDER BY id"),
  });

  beforeEach(async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    vi.mocked(invoke).mockClear();
    db = openMemorySql();
    const open = launchOn(db);
    await open();
    good = await exportToJson(db, new Date());
    // A hand-edited database: the row is gone.
    await db.execute("DELETE FROM assumptions");
    await store().init(open);
  });

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
    const { safetyBackup, ready } = unwrap(
      await store().restoreAtStartup(good),
    );

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
    await expect(refused).resolves.toMatchObject({
      ok: false,
      error: { kind: "restoreRefused" },
    });
    await expect(refused).resolves.toMatchObject({
      ok: false,
      error: {
        issues: [{ table: "assumptions", rule: "MISSING_ASSUMPTIONS" }],
      },
    });

    expect(await snapshot()).toEqual(before);
    expect(
      vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "write_app_backup"),
    ).toBe(false);
    expect(statusOf(store())).toBe("error");
    expect(startupErrorOf(store())?.code).toBe("ROW_INVALID");
  });
});

// #115 (ADR 0153): a stored row the app cannot read (ROW_INVALID) stops startup. The
// database is open and at head, so a JSON backup can be restored from the error screen;
// the safety copy is taken from the raw rows, bad value included.
describe("restoring from the startup error screen", () => {
  let db: TestSql;
  let good: BackupFile;

  beforeEach(async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    vi.mocked(invoke).mockClear();
    db = openMemorySql();
    await launchOn(db)();
    good = await exportToJson(db, new Date());
    // A value the CHECK lets through (it only refuses a leading minus) but the mapper
    // guard refuses: a hand-edited row.
    await db.execute(
      "UPDATE leases SET monthly_rent = 'abc' WHERE id = (SELECT id FROM leases ORDER BY id LIMIT 1)",
    );
    await store().init(async () => db);
  });

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
    // Every load fails, as when the restored file cannot be read back.
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

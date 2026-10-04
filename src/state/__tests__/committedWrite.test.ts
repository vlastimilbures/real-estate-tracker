// ADR 0125 (#106): once a whole-database action has committed, a failed reload never turns
// it into a failure. It resolves as usual (naming the safety backup) and leaves the screen
// marked stale, so the page never says "rolled back — unchanged" about replaced data.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePortfolioStore } from "../portfolioStore";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { exportToJson } from "../../data/backup";
import { parseProperties } from "../../import/csv";
import type { Sql } from "../../data/sql";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((_command: string, args: { json: string }) =>
    Promise.resolve(args.json),
  ),
}));

/** `real`, but the reload's snapshot read fails: the write commits, the reload after it
 *  fails. Every action's own reads use `select`, so only the reload is hit. */
const reloadFails = (real: Sql): Sql => ({
  ...real,
  selectSnapshot: () => Promise.reject(new Error("database is locked")),
});

let db: TestSql;

beforeEach(async () => {
  usePortfolioStore.setState({
    sql: null,
    portfolio: null,
    assumptions: null,
    sample: { active: false, dismissed: false },
    status: "idle",
    error: null,
    startupError: null,
    stale: false,
  });
  db = openMemorySql();
  await usePortfolioStore.getState().init(async () => {
    await migrate(db);
    await seedIfEmpty(db);
    return db;
  });
});

const store = () => usePortfolioStore.getState();
const propertiesOnDisk = async () =>
  (await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM properties"))[0]!
    .n;

describe("a committed whole-database action whose reload fails (ADR 0125)", () => {
  it("a restore resolves with the safety backup and marks the screen stale", async () => {
    const file = await exportToJson(db);
    await store().clearSample();
    usePortfolioStore.setState({ sql: reloadFails(db) });

    const { safetyBackup } = await store().restoreBackup(file);

    expect(safetyBackup).toMatch(/^portfolio-before-restore-.*\.json$/);
    expect(store().stale).toBe(true);
    expect(store().error).toBeNull();
    // The file replaced the data; the screen still shows what was there before.
    expect(await propertiesOnDisk()).toBe(3);
    expect(store().portfolio!.properties).toHaveLength(0);

    usePortfolioStore.setState({ sql: db });
    await store().reload();
    expect(store().stale).toBe(false);
    expect(store().portfolio!.properties).toHaveLength(3);
  });

  it("clearing the sample resolves with the safety backup and marks the screen stale", async () => {
    usePortfolioStore.setState({ sql: reloadFails(db) });

    const { safetyBackup } = await store().clearSample();

    expect(safetyBackup).toMatch(/^portfolio-before-clear-sample-.*\.json$/);
    expect(store().stale).toBe(true);
    expect(await propertiesOnDisk()).toBe(0);
  });

  it.each([
    {
      action: "loading the sample",
      run: async () => {
        await store().clearSample();
        usePortfolioStore.setState({ sql: reloadFails(db) });
        await store().loadSample();
        expect(await propertiesOnDisk()).toBe(3);
      },
    },
    {
      action: "a CSV import",
      run: async () => {
        usePortfolioStore.setState({ sql: reloadFails(db) });
        const report = await store().importCsv({
          properties: parseProperties(
            "name,purchase_date,purchase_price\nStore Import,2020-01-01,1000000",
          ).rows,
        });
        expect(report.upserted.properties).toBe(1);
        expect(await propertiesOnDisk()).toBe(4);
      },
    },
  ])("$action resolves and marks the screen stale", async ({ run }) => {
    await run();
    expect(store().stale).toBe(true);
  });
});

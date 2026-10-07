// ADR 0125 (#106): once a whole-database action has committed, a failed reload never turns
// it into a failure. It resolves as usual (naming the safety backup) and leaves the screen
// marked stale, so the page never says "rolled back — unchanged" about replaced data.
// ADR 0132 (#138, #199): whole-database reads and the banner Reload follow the write queue.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePortfolioStore } from "../portfolioStore";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { invoke } from "@tauri-apps/api/core";
import { exportToJson, type BackupFile } from "../../data/backup";
import { parseProperties } from "../../import/csv";
import type { Sql } from "../../data/sql";
import { CHANGED_SINCE_BACKUP } from "../../data/repositories";
import { money, type IsoDate } from "../../engine";
import { logFailure } from "../../data/errorLog";

vi.mock("../../data/errorLog", () => ({ logFailure: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((_command: string, args: { json: string }) =>
    Promise.resolve(args.json),
  ),
}));

/** `real`, but the reload's snapshot read fails: the write commits, the reload after it
 *  fails. A snapshot that reads `schema_migrations` stands for `exportToJson` (the safety
 *  backup) and passes; every action's other reads use `select`, so only the reload is
 *  hit. */
const reloadFails = (real: Sql): Sql => ({
  ...real,
  selectSnapshot: (statements) =>
    statements.some((s) => s.query.includes("schema_migrations"))
      ? real.selectSnapshot(statements)
      : Promise.reject(new Error("database is locked")),
});

/** A promise that settles once `release()` is called. */
function gate() {
  let release!: () => void;
  const opened = new Promise<void>((r) => (release = r));
  return { opened, release };
}

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
/** A valuation `id` on the first property. */
const valuation = (id: string) => ({
  id,
  propertyId: store().portfolio!.properties[0]!.id,
  validFrom: new Date(Date.UTC(2033, 0, 1)) as IsoDate,
  marketValue: money("1"),
});
const onScreen = (id: string) =>
  store().portfolio!.valuations.some((v) => v.id === id);
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
    expect(store().error).toBeNull();
  });
});

describe("saved assumptions whose reload fails (ADR 0125)", () => {
  it("are what the store shows, so the form cannot write the old ones back", async () => {
    const next = { ...store().assumptions!, horizonYears: 25 };
    usePortfolioStore.setState({ sql: reloadFails(db) });

    expect(await store().saveAssumptions(next)).toEqual({ ok: true });

    expect(store().stale).toBe(true);
    expect(store().assumptions).toEqual(next);
  });

  it("log the failed reload as RELOAD, not as a failed write (#122)", async () => {
    vi.mocked(logFailure).mockClear();
    usePortfolioStore.setState({ sql: reloadFails(db) });

    await store().saveAssumptions({
      ...store().assumptions!,
      horizonYears: 25,
    });

    expect(vi.mocked(logFailure).mock.calls.map(([where]) => where)).toEqual([
      "RELOAD",
    ]);
  });
});

describe("a failed write whose reload also fails (ADR 0125)", () => {
  /** Nothing commits, and the reload after the failure fails too. */
  const writeAndReloadFail = (): Sql => ({
    ...reloadFails(db),
    transaction: () => Promise.reject(new Error("disk is full")),
  });

  it("a whole-database action rejects with its own error and marks the screen stale", async () => {
    usePortfolioStore.setState({ sql: writeAndReloadFail() });

    await expect(store().clearSample()).rejects.toThrow("disk is full");

    expect(store().stale).toBe(true);
    expect(await propertiesOnDisk()).toBe(3);
  });

  it("a form write returns its own error and marks the screen stale", async () => {
    const before = store().assumptions!;
    usePortfolioStore.setState({ sql: writeAndReloadFail() });

    const error = { kind: "other", message: "disk is full" };
    expect(
      await store().saveAssumptions({ ...before, horizonYears: 25 }),
    ).toEqual({ ok: false, error });

    expect(store().error).toEqual(error);
    expect(store().stale).toBe(true);
    expect(store().assumptions).toBe(before);
  });
});

describe("a safety backup waits for a write queued before it (ADR 0132)", () => {
  /** `real`, but the first `execute` (the queued valuation) waits for `release`. */
  function heldFirstWrite(real: Sql) {
    const { opened, release } = gate();
    let held = false;
    const sql: Sql = {
      ...real,
      execute: async (q, p) => {
        if (!held) {
          held = true;
          await opened;
        }
        return real.execute(q, p);
      },
    };
    return { sql, release };
  }
  const backupsWritten = () =>
    vi.mocked(invoke).mock.calls.filter(([c]) => c === "write_app_backup");

  it.each([
    { action: "clearing the sample", run: () => store().clearSample() },
    {
      action: "a restore",
      run: (file: BackupFile) => store().restoreBackup(file),
    },
  ])("$action backs up the queued write", async ({ run }) => {
    const file = await exportToJson(db);
    const { sql, release } = heldFirstWrite(db);
    usePortfolioStore.setState({ sql });
    vi.mocked(invoke).mockClear();

    const write = store().addValuation(valuation("queued"));
    const action = run(file);
    await new Promise((r) => setTimeout(r, 0));
    expect(backupsWritten()).toHaveLength(0);

    release();
    expect(await write).toEqual({ ok: true });
    await action;

    const [, args] = backupsWritten().at(-1)!;
    const saved = JSON.parse((args as { json: string }).json) as BackupFile;
    expect(saved.tables.valuations!.map((v) => v.id)).toContain("queued");
  });
});

describe("the banner Reload waits for pending writes (ADR 0132)", () => {
  it("a Reload read before a write cannot put the old data back after it", async () => {
    // The Reload's snapshot is read at once (old data) but answers only on `release`.
    const { opened, release } = gate();
    let held = false;
    const sql: Sql = {
      ...db,
      selectSnapshot: async (statements) => {
        const rows = await db.selectSnapshot(statements);
        if (!held) {
          held = true;
          await opened;
        }
        return rows;
      },
    };
    usePortfolioStore.setState({ sql, stale: true });

    const reload = store().reload();
    const write = store().addValuation(valuation("saved"));
    await new Promise((r) => setTimeout(r, 0));
    release();
    // Never await the write before `release`: it is queued behind the Reload.
    const [, result] = await Promise.all([reload, write]);

    expect(result).toEqual({ ok: true });
    expect(onScreen("saved")).toBe(true);
    expect(store().stale).toBe(false);
  });

  it("a Reload clicked during a write reads only after it", async () => {
    const log: string[] = [];
    const { opened, release } = gate();
    const sql: Sql = {
      ...db,
      execute: async (q, p) => {
        log.push(p?.[0] === CHANGED_SINCE_BACKUP ? "changed" : "valuation");
        await opened;
        return db.execute(q, p);
      },
      selectSnapshot: (statements) => {
        log.push("snapshot");
        return db.selectSnapshot(statements);
      },
    };
    usePortfolioStore.setState({ sql, stale: true });

    const write = store().addValuation(valuation("saved"));
    const reload = store().reload();
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toEqual(["valuation"]);

    release();
    await Promise.all([write, reload]);
    // The write's own reload, then the banner's.
    expect(log).toEqual(["valuation", "changed", "snapshot", "snapshot"]);
    expect(onScreen("saved")).toBe(true);
  });
});

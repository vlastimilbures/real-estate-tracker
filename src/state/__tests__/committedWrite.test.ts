// ADR 0125 (#106), amended by ADR 0228 (#446): once a write has committed, a failed
// read-back never turns it into a failure. It resolves as usual (naming the safety
// backup), and the app stops on the error screen until Try again reads the data, so the
// page never says "rolled back — unchanged" about replaced data and never edits data older
// than the database. ADR 0132 (#138, #199): whole-database reads follow the write queue.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { invoke } from "@tauri-apps/api/core";
import { exportToJson, type BackupFile } from "../../data/backup";
import { parseProperties } from "../../import/csv";
import type { Sql } from "../../data/sql";
import { money, type IsoDate } from "../../engine";
import { logFailure } from "../../data/errorLog";
import { importNow } from "./support/importNow";
import {
  readBackFailedOf,
  startupErrorOf,
  statusOf,
} from "../../__tests__/support/status";

vi.mocked(invoke).mockResolvedValue(undefined);
// An export's save dialog, saved: only the export test reaches it.
vi.mock("../../platform/saveFile", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  saveFile: vi.fn(async () => ({ kind: "saved", filename: "export.json" })),
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
const propertiesOnDisk = async () =>
  (await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM properties"))[0]!
    .n;

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
    const file = await exportToJson(db, new Date());
    const { sql, release } = heldFirstWrite(db);
    portfolioDb.set(sql);
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

describe("a committed write whose read-back fails stops on the error screen (ADR 0228)", () => {
  const valuationsOnDisk = async (id: string) =>
    (
      await db.select<{ n: number }>(
        "SELECT COUNT(*) AS n FROM valuations WHERE id = ?",
        [id],
      )
    )[0]!.n;
  const logged = () => vi.mocked(logFailure).mock.calls.map(([where]) => where);
  const onTheScreen = () => {
    expect(statusOf(store())).toBe("error");
    expect(readBackFailedOf(store())).toBe(true);
    expect(store().error).toBeNull();
    expect(startupErrorOf(store())).toBeNull();
  };

  beforeEach(() => vi.mocked(logFailure).mockClear());

  it("stays saved, is in the database once and logs RELOAD (#122)", async () => {
    portfolioDb.set(reloadFails(db));

    expect(await store().addValuation(valuation("saved"))).toEqual({
      ok: true,
    });

    onTheScreen();
    expect(await valuationsOnDisk("saved")).toBe(1);
    expect(logged()).toEqual(["RELOAD"]);
  });

  it.each([
    {
      action: "a restore",
      run: async () => {
        const file = await exportToJson(db, new Date());
        await store().clearSample();
        portfolioDb.set(reloadFails(db));
        const { safetyBackup } = await store().restoreBackup(file);
        expect(safetyBackup).toMatch(/^portfolio-before-restore-.*\.json$/);
        expect(await propertiesOnDisk()).toBe(3);
      },
    },
    {
      action: "clearing the sample",
      run: async () => {
        portfolioDb.set(reloadFails(db));
        const { safetyBackup } = await store().clearSample();
        expect(safetyBackup).toMatch(
          /^portfolio-before-clear-sample-.*\.json$/,
        );
        expect(await propertiesOnDisk()).toBe(0);
      },
    },
    {
      action: "loading the sample",
      run: async () => {
        await store().clearSample();
        portfolioDb.set(reloadFails(db));
        await store().loadSample();
        expect(await propertiesOnDisk()).toBe(3);
      },
    },
    {
      action: "a CSV import",
      run: async () => {
        portfolioDb.set(reloadFails(db));
        const report = await importNow({
          properties: parseProperties(
            "name,purchase_date,purchase_price\nStore Import,2020-01-01,1000000",
          ).rows,
        });
        expect(report.items.map((i) => i.kind)).toEqual(["add"]);
        expect(await propertiesOnDisk()).toBe(4);
      },
    },
  ])("$action resolves and stops on the screen", async ({ run }) => {
    await run();
    onTheScreen();
  });

  it("Try again only reads: no open, no write, and the row shows once", async () => {
    portfolioDb.set(reloadFails(db));
    await store().addValuation(valuation("saved"));
    const writes = { execute: 0, transaction: 0 };
    portfolioDb.set({
      ...db,
      execute: (q, p) => {
        writes.execute += 1;
        return db.execute(q, p);
      },
      transaction: (statements, options) => {
        writes.transaction += 1;
        return db.transaction(statements, options);
      },
    });
    const open = vi.fn(async () => db);

    await store().init(open);

    expect(open).not.toHaveBeenCalled();
    expect(statusOf(store())).toBe("ready");
    expect(readBackFailedOf(store())).toBe(false);
    expect(
      store().portfolio!.valuations.filter((v) => v.id === "saved"),
    ).toHaveLength(1);
    expect(writes).toEqual({ execute: 0, transaction: 0 });
  });

  it("a Try again that fails again stays on the screen", async () => {
    portfolioDb.set(reloadFails(db));
    await store().addValuation(valuation("saved"));
    vi.mocked(logFailure).mockClear();
    const open = vi.fn(async () => db);

    await store().init(open);

    expect(open).not.toHaveBeenCalled();
    onTheScreen();
    expect(logged()).toEqual(["RELOAD"]);
  });

  it("refuses a write queued behind the failed one", async () => {
    portfolioDb.set(reloadFails(db));

    const first = store().addValuation(valuation("first"));
    const queued = store().addValuation(valuation("queued"));

    expect(await first).toEqual({ ok: true });
    expect((await queued).ok).toBe(false);
    expect(await valuationsOnDisk("queued")).toBe(0);
    expect(readBackFailedOf(store())).toBe(true);
  });

  it("a failed write whose read-back also fails stays in the app with the write error", async () => {
    portfolioDb.set({
      ...reloadFails(db),
      transaction: () => Promise.reject(new Error("disk is full")),
    });

    const error = { kind: "other", message: "disk is full" };
    expect(
      await store().saveAssumptions({
        ...store().assumptions!,
        horizonYears: 25,
      }),
    ).toEqual({ ok: false, error });

    expect(statusOf(store())).toBe("ready");
    expect(readBackFailedOf(store())).toBe(false);
    expect(store().error).toEqual(error);
    expect(logged()).toEqual(["WRITE", "RELOAD"]);
  });

  /** `real`, but the read-back fails, and from then on every write is counted. */
  function countedAfterReadBack(real: Sql) {
    const writes = { execute: 0, transaction: 0 };
    let failed = false;
    const sql: Sql = {
      ...real,
      execute: (q, p) => {
        if (failed) writes.execute += 1;
        return real.execute(q, p);
      },
      transaction: (statements, options) => {
        if (failed) writes.transaction += 1;
        return real.transaction(statements, options);
      },
      selectSnapshot: (statements) => {
        if (statements.some((s) => s.query.includes("schema_migrations")))
          return real.selectSnapshot(statements);
        failed = true;
        return Promise.reject(new Error("database is locked"));
      },
    };
    return { sql, writes };
  }
  const refused = (p: Promise<unknown>) =>
    expect(p).rejects.toThrow("Database not initialised");

  it.each([
    {
      action: "a CSV import",
      prepare: async () => () =>
        refused(
          importNow({
            properties: parseProperties(
              "name,purchase_date,purchase_price\nQueued Import,2020-01-01,1000000",
            ).rows,
          }),
        ),
    },
    {
      action: "a restore",
      prepare: async () => {
        const file = await exportToJson(db, new Date());
        await store().clearSample();
        return () => refused(store().restoreBackup(file));
      },
    },
    {
      action: "loading the sample",
      prepare: async () => {
        await store().clearSample();
        return () => refused(store().loadSample());
      },
    },
    {
      // The export itself reads only; recording it is the queued write.
      action: "recording an export",
      prepare: async () => async () => {
        expect((await store().exportBackup()).kind).toBe("saved");
        expect(logged()).toContain("BACKUP");
      },
    },
  ])("refuses $action queued behind the failed one", async ({ prepare }) => {
    const run = await prepare();
    const before = await propertiesOnDisk();
    const { sql, writes } = countedAfterReadBack(db);
    portfolioDb.set(sql);

    // An assumptions save: a write that needs no property (the sample may be cleared).
    const first = store().saveAssumptions({
      ...store().assumptions!,
      horizonYears: 25,
    });
    const queued = run();

    expect(await first).toEqual({ ok: true });
    await queued;
    expect(await propertiesOnDisk()).toBe(before);
    expect(writes).toEqual({ execute: 0, transaction: 0 });
    expect(readBackFailedOf(store())).toBe(true);
  });

  it("Try again reads only after the job running before it", async () => {
    // Every job queued behind a failed read-back is refused at once, so none can hold the
    // queue today; Try again still reads behind the queue, never alongside a job.
    const log: string[] = [];
    const { opened, release } = gate();
    let held = false;
    portfolioDb.set({
      ...db,
      execute: async (q, p) => {
        if (!held) {
          held = true;
          log.push("held write");
          await opened;
        }
        return db.execute(q, p);
      },
      selectSnapshot: (statements) => {
        log.push("snapshot");
        return db.selectSnapshot(statements);
      },
    });
    const write = store().addValuation(valuation("held"));
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toEqual(["held write"]);
    usePortfolioStore.setState({
      status: { kind: "readBackFailed", refused: [] },
    });

    const tryAgain = store().init(vi.fn(async () => db));
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toEqual(["held write"]);
    expect(readBackFailedOf(store())).toBe(true);

    release();
    await Promise.all([write, tryAgain]);
    // The write's own read-back, then Try again's.
    expect(log).toEqual(["held write", "snapshot", "snapshot"]);
    expect(readBackFailedOf(store())).toBe(false);
    expect(statusOf(store())).toBe("ready");
  });
});

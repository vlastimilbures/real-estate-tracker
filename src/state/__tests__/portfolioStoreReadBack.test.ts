// The portfolio store after a write has committed: the safety backup waits for the write
// queue, a failed read-back stops on the error screen, and the writes refused behind it
// are kept for the screen, each under its own target.
//
// ADR 0125 (#106), amended by ADR 0228 (#446): once a write has committed, a failed
// read-back never turns it into a failure. It resolves as usual (naming the safety
// backup), and the app stops on the error screen until Try again reads the data, so the
// page never says "rolled back — unchanged" about replaced data and never edits data older
// than the database. ADR 0132 (#138, #199): whole-database reads follow the write queue.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import type { WriteTarget } from "../writeTargets";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { exportToJson, type BackupFile } from "../../data/backup";
import { logFailure } from "../../data/errorLog";
import type { Sql } from "../../data/sql";
import { parseProperties } from "../../import/csv";
import { money, type IsoDate } from "../../engine";
import { saveFile } from "../../platform/saveFile";
import { importNow } from "./support/importNow";
import { launchOn, reloadFails } from "./support/openSeeded";
import {
  readBackFailedOf,
  refusedWritesOf,
  startupErrorOf,
  statusOf,
} from "../../__tests__/support/status";
import { unwrap } from "../../__tests__/support/result";

// An export's save dialog, saved: only the export tests reach it.
vi.mock("../../platform/saveFile", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  saveFile: vi.fn(async () => ({ kind: "saved", filename: "export.json" })),
}));

/** A promise that settles once `release()` is called. */
function gate() {
  let release!: () => void;
  const opened = new Promise<void>((r) => (release = r));
  return { opened, release };
}

let db: TestSql;

// The setup file (src/__tests__/setup/stores.ts) resets both stores before every test;
// the spies start each test with no calls, and every describe here starts the store on a
// fresh seeded database.
beforeEach(async () => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue(undefined);
  vi.mocked(logFailure).mockClear();
  vi.mocked(saveFile).mockClear();
  db = openMemorySql();
  await usePortfolioStore.getState().init(launchOn(db));
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

// ADR 0132.
describe("a safety backup waits for a write queued before it", () => {
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

// ADR 0228.
describe("a committed write whose read-back fails stops on the error screen", () => {
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
        unwrap(await store().clearSample());
        portfolioDb.set(reloadFails(db));
        const { safetyBackup } = unwrap(await store().restoreBackup(file));
        expect(safetyBackup).toMatch(/^portfolio-before-restore-.*\.json$/);
        expect(await propertiesOnDisk()).toBe(3);
      },
    },
    {
      action: "clearing the sample",
      run: async () => {
        portfolioDb.set(reloadFails(db));
        const { safetyBackup } = unwrap(await store().clearSample());
        expect(safetyBackup).toMatch(
          /^portfolio-before-clear-sample-.*\.json$/,
        );
        expect(await propertiesOnDisk()).toBe(0);
      },
    },
    {
      action: "loading the sample",
      run: async () => {
        unwrap(await store().clearSample());
        portfolioDb.set(reloadFails(db));
        unwrap(await store().loadSample());
        expect(await propertiesOnDisk()).toBe(3);
      },
    },
    {
      action: "a CSV import",
      run: async () => {
        portfolioDb.set(reloadFails(db));
        const report = unwrap(
          await importNow({
            properties: parseProperties(
              "name,purchase_date,purchase_price\nStore Import,2020-01-01,1000000",
            ).rows,
          }),
        );
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
      transaction: (statements) => {
        writes.transaction += 1;
        return db.transaction(statements);
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
    // ADR 0261: the write error is returned to the caller, not put in the banner.
    expect(store().error).toBeNull();
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
      transaction: (statements) => {
        if (failed) writes.transaction += 1;
        return real.transaction(statements);
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
    expect(p).resolves.toMatchObject({
      ok: false,
      error: { kind: "other", message: "Database not initialised" },
    });

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
        unwrap(await store().clearSample());
        return () => refused(store().restoreBackup(file));
      },
    },
    {
      action: "loading the sample",
      prepare: async () => {
        unwrap(await store().clearSample());
        return () => refused(store().loadSample());
      },
    },
    {
      // The export itself reads only; recording it is the queued write.
      action: "recording an export",
      prepare: async () => async () => {
        expect(unwrap(await store().exportBackup()).kind).toBe("saved");
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

// ADR 0255 (#446): a write queued behind a committed write whose read-back failed is
// refused (ADR 0228), and the store keeps what it would have changed, so the error screen
// can name it: once each, in the order refused, bookkeeping left out. A successful Try
// again empties the list.
describe("refused writes are kept for the screen", () => {
  /** The first property's lease, saved unchanged. */
  const lease = () => store().portfolio!.leases[0]!;

  /** Save a valuation whose read-back fails, with `queued` called right behind it. */
  async function behindAFailedReadBack(queued: () => Promise<unknown>[]) {
    portfolioDb.set(reloadFails(db));
    const first = store().addValuation(valuation("first"));
    const behind = queued();
    expect(await first).toEqual({ ok: true });
    const settled = await Promise.allSettled(behind);
    expect(readBackFailedOf(store())).toBe(true);
    return settled;
  }

  it("starts empty", () => {
    expect(refusedWritesOf(store())).toEqual([]);
  });

  it("keeps a lease saved right behind the valuation", async () => {
    await behindAFailedReadBack(() => [store().saveLease(lease())]);
    expect(refusedWritesOf(store())).toEqual(["leases"]);
  });

  it("keeps each table once, in the order refused", async () => {
    const assumptions = store().assumptions!;
    await behindAFailedReadBack(() => [
      store().saveLease(lease()),
      store().addValuation(valuation("second")),
      store().removeLease(lease().id),
      store().saveAssumptions(assumptions),
      store().removeScenario("none"),
      store().setPropertyActive(store().portfolio!.properties[0]!.id, false),
    ]);
    expect(refusedWritesOf(store())).toEqual([
      "leases",
      "valuations",
      "assumptions",
      "scenarios",
      "properties",
    ]);
  });

  it("names the table of every record write", async () => {
    const p = store().portfolio!;
    await behindAFailedReadBack(() => [
      store().saveMortgageBlock(p.mortgages[0]!),
      store().saveHoldingCost(p.holdingCosts[0]!),
    ]);
    expect(refusedWritesOf(store())).toEqual([
      "mortgage_blocks",
      "holding_costs",
    ]);
  });

  it("names the whole-database actions, which still throw", async () => {
    const file = await exportToJson(db, new Date());
    const settled = await behindAFailedReadBack(() => [
      store().importCsv({
        properties: parseProperties(
          "name,purchase_date,purchase_price\nRefused,2020-01-01,1000000",
        ).rows,
      }),
      store().restoreBackup(file),
      store().clearSample(),
      store().loadSample(),
    ]);
    expect(settled).toMatchObject([
      { value: { ok: false } },
      { value: { ok: false } },
      { value: { ok: false } },
      { value: { ok: false } },
    ]);
    expect(refusedWritesOf(store())).toEqual([
      "importCsv",
      "restore",
      "clearSample",
      "loadSample",
    ]);
  });

  it("leaves out bookkeeping: dismissing the sample banner", async () => {
    const [dismissed] = await behindAFailedReadBack(() => [
      store().dismissSampleBanner(),
    ]);
    expect(dismissed).toMatchObject({ value: { ok: false } });
    expect(refusedWritesOf(store())).toEqual([]);
  });

  it("a successful Try again empties the list", async () => {
    await behindAFailedReadBack(() => [store().saveLease(lease())]);
    portfolioDb.set(db);
    await store().init();
    expect(statusOf(store())).toBe("ready");
    expect(refusedWritesOf(store())).toEqual([]);
  });

  it("a Try again that fails again keeps the list", async () => {
    await behindAFailedReadBack(() => [store().saveLease(lease())]);
    await store().init();
    expect(statusOf(store())).toBe("error");
    expect(refusedWritesOf(store())).toEqual(["leases"]);
  });

  it("a write refused because no database is open is not kept", async () => {
    portfolioDb.set(null);
    expect((await store().saveLease(lease())).ok).toBe(false);
    expect(refusedWritesOf(store())).toEqual([]);
  });
});

// ADR 0255 (#446): every public write method names what it changes. Refused while a
// read-back has failed, each keeps its own target for the error screen; the bookkeeping
// writes (dismissing the sample banner, recording an export) keep none, and a restore
// from the startup screen refuses before it queues anything.
describe("each write method's target", () => {
  let file: BackupFile;

  beforeEach(async () => {
    file = await exportToJson(db, new Date());
  });

  const readBackFails = () =>
    usePortfolioStore.setState({
      status: { kind: "readBackFailed", refused: [] },
    });
  /** Any record: a refused write never reads its arguments. */
  const any = {} as never;

  /** Record an export whose save dialog closes after the read-back failed, so only the
   *  recording write is refused. */
  async function recordBackup() {
    let close!: () => void;
    const dialog = new Promise<void>((r) => (close = r));
    vi.mocked(saveFile).mockImplementationOnce(async () => {
      await dialog;
      return { kind: "saved", filename: "export.json" };
    });
    const exported = store().exportBackup();
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalled());
    readBackFails();
    close();
    return exported;
  }

  /** Call the method once a read-back has failed. */
  const refused = (call: () => Promise<unknown>) => (): Promise<unknown> => {
    readBackFails();
    return call();
  };

  it.each<{ method: string; kept: WriteTarget[]; run: () => Promise<unknown> }>(
    [
      {
        method: "addValuation",
        kept: ["valuations"],
        run: refused(() => store().addValuation(any)),
      },
      {
        method: "saveValuation",
        kept: ["valuations"],
        run: refused(() => store().saveValuation(any)),
      },
      {
        method: "removeValuation",
        kept: ["valuations"],
        run: refused(() => store().removeValuation("v")),
      },
      {
        method: "addLease",
        kept: ["leases"],
        run: refused(() => store().addLease(any)),
      },
      {
        method: "saveLease",
        kept: ["leases"],
        run: refused(() => store().saveLease(any)),
      },
      {
        method: "removeLease",
        kept: ["leases"],
        run: refused(() => store().removeLease("l")),
      },
      {
        method: "addMortgageBlock",
        kept: ["mortgage_blocks"],
        run: refused(() => store().addMortgageBlock(any)),
      },
      {
        method: "saveMortgageBlock",
        kept: ["mortgage_blocks"],
        run: refused(() => store().saveMortgageBlock(any)),
      },
      {
        method: "removeMortgageBlock",
        kept: ["mortgage_blocks"],
        run: refused(() => store().removeMortgageBlock("m")),
      },
      {
        method: "saveHoldingCost",
        kept: ["holding_costs"],
        run: refused(() => store().saveHoldingCost(any)),
      },
      {
        method: "addProperty",
        kept: ["properties"],
        run: refused(() => store().addProperty(any, any, any)),
      },
      {
        method: "editProperty",
        kept: ["properties"],
        run: refused(() => store().editProperty(any, any)),
      },
      {
        method: "setPropertyActive",
        kept: ["properties"],
        run: refused(() => store().setPropertyActive("p", false)),
      },
      {
        method: "removeProperty",
        kept: ["properties"],
        run: refused(() => store().removeProperty("p")),
      },
      {
        method: "saveAssumptions",
        kept: ["assumptions"],
        run: refused(() => store().saveAssumptions(any)),
      },
      {
        method: "addScenario",
        kept: ["scenarios"],
        run: refused(() => store().addScenario(any)),
      },
      {
        method: "saveScenario",
        kept: ["scenarios"],
        run: refused(() => store().saveScenario(any)),
      },
      {
        method: "duplicateScenario",
        kept: ["scenarios"],
        run: refused(() => store().duplicateScenario("s", "copy", "Copy")),
      },
      {
        method: "removeScenario",
        kept: ["scenarios"],
        run: refused(() => store().removeScenario("s")),
      },
      {
        method: "importCsv",
        kept: ["importCsv"],
        run: refused(() => store().importCsv({})),
      },
      {
        method: "restoreBackup",
        kept: ["restore"],
        run: refused(() => store().restoreBackup(file)),
      },
      {
        method: "clearSample",
        kept: ["clearSample"],
        run: refused(() => store().clearSample()),
      },
      {
        method: "loadSample",
        kept: ["loadSample"],
        run: refused(() => store().loadSample()),
      },
      // Bookkeeping, and a restore that refuses before it is queued: nothing kept.
      {
        method: "dismissSampleBanner",
        kept: [],
        run: refused(() => store().dismissSampleBanner()),
      },
      { method: "recordBackup (exportBackup)", kept: [], run: recordBackup },
      {
        method: "restoreAtStartup",
        kept: [],
        run: refused(() => store().restoreAtStartup(file)),
      },
    ],
  )("$method keeps $kept", async ({ run, kept }) => {
    await Promise.allSettled([run()]);
    expect(readBackFailedOf(store())).toBe(true);
    expect(refusedWritesOf(store())).toEqual(kept);
  });
});

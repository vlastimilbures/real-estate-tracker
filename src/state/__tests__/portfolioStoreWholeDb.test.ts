// The portfolio store's whole-database actions: CSV import, restore, the sample (clear,
// load, banner) and backup export, with what they log and what they leave behind.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import { useUiStore } from "../uiStore";
import { toActionError } from "../actionError";
import type { CsvImportReport } from "../csv";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { CHANGED_SINCE_BACKUP } from "../../data/appMeta";
import { exportToJson } from "../../data/backup";
import { logFailure } from "../../data/errorLog";
import type { Sql } from "../../data/sql";
import { parseProperties, parseRents } from "../../import/csv";
import { money, type IsoDate } from "../../engine";
import { SaveFileError, type SaveOutcome } from "../../platform/saveFile";
import { importNow } from "./support/importNow";
import { launchOn, openSeeded } from "./support/openSeeded";
import { unwrap } from "../../__tests__/support/result";

/** What the export's save dialog does next; the backup describe sets it per test. */
const save = vi.hoisted(() => ({
  next: (): Promise<unknown> => Promise.resolve({ kind: "cancelled" }),
}));
vi.mock("../../platform/saveFile", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  saveFile: vi.fn(() => save.next()),
}));

const store = () => usePortfolioStore.getState();
const ui = () => useUiStore.getState();

// The setup file (src/__tests__/setup/stores.ts) resets both stores before every test;
// the Tauri spy goes back to the real pass-through, the log spy starts with no calls and
// the save dialog cancels, and each describe sets what it needs.
beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(logFailure).mockClear();
  save.next = () => Promise.resolve({ kind: "cancelled" });
});

// DR-047.
describe("whole-database actions", () => {
  it("importCsv writes, reloads, and leaves the banner alone", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const before = usePortfolioStore.getState().portfolio!.properties.length;
    const report = unwrap(
      await importNow({
        properties: parseProperties(
          "name,purchase_date,purchase_price\nStore Import,2020-01-01,1000000",
        ).rows,
      }),
    );
    expect(report.items.map((i) => i.kind)).toEqual(["add"]);
    expect(usePortfolioStore.getState().portfolio!.properties.length).toBe(
      before + 1,
    );
    expect(usePortfolioStore.getState().error).toBeNull();
  });

  it("importCsv rethrows a refused file unchanged and writes nothing", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const before = usePortfolioStore.getState().portfolio!;
    await expect(
      importNow({
        rents: parseRents(
          "property_name,start_date,end_date,monthly_rent\nNope,2025-01-01,,1000",
        ).rows,
      }),
    ).resolves.toMatchObject({ ok: false, error: { kind: "planRefused" } });
    expect(usePortfolioStore.getState().portfolio!.leases.length).toBe(
      before.leases.length,
    );
    expect(usePortfolioStore.getState().error).toBeNull();
  });

  it("importCsv waits for a pending mutation (one queue, DR-085)", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const real = portfolioDb.get()!;
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: Sql = {
      ...real,
      select: real.select.bind(real),
      backup: real.backup.bind(real),
      execute: async (q, p) => {
        log.push(p?.[0] === CHANGED_SINCE_BACKUP ? "changed" : "valuation");
        await gate;
        return real.execute(q, p);
      },
      transaction: async (stmts) => {
        log.push("import");
        return real.transaction(stmts);
      },
    };
    // Previewed before the gate, so only importCsv itself can wait in the queue.
    const batch = {
      properties: parseProperties(
        "name,purchase_date,purchase_price\nQueued Import,2020-01-01,1",
      ).rows,
    };
    unwrap(await usePortfolioStore.getState().previewCsv(batch));
    portfolioDb.set(slow);
    const pid = usePortfolioStore.getState().portfolio!.properties[0].id;
    // Dated, so the add is one insert and changes no other row (ADR 0144).
    const a = usePortfolioStore.getState().addValuation({
      id: "queued",
      propertyId: pid,
      validFrom: new Date(Date.UTC(2033, 0, 1)) as IsoDate,
      validTo: new Date(Date.UTC(2033, 11, 31)) as IsoDate,
      marketValue: money("1"),
    });
    const b = usePortfolioStore.getState().importCsv(batch);
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toEqual(["valuation"]);
    release();
    await a;
    await b;
    // Each write is followed by its "changed since backup" mark (ADR 0110).
    expect(log).toEqual(["valuation", "changed", "import", "changed"]);
  });

  it("a failed whole-database action does not block later mutations", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    await expect(
      importNow({
        rents: parseRents(
          "property_name,start_date,end_date,monthly_rent\nNope,2025-01-01,,1000",
        ).rows,
      }),
    ).resolves.toMatchObject({ ok: false, error: { kind: "planRefused" } });
    const pid = usePortfolioStore.getState().portfolio!.properties[0].id;
    const r = await usePortfolioStore.getState().addValuation({
      id: "after-fail",
      propertyId: pid,
      validFrom: new Date(Date.UTC(2034, 0, 1)) as IsoDate,
      marketValue: money("1"),
    });
    expect(r.ok).toBe(true);
  });
});

// ADR 0147 (#467 review L4): the whole-database actions log a failure once, at the
// store, under their site, and never log a refusal the user can fix: a refused restore
// or a refused import plan.
const logged = () => vi.mocked(logFailure).mock.calls.map(([site]) => site);
const fail = () => Promise.reject(new Error("disk I/O error"));

/** Start the store on a seeded database, with no failure logged yet. */
async function startLogged(): Promise<Sql> {
  vi.mocked(invoke).mockResolvedValue(undefined);
  const sql = await openSeeded();
  await store().init(async () => sql);
  vi.mocked(logFailure).mockClear();
  return sql;
}

describe("whole-database failures are logged once", () => {
  const newProperty = {
    properties: parseProperties(
      "name,purchase_date,purchase_price\nLogged Import,2020-01-01,1000000",
    ).rows,
  };
  let sql: Sql;

  beforeEach(async () => {
    sql = await startLogged();
  });

  it("a failed preview logs IMPORT once", async () => {
    portfolioDb.set({ ...sql, select: fail, selectSnapshot: fail });
    expect((await store().previewCsv(newProperty)).ok).toBe(false);
    expect(logged()).toEqual(["IMPORT"]);
  });

  it("a failed import logs IMPORT once", async () => {
    portfolioDb.set({
      ...sql,
      select: sql.select.bind(sql),
      selectSnapshot: sql.selectSnapshot.bind(sql),
      execute: fail,
      transaction: fail,
    });
    expect((await store().importCsv(newProperty)).ok).toBe(false);
    expect(logged()).toEqual(["IMPORT"]);
  });

  it("a failed backup export logs BACKUP once", async () => {
    portfolioDb.set({ ...sql, select: fail, selectSnapshot: fail });
    expect((await store().exportBackup()).ok).toBe(false);
    expect(logged()).toEqual(["BACKUP"]);
  });
});

describe("a refusal is not logged", () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await startLogged();
  });

  it("a refused restore", async () => {
    const file = await exportToJson(sql, new Date());
    const leases = file.tables.leases!;
    leases[0] = { ...leases[0], monthly_rent: "abc" };
    await expect(store().restoreBackup(file)).resolves.toMatchObject({
      ok: false,
      error: { kind: "restoreRefused" },
    });
    expect(logged()).toEqual([]);
  });

  it("a refused import plan", async () => {
    const refused = {
      rents: parseRents(
        "property_name,start_date,end_date,monthly_rent\nNope,2025-01-01,,1000",
      ).rows,
    };
    await expect(store().importCsv(refused)).resolves.toMatchObject({
      ok: false,
      error: { kind: "planRefused" },
    });
    expect(logged()).toEqual([]);
  });
});

// ADR 0154: replacing the data drops what described the old data — the UI's notice, its
// failure and the last import report. The store's replacing actions do it themselves
// when they succeed (#468), and name their own safety copy in the same update; a failed
// one leaves them, since the data is as it was.
describe("a replacing action drops the old data's feedback", () => {
  /** Start the store on a migrated database, seeded with the sample or empty. */
  async function start(seeded: boolean): Promise<Sql> {
    const db = openMemorySql();
    await migrate(db);
    if (seeded) await seedIfEmpty(db);
    portfolioDb.set(null);
    usePortfolioStore.setState({ status: { kind: "idle" }, error: null });
    await store().init(async () => db);
    return db;
  }

  /** What the old data left: a notice, a failure and an import report. */
  function leftovers() {
    useUiStore.setState({
      notice: { kind: "restored", file: "old-safety.json" },
      failure: { action: "import", error: toActionError(new Error("x")) },
      lastImport: { items: [] } as unknown as CsvImportReport,
    });
  }

  const dropped = () => ({
    notice: ui().notice,
    failure: ui().failure,
    lastImport: ui().lastImport,
  });
  const NONE = { notice: null, failure: null, lastImport: null };

  beforeEach(() => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    useUiStore.setState({ notice: null, failure: null, lastImport: null });
  });

  it("restore", async () => {
    const db = await start(true);
    const file = await exportToJson(db, new Date());
    leftovers();
    const r = await store().restoreBackup(file);
    if (!r.ok) throw new Error("restore failed");
    expect(dropped()).toEqual({
      ...NONE,
      notice: { kind: "restored", file: r.value.safetyBackup },
    });
  });

  it("Clear sample", async () => {
    await start(true);
    leftovers();
    const r = await store().clearSample();
    if (!r.ok) throw new Error("clear failed");
    expect(dropped()).toEqual({
      ...NONE,
      notice: { kind: "sampleCleared", file: r.value.safetyBackup },
    });
  });

  it("Load sample", async () => {
    await start(false);
    leftovers();
    expect((await store().loadSample()).ok).toBe(true);
    expect(dropped()).toEqual(NONE);
  });

  it("a failed restore leaves them", async () => {
    await start(true);
    leftovers();
    expect((await store().restoreBackup({} as never)).ok).toBe(false);
    expect(ui().notice).toEqual({ kind: "restored", file: "old-safety.json" });
    expect(ui().failure).not.toBeNull();
    expect(ui().lastImport).not.toBeNull();
  });
});

// ADR 0094: the store exposes the sample state, remembers "Keep exploring" across a
// relaunch, and clears the sample as a whole-database action that reloads afterwards.
// ADR 0112: loading it again on demand is a data write that reloads too.
describe("the sample: its banner, clearing it and loading it again", () => {
  const disk = { fail: false };

  function reset(): void {
    portfolioDb.set(null);
    usePortfolioStore.setState({
      portfolio: null,
      assumptions: null,
      sample: { active: false, dismissed: false },
      status: { kind: "idle" },
      error: null,
    });
  }

  beforeEach(() => {
    vi.mocked(invoke).mockImplementation(() =>
      disk.fail
        ? Promise.reject({ code: "IO", detail: "No space left on device" })
        : Promise.resolve(),
    );
    disk.fail = false;
    reset();
  });

  it("a first run loads the sample as active", async () => {
    await usePortfolioStore.getState().init(launchOn(openMemorySql()));
    expect(usePortfolioStore.getState().sample).toEqual({
      active: true,
      dismissed: false,
    });
  });

  it("dismissing the banner survives a relaunch", async () => {
    const launch = launchOn(openMemorySql());
    await usePortfolioStore.getState().init(launch);
    const r = await usePortfolioStore.getState().dismissSampleBanner();
    expect(r.ok).toBe(true);
    expect(usePortfolioStore.getState().sample.dismissed).toBe(true);

    reset();
    await usePortfolioStore.getState().init(launch);
    expect(usePortfolioStore.getState().sample).toEqual({
      active: true,
      dismissed: true,
    });
  });

  it("clearSample removes the sample and reloads", async () => {
    await usePortfolioStore.getState().init(launchOn(openMemorySql()));
    // A banner from an earlier failed edit describes data that is gone (#136).
    usePortfolioStore.setState({ error: { kind: "other", message: "old" } });
    const { safetyBackup } = unwrap(
      await usePortfolioStore.getState().clearSample(),
    );
    expect(safetyBackup).toMatch(
      /^portfolio-before-clear-sample-\d{8}T\d{6}Z\.json$/,
    );
    const s = usePortfolioStore.getState();
    expect(s.portfolio!.properties).toHaveLength(0);
    expect(s.sample).toEqual({ active: false, dismissed: false });
    expect(s.error).toBeNull();
  });

  it("clearSample throws the safety-backup failure and keeps the sample", async () => {
    await usePortfolioStore.getState().init(launchOn(openMemorySql()));
    disk.fail = true;
    await expect(
      usePortfolioStore.getState().clearSample(),
    ).resolves.toMatchObject({ ok: false, error: { kind: "safetyBackup" } });
    expect(usePortfolioStore.getState().portfolio!.properties).toHaveLength(3);
    expect(usePortfolioStore.getState().sample.active).toBe(true);
  });

  it("loadSample loads the sample into an empty portfolio, reloads and marks a change (ADR 0112)", async () => {
    const db = openMemorySql();
    await usePortfolioStore.getState().init(launchOn(db));
    unwrap(await usePortfolioStore.getState().clearSample());
    // Pretend a backup was exported after the clear.
    await db.execute("DELETE FROM app_meta WHERE key = 'changed_since_backup'");

    usePortfolioStore.setState({ error: { kind: "other", message: "old" } });
    unwrap(await usePortfolioStore.getState().loadSample());

    const s = usePortfolioStore.getState();
    expect(s.portfolio!.properties).toHaveLength(3);
    expect(s.sample).toEqual({ active: true, dismissed: false });
    expect(s.backup.changedSince).toBe(true);
    expect(s.error).toBeNull();
  });

  it("loadSample throws the refusal when the portfolio is not empty", async () => {
    await usePortfolioStore.getState().init(launchOn(openMemorySql()));
    await expect(
      usePortfolioStore.getState().loadSample(),
    ).resolves.toMatchObject({ ok: false, error: { kind: "sampleNotEmpty" } });
    expect(usePortfolioStore.getState().portfolio!.properties).toHaveLength(3);
  });
});

// ADR 0110: a successful export records when and to which file; a cancelled or failed
// one records nothing. Every data write marks the data as changed since the backup.
describe("the last backup and the changes since it", () => {
  let db: TestSql;

  beforeEach(async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    db = openMemorySql();
    await usePortfolioStore.getState().init(launchOn(db));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-12T08:30:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  const outcome = (o: SaveOutcome) => {
    save.next = () => Promise.resolve(o);
  };
  const backup = () => usePortfolioStore.getState().backup;
  const edit = async () => {
    const a = usePortfolioStore.getState().assumptions!;
    const r = await usePortfolioStore
      .getState()
      .saveAssumptions({ ...a, horizonYears: 25 });
    expect(r.ok).toBe(true);
  };

  it("an edit marks the data as changed", async () => {
    expect(backup().changedSince).toBe(false);
    await edit();
    expect(backup().changedSince).toBe(true);
  });

  it("dismissing the sample banner is not a data change", async () => {
    await usePortfolioStore.getState().dismissSampleBanner();
    expect(backup().changedSince).toBe(false);
  });

  it("a saved export records the time and file and clears the flag", async () => {
    await edit();
    outcome({ kind: "saved", filename: "portfolio-backup-2026-09-12.json" });
    unwrap(await usePortfolioStore.getState().exportBackup());
    expect(backup()).toEqual({
      lastAt: "2026-09-12T08:30:00.000Z",
      lastFile: "portfolio-backup-2026-09-12.json",
      changedSince: false,
    });
  });

  it("a downloaded export (browser build) counts too", async () => {
    outcome({ kind: "downloaded", filename: "portfolio-backup.json" });
    unwrap(await usePortfolioStore.getState().exportBackup());
    expect(backup().lastFile).toBe("portfolio-backup.json");
  });

  it("a cancelled export records nothing", async () => {
    await edit();
    outcome({ kind: "cancelled" });
    const r = await usePortfolioStore.getState().exportBackup();
    expect(r.ok && r.value.kind).toBe("cancelled");
    expect(backup()).toEqual({
      lastAt: null,
      lastFile: null,
      changedSince: true,
    });
  });

  it("a failed export records nothing", async () => {
    await edit();
    save.next = () => Promise.reject(new SaveFileError("disk full"));
    await expect(
      usePortfolioStore.getState().exportBackup(),
    ).resolves.toMatchObject({ ok: false, error: { kind: "backupExport" } });
    expect(backup()).toEqual({
      lastAt: null,
      lastFile: null,
      changedSince: true,
    });
  });

  it("an edit made while the save dialog is open keeps the data marked as changed", async () => {
    let finish!: (o: SaveOutcome) => void;
    save.next = () => new Promise((r) => (finish = r));
    const exporting = usePortfolioStore.getState().exportBackup();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await edit();
    finish({ kind: "saved", filename: "before-the-edit.json" });
    await exporting;
    // `vi.waitFor` moves the fake clock, so only the day of `lastAt` is fixed here.
    expect(backup()).toEqual({
      lastAt: expect.stringMatching(/^2026-09-12T/),
      lastFile: "before-the-edit.json",
      changedSince: true,
    });
  });

  it("a restore keeps the local last backup and marks the data as changed", async () => {
    const file = await exportToJson(db, new Date());
    outcome({ kind: "saved", filename: "local.json" });
    unwrap(await usePortfolioStore.getState().exportBackup());
    unwrap(await usePortfolioStore.getState().restoreBackup(file));
    expect(backup()).toEqual({
      lastAt: "2026-09-12T08:30:00.000Z",
      lastFile: "local.json",
      changedSince: true,
    });
  });

  it("a restore clears the banner left by an earlier failed edit (#136)", async () => {
    const file = await exportToJson(db, new Date());
    usePortfolioStore.setState({ error: { kind: "other", message: "old" } });
    unwrap(await usePortfolioStore.getState().restoreBackup(file));
    expect(usePortfolioStore.getState().error).toBeNull();
  });

  it("counts a restore in `replacing` until it settles (#136 review)", async () => {
    const file = await exportToJson(db, new Date());
    const running = usePortfolioStore.getState().restoreBackup(file);
    expect(usePortfolioStore.getState().replacing).toBe(1);
    await running;
    expect(usePortfolioStore.getState().replacing).toBe(0);

    await expect(
      usePortfolioStore.getState().restoreBackup({} as never),
    ).resolves.toMatchObject({ ok: false });
    expect(usePortfolioStore.getState().replacing).toBe(0);
  });
});

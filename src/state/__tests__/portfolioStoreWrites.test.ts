// The portfolio store's write path: what a write returns, typed write errors, one queue,
// the count of writes running, and no action that rejects. The store is driven through
// getState() (zustand works outside React), so no DOM is needed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import type { PortfolioState } from "../portfolio/types";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { noExtras } from "../../data/__tests__/support/noExtras";
import { CHANGED_SINCE_BACKUP } from "../../data/appMeta";
import { exportToJson, type BackupFile } from "../../data/backup";
import type { Sql } from "../../data/sql";
import { parseProperties } from "../../import/csv";
import { money, type IsoDate } from "../../engine";
import { launchOn, openSeeded, text } from "./support/openSeeded";
import { statusOf } from "../../__tests__/support/status";
import { unwrap } from "../../__tests__/support/result";

const store = () => usePortfolioStore.getState();

// The setup file (src/__tests__/setup/stores.ts) resets both stores before every test;
// the Tauri spy goes back to the real pass-through, and each describe sets what it needs.
beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

// A failed DB write must surface (return `{ ok: false }` to the caller, which shows it;
// ADR 0261 leaves the banner `error` to the caller) rather than throw into the void, and
// must leave the in-memory state reconciled with what's actually on disk.
describe("a write's result", () => {
  it("returns an error result (not a throw) when the database is not initialised", async () => {
    const result = await usePortfolioStore
      .getState()
      .removeValuation("anything");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(text(result.error)).toMatch(/not initialised/i);
    // ADR 0261: the store puts no failure in the banner; the caller shows it.
    expect(usePortfolioStore.getState().error).toBeNull();
  });

  it("a successful mutation clears error and refreshes state", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    expect(statusOf(usePortfolioStore.getState())).toBe("ready");

    const pid = usePortfolioStore.getState().portfolio!.properties[0].id;
    const before = usePortfolioStore.getState().portfolio!.valuations.length;

    const result = await usePortfolioStore.getState().addValuation({
      id: "val-test",
      propertyId: pid,
      validFrom: new Date(Date.UTC(2027, 0, 1)) as IsoDate,
      marketValue: money("13000000"),
    });

    expect(result.ok).toBe(true);
    expect(usePortfolioStore.getState().error).toBeNull();
    expect(usePortfolioStore.getState().portfolio!.valuations.length).toBe(
      before + 1,
    );
  });

  it("surfaces a failed write and reconciles state instead of throwing", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const real = portfolioDb.get()!;

    // A fake Sql whose writes reject but whose reads still work, so refresh() can
    // reconcile in-memory state back to what's actually persisted.
    const failing: Sql = {
      execute: () => Promise.reject(new Error("disk is full")),
      select: real.select.bind(real),
      selectSnapshot: real.selectSnapshot.bind(real),
      transaction: () => Promise.reject(new Error("disk is full")),
      backup: real.backup.bind(real),
    };
    portfolioDb.set(failing);

    const pid = usePortfolioStore.getState().portfolio!.properties[0].id;
    const before = usePortfolioStore.getState().portfolio!.valuations.length;

    const result = await usePortfolioStore.getState().addValuation({
      id: "val-fail",
      propertyId: pid,
      validFrom: new Date(Date.UTC(2028, 0, 1)) as IsoDate,
      marketValue: money("1"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(text(result.error)).toMatch(/disk is full/i);
    // ADR 0261: the store puts no failure in the banner; the caller shows it.
    expect(usePortfolioStore.getState().error).toBeNull();
    // status stays "ready" (mutation failures are not full-screen init errors) and the
    // optimistic row never sticks because refresh() reconciles to disk.
    expect(statusOf(usePortfolioStore.getState())).toBe("ready");
    expect(usePortfolioStore.getState().portfolio!.valuations.length).toBe(
      before,
    );
  });

  it("runs mutations one at a time, in call order (DR-085)", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const real = portfolioDb.get()!;
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    // The first write blocks until released; a second mutation must not start before.
    const slow: Sql = {
      ...real,
      select: real.select.bind(real),
      backup: real.backup.bind(real),
      transaction: real.transaction.bind(real),
      execute: async (q, p) => {
        log.push(`start ${String(p?.[0])}`);
        if (p?.[0] === "first") await gate;
        const r = await real.execute(q, p);
        log.push(`end ${String(p?.[0])}`);
        return r;
      },
    };
    portfolioDb.set(slow);
    const pid = usePortfolioStore.getState().portfolio!.properties[0].id;
    // Dated, so each add is one insert and changes no other row (ADR 0144).
    const add = (id: string, y: number) =>
      usePortfolioStore.getState().addValuation({
        id,
        propertyId: pid,
        validFrom: new Date(Date.UTC(y, 0, 1)) as IsoDate,
        validTo: new Date(Date.UTC(y, 11, 31)) as IsoDate,
        marketValue: money("1"),
      });
    const a = add("first", 2031);
    const b = add("second", 2032);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toEqual(["start first"]);
    release();
    expect((await a).ok).toBe(true);
    expect((await b).ok).toBe(true);
    // Each write is followed by its "changed since backup" mark (ADR 0110).
    expect(log).toEqual([
      "start first",
      "end first",
      `start ${CHANGED_SINCE_BACKUP}`,
      `end ${CHANGED_SINCE_BACKUP}`,
      "start second",
      "end second",
      `start ${CHANGED_SINCE_BACKUP}`,
      `end ${CHANGED_SINCE_BACKUP}`,
    ]);
  });

  it("clearError() resets a surfaced error", async () => {
    // ADR 0261: a caller with no place of its own surfaces the failure with showError.
    const result = await usePortfolioStore.getState().removeLease("missing");
    if (!result.ok) usePortfolioStore.getState().showError(result.error);
    expect(usePortfolioStore.getState().error).not.toBeNull();
    usePortfolioStore.getState().clearError();
    expect(usePortfolioStore.getState().error).toBeNull();
  });
});

// UX-046, DR-133.
describe("typed write errors", () => {
  it("a duplicate property name returns the constraint, not SQLite's text", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const existing = usePortfolioStore.getState().portfolio!.properties[0];
    const result = await usePortfolioStore
      .getState()
      .addProperty(
        { ...existing, id: "dup-name" },
        { id: "hc-dup-name", propertyId: "dup-name" },
        noExtras,
      );
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "constraint",
        constraint: { kind: "unique", table: "properties", columns: ["name"] },
      },
    });
    // ADR 0261: returned only; the caller shows it, not the banner.
    expect(usePortfolioStore.getState().error).toBeNull();
  });

  it("deleting a record that is gone returns ROW_MISSING", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const result = await usePortfolioStore
      .getState()
      .removeLease("no-such-lease");
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "data",
        code: "ROW_MISSING",
        details: ["leases no-such-lease"],
      },
    });
  });
});

// ADR 0253 (#444): the store counts the writes queued or running in `writesRunning`, from
// the call until the write settles, so row write actions can be disabled meanwhile. The
// count is back to 0 before the caller's `await` resumes (ADR 0248's focus restore needs
// the button enabled by then). Reads do not count.
describe("the count of writes running", () => {
  let db: TestSql;

  beforeEach(async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    db = openMemorySql();
    await usePortfolioStore.getState().init(launchOn(db));
  });

  const running = () => store().writesRunning;
  /** A dated valuation `id` on the first property: one insert, no other row changed
   *  (ADR 0144). */
  const valuation = (id: string) => ({
    id,
    propertyId: store().portfolio!.properties[0]!.id,
    validFrom: new Date(Date.UTC(2033, 0, 1)) as IsoDate,
    validTo: new Date(Date.UTC(2033, 11, 31)) as IsoDate,
    marketValue: money("1"),
  });

  /** `db`, but every `execute` waits until `release()`. */
  function held() {
    let release!: () => void;
    const opened = new Promise<void>((r) => (release = r));
    const sql: Sql = {
      ...db,
      execute: async (q, p) => {
        await opened;
        return db.execute(q, p);
      },
    };
    portfolioDb.set(sql);
    return release;
  }

  it("starts at 0", () => {
    expect(running()).toBe(0);
  });

  it("rises at the call, before the write has started", async () => {
    const release = held();
    const write = store().addValuation(valuation("v1"));
    expect(running()).toBe(1);
    release();
    await write;
    expect(running()).toBe(0);
  });

  it("stays up across two queued writes, counting the one that waits", async () => {
    const release = held();
    const first = store().addValuation(valuation("v1"));
    const second = store().addValuation(valuation("v2"));
    expect(running()).toBe(2);
    let afterFirst = -1;
    const firstDone = first.then(() => (afterFirst = running()));
    release();
    await firstDone;
    expect(afterFirst).toBe(1);
    await second;
    expect(running()).toBe(0);
  });

  it("drops after a failed write", async () => {
    portfolioDb.set({
      ...db,
      execute: () => Promise.reject(new Error("disk I/O")),
    });
    const result = await store().addValuation(valuation("v1"));
    expect(result.ok).toBe(false);
    expect(running()).toBe(0);
  });

  it("drops after a write that throws (exclusive, replaceData)", async () => {
    // The sample is loaded: Load sample refuses a non-empty portfolio.
    await expect(store().loadSample()).resolves.toMatchObject({ ok: false });
    expect(running()).toBe(0);
  });

  it("is 0 when the caller's await resumes", async () => {
    // Read synchronously at the resume: a count dropped later would still show here.
    const result = await store().addValuation(valuation("v1"));
    const afterWrite = running();
    unwrap(await store().clearSample());
    const afterReplace = running();
    expect(result.ok).toBe(true);
    expect([afterWrite, afterReplace]).toEqual([0, 0]);
  });

  it("a CSV preview, a read, does not raise it", async () => {
    const batch = {
      properties: parseProperties(
        "name,purchase_date,purchase_price\nPreviewed,2020-01-01,1",
      ).rows,
    };
    const preview = store().previewCsv(batch);
    expect(running()).toBe(0);
    await preview;
    expect(running()).toBe(0);
  });

  it("a CSV import counts once", async () => {
    const batch = {
      properties: parseProperties(
        "name,purchase_date,purchase_price\nImported,2020-01-01,1",
      ).rows,
    };
    unwrap(await store().previewCsv(batch));
    const write = store().importCsv(batch);
    expect(running()).toBe(1);
    await write;
    expect(running()).toBe(0);
  });

  it("a restore raises it once, from the call until it settles", async () => {
    const file = await exportToJson(db, new Date());
    const restore = store().restoreBackup(file);
    expect(running()).toBe(1);
    expect(store().replacing).toBe(1);
    await restore;
    expect(running()).toBe(0);
    expect(store().replacing).toBe(0);
  });
});

// #467: no store action rejects. Every write, read and whole-database action resolves
// with a result, whether the database fails, is not open yet, or a read-back failed;
// the caller branches on `ok` and never needs a catch.
describe("no store action rejects", () => {
  /** A database whose every call fails. */
  const failing: Sql = {
    execute: () => Promise.reject(new Error("disk I/O error")),
    select: () => Promise.reject(new Error("disk I/O error")),
    transaction: () => Promise.reject(new Error("disk I/O error")),
    selectSnapshot: () => Promise.reject(new Error("disk I/O error")),
    backup: () => Promise.reject(new Error("disk I/O error")),
  };

  /** Any record: the failure comes before its fields matter, or from them. */
  const any = {} as never;
  let file: BackupFile;

  /** Each store action that returns a promise, called once. */
  const actions: [
    name: keyof PortfolioState,
    run: (s: PortfolioState) => Promise<unknown>,
  ][] = [
    ["addValuation", (s) => s.addValuation(any)],
    ["saveValuation", (s) => s.saveValuation(any)],
    ["removeValuation", (s) => s.removeValuation("v")],
    ["addLease", (s) => s.addLease(any)],
    ["saveLease", (s) => s.saveLease(any)],
    ["removeLease", (s) => s.removeLease("l")],
    ["addMortgageBlock", (s) => s.addMortgageBlock(any)],
    ["saveMortgageBlock", (s) => s.saveMortgageBlock(any)],
    ["removeMortgageBlock", (s) => s.removeMortgageBlock("m")],
    ["saveHoldingCost", (s) => s.saveHoldingCost(any)],
    ["addProperty", (s) => s.addProperty(any, any, any)],
    ["editProperty", (s) => s.editProperty(any, any)],
    ["getPropertyExtras", (s) => s.getPropertyExtras("p")],
    ["setPropertyActive", (s) => s.setPropertyActive("p", false)],
    ["removeProperty", (s) => s.removeProperty("p")],
    ["saveAssumptions", (s) => s.saveAssumptions(any)],
    ["addScenario", (s) => s.addScenario(any)],
    ["saveScenario", (s) => s.saveScenario(any)],
    ["duplicateScenario", (s) => s.duplicateScenario("s", "copy", "Copy")],
    ["removeScenario", (s) => s.removeScenario("s")],
    ["dismissSampleBanner", (s) => s.dismissSampleBanner()],
    ["previewCsv", (s) => s.previewCsv({})],
    ["importCsv", (s) => s.importCsv({})],
    ["restoreBackup", (s) => s.restoreBackup(file)],
    ["restoreAtStartup", (s) => s.restoreAtStartup(file)],
    ["clearSample", (s) => s.clearSample()],
    ["loadSample", (s) => s.loadSample()],
    ["exportBackup", (s) => s.exportBackup()],
  ];

  beforeEach(async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const sql = await openSeeded();
    file = await exportToJson(sql, new Date());
  });

  it("lists every action that returns a promise, init and refresh aside", () => {
    const listed = new Set(actions.map(([name]) => name));
    const promised = Object.entries(store())
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k as keyof PortfolioState)
      .filter(
        (k) =>
          ![
            "init",
            "refresh",
            "clearError",
            "showError",
            "continueAfterRestore",
          ].includes(k),
      );
    expect(promised.filter((k) => !listed.has(k))).toEqual([]);
  });

  it.each(actions)(
    "%s resolves before the database is open",
    async (_, run) => {
      await expect(run(store())).resolves.toHaveProperty("ok");
    },
  );

  it.each(actions)("%s resolves when the database fails", async (_, run) => {
    const sql = await openSeeded();
    await store().init(async () => sql);
    portfolioDb.set(failing);
    await expect(run(store())).resolves.toHaveProperty("ok", false);
  });

  it.each(actions)("%s resolves after a failed read-back", async (_, run) => {
    const sql = await openSeeded();
    await store().init(async () => sql);
    usePortfolioStore.setState({
      status: { kind: "readBackFailed", refused: [] },
    });
    await expect(run(store())).resolves.toHaveProperty("ok");
  });
});

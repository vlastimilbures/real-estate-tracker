// Failure-path tests for the portfolio store: a failed DB write must surface (set
// `error`, return `{ ok: false }`) rather than throw into the void, and must leave the
// in-memory state reconciled with what's actually on disk. The store is driven directly
// via getState() (zustand works outside React), so no DOM is needed.
import { beforeEach, describe, expect, it } from "vitest";
import { usePortfolioStore } from "../portfolioStore";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { isoDate, rate } from "../../engine";
import type { IsoDate, MortgageBlock } from "../../engine";
import type { Sql } from "../../data/sql";
import { DataError } from "../../data/errors";
import { CHANGED_SINCE_BACKUP } from "../../data/repositories";
import type { WriteError } from "../writeError";
import { parseProperties, parseRents } from "../../import/csv";
import { CsvImportError } from "../../import/csvImport";
import { money } from "../../engine";

/** The underlying text of an untyped failure (kind "other"); "" for typed ones. */
const text = (e: WriteError | null) => (e?.kind === "other" ? e.message : "");

/** A fresh, migrated + seeded in-memory DB — the same recipe as the app's defaultOpen. */
async function openSeeded(): Promise<Sql> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  return sql;
}

beforeEach(() => {
  // Reset the singleton so each test gets a clean store + a fresh DB on init().
  usePortfolioStore.setState({
    sql: null,
    portfolio: null,
    assumptions: null,
    status: "idle",
    error: null,
    startupError: null,
  });
});

describe("portfolioStore mutations", () => {
  it("returns an error result (not a throw) when the database is not initialised", async () => {
    const result = await usePortfolioStore
      .getState()
      .removeValuation("anything");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(text(result.error)).toMatch(/not initialised/i);
    expect(text(usePortfolioStore.getState().error)).toMatch(
      /not initialised/i,
    );
  });

  it("a successful mutation clears error and refreshes state", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    expect(usePortfolioStore.getState().status).toBe("ready");

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
    const real = usePortfolioStore.getState().sql!;

    // A fake Sql whose writes reject but whose reads still work, so refresh() can
    // reconcile in-memory state back to what's actually persisted.
    const failing: Sql = {
      execute: () => Promise.reject(new Error("disk is full")),
      select: real.select.bind(real),
      selectSnapshot: real.selectSnapshot.bind(real),
      transaction: () => Promise.reject(new Error("disk is full")),
      backup: real.backup.bind(real),
    };
    usePortfolioStore.setState({ sql: failing });

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
    expect(text(usePortfolioStore.getState().error)).toMatch(/disk is full/i);
    // status stays "ready" (mutation failures are not full-screen init errors) and the
    // optimistic row never sticks because refresh() reconciles to disk.
    expect(usePortfolioStore.getState().status).toBe("ready");
    expect(usePortfolioStore.getState().portfolio!.valuations.length).toBe(
      before,
    );
  });

  it("a write whose reload fails succeeds and marks the screen stale (ADR 0125)", async () => {
    // The other half of mutate()'s contract: the write reaches disk but the follow-up
    // refresh() throws. The write has already committed (multi-step writes run in one
    // transaction, D-14), so it is reported as done: the form closes, and the stale
    // banner asks for a Reload instead of a retry being refused as a duplicate (#106).
    await usePortfolioStore.getState().init(openSeeded);
    const real = usePortfolioStore.getState().sql!;

    const pid = usePortfolioStore.getState().portfolio!.properties[0].id;
    const before = usePortfolioStore.getState().portfolio!.valuations.length;

    // Writes succeed against the real DB; the very next read (refresh's load) rejects.
    const writeOkReadFails: Sql = {
      execute: real.execute.bind(real),
      select: () => Promise.reject(new Error("read timeout")),
      selectSnapshot: () => Promise.reject(new Error("read timeout")),
      transaction: real.transaction.bind(real),
      backup: real.backup.bind(real),
    };
    usePortfolioStore.setState({ sql: writeOkReadFails });

    const result = await usePortfolioStore.getState().addValuation({
      id: "val-refresh-fail",
      propertyId: pid,
      validFrom: new Date(Date.UTC(2029, 0, 1)) as IsoDate,
      marketValue: money("14000000"),
    });

    expect(result).toEqual({ ok: true });
    expect(usePortfolioStore.getState().error).toBeNull();
    expect(usePortfolioStore.getState().stale).toBe(true);
    // refresh() never completed, so the in-memory portfolio is stale (the new row is on
    // disk but not reflected here).
    expect(usePortfolioStore.getState().status).toBe("ready");
    expect(usePortfolioStore.getState().portfolio!.valuations.length).toBe(
      before,
    );

    // Reconnect a healthy Sql and refresh: the persisted write is now visible, proving
    // the write really did reach disk.
    usePortfolioStore.setState({ sql: real });
    await usePortfolioStore.getState().refresh();
    expect(usePortfolioStore.getState().portfolio!.valuations.length).toBe(
      before + 1,
    );
  });

  it("runs mutations one at a time, in call order (DR-085)", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const real = usePortfolioStore.getState().sql!;
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
    usePortfolioStore.setState({ sql: slow });
    const pid = usePortfolioStore.getState().portfolio!.properties[0].id;
    const add = (id: string, y: number) =>
      usePortfolioStore.getState().addValuation({
        id,
        propertyId: pid,
        validFrom: new Date(Date.UTC(y, 0, 1)) as IsoDate,
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
    await usePortfolioStore.getState().removeLease("missing");
    expect(usePortfolioStore.getState().error).not.toBeNull();
    usePortfolioStore.getState().clearError();
    expect(usePortfolioStore.getState().error).toBeNull();
  });
});

describe("portfolioStore init & refresh", () => {
  it("a typed data-layer failure at startup is kept for the translated error screen", async () => {
    const details = ['properties "A", "A": duplicate name'];
    await usePortfolioStore
      .getState()
      .init(() =>
        Promise.reject(
          new DataError("MIGRATION_CONFLICT", "upgrade stopped", details),
        ),
      );
    const s = usePortfolioStore.getState();
    expect(s.status).toBe("error");
    expect(s.error).toEqual({
      kind: "data",
      code: "MIGRATION_CONFLICT",
      details,
    });
    expect(s.startupError).toEqual({ code: "MIGRATION_CONFLICT", details });
  });

  it("any other startup failure keeps the raw message only", async () => {
    await usePortfolioStore
      .getState()
      .init(() => Promise.reject(new Error("boom")));
    expect(usePortfolioStore.getState().startupError).toBeNull();
    expect(usePortfolioStore.getState().error).toEqual({
      kind: "other",
      message: "boom",
    });
  });

  it("init() loads the portfolio + assumptions and goes ready", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const s = usePortfolioStore.getState();
    expect(s.status).toBe("ready");
    expect(s.portfolio!.properties.length).toBe(3);
    expect(s.assumptions).not.toBeNull();
  });

  it("init() is a no-op once ready (does not reopen the DB)", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const sql = usePortfolioStore.getState().sql;
    let reopened = false;
    await usePortfolioStore.getState().init(async () => {
      reopened = true;
      return openSeeded();
    });
    expect(reopened).toBe(false);
    expect(usePortfolioStore.getState().sql).toBe(sql);
  });

  it("init() surfaces an opener failure as status='error'", async () => {
    await usePortfolioStore
      .getState()
      .init(() => Promise.reject(new Error("boom")));
    const s = usePortfolioStore.getState();
    expect(s.status).toBe("error");
    expect(text(s.error)).toMatch(/boom/);
  });

  it("refresh() reflects a row written directly to the DB", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const sql = usePortfolioStore.getState().sql!;
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

// Every mutation, invoked once on the happy path — a smoke test that each action's
// mapper + repository call round-trips through the DB and the refreshed in-memory state
// (a bad mapper would surface here). The shared mutate() failure path is covered above.
describe("portfolioStore mutations — happy path (all actions)", () => {
  beforeEach(async () => {
    await usePortfolioStore.getState().init(openSeeded);
  });

  const pf = () => usePortfolioStore.getState().portfolio!;
  const pid = () => pf().properties[0].id;

  it("addValuation / saveValuation / removeValuation", async () => {
    const add = await usePortfolioStore.getState().addValuation({
      id: "v-new",
      propertyId: pid(),
      validFrom: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
      marketValue: money("15000000"),
    });
    expect(add.ok).toBe(true);
    expect(pf().valuations.some((v) => v.id === "v-new")).toBe(true);

    const save = await usePortfolioStore.getState().saveValuation({
      id: "v-new",
      propertyId: pid(),
      validFrom: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
      marketValue: money("16000000"),
    });
    expect(save.ok).toBe(true);
    expect(
      pf()
        .valuations.find((v) => v.id === "v-new")!
        .marketValue.toString(),
    ).toBe("16000000");

    const remove = await usePortfolioStore.getState().removeValuation("v-new");
    expect(remove.ok).toBe(true);
    expect(pf().valuations.some((v) => v.id === "v-new")).toBe(false);
  });

  it("addLease / saveLease / removeLease", async () => {
    const add = await usePortfolioStore.getState().addLease({
      id: "l-new",
      propertyId: pid(),
      startDate: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
      monthlyRent: money("40000"),
    });
    expect(add.ok).toBe(true);
    expect(pf().leases.some((l) => l.id === "l-new")).toBe(true);

    const save = await usePortfolioStore.getState().saveLease({
      id: "l-new",
      propertyId: pid(),
      startDate: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
      monthlyRent: money("41000"),
    });
    expect(save.ok).toBe(true);
    expect(
      pf()
        .leases.find((l) => l.id === "l-new")!
        .monthlyRent.toString(),
    ).toBe("41000");

    const remove = await usePortfolioStore.getState().removeLease("l-new");
    expect(remove.ok).toBe(true);
    expect(pf().leases.some((l) => l.id === "l-new")).toBe(false);
  });

  it("addMortgageBlock / saveMortgageBlock / removeMortgageBlock", async () => {
    const block = {
      id: "m-new",
      propertyId: pid(),
      startDate: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
      initialPrincipal: money("1000000"),
      fixationYears: 5,
      interestRatePa: rate("0.04"),
      monthlyInstalment: money("5000"),
    };
    const add = await usePortfolioStore.getState().addMortgageBlock(block);
    expect(add.ok).toBe(true);
    expect(pf().mortgages.some((m) => m.id === "m-new")).toBe(true);

    const save = await usePortfolioStore
      .getState()
      .saveMortgageBlock({ ...block, monthlyInstalment: money("5500") });
    expect(save.ok).toBe(true);
    expect(
      pf()
        .mortgages.find((m) => m.id === "m-new")!
        .monthlyInstalment.toString(),
    ).toBe("5500");

    const remove = await usePortfolioStore
      .getState()
      .removeMortgageBlock("m-new");
    expect(remove.ok).toBe(true);
    expect(pf().mortgages.some((m) => m.id === "m-new")).toBe(false);
  });

  it("editing a plain block into a development loan: blocked without a term, persists with one", async () => {
    // Reproduces the reported flow: take a seed mortgage (no loanTermYears), add draws
    // + a completion date. Without a term the write must fail (surfaced, not silent);
    // with a term it saves and the tranches round-trip through the DB.
    const existing = pf().mortgages[0];
    expect(existing.loanTermYears).toBeUndefined();
    const draws = [
      { date: isoDate("2026-09-01"), amount: money("2300000") },
      { date: isoDate("2028-04-05"), amount: money("4000000") },
      { date: isoDate("2028-10-10"), amount: money("700000") },
    ];
    const completionDate = isoDate("2028-10-10");

    const blocked = await usePortfolioStore.getState().saveMortgageBlock({
      ...existing,
      draws,
      completionDate,
    } as unknown as MortgageBlock); // deliberately invalid (no term)
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("expected failure");
    // UX-047: the engine rule, on the loan-term field (was an English-only message).
    expect(blocked.error).toEqual({
      kind: "input",
      errors: [
        {
          code: "MISSING_TERM_FOR_DEV_LOAN",
          entity: "mortgage",
          id: existing.id,
          field: "loanTermYears",
        },
      ],
    });

    const ok = await usePortfolioStore.getState().saveMortgageBlock({
      ...existing,
      loanTermYears: 30,
      draws,
      completionDate,
    });
    expect(ok.ok).toBe(true);
    const reloaded = pf().mortgages.find((m) => m.id === existing.id)!;
    expect(reloaded.draws?.length).toBe(3);
    expect(reloaded.draws![0].amount.toString()).toBe("2300000");
    expect(reloaded.completionDate?.getTime()).toBe(completionDate.getTime());
  });

  it("saveHoldingCost updates an existing row", async () => {
    const existing = pf().holdingCosts.find((h) => h.propertyId === pid())!;
    const result = await usePortfolioStore
      .getState()
      .saveHoldingCost({ ...existing, svjMonthly: money("1500") });
    expect(result.ok).toBe(true);
    expect(
      pf()
        .holdingCosts.find((h) => h.id === existing.id)!
        .svjMonthly!.toString(),
    ).toBe("1500");
  });

  it("addProperty (with holding cost) / editProperty / removeProperty", async () => {
    const before = pf().properties.length;
    const add = await usePortfolioStore.getState().addProperty(
      {
        id: "p-new",
        name: "Byt Test",
        purchaseDate: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
        purchasePrice: money("5000000"),
      },
      { id: "hc-new", propertyId: "p-new", svjMonthly: money("1000") },
    );
    expect(add.ok).toBe(true);
    expect(pf().properties.length).toBe(before + 1);
    expect(pf().holdingCosts.some((h) => h.id === "hc-new")).toBe(true);

    const edit = await usePortfolioStore.getState().editProperty(
      {
        id: "p-new",
        name: "Byt Renamed",
        purchaseDate: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
        purchasePrice: money("5000000"),
      },
      { address: "Main St 1", garage: true },
    );
    expect(edit.ok).toBe(true);
    expect(pf().properties.find((p) => p.id === "p-new")!.name).toBe(
      "Byt Renamed",
    );

    const remove = await usePortfolioStore.getState().removeProperty("p-new");
    expect(remove.ok).toBe(true);
    expect(pf().properties.length).toBe(before);
  });

  it("addProperty persists the address & garage extras", async () => {
    const add = await usePortfolioStore.getState().addProperty(
      {
        id: "p-new",
        name: "Byt Test",
        purchaseDate: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
        purchasePrice: money("5000000"),
      },
      { id: "hc-new", propertyId: "p-new" },
      { address: "Main St 1", garage: true },
    );
    expect(add.ok).toBe(true);
    expect(
      await usePortfolioStore.getState().getPropertyExtras("p-new"),
    ).toEqual({ address: "Main St 1", garage: true });
  });

  it("editProperty keeps an inactive property inactive", async () => {
    const id = pid();
    expect(
      (await usePortfolioStore.getState().setPropertyActive(id, false)).ok,
    ).toBe(true);
    // The edit form's Property carries no `active` flag.
    const edited = { ...pf().properties.find((p) => p.id === id)! };
    delete edited.active;
    const edit = await usePortfolioStore
      .getState()
      .editProperty({ ...edited, name: "Byt Renamed" }, {});
    expect(edit.ok).toBe(true);
    const saved = pf().properties.find((p) => p.id === id)!;
    expect(saved.name).toBe("Byt Renamed");
    expect(saved.active).toBe(false);
  });

  it("editProperty keeps a stored funding record the edit does not carry (ADR 0119)", async () => {
    const id = pid();
    const stored = pf().properties.find((p) => p.id === id)!;
    const funding = {
      ownCash: money("1500000"),
      transactionCosts: money("95000"),
      note: "Deposit",
    };
    expect(
      (
        await usePortfolioStore
          .getState()
          .editProperty({ ...stored, funding }, {})
      ).ok,
    ).toBe(true);
    // The edit form's Property carries no funding record yet (#33 PR3 adds it).
    const edited = { ...pf().properties.find((p) => p.id === id)! };
    delete edited.funding;
    const edit = await usePortfolioStore
      .getState()
      .editProperty({ ...edited, name: "Byt Renamed" }, {});
    expect(edit.ok).toBe(true);
    const saved = pf().properties.find((p) => p.id === id)!;
    expect(saved.name).toBe("Byt Renamed");
    expect(saved.funding?.ownCash?.toString()).toBe("1500000");
    expect(saved.funding?.transactionCosts?.toString()).toBe("95000");
    expect(saved.funding?.initialWorks).toBeUndefined();
    expect(saved.funding?.note).toBe("Deposit");
  });

  it("saveAssumptions persists changed assumptions", async () => {
    const a = usePortfolioStore.getState().assumptions!;
    const result = await usePortfolioStore
      .getState()
      .saveAssumptions({ ...a, horizonYears: 25 });
    expect(result.ok).toBe(true);
    expect(usePortfolioStore.getState().assumptions!.horizonYears).toBe(25);
  });
});

describe("portfolioStore — emptied portfolio stays empty on relaunch (DR-024)", () => {
  it("removing every property, then relaunching, does not bring the sample back", async () => {
    const db = openMemorySql();
    const launch = async (): Promise<Sql> => {
      await migrate(db);
      await seedIfEmpty(db);
      return db;
    };
    await usePortfolioStore.getState().init(launch);
    for (const p of usePortfolioStore.getState().portfolio!.properties) {
      const r = await usePortfolioStore.getState().removeProperty(p.id);
      expect(r.ok).toBe(true);
    }
    expect(usePortfolioStore.getState().portfolio!.properties).toHaveLength(0);

    // Relaunch: a fresh store over the same DB, via the app's open recipe.
    usePortfolioStore.setState({
      sql: null,
      portfolio: null,
      assumptions: null,
      status: "idle",
      error: null,
    });
    await usePortfolioStore.getState().init(launch);
    expect(usePortfolioStore.getState().status).toBe("ready");
    expect(usePortfolioStore.getState().portfolio!.properties).toHaveLength(0);
  });
});

describe("portfolioStore whole-database actions (DR-047)", () => {
  it("importCsv writes, reloads, and leaves the banner alone", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const before = usePortfolioStore.getState().portfolio!.properties.length;
    const report = await usePortfolioStore.getState().importCsv({
      properties: parseProperties(
        "name,purchase_date,purchase_price\nStore Import,2020-01-01,1000000",
      ).rows,
    });
    expect(report.upserted.properties).toBe(1);
    expect(usePortfolioStore.getState().portfolio!.properties.length).toBe(
      before + 1,
    );
    expect(usePortfolioStore.getState().error).toBeNull();
  });

  it("importCsv rethrows a refused file unchanged and writes nothing", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const before = usePortfolioStore.getState().portfolio!;
    await expect(
      usePortfolioStore.getState().importCsv({
        rents: parseRents(
          "property_name,start_date,end_date,monthly_rent\nNope,2025-01-01,,1000",
        ).rows,
      }),
    ).rejects.toBeInstanceOf(CsvImportError);
    expect(usePortfolioStore.getState().portfolio!.leases.length).toBe(
      before.leases.length,
    );
    expect(usePortfolioStore.getState().error).toBeNull();
  });

  it("importCsv waits for a pending mutation (one queue, DR-085)", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const real = usePortfolioStore.getState().sql!;
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
    usePortfolioStore.setState({ sql: slow });
    const pid = usePortfolioStore.getState().portfolio!.properties[0].id;
    const a = usePortfolioStore.getState().addValuation({
      id: "queued",
      propertyId: pid,
      validFrom: new Date(Date.UTC(2033, 0, 1)) as IsoDate,
      marketValue: money("1"),
    });
    const b = usePortfolioStore.getState().importCsv({
      properties: parseProperties(
        "name,purchase_date,purchase_price\nQueued Import,2020-01-01,1",
      ).rows,
    });
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
      usePortfolioStore.getState().importCsv({
        rents: parseRents(
          "property_name,start_date,end_date,monthly_rent\nNope,2025-01-01,,1000",
        ).rows,
      }),
    ).rejects.toBeInstanceOf(CsvImportError);
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

describe("portfolioStore typed write errors (UX-046, DR-133)", () => {
  it("a duplicate property name returns the constraint, not SQLite's text", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const existing = usePortfolioStore.getState().portfolio!.properties[0];
    const result = await usePortfolioStore
      .getState()
      .addProperty(
        { ...existing, id: "dup-name" },
        { id: "hc-dup-name", propertyId: "dup-name" },
      );
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "constraint",
        constraint: { kind: "unique", table: "properties", columns: ["name"] },
      },
    });
    expect(usePortfolioStore.getState().error).toEqual(
      result.ok ? null : result.error,
    );
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

describe("portfolioStore checks engine input rules before writing (UX-047)", () => {
  const pf = () => usePortfolioStore.getState().portfolio!;
  beforeEach(async () => {
    await usePortfolioStore.getState().init(openSeeded);
  });

  const plain = (over: Partial<MortgageBlock> = {}): MortgageBlock =>
    ({
      id: "m-check",
      propertyId: pf().properties[0].id,
      startDate: isoDate("2030-01-01"),
      initialPrincipal: money("2000000"),
      fixationYears: 5,
      interestRatePa: rate("0.05"),
      monthlyInstalment: money("20000"),
      ...over,
    }) as MortgageBlock;

  it("an instalment below the monthly interest is refused, nothing written", async () => {
    const before = pf().mortgages.length;
    const r = await usePortfolioStore
      .getState()
      .addMortgageBlock(plain({ monthlyInstalment: money("100") }));
    expect(r).toEqual({
      ok: false,
      error: {
        kind: "input",
        errors: [
          {
            code: "INSTALMENT_BELOW_INTEREST",
            entity: "mortgage",
            id: "m-check",
            field: "monthlyInstalment",
          },
        ],
      },
    });
    expect(pf().mortgages.length).toBe(before);
  });

  it("a zero rate with a zero instalment is refused (DR-018)", async () => {
    const r = await usePortfolioStore
      .getState()
      .addMortgageBlock(
        plain({ interestRatePa: rate("0"), monthlyInstalment: money("0") }),
      );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind === "input" && r.error.errors[0].code).toBe(
      "ZERO_RATE_ZERO_INSTALMENT",
    );
  });

  it("moving a loan onto another loan's start date reports it on the edited loan", async () => {
    const [first] = pf().mortgages;
    const mine = { propertyId: first.propertyId };
    expect(
      (await usePortfolioStore.getState().addMortgageBlock(plain(mine))).ok,
    ).toBe(true);
    const r = await usePortfolioStore
      .getState()
      .saveMortgageBlock({ ...plain(mine), startDate: first.startDate });
    expect(r.ok).toBe(false);
    if (r.ok || r.error.kind !== "input") throw new Error("expected input");
    expect(r.error.errors).toContainEqual({
      code: "DUPLICATE_BLOCK_START",
      entity: "mortgage",
      id: "m-check",
      field: "startDate",
    });
  });

  it("a lease ending before it starts is refused on the end date", async () => {
    const r = await usePortfolioStore.getState().addLease({
      id: "l-check",
      propertyId: pf().properties[0].id,
      startDate: isoDate("2030-01-01"),
      endDate: isoDate("2029-01-01"),
      monthlyRent: money("1000"),
    });
    expect(r).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "END_BEFORE_START", field: "endDate" }],
      },
    });
  });

  it("a holding-cost share above 100 % is refused (DR-127)", async () => {
    const h = pf().holdingCosts[0];
    const r = await usePortfolioStore
      .getState()
      .saveHoldingCost({ ...h, mgmtPctRent: rate("1.5") });
    expect(r).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "RATE_OUT_OF_RANGE", field: "mgmtPctRent" }],
      },
    });
  });

  it("assumptions with a zero horizon are refused, nothing written", async () => {
    const a = usePortfolioStore.getState().assumptions!;
    const r = await usePortfolioStore
      .getState()
      .saveAssumptions({ ...a, horizonYears: 0 });
    expect(r).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "HORIZON_NOT_POSITIVE", field: "horizonYears" }],
      },
    });
    expect(usePortfolioStore.getState().assumptions!.horizonYears).toBe(
      a.horizonYears,
    );
  });

  it("a problem in another row does not block an unrelated edit", async () => {
    const v = pf().valuations[0];
    const r = await usePortfolioStore
      .getState()
      .saveValuation({ ...v, marketValue: money("12345678") });
    expect(r.ok).toBe(true);
  });
});

describe("development-loan rules at save time (UX-047, was mortgageFieldErrors)", () => {
  const pf = () => usePortfolioStore.getState().portfolio!;
  beforeEach(async () => {
    await usePortfolioStore.getState().init(openSeeded);
  });

  it("a draw on the loan start date is refused on the draws field (D-42)", async () => {
    const start = isoDate("2030-01-01");
    const r = await usePortfolioStore.getState().addMortgageBlock({
      id: "m-draw",
      propertyId: pf().properties[0].id,
      startDate: start,
      initialPrincipal: money("1000000"),
      fixationYears: 5,
      loanTermYears: 30,
      interestRatePa: rate("0.05"),
      monthlyInstalment: money("6000"),
      draws: [{ date: start, amount: money("500000") }],
    } as MortgageBlock);
    expect(r).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "DRAW_BEFORE_START", field: "draws" }],
      },
    });
  });

  it("a draw on or after the loan's final payment date is refused (DR-074)", async () => {
    const start = isoDate("2030-01-01");
    const r = await usePortfolioStore.getState().addMortgageBlock({
      id: "m-draw-late",
      propertyId: pf().properties[0].id,
      startDate: start,
      initialPrincipal: money("1000000"),
      fixationYears: 5,
      loanTermYears: 30,
      interestRatePa: rate("0.05"),
      monthlyInstalment: money("6000"),
      draws: [{ date: isoDate("2060-01-01"), amount: money("500000") }],
    } as MortgageBlock);
    expect(r).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "DRAW_AFTER_SCHEDULE_END", field: "draws" }],
      },
    });
  });
});

describe("portfolioStore stale flag (UX-050, DR-086)", () => {
  it("is set when the reload after a write fails, and cleared by a good refresh", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    expect(usePortfolioStore.getState().stale).toBe(false);
    const real = usePortfolioStore.getState().sql!;
    usePortfolioStore.setState({
      sql: {
        execute: real.execute.bind(real),
        select: () => Promise.reject(new Error("read timeout")),
        selectSnapshot: () => Promise.reject(new Error("read timeout")),
        transaction: real.transaction.bind(real),
        backup: real.backup.bind(real),
      },
    });
    const pid = usePortfolioStore.getState().portfolio!.properties[0].id;
    await usePortfolioStore.getState().addValuation({
      id: "stale-1",
      propertyId: pid,
      validFrom: new Date(Date.UTC(2035, 0, 1)) as IsoDate,
      marketValue: money("1"),
    });
    expect(usePortfolioStore.getState().stale).toBe(true);
    usePortfolioStore.setState({ sql: real });
    await usePortfolioStore.getState().reload();
    expect(usePortfolioStore.getState().stale).toBe(false);
    expect(
      usePortfolioStore
        .getState()
        .portfolio!.valuations.some((v) => v.id === "stale-1"),
    ).toBe(true);
  });
});

// ADR 0123 (#107, #108): scenario writes.
describe("portfolioStore scenario writes (ADR 0123)", () => {
  const createdAt = async (id: string) =>
    (
      await usePortfolioStore.getState().sql!.select<{
        created_at: string;
      }>("SELECT created_at FROM scenarios WHERE id = ?", [id])
    )[0]?.created_at;

  it("an add stamps created_at; a save keeps it", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const s = { id: "s1", name: "Stress", overrides: {} };
    expect(await usePortfolioStore.getState().addScenario(s)).toEqual({
      ok: true,
    });
    const stamped = await createdAt("s1");
    expect(stamped).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    await usePortfolioStore.getState().saveScenario({ ...s, name: "Renamed" });
    expect(await createdAt("s1")).toBe(stamped);
    expect(usePortfolioStore.getState().scenarios.map((x) => x.name)).toEqual([
      "Renamed",
    ]);
  });
});

// ADR 0123 (#108): a scenario write runs the engine's assumption rules on the scenario's
// own overrides before anything is written, like saveAssumptions (UX-047).
describe("portfolioStore refuses a scenario that breaks an engine rule (ADR 0123)", () => {
  const storedIds = async () =>
    (
      await usePortfolioStore
        .getState()
        .sql!.select<{ id: string }>("SELECT id FROM scenarios ORDER BY id")
    ).map((r) => r.id);

  it.each([
    [
      "a vacancy of 150 %",
      { vacancyAllowance: rate("1.5") },
      "RATE_OUT_OF_RANGE",
      "vacancyAllowance",
    ],
    [
      "a crash typed as −20 %",
      { valueShock: { pct: rate("-0.2"), atYear: 0 } },
      "SHOCK_OUT_OF_RANGE",
      "valueShock",
    ],
  ] as const)(
    "add and save refuse %s, nothing written",
    async (_, overrides, code, field) => {
      await usePortfolioStore.getState().init(openSeeded);
      const refused = {
        ok: false,
        error: { kind: "input", errors: [{ code, field }] },
      };
      const store = () => usePortfolioStore.getState();
      expect(
        await store().addScenario({ id: "bad", name: "Bad", overrides }),
      ).toMatchObject(refused);
      expect(await storedIds()).toEqual([]);

      await store().addScenario({ id: "s1", name: "Fine", overrides: {} });
      expect(
        await store().saveScenario({ id: "s1", name: "Fine", overrides }),
      ).toMatchObject(refused);
      expect(
        await store().sql!.select("SELECT overrides FROM scenarios"),
      ).toEqual([{ overrides: '{"version":1}' }]);
    },
  );

  it("refuses to duplicate a stored scenario that breaks a rule", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    await usePortfolioStore
      .getState()
      .sql!.execute(
        "INSERT INTO scenarios (id, name, overrides, created_at) VALUES (?, ?, ?, ?)",
        [
          "old",
          "Old",
          '{"version":1,"vacancyAllowance":"1.5"}',
          "2026-01-01T00:00:00.000Z",
        ],
      );
    await usePortfolioStore.getState().reload();
    const r = await usePortfolioStore
      .getState()
      .duplicateScenario("old", "copy");
    expect(r).toMatchObject({
      ok: false,
      error: { kind: "input", errors: [{ code: "RATE_OUT_OF_RANGE" }] },
    });
    expect(await storedIds()).toEqual(["old"]);
  });
});

// ADR 0123 (#107): one scenario row the app cannot read no longer blocks startup.
describe("portfolioStore loads around an unreadable scenario (ADR 0123)", () => {
  it("starts, lists the row as unreadable, and Delete removes it", async () => {
    await usePortfolioStore.getState().init(async () => {
      const sql = await openSeeded();
      // Valid JSON (passes the CHECK) that the overrides reader refuses.
      await sql.execute(
        "INSERT INTO scenarios (id, name, overrides, created_at) VALUES (?, ?, ?, ?)",
        [
          "bad",
          "Broken",
          '{"version":1,"valueShock":{"pct":"x"}}',
          "2026-01-01T00:00:00.000Z",
        ],
      );
      return sql;
    });
    const store = () => usePortfolioStore.getState();
    expect(store().status).toBe("ready");
    expect(store().scenarios).toEqual([]);
    expect(store().unreadableScenarios).toEqual([
      { id: "bad", name: "Broken" },
    ]);

    expect(await store().removeScenario("bad")).toEqual({ ok: true });
    expect(store().unreadableScenarios).toEqual([]);
  });
});

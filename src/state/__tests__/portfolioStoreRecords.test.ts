// The portfolio store's record writes on the happy path, and what an added valuation or
// lease does to the one before it. Every action is invoked once — a smoke test that each
// action's mapper + repository call round-trips through the DB and the refreshed in-memory
// state (a bad mapper would surface here). The shared failure path is covered in
// portfolioStoreWrites.test.ts.
import { beforeEach, describe, expect, it } from "vitest";
import {
  usePortfolioStore,
  type MutationResult,
  portfolioDb,
} from "../portfolioStore";
import { insertLease, insertValuation } from "../../data/repositories";
import { noExtras } from "../../data/__tests__/support/noExtras";
import type { Sql } from "../../data/sql";
import {
  isoDate,
  money,
  mortgageBlock,
  portfolioOutputs,
  rate,
  type IsoDate,
  type Lease,
  type Valuation,
} from "../../engine";
import { openPredecessor } from "../../engine/__tests__/support/seams";
import { setClock } from "../../__tests__/support/clock";
import { openSeeded } from "./support/openSeeded";
import { unwrap } from "../../__tests__/support/result";

// The setup file (src/__tests__/setup/stores.ts) resets both stores before every test;
// this file sets no spy and keeps no module-level state of its own.

const store = () => usePortfolioStore.getState();
const pf = () => store().portfolio!;
const pid = () => pf().properties[0].id;

describe("valuation, lease, mortgage and holding-cost writes", () => {
  beforeEach(async () => {
    await usePortfolioStore.getState().init(openSeeded);
  });

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
    // ADR 0163: the property's open lease ends the day before the new one starts.
    expect(
      pf()
        .leases.filter((l) => l.propertyId === pid() && l.id !== "l-new")
        .map((l) => l.endDate?.toISOString().slice(0, 10)),
    ).toContain("2029-12-31");

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
    const block = mortgageBlock({
      id: "m-new",
      propertyId: pid(),
      startDate: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
      initialPrincipal: money("1000000"),
      fixationYears: 5,
      interestRatePa: rate("0.04"),
      monthlyInstalment: money("5000"),
    });
    const add = await usePortfolioStore.getState().addMortgageBlock(block);
    expect(add.ok).toBe(true);
    expect(pf().mortgages.some((m) => m.id === "m-new")).toBe(true);

    const save = await usePortfolioStore
      .getState()
      .saveMortgageBlock(
        mortgageBlock({ ...block, monthlyInstalment: money("5500") }),
      );
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

    const blocked = await usePortfolioStore.getState().saveMortgageBlock(
      mortgageBlock({
        ...existing,
        draws,
        completionDate,
      }),
    ); // deliberately invalid (no term)
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

    const ok = await usePortfolioStore.getState().saveMortgageBlock(
      mortgageBlock({
        ...existing,
        loanTermYears: 30,
        draws,
        completionDate,
      }),
    );
    expect(ok.ok).toBe(true);
    const reloaded = pf().mortgages.find((m) => m.id === existing.id)!;
    expect(reloaded.draws?.length).toBe(3);
    expect(reloaded.draws![0].amount.toString()).toBe("2300000");
    expect(reloaded.completionDate?.getTime()).toBe(completionDate.getTime());
  });

  it("a broken input rule is only returned: the banner stays empty (#125)", async () => {
    // ADR 0141: the form that submitted the write shows the refusal itself.
    const existing = pf().mortgages[0];
    const blocked = await usePortfolioStore.getState().saveMortgageBlock(
      mortgageBlock({
        ...existing,
        draws: [{ date: isoDate("2026-09-01"), amount: money("2300000") }],
        completionDate: isoDate("2028-10-10"),
      }),
    ); // deliberately invalid (no term)
    expect(blocked.ok).toBe(false);
    expect(blocked.ok ? null : blocked.error.kind).toBe("input");
    expect(usePortfolioStore.getState().error).toBeNull();
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
});

describe("property writes", () => {
  beforeEach(async () => {
    await usePortfolioStore.getState().init(openSeeded);
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
      noExtras,
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
      unwrap(await usePortfolioStore.getState().getPropertyExtras("p-new")),
    ).toEqual({ address: "Main St 1", garage: true });
  });

  it("editProperty keeps an inactive property inactive", async () => {
    const id = pid();
    expect(
      (await usePortfolioStore.getState().setPropertyActive(id, false)).ok,
    ).toBe(true);
    // The edit form sends a PropertyEdit, which carries no `active` flag.
    const { active, ...edited } = pf().properties.find((p) => p.id === id)!;
    expect(active).toBe(false);
    const edit = await usePortfolioStore
      .getState()
      .editProperty({ ...edited, name: "Byt Renamed" }, noExtras);
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
          .editProperty({ ...stored, funding }, noExtras)
      ).ok,
    ).toBe(true);
    // An edit with no record keeps the stored one; the form always sends one (ADR 0119 §8).
    const edited = { ...pf().properties.find((p) => p.id === id)! };
    delete edited.funding;
    const edit = await usePortfolioStore
      .getState()
      .editProperty({ ...edited, name: "Byt Renamed" }, noExtras);
    expect(edit.ok).toBe(true);
    const saved = pf().properties.find((p) => p.id === id)!;
    expect(saved.name).toBe("Byt Renamed");
    expect(saved.funding?.ownCash?.toString()).toBe("1500000");
    expect(saved.funding?.transactionCosts?.toString()).toBe("95000");
    expect(saved.funding?.initialWorks).toBeUndefined();
    expect(saved.funding?.note).toBe("Deposit");
  });

  it("editProperty clears a stored funding record with an empty one (ADR 0119 §8)", async () => {
    const id = pid();
    const stored = pf().properties.find((p) => p.id === id)!;
    const store = usePortfolioStore.getState();
    const funding = { ownCash: money("1500000"), note: "Deposit" };
    expect(
      (await store.editProperty({ ...stored, funding }, noExtras)).ok,
    ).toBe(true);
    expect(
      (await store.editProperty({ ...stored, funding: {} }, noExtras)).ok,
    ).toBe(true);
    expect(pf().properties.find((p) => p.id === id)!.funding).toBeUndefined();
  });

  it("editProperty saves the edit's record whole: a part it drops is cleared", async () => {
    const id = pid();
    const stored = pf().properties.find((p) => p.id === id)!;
    const store = usePortfolioStore.getState();
    const full = {
      ownCash: money("1500000"),
      transactionCosts: money("95000"),
      note: "Deposit",
    };
    expect(
      (await store.editProperty({ ...stored, funding: full }, noExtras)).ok,
    ).toBe(true);
    const edit = await store.editProperty(
      { ...stored, funding: { ownCash: money("1400000") } },
      noExtras,
    );
    expect(edit.ok).toBe(true);
    const saved = pf().properties.find((p) => p.id === id)!.funding;
    expect(saved?.ownCash?.toString()).toBe("1400000");
    expect(saved?.transactionCosts).toBeUndefined();
    expect(saved?.note).toBeUndefined();
  });

  it("addProperty persists a funding record", async () => {
    const add = await usePortfolioStore.getState().addProperty(
      {
        id: "p-new",
        name: "Byt Test",
        purchaseDate: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
        purchasePrice: money("5000000"),
        funding: { ownCash: money("0"), initialWorks: money("150000") },
      },
      { id: "hc-new", propertyId: "p-new" },
      noExtras,
    );
    expect(add.ok).toBe(true);
    const saved = pf().properties.find((p) => p.id === "p-new")!.funding;
    expect(saved?.ownCash?.toString()).toBe("0");
    expect(saved?.initialWorks?.toString()).toBe("150000");
    expect(saved?.transactionCosts).toBeUndefined();
  });
});

/** The day the added valuations and leases below start. */
const START = isoDate("2030-01-01");

/** A fresh database from `open` (default: the seed). `init` alone is a no-op once the
 *  store is ready. */
async function reset(open: () => Promise<Sql> = openSeeded) {
  portfolioDb.set(null);
  usePortfolioStore.setState({
    portfolio: null,
    assumptions: null,
    status: { kind: "idle" },
    error: null,
  });
  await store().init(open);
}

/** The seed's first property that has an open-ended valuation before START. */
function openValuation(): Valuation {
  for (const p of pf().properties) {
    const prev = openPredecessor(
      pf().valuations,
      p.id,
      START,
      (v) => v.validFrom,
      (v) => v.validTo,
    );
    if (prev) return prev;
  }
  throw new Error("seed has no open-ended valuation");
}
function openLease(at = START): Lease {
  for (const p of pf().properties) {
    const prev = openPredecessor(
      pf().leases,
      p.id,
      at,
      (l) => l.startDate,
      (l) => l.endDate,
    );
    if (prev) return prev;
  }
  throw new Error("seed has no open-ended lease");
}

const outputs = () =>
  JSON.stringify(portfolioOutputs(pf(), store().assumptions!));
const day = (d: Date | undefined) => d?.toISOString().slice(0, 10);
const inputCodes = (r: MutationResult) =>
  r.ok || r.error.kind !== "input" ? [] : r.error.errors.map((e) => e.code);

// ADR 0099, 0227: adding an open-ended valuation ends the previous open-ended one in the
// same write. Both rows pass the engine input checks, and no computed number changes.
describe("an added valuation ends the previous one", () => {
  beforeEach(() => reset());

  it("adds the valuation and ends the previous one the day before", async () => {
    const prev = openValuation();
    const v: Valuation = {
      id: "v-new",
      propertyId: prev.propertyId,
      validFrom: START,
      marketValue: money("15000000"),
    };
    const result = await store().addValuation(v);
    expect(result.ok).toBe(true);
    const old = pf().valuations.find((x) => x.id === prev.id)!;
    expect(day(old.validTo)).toBe("2029-12-31");
    expect(pf().valuations.some((x) => x.id === "v-new")).toBe(true);
  });

  it("a refused add writes neither row", async () => {
    const prev = openValuation();
    const before = pf().valuations.length;
    const result = await store().addValuation({
      id: "v-new",
      propertyId: prev.propertyId,
      validFrom: START,
      marketValue: money("-1"),
    });
    expect(result.ok).toBe(false);
    expect(pf().valuations).toHaveLength(before);
    expect(pf().valuations.find((x) => x.id === prev.id)!.validTo).toBe(
      undefined,
    );
  });

  it("computes the same outputs as the row inserted without ending the previous one", async () => {
    const prev = openValuation();
    const v: Valuation = {
      id: "v-new",
      propertyId: prev.propertyId,
      validFrom: START,
      marketValue: money("15000000"),
    };
    await reset(async () => {
      const sql = await openSeeded();
      await insertValuation(sql, v);
      return sql;
    });
    expect(pf().valuations.find((x) => x.id === prev.id)!.validTo).toBe(
      undefined,
    );
    const plain = outputs();

    await reset();
    expect(await store().addValuation(v)).toEqual({ ok: true });
    expect(day(pf().valuations.find((x) => x.id === prev.id)!.validTo)).toBe(
      "2029-12-31",
    );
    expect(outputs()).toBe(plain);
  });
});

// ADR 0163: leases of one apartment never overlap. Adding a lease ends the open lease
// before it the day before, and a write that would overlap another lease is refused.
describe("leases never overlap", () => {
  beforeEach(() => reset());

  it("adding an open-ended lease ends the open lease before it the day before", async () => {
    const prev = openLease();
    const l: Lease = {
      id: "l-new",
      propertyId: prev.propertyId,
      startDate: START,
      monthlyRent: money("40000"),
    };
    expect(await store().addLease(l)).toEqual({ ok: true });
    expect(day(pf().leases.find((x) => x.id === prev.id)!.endDate)).toBe(
      "2029-12-31",
    );
    expect(pf().leases.some((x) => x.id === "l-new")).toBe(true);
  });

  it("adding a dated lease ends the open lease before it too", async () => {
    const from = isoDate("2026-01-01");
    const prev = openLease(from);
    const l: Lease = {
      id: "l-new",
      propertyId: prev.propertyId,
      startDate: from,
      endDate: isoDate("2026-03-31"),
      monthlyRent: money("40000"),
    };
    expect(await store().addLease(l)).toEqual({ ok: true });
    expect(day(pf().leases.find((x) => x.id === prev.id)!.endDate)).toBe(
      "2025-12-31",
    );
  });

  it("a lease after the last one has no open lease to end and is added as is", async () => {
    // lipova: l-lipova-1 ends 2026-08-30, l-lipova-2 is open from 2026-09-01.
    const l: Lease = {
      id: "l-new",
      propertyId: "lipova",
      startDate: START,
      monthlyRent: money("30000"),
    };
    expect(await store().addLease(l)).toEqual({ ok: true });
    const lipova = pf().leases.filter((x) => x.propertyId === "lipova");
    expect(lipova.map((x) => [x.id, day(x.endDate)])).toEqual(
      expect.arrayContaining([
        ["l-lipova-1", "2026-08-30"],
        ["l-lipova-2", "2029-12-31"],
        ["l-new", undefined],
      ]),
    );
  });

  it("refuses a new lease that runs into a later lease and writes nothing", async () => {
    // lipova: a lease for 2026-08-31..09-01 reaches l-lipova-2 (open from 2026-09-01).
    const before = JSON.stringify(pf().leases);
    const r = await store().addLease({
      id: "l-new",
      propertyId: "lipova",
      startDate: isoDate("2026-08-31"),
      endDate: isoDate("2026-09-01"),
      monthlyRent: money("20000"),
    });
    expect(inputCodes(r)).toContain("LEASE_OVERLAP");
    expect(JSON.stringify(pf().leases)).toBe(before);
  });

  it("refuses a new lease with the same start as a stored one", async () => {
    const r = await store().addLease({
      id: "l-new",
      propertyId: "dubova",
      startDate: isoDate("2025-07-01"),
      monthlyRent: money("20000"),
    });
    expect(inputCodes(r)).toContain("LEASE_OVERLAP");
    expect(pf().leases.some((x) => x.id === "l-new")).toBe(false);
  });

  it("refuses an edit that makes two leases overlap", async () => {
    const lipova1 = pf().leases.find((x) => x.id === "l-lipova-1")!;
    const r = await store().saveLease({
      ...lipova1,
      endDate: isoDate("2026-09-01"),
    });
    expect(inputCodes(r)).toEqual(["LEASE_OVERLAP"]);
    expect(day(pf().leases.find((x) => x.id === "l-lipova-1")!.endDate)).toBe(
      "2026-08-30",
    );
  });

  // Written before ADR 0163.
  describe("a stored overlap", () => {
    // dubova: the seed's open lease from 2025-07-01, plus an open one from 2027-01-01.
    const legacy: Lease = {
      id: "l-dubova-legacy",
      propertyId: "dubova",
      startDate: isoDate("2027-01-01"),
      monthlyRent: money("25000"),
    };
    beforeEach(() =>
      reset(async () => {
        const sql = await openSeeded();
        await insertLease(sql, legacy);
        return sql;
      }),
    );

    it("loads, and does not block writes to other rows", async () => {
      expect(pf().leases.some((x) => x.id === legacy.id)).toBe(true);
      const javorova = pf().leases.find((x) => x.id === "l-javorova")!;
      expect(
        await store().saveLease({ ...javorova, monthlyRent: money("28000") }),
      ).toEqual({ ok: true });
    });

    it("refuses an edit of either lease while they overlap", async () => {
      const r = await store().saveLease({
        ...legacy,
        monthlyRent: money("26000"),
      });
      expect(inputCodes(r)).toEqual(["LEASE_OVERLAP"]);
    });

    it("is fixed by ending the earlier lease, or by deleting one of them", async () => {
      const dubova = pf().leases.find((x) => x.id === "l-dubova")!;
      expect(
        await store().saveLease({
          ...dubova,
          endDate: isoDate("2026-12-31"),
        }),
      ).toEqual({ ok: true });

      await reset(async () => {
        const sql = await openSeeded();
        await insertLease(sql, legacy);
        return sql;
      });
      expect(await store().removeLease(legacy.id)).toEqual({ ok: true });
    });
  });

  it("adds a lease that overlaps nothing although its predecessor keeps a stored overlap", async () => {
    // dubova: a dated lease from before the rule overlaps the seed's open l-dubova
    // (from 2025-07-01). Ending l-dubova for the new lease cannot add an overlap, so the
    // old pair is not the new lease's to report (ADR 0163 §4).
    const old: Lease = {
      id: "l-dubova-old",
      propertyId: "dubova",
      startDate: isoDate("2024-01-01"),
      endDate: isoDate("2025-12-31"),
      monthlyRent: money("19000"),
    };
    await reset(async () => {
      const sql = await openSeeded();
      await insertLease(sql, old);
      return sql;
    });
    const r = await store().addLease({
      id: "l-new",
      propertyId: "dubova",
      startDate: isoDate("2027-01-01"),
      monthlyRent: money("25000"),
    });
    expect(r).toEqual({ ok: true });
    expect(day(pf().leases.find((x) => x.id === "l-dubova")!.endDate)).toBe(
      "2026-12-31",
    );
    expect(day(pf().leases.find((x) => x.id === old.id)!.endDate)).toBe(
      "2025-12-31",
    );
  });
});

// ADR 0123 (#107, #108).
describe("scenario writes", () => {
  const createdAt = async (id: string) =>
    (
      await portfolioDb.get()!.select<{
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
    // The clock stands still (setup/clock.ts): move it, so a re-stamp on save would show.
    setClock("2026-10-02");
    await usePortfolioStore.getState().saveScenario({ ...s, name: "Renamed" });
    expect(await createdAt("s1")).toBe(stamped);
    expect(usePortfolioStore.getState().scenarios.map((x) => x.name)).toEqual([
      "Renamed",
    ]);
  });

  it("stores a duplicate under the name the caller gives (#169)", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    await portfolioDb
      .get()!
      .execute(
        "INSERT INTO scenarios (id, name, overrides, created_at) VALUES (?, ?, ?, ?)",
        ["old", "Stres", '{"version":1}', "2026-01-01T00:00:00.000Z"],
      );
    await usePortfolioStore.getState().refresh();
    const r = await usePortfolioStore
      .getState()
      .duplicateScenario("old", "copy", "Stres (kopie)");
    expect(r).toEqual({ ok: true });
    await usePortfolioStore.getState().refresh();
    const copy = usePortfolioStore
      .getState()
      .scenarios.find((x) => x.id === "copy");
    expect(copy?.name).toBe("Stres (kopie)");
  });
});

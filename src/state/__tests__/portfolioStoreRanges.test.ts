// The portfolio store's bounded ranges: after the engine rules it refuses a value outside
// a bounded range that a write adds (ADR 0245), and a scenario shock or crash year outside
// the scenario form's bounds (ADR 0257). A stored out-of-range value (a restored file,
// "Restore anyway", ADR 0148) still loads and blocks no other write, and a fix saves.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  usePortfolioStore,
  type MutationResult,
  portfolioDb,
} from "../portfolioStore";
import { noExtras } from "../../data/__tests__/support/noExtras";
import { exportToJson } from "../../data/backup";
import { upsertScenario } from "../../data/repositories";
import { parseProperties } from "../../import/csv";
import {
  isoDate,
  money,
  rate,
  type Property,
  type Scenario,
  type ScenarioOverrides,
} from "../../engine";
import { CRASH_YEAR, SHOCK_YEARS } from "../../lib/rules";
import { scenarioWriteErrors } from "../../ui/model/scenarioForm";
import { en } from "../../i18n/en";
import { importNow } from "./support/importNow";
import { openSeeded } from "./support/openSeeded";
import { unwrap } from "../../__tests__/support/result";

const store = () => usePortfolioStore.getState();
const ok: MutationResult = { ok: true };
/** Start the store on a fresh seeded database. */
const start = () => store().init(openSeeded);

// The setup file (src/__tests__/setup/stores.ts) resets both stores before every test;
// the Tauri spy goes back to the real pass-through, and each describe sets what it needs
// and starts the store.
beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

/** Start the store with the Tauri bridge answering, for the restore's safety copy. */
async function startBridged(): Promise<void> {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await start();
}

const block = (id = "m-javorova") =>
  store().portfolio!.mortgages.find((m) => m.id === id)!;
const property = (id = "javorova") =>
  store().portfolio!.properties.find((p) => p.id === id)!;

/** The refusal of one out-of-range value on `field`. */
const refused = (
  field: string,
  value: number,
  code: "OUT_OF_RANGE" | "BEYOND_LIMIT" = "OUT_OF_RANGE",
) => ({
  ok: false,
  error: { kind: "input", errors: [], ranges: [{ code, field, value }] },
});

/** A property `p-new` of `sizeM2` m². */
const addSized = (sizeM2: number) =>
  store().addProperty(
    {
      id: "p-new",
      name: "New",
      purchaseDate: isoDate("2030-01-01"),
      purchasePrice: money("5000000"),
      sizeM2,
    },
    { id: "hc-new", propertyId: "p-new" },
    noExtras,
  );

/** Store `value` in `table.column` past the form, as a restored file can (ADR 0148). */
async function storeRaw(
  table: string,
  column: string,
  value: number,
  id?: string,
): Promise<void> {
  const where = id === undefined ? "" : ` WHERE id = '${id}'`;
  await portfolioDb
    .get()!
    .execute(`UPDATE ${table} SET ${column} = ${value}${where}`);
  await store().refresh();
}

// ADR 0245.
describe("an out-of-range value a write adds is refused", () => {
  beforeEach(startBridged);

  it("refuses a fixation of 51 years", async () => {
    expect(
      await store().saveMortgageBlock({ ...block(), fixationYears: 51 }),
    ).toMatchObject(refused("fixationYears", 51));
    expect(block().fixationYears).toBe(10);
    // An input error: the form shows it, not the banner (ADR 0141).
    expect(store().error).toBeNull();
  });

  it("refuses a loan term of 51 years", async () => {
    expect(
      await store().saveMortgageBlock({ ...block(), loanTermYears: 51 }),
    ).toMatchObject(refused("loanTermYears", 51));
    expect(block().loanTermYears).toBeUndefined();
  });

  it("refuses a horizon of 101 years, and 1001 beyond the limit", async () => {
    const a = store().assumptions!;
    expect(
      await store().saveAssumptions({ ...a, horizonYears: 101 }),
    ).toMatchObject(refused("horizonYears", 101));
    expect(
      await store().saveAssumptions({ ...a, horizonYears: 1001 }),
    ).toMatchObject(refused("horizonYears", 1001, "BEYOND_LIMIT"));
    expect(store().assumptions!.horizonYears).toBe(30);
  });

  it("refuses a new property of 0.5, 54.55 or 10 000.5 m²", async () => {
    for (const size of [0.5, 54.55, 10000.5])
      expect(await addSized(size)).toMatchObject(refused("sizeM2", size));
    expect(store().portfolio!.properties).toHaveLength(3);
  });

  it("refuses an edit to 20 000 m²", async () => {
    expect(
      await store().editProperty({ ...property(), sizeM2: 20000 }, noExtras),
    ).toMatchObject(refused("sizeM2", 20000));
    expect(property().sizeM2).toBe(71);
  });

  it("refuses changing a stored fixation of 60 to 70", async () => {
    await storeRaw("mortgage_blocks", "fixation_years", 60, "m-javorova");
    expect(
      await store().saveMortgageBlock({ ...block(), fixationYears: 70 }),
    ).toMatchObject(refused("fixationYears", 70));
    expect(block().fixationYears).toBe(60);
  });

  it("refuses changing a stored horizon of 150 to 120", async () => {
    await storeRaw("assumptions", "horizon_years", 150);
    const a = store().assumptions!;
    expect(
      await store().saveAssumptions({ ...a, horizonYears: 120 }),
    ).toMatchObject(refused("horizonYears", 120));
    expect(store().assumptions!.horizonYears).toBe(150);
  });
});

// ADR 0245 §2.
describe("a stored out-of-range value locks nothing out", () => {
  beforeEach(startBridged);

  it("saves the bounds themselves", async () => {
    for (const fixationYears of [0, 50])
      expect(
        await store().saveMortgageBlock({ ...block(), fixationYears }),
      ).toEqual(ok);
    for (const loanTermYears of [1, 50])
      expect(
        await store().saveMortgageBlock({ ...block(), loanTermYears }),
      ).toEqual(ok);
    for (const horizonYears of [1, 100])
      expect(
        await store().saveAssumptions({
          ...store().assumptions!,
          horizonYears,
        }),
      ).toEqual(ok);
    for (const sizeM2 of [1, 54.5, 10000])
      expect(
        await store().editProperty({ ...property(), sizeM2 }, noExtras),
      ).toEqual(ok);
    expect(property().sizeM2).toBe(10000);
  });

  it("a stored fixation of 60 blocks no other write", async () => {
    await storeRaw("mortgage_blocks", "fixation_years", 60, "m-javorova");
    const s = store();
    expect(
      await s.saveMortgageBlock({ ...block("m-lipova"), fixationYears: 5 }),
    ).toEqual(ok);
    expect(
      await store().editProperty(
        { ...property(), name: "Javorová 2" },
        noExtras,
      ),
    ).toEqual(ok);
    expect(
      await store().addValuation({
        id: "v-new",
        propertyId: "javorova",
        validFrom: isoDate("2031-01-01"),
        marketValue: money("6000000"),
      }),
    ).toEqual(ok);
    expect(
      await store().saveAssumptions({
        ...store().assumptions!,
        inflationPa: rate("0.03"),
      }),
    ).toEqual(ok);
    expect(
      await store().addScenario({
        id: "s1",
        name: "Shock",
        overrides: { rateShock: { deltaPa: rate("0.01"), durationYears: 3 } },
      }),
    ).toEqual(ok);
    expect(
      await store().addMortgageBlock({
        ...block("m-lipova"),
        id: "m-new",
        startDate: isoDate("2032-01-01"),
      }),
    ).toEqual(ok);
    expect(await store().removeMortgageBlock("m-new")).toEqual(ok);
    expect(block().fixationYears).toBe(60);
  });

  it("saves the same block with another rate, then a fix to 50", async () => {
    await storeRaw("mortgage_blocks", "fixation_years", 60, "m-javorova");
    expect(
      await store().saveMortgageBlock({
        ...block(),
        interestRatePa: rate("0.02"),
      }),
    ).toEqual(ok);
    expect(block().fixationYears).toBe(60);
    expect(
      await store().saveMortgageBlock({ ...block(), fixationYears: 50 }),
    ).toEqual(ok);
    expect(block().fixationYears).toBe(50);
  });

  it("deletes a block holding a fixation of 60", async () => {
    await storeRaw("mortgage_blocks", "fixation_years", 60, "m-javorova");
    expect(await store().removeMortgageBlock("m-javorova")).toEqual(ok);
    expect(store().portfolio!.mortgages).toHaveLength(2);
  });

  it("a stored size of 20 000 m² blocks no other edit of the property", async () => {
    await storeRaw("properties", "size_m2", 20000, "javorova");
    const p: Property = property();
    expect(
      await store().editProperty({ ...p, name: "Javorová 2" }, noExtras),
    ).toEqual(ok);
    expect(property().sizeM2).toBe(20000);
  });

  it("a stored size of 54.55 m² blocks no write on that property, nor deleting it", async () => {
    await storeRaw("properties", "size_m2", 54.55, "javorova");
    expect(await store().setPropertyActive("javorova", false)).toEqual(ok);
    expect(await store().setPropertyActive("javorova", true)).toEqual(ok);
    const hc = store().portfolio!.holdingCosts.find(
      (h) => h.propertyId === "javorova",
    )!;
    expect(
      await store().saveHoldingCost({ ...hc, svjMonthly: money("900") }),
    ).toEqual(ok);
    expect(
      await store().addLease({
        id: "l-new",
        propertyId: "javorova",
        startDate: isoDate("2031-01-01"),
        monthlyRent: money("20000"),
      }),
    ).toEqual(ok);
    expect(
      await store().editProperty(
        { ...property(), name: "Javorová 2" },
        noExtras,
      ),
    ).toEqual(ok);
    expect(property().sizeM2).toBe(54.55);
    expect(await store().removeProperty("javorova")).toEqual(ok);
    expect(store().portfolio!.properties).toHaveLength(2);
  });

  it("with two blocks stored at 60, a change names only the changed block", async () => {
    await storeRaw("mortgage_blocks", "fixation_years", 60, "m-javorova");
    await storeRaw("mortgage_blocks", "fixation_years", 60, "m-lipova");
    expect(
      await store().saveMortgageBlock({
        ...block("m-lipova"),
        fixationYears: 70,
      }),
    ).toMatchObject(refused("fixationYears", 70));
    const r = await store().saveMortgageBlock({
      ...block("m-lipova"),
      fixationYears: 70,
    });
    expect(r.ok ? [] : (r.error as { ranges?: unknown[] }).ranges).toHaveLength(
      1,
    );
    expect(
      await store().saveMortgageBlock({
        ...block(),
        interestRatePa: rate("0.02"),
      }),
    ).toEqual(ok);
  });

  it("a stored horizon of 150 does not block an inflation edit", async () => {
    await storeRaw("assumptions", "horizon_years", 150);
    expect(
      await store().saveAssumptions({
        ...store().assumptions!,
        inflationPa: rate("0.03"),
      }),
    ).toEqual(ok);
    expect(store().assumptions!.horizonYears).toBe(150);
  });

  it("after Restore anyway with a fixation of 60, a lease saves", async () => {
    const file = await exportToJson(portfolioDb.get()!, new Date());
    const rows = (file.tables.mortgage_blocks as Record<string, unknown>[]).map(
      (r) => (r.id === "m-javorova" ? { ...r, fixation_years: 60 } : r),
    );
    unwrap(
      await store().restoreBackup({
        ...file,
        tables: { ...file.tables, mortgage_blocks: rows },
      }),
    );
    expect(block().fixationYears).toBe(60);
    expect(
      await store().addLease({
        id: "l-new",
        propertyId: "javorova",
        startDate: isoDate("2031-01-01"),
        monthlyRent: money("20000"),
      }),
    ).toEqual(ok);
  });

  it("CSV import adds a property while a fixation of 60 is stored", async () => {
    await storeRaw("mortgage_blocks", "fixation_years", 60, "m-javorova");
    const report = unwrap(
      await importNow({
        properties: parseProperties(
          "name,purchase_date,purchase_price\nCSV Import,2020-01-01,1000000",
        ).rows,
      }),
    );
    expect(report.items.map((i) => i.kind)).toEqual(["add"]);
  });

  it("a horizon of 0 gives the engine rule only", async () => {
    const r = await store().saveAssumptions({
      ...store().assumptions!,
      horizonYears: 0,
    });
    expect(r).toEqual({
      ok: false,
      error: {
        kind: "input",
        errors: [expect.objectContaining({ code: "HORIZON_NOT_POSITIVE" })],
      },
    });
    expect(store().error).toBeNull();
  });
});

// #464: what the store does at and past the form bounds.
describe("the store at and past the form bounds", () => {
  beforeEach(async () => {
    await start();
  });

  const firstBlock = () => store().portfolio!.mortgages[0]!;

  it("refuses a horizon of 150 years (ADR 0245)", async () => {
    const a = store().assumptions!;
    expect(
      await store().saveAssumptions({ ...a, horizonYears: 150 }),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [],
        ranges: [{ field: "horizonYears", value: 150 }],
      },
    });
    expect(store().assumptions!.horizonYears).toBe(30);
  });

  it("refuses a fixation of 60 and a loan term of 60 years (ADR 0245)", async () => {
    expect(
      await store().saveMortgageBlock({
        ...firstBlock(),
        fixationYears: 60,
        loanTermYears: 60,
      }),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [],
        ranges: [
          { field: "fixationYears", value: 60 },
          { field: "loanTermYears", value: 60 },
        ],
      },
    });
  });

  it("refuses a loan term of 0.5 years", async () => {
    expect(
      await store().saveMortgageBlock({ ...firstBlock(), loanTermYears: 0.5 }),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "INVALID_TERM", field: "loanTermYears" }],
      },
    });
  });

  it("refuses a property of 20 000 m² (ADR 0245)", async () => {
    expect(
      await store().addProperty(
        {
          id: "p-big",
          name: "Big",
          purchaseDate: isoDate("2030-01-01"),
          purchasePrice: money("5000000"),
          sizeM2: 20000,
        },
        { id: "hc-big", propertyId: "p-big" },
        { address: null, garage: null },
      ),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [],
        ranges: [{ field: "sizeM2", value: 20000 }],
      },
    });
  });

  it("refuses a shock lasting 0, 500 or −1 years (ADR 0257)", async () => {
    const scenario = (durationYears: number) => ({
      id: "s1",
      name: "Shock",
      overrides: { rateShock: { deltaPa: rate("0.01"), durationYears } },
    });
    // ADR 0257: 0 and 500 are outside SHOCK_YEARS; −1 is the engine's own rule.
    expect(await store().addScenario(scenario(0))).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [],
        ranges: [{ field: "rateShockYears", value: 0 }],
      },
    });
    expect(await store().saveScenario(scenario(500))).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [],
        ranges: [{ field: "rateShockYears", value: 500 }],
      },
    });
    expect(await store().saveScenario(scenario(-1))).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "SHOCK_OUT_OF_RANGE", field: "rateShock" }],
      },
    });
  });
});

const rateShock = (durationYears: number): ScenarioOverrides => ({
  rateShock: { deltaPa: rate("0.01"), durationYears },
});
const inflationShock = (durationYears: number): ScenarioOverrides => ({
  inflationShock: { deltaPa: rate("0.01"), durationYears },
});
const crash = (atYear: number): ScenarioOverrides => ({
  valueShock: { pct: rate("0.1"), atYear },
});
const scenario = (
  overrides: ScenarioOverrides,
  id = "s-new",
  name = "What if",
): Scenario => ({ id, name, overrides });

/** The refusal of one out-of-range year on the scenario form's `field`. */
const refusedYear = (field: string, value: number) => ({
  ok: false,
  error: {
    kind: "input",
    errors: [],
    ranges: [{ code: "OUT_OF_RANGE", entity: "scenario", field, value }],
  },
});

/** Store `s` past the store's rules, as a restored file can (ADR 0148). */
async function storeRawScenario(s: Scenario): Promise<void> {
  await upsertScenario(portfolioDb.get()!, s, new Date());
  await store().refresh();
}

const stored = (id: string) => store().scenarios.find((s) => s.id === id);

// ADR 0257 §1: a write that adds a shock or crash year outside SHOCK_YEARS / CRASH_YEAR,
// or changes a stored one to another, is refused after the engine rules.
describe("a shock or crash year a scenario write adds is refused", () => {
  beforeEach(async () => {
    await start();
  });

  it("refuses a rate shock of 0 or 101 years and writes nothing", async () => {
    const before = store().scenarios.length;
    expect(await store().addScenario(scenario(rateShock(0)))).toMatchObject(
      refusedYear("rateShockYears", 0),
    );
    expect(await store().addScenario(scenario(rateShock(101)))).toMatchObject(
      refusedYear("rateShockYears", 101),
    );
    expect(store().scenarios).toHaveLength(before);
  });

  it("refuses an inflation shock of 101 years", async () => {
    expect(
      await store().addScenario(scenario(inflationShock(101))),
    ).toMatchObject(refusedYear("inflationShockYears", 101));
  });

  it("refuses a crash at year 101", async () => {
    expect(await store().addScenario(scenario(crash(101)))).toMatchObject(
      refusedYear("valueShockYear", 101),
    );
  });

  it("names the range the form uses", async () => {
    const r = await store().addScenario(scenario(rateShock(500)));
    expect(r).toMatchObject({
      ok: false,
      error: { ranges: [{ range: SHOCK_YEARS }] },
    });
    const c = await store().addScenario(scenario(crash(500)));
    expect(c).toMatchObject({
      ok: false,
      error: { ranges: [{ range: CRASH_YEAR }] },
    });
  });

  it("saves the limits themselves: 1 and 100 years, a crash at 0 and at 100", async () => {
    expect(await store().addScenario(scenario(rateShock(1), "s-a"))).toEqual(
      ok,
    );
    expect(
      await store().addScenario(scenario(inflationShock(100), "s-b")),
    ).toEqual(ok);
    expect(await store().addScenario(scenario(crash(0), "s-c"))).toEqual(ok);
    expect(await store().addScenario(scenario(crash(100), "s-d"))).toEqual(ok);
  });

  it("refuses a save that moves a stored year out of range", async () => {
    expect(await store().addScenario(scenario(rateShock(5)))).toEqual(ok);
    expect(await store().saveScenario(scenario(rateShock(150)))).toMatchObject(
      refusedYear("rateShockYears", 150),
    );
    expect(stored("s-new")!.overrides.rateShock!.durationYears).toBe(5);
  });

  it("runs the engine rules first: −1 years is the engine's refusal only", async () => {
    expect(await store().addScenario(scenario(rateShock(-1)))).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "SHOCK_OUT_OF_RANGE", field: "rateShock" }],
      },
    });
    const r = await store().addScenario(scenario(rateShock(-1)));
    expect(r.ok === false && r.error.kind === "input" && r.error.ranges).toBe(
      undefined,
    );
  });
});

// ADR 0257: a stored out-of-range year still loads; a duplicate is compared with its
// source.
describe("a stored out-of-range year blocks no other write", () => {
  beforeEach(async () => {
    await start();
  });
  beforeEach(async () => {
    await storeRawScenario(
      scenario({ ...rateShock(150), ...crash(120) }, "s-old"),
    );
  });

  it("loads", () => {
    expect(stored("s-old")!.overrides.rateShock!.durationYears).toBe(150);
    expect(stored("s-old")!.overrides.valueShock!.atYear).toBe(120);
  });

  it("saves a rename that leaves the years as they are", async () => {
    const s = stored("s-old")!;
    expect(await store().saveScenario({ ...s, name: "Renamed" })).toEqual(ok);
    expect(stored("s-old")!.name).toBe("Renamed");
  });

  it("saves another field changed", async () => {
    const s = stored("s-old")!;
    expect(
      await store().saveScenario({
        ...s,
        overrides: { ...s.overrides, appreciationPa: rate("0.02") },
      }),
    ).toEqual(ok);
  });

  it("refuses a change to another out-of-range year", async () => {
    const s = stored("s-old")!;
    expect(
      await store().saveScenario({
        ...s,
        overrides: { ...s.overrides, ...rateShock(160) },
      }),
    ).toMatchObject(refusedYear("rateShockYears", 160));
  });

  it("saves a fix", async () => {
    const s = stored("s-old")!;
    expect(
      await store().saveScenario({
        ...s,
        overrides: { ...s.overrides, ...rateShock(10) },
      }),
    ).toEqual(ok);
    expect(stored("s-old")!.overrides.rateShock!.durationYears).toBe(10);
  });

  it("duplicates it: the copy is compared with its source", async () => {
    expect(await store().duplicateScenario("s-old", "s-copy", "Copy")).toEqual(
      ok,
    );
    expect(stored("s-copy")!.overrides.rateShock!.durationYears).toBe(150);
  });

  it("refuses the same out-of-range year in a new scenario", async () => {
    expect(
      await store().addScenario(scenario(rateShock(150), "s-other")),
    ).toMatchObject(refusedYear("rateShockYears", 150));
  });
});

// ADR 0257.
describe("the scenario form shows the refusal on its own field", () => {
  beforeEach(async () => {
    await start();
  });

  it("puts forms.intRange with the year range on the years field", async () => {
    const r = await store().addScenario(
      scenario({ ...rateShock(0), ...inflationShock(101), ...crash(101) }),
    );
    if (r.ok) throw new Error("expected a refusal");
    expect(scenarioWriteErrors(en, r.error)).toEqual({
      fieldErrors: {
        inflationShockYears: "Must be a whole number from 1 to 100",
        rateShockYears: "Must be a whole number from 1 to 100",
        valueShockYear: "Must be a whole number from 0 to 100",
      },
      formError: null,
    });
  });
});

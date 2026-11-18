// ADR 0257 §1: the store refuses a scenario write that adds a shock or crash year outside
// SHOCK_YEARS / CRASH_YEAR, or changes a stored one to another, after the engine rules. A
// stored out-of-range year (restore, "Restore anyway") still loads and blocks no other
// write; a duplicate is compared with its source.
import { beforeEach, describe, expect, it } from "vitest";
import { usePortfolioStore, type MutationResult } from "../portfolioStore";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { upsertScenario } from "../../data/repositories";
import { scenarioToRow } from "../../data/mappers";
import { rate, type Scenario, type ScenarioOverrides } from "../../engine";
import { CRASH_YEAR, SHOCK_YEARS } from "../../lib/rules";
import { scenarioWriteErrors } from "../../ui/model/scenarioForm";
import { en } from "../../i18n/en";
import type { Sql } from "../../data/sql";

async function openSeeded(): Promise<Sql> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  return sql;
}

const store = () => usePortfolioStore.getState();
const ok: MutationResult = { ok: true };

beforeEach(async () => {
  await store().init(openSeeded);
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
const refused = (field: string, value: number) => ({
  ok: false,
  error: {
    kind: "input",
    errors: [],
    ranges: [{ code: "OUT_OF_RANGE", entity: "scenario", field, value }],
  },
});

/** Store `s` past the store's rules, as a restored file can (ADR 0148). */
async function storeRaw(s: Scenario): Promise<void> {
  await upsertScenario(store().sql!, scenarioToRow(s, new Date()));
  await store().refresh();
}

const stored = (id: string) => store().scenarios.find((s) => s.id === id);

describe("the store refuses a shock or crash year a scenario write adds (ADR 0257)", () => {
  it("refuses a rate shock of 0 or 101 years and writes nothing", async () => {
    const before = store().scenarios.length;
    expect(await store().addScenario(scenario(rateShock(0)))).toMatchObject(
      refused("rateShockYears", 0),
    );
    expect(await store().addScenario(scenario(rateShock(101)))).toMatchObject(
      refused("rateShockYears", 101),
    );
    expect(store().scenarios).toHaveLength(before);
  });

  it("refuses an inflation shock of 101 years", async () => {
    expect(
      await store().addScenario(scenario(inflationShock(101))),
    ).toMatchObject(refused("inflationShockYears", 101));
  });

  it("refuses a crash at year 101", async () => {
    expect(await store().addScenario(scenario(crash(101)))).toMatchObject(
      refused("valueShockYear", 101),
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
      refused("rateShockYears", 150),
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

describe("a stored out-of-range year blocks no other write (ADR 0257)", () => {
  beforeEach(async () => {
    await storeRaw(scenario({ ...rateShock(150), ...crash(120) }, "s-old"));
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
    ).toMatchObject(refused("rateShockYears", 160));
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
    ).toMatchObject(refused("rateShockYears", 150));
  });
});

describe("the scenario form shows the refusal on its own field (ADR 0257)", () => {
  it("puts forms.intRange with the year range on the years field", async () => {
    const r = await store().addScenario(
      scenario({ ...rateShock(0), ...inflationShock(101), ...crash(101) }),
    );
    if (r.ok) throw new Error("expected a refusal");
    expect(scenarioWriteErrors(en, r.error)).toEqual({
      fieldErrors: {
        inflationShockYears: "Enter a whole number from 1 to 100",
        rateShockYears: "Enter a whole number from 1 to 100",
        valueShockYear: "Enter a whole number from 0 to 100",
      },
      formError: null,
    });
  });
});

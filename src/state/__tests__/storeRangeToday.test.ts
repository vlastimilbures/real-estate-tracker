// #464: what the store does at and past the form bounds. After the engine rules it
// refuses a value outside the bounded ranges that a write adds (ADR 0245); scenario shock
// years are not range-checked.
import { beforeEach, describe, expect, it } from "vitest";
import { usePortfolioStore } from "../portfolioStore";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { isoDate, money, rate } from "../../engine";
import type { Sql } from "../../data/sql";

async function openSeeded(): Promise<Sql> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  return sql;
}

const store = () => usePortfolioStore.getState();
const block = () => store().portfolio!.mortgages[0]!;

beforeEach(async () => {
  await store().init(openSeeded);
});

describe("the store at and past the form bounds", () => {
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
        ...block(),
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
      await store().saveMortgageBlock({ ...block(), loanTermYears: 0.5 }),
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

  it("saves a shock lasting 0 or 500 years and refuses −1", async () => {
    const scenario = (durationYears: number) => ({
      id: "s1",
      name: "Shock",
      overrides: { rateShock: { deltaPa: rate("0.01"), durationYears } },
    });
    // Today's behaviour; a later ADR may change it (#464 part 4).
    expect(await store().addScenario(scenario(0))).toEqual({ ok: true });
    expect(await store().saveScenario(scenario(500))).toEqual({ ok: true });
    expect(await store().saveScenario(scenario(-1))).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "SHOCK_OUT_OF_RANGE", field: "rateShock" }],
      },
    });
  });
});

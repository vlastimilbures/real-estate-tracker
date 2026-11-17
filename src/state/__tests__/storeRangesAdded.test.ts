// ADR 0245: the store refuses a write that adds a value outside the bounded ranges, or
// changes a stored one to another, after the engine rules. A stored out-of-range value
// (ADR 0148: "Restore anyway") blocks no other write, and a fix saves.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { usePortfolioStore, type MutationResult } from "../portfolioStore";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { exportToJson } from "../../data/backup";
import { parseProperties } from "../../import/csv";
import { importNow } from "./support/importNow";
import { isoDate, money, rate } from "../../engine";
import type { Property } from "../../engine";
import type { Sql } from "../../data/sql";

vi.mocked(invoke).mockResolvedValue(undefined);

async function openSeeded(): Promise<Sql> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  return sql;
}

const store = () => usePortfolioStore.getState();
const block = (id = "m-javorova") =>
  store().portfolio!.mortgages.find((m) => m.id === id)!;
const property = (id = "javorova") =>
  store().portfolio!.properties.find((p) => p.id === id)!;
const noExtras = { address: null, garage: null };

beforeEach(async () => {
  await store().init(openSeeded);
});

/** The refusal of one out-of-range value on `field`. */
const refused = (
  field: string,
  value: number,
  code: "OUT_OF_RANGE" | "BEYOND_LIMIT" = "OUT_OF_RANGE",
) => ({
  ok: false,
  error: { kind: "input", errors: [], ranges: [{ code, field, value }] },
});

const ok: MutationResult = { ok: true };

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
  await store().sql!.execute(
    `UPDATE ${table} SET ${column} = ${value}${where}`,
  );
  await store().refresh();
}

describe("the store refuses an out-of-range value a write adds (ADR 0245)", () => {
  it.fails("refuses a fixation of 51 years", async () => {
    expect(
      await store().saveMortgageBlock({ ...block(), fixationYears: 51 }),
    ).toMatchObject(refused("fixationYears", 51));
    expect(block().fixationYears).toBe(10);
  });

  it.fails("refuses a loan term of 51 years", async () => {
    expect(
      await store().saveMortgageBlock({ ...block(), loanTermYears: 51 }),
    ).toMatchObject(refused("loanTermYears", 51));
    expect(block().loanTermYears).toBeUndefined();
  });

  it.fails(
    "refuses a horizon of 101 years, and 1001 beyond the limit",
    async () => {
      const a = store().assumptions!;
      expect(
        await store().saveAssumptions({ ...a, horizonYears: 101 }),
      ).toMatchObject(refused("horizonYears", 101));
      expect(
        await store().saveAssumptions({ ...a, horizonYears: 1001 }),
      ).toMatchObject(refused("horizonYears", 1001, "BEYOND_LIMIT"));
      expect(store().assumptions!.horizonYears).toBe(30);
    },
  );

  it.fails("refuses a new property of 0.5, 54.55 or 10 000.5 m²", async () => {
    for (const size of [0.5, 54.55, 10000.5])
      expect(await addSized(size)).toMatchObject(refused("sizeM2", size));
    expect(store().portfolio!.properties).toHaveLength(3);
  });

  it.fails("refuses an edit to 20 000 m²", async () => {
    expect(
      await store().editProperty({ ...property(), sizeM2: 20000 }, noExtras),
    ).toMatchObject(refused("sizeM2", 20000));
    expect(property().sizeM2).toBe(71);
  });

  it.fails("refuses changing a stored fixation of 60 to 70", async () => {
    await storeRaw("mortgage_blocks", "fixation_years", 60, "m-javorova");
    expect(
      await store().saveMortgageBlock({ ...block(), fixationYears: 70 }),
    ).toMatchObject(refused("fixationYears", 70));
    expect(block().fixationYears).toBe(60);
  });

  it.fails("refuses changing a stored horizon of 150 to 120", async () => {
    await storeRaw("assumptions", "horizon_years", 150);
    const a = store().assumptions!;
    expect(
      await store().saveAssumptions({ ...a, horizonYears: 120 }),
    ).toMatchObject(refused("horizonYears", 120));
    expect(store().assumptions!.horizonYears).toBe(150);
  });
});

describe("a stored out-of-range value locks nothing out (ADR 0245 §2)", () => {
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
    const file = await exportToJson(store().sql!, new Date());
    const rows = (file.tables.mortgage_blocks as Record<string, unknown>[]).map(
      (r) => (r.id === "m-javorova" ? { ...r, fixation_years: 60 } : r),
    );
    await store().restoreBackup({
      ...file,
      tables: { ...file.tables, mortgage_blocks: rows },
    });
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
    const report = await importNow({
      properties: parseProperties(
        "name,purchase_date,purchase_price\nCSV Import,2020-01-01,1000000",
      ).rows,
    });
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

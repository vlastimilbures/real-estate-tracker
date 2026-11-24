// ADR 0252 (#444): the assumptions row is created on a true first run only. A database
// that lost it is not repaired from the sample values: loading it stops with ROW_INVALID.
import { describe, it, expect, afterEach } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import { SEED_ASSUMPTIONS, seedIfEmpty } from "../seed";
import { loadState } from "../repositories";
import { rate } from "../../engine";

let sql: TestSql;
afterEach(() => sql.db.close());

/** The app's launch recipe (`defaultOpen`, src/data/open.ts). */
async function launch(): Promise<boolean> {
  await migrate(sql);
  return seedIfEmpty(sql);
}

async function assumptionRows(): Promise<number> {
  return (await sql.select("SELECT id FROM assumptions")).length;
}

describe("a missing assumptions row (ADR 0252)", () => {
  it("is not re-created by a later launch", async () => {
    sql = openMemorySql();
    await launch();
    await sql.execute("DELETE FROM assumptions");

    expect(await launch()).toBe(false);
    expect(await assumptionRows()).toBe(0);
  });

  it("stops the load with ROW_INVALID naming the record", async () => {
    sql = openMemorySql();
    await launch();
    await sql.execute("DELETE FROM assumptions");
    await launch();

    await expect(loadState(sql)).rejects.toMatchObject({
      name: "DataError",
      code: "ROW_INVALID",
      details: ["assumptions 1: row not found"],
    });
  });

  it("is not created for a pre-flag database that has properties", async () => {
    sql = openMemorySql();
    await launch();
    await sql.execute("DELETE FROM assumptions");
    await sql.execute("DELETE FROM app_meta WHERE key = 'sample_seeded'");

    expect(await launch()).toBe(false);
    expect(await assumptionRows()).toBe(0);
  });
});

describe("guards: the row still exists where it should", () => {
  it("a fresh database seeds the sample assumptions and loads", async () => {
    sql = openMemorySql();
    expect(await launch()).toBe(true);

    expect(await assumptionRows()).toBe(1);
    const state = await loadState(sql);
    // The seed leaves sellingCostPct to the column default, 0.
    expect(state.assumptions).toEqual({
      ...SEED_ASSUMPTIONS,
      sellingCostPct: rate("0"),
    });
  });

  it("an emptied portfolio that keeps its row loads", async () => {
    sql = openMemorySql();
    await launch();
    await sql.execute("DELETE FROM properties");

    expect(await launch()).toBe(false);
    const state = await loadState(sql);
    expect(state.portfolio.properties).toEqual([]);
    expect(state.assumptions).toEqual({
      ...SEED_ASSUMPTIONS,
      sellingCostPct: rate("0"),
    });
  });
});

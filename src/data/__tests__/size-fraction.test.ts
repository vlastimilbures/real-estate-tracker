// ADR 0236 §2: a size with one decimal place is stored exactly as entered. The column is
// `size_m2 INTEGER` without STRICT or a CHECK, so SQLite's INTEGER affinity keeps 54.5 as
// REAL; the read path decodes by storage class and the guards pass the number through.
// This pins that no schema step is needed.
import { describe, it, expect, afterAll } from "vitest";
import { openMemorySql } from "./betterSqlite";
import { migrate } from "../migrations";
import { upsertAssumptions } from "../repositories";
import { SEED_ASSUMPTIONS } from "../seed";
import { propertyToRow } from "../mappers";
import type { Property } from "../../engine";
import { isoDate, money } from "../../engine";
import { insertProperty, loadPortfolio } from "./support/reads";

const sql = openMemorySql();
afterAll(() => sql.db.close());

const property: Property = {
  active: true,
  id: "p-half",
  name: "Half-metre flat",
  purchaseDate: isoDate("2020-01-01"),
  purchasePrice: money("5000000"),
  sizeM2: 54.5,
};

describe("size with one decimal place round-trips through SQLite (ADR 0236 §2)", () => {
  it("stores 54.5 as REAL and loads it back as 54.5", async () => {
    await migrate(sql);
    await upsertAssumptions(sql, SEED_ASSUMPTIONS);
    await insertProperty(
      sql,
      propertyToRow(property, { address: null, garage: null }),
    );
    const [stored] = await sql.select<{ t: string; v: number }>(
      "SELECT typeof(size_m2) AS t, size_m2 AS v FROM properties WHERE id = ?",
      ["p-half"],
    );
    expect(stored).toEqual({ t: "real", v: 54.5 });
    const portfolio = await loadPortfolio(sql);
    const loaded = portfolio.properties.find((p) => p.id === "p-half");
    expect(loaded?.sizeM2).toBe(54.5);
  });
});

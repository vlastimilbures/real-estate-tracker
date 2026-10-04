// ADR 0119: migration v10 adds the nullable funding columns own_cash, transaction_costs,
// initial_works and funding_note to properties. Forward-only, on a synthetic v9
// database: existing properties keep NULL (funding unknown, same numbers); the mapper
// round-trips the record; a negative amount is refused.
import { describe, it, expect } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { schemaAt } from "./schemaAt";
import { migrate } from "../migrations";
import { insertProperty, loadPortfolio } from "../repositories";
import { propertyToRow, rowToProperty, type PropertyRow } from "../mappers";
import { DataError } from "../errors";
import { isoDate, money, type Property } from "../../engine";

const property: Property = {
  id: "p1",
  name: "Flat One",
  purchaseDate: isoDate("2023-02-01"),
  purchasePrice: money("6375000"),
};

const funded: Property = {
  ...property,
  funding: {
    ownCash: money("1500000.5"),
    transactionCosts: money("95000"),
    initialWorks: money("0"),
    note: "Deposit from the sale of the old flat",
  },
};

async function migrated(): Promise<TestSql> {
  const sql = openMemorySql();
  await migrate(sql);
  return sql;
}

const text = (f: Property["funding"]) => ({
  ownCash: f?.ownCash?.toString(),
  transactionCosts: f?.transactionCosts?.toString(),
  initialWorks: f?.initialWorks?.toString(),
  note: f?.note,
});

describe("migration v10 — acquisition funding (ADR 0119)", () => {
  it("upgrades a v9 database, keeping its properties with funding unknown", async () => {
    const sql = await schemaAt(9);
    await sql.execute(
      "INSERT INTO properties (id, name, purchase_date, purchase_price) VALUES ('p1', 'Flat One', '2023-02-01', '6375000')",
    );
    await migrate(sql);

    const [row] = await sql.select<Record<string, unknown>>(
      "SELECT own_cash, transaction_costs, initial_works, funding_note FROM properties",
    );
    expect(row).toEqual({
      own_cash: null,
      transaction_costs: null,
      initial_works: null,
      funding_note: null,
    });
    const [p] = (await loadPortfolio(sql)).properties;
    expect(p.funding).toBeUndefined();
    sql.db.close();
  });

  it("stores and loads a full record, exactly", async () => {
    const sql = await migrated();
    await insertProperty(sql, propertyToRow(funded));
    const [p] = (await loadPortfolio(sql)).properties;
    expect(text(p.funding)).toEqual({
      ownCash: "1500000.5",
      transactionCosts: "95000",
      initialWorks: "0",
      note: "Deposit from the sale of the old flat",
    });
    sql.db.close();
  });

  it.each(["own_cash", "transaction_costs", "initial_works"])(
    "refuses a negative %s",
    async (column) => {
      const sql = await migrated();
      await expect(
        insertProperty(sql, { ...propertyToRow(property), [column]: "-1" }),
      ).rejects.toThrow(`property_${column}_not_negative`);
      sql.db.close();
    },
  );
});

describe("mapper — acquisition funding", () => {
  const row = propertyToRow(property);
  const reason = (patch: Partial<PropertyRow>) => {
    try {
      rowToProperty({ ...row, ...patch });
    } catch (e) {
      expect(e).toBeInstanceOf(DataError);
      return (e as DataError).details.join(" ");
    }
    throw new Error("expected a DataError");
  };

  it("writes NULL for every unknown part", () => {
    expect(row).toMatchObject({
      own_cash: null,
      transaction_costs: null,
      initial_works: null,
      funding_note: null,
    });
    expect(propertyToRow({ ...property, funding: {} })).toEqual(row);
    expect(rowToProperty(row).funding).toBeUndefined();
  });

  it("round-trips a full record through row ⇄ property", () => {
    const back = rowToProperty(propertyToRow(funded));
    expect(text(back.funding)).toEqual(text(funded.funding));
    expect(propertyToRow(back)).toEqual(propertyToRow(funded));
  });

  it("keeps a partial record partial (unknown is not 0)", () => {
    const partial = rowToProperty({ ...row, transaction_costs: "120000" });
    expect(text(partial.funding)).toEqual({
      ownCash: undefined,
      transactionCosts: "120000",
      initialWorks: undefined,
      note: undefined,
    });
    expect(
      rowToProperty({ ...row, funding_note: "Inherited" }).funding,
    ).toEqual({ note: "Inherited" });
  });

  it.each([
    [{ own_cash: "lots" }, "own_cash is not a finite decimal number"],
    [
      { initial_works: "Infinity" },
      "initial_works is not a finite decimal number",
    ],
    [{ funding_note: 42 as unknown as string }, "funding_note is not text"],
  ] as [Partial<PropertyRow>, string][])(
    "rejects a corrupt row (%j)",
    (patch, message) => {
      expect(reason(patch)).toContain(`properties p1: ${message}`);
    },
  );
});

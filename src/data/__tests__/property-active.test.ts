// setPropertyActive is a *targeted* column update so toggling activation does not
// clobber the address/garage columns that rowToProperty drops (and a full
// updateProperty round-trip would null). This locks down that contract.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import { insertProperty, setPropertyActive } from "../repositories";
import { propertyToRow } from "../mappers";
import type { Property, IsoDate } from "../../engine";
import { money } from "../../engine";

let sql: TestSql;

const property: Property = {
  id: "p1",
  name: "Test flat",
  purchaseDate: new Date(Date.UTC(2020, 0, 1)) as IsoDate,
  purchasePrice: money("5000000"),
};

beforeAll(async () => {
  sql = openMemorySql();
  await migrate(sql);
  await insertProperty(
    sql,
    propertyToRow(property, { address: "Main St 1", garage: true }),
  );
});

afterAll(() => sql.db.close());

const readRow = async () =>
  (
    await sql.select<{
      active: number;
      address: string | null;
      garage: number | null;
    }>("SELECT active, address, garage FROM properties WHERE id = ?", ["p1"])
  )[0];

describe("setPropertyActive preserves address & garage", () => {
  it("starts active with address & garage intact", async () => {
    const r = await readRow();
    expect(r.active).toBe(1);
    expect(r.address).toBe("Main St 1");
    expect(r.garage).toBe(1);
  });

  it("deactivate flips active but keeps address & garage", async () => {
    await setPropertyActive(sql, "p1", false);
    const r = await readRow();
    expect(r.active).toBe(0);
    expect(r.address).toBe("Main St 1");
    expect(r.garage).toBe(1);
  });

  it("reactivate restores active, still keeping address & garage", async () => {
    await setPropertyActive(sql, "p1", true);
    const r = await readRow();
    expect(r.active).toBe(1);
    expect(r.address).toBe("Main St 1");
    expect(r.garage).toBe(1);
  });
});

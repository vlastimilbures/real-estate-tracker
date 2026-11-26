// setPropertyActive is a *targeted* column update so toggling activation does not
// clobber the address/garage columns that rowToProperty drops (and a full
// updateProperty round-trip would null). This locks down that contract.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import { setPropertyActive } from "../repositories";
import { propertyToRow, rowToProperty } from "../mappers";
import type { Property, IsoDate } from "../../engine";
import { money } from "../../engine";
import { insertProperty } from "./support/reads";

let sql: TestSql;

const property: Property = {
  active: true,
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

// The engine's `active` is required (#480): a missing flag counts as active here, at the
// mapper, and nowhere downstream. A restore of a backup without the column fills 1
// (restore.test, "restores a legacy v1 file").
describe("rowToProperty reads the active flag", () => {
  const row = propertyToRow(property, { address: null, garage: null });
  it.each([
    [1, true],
    [0, false],
    [null, true],
  ] as const)(
    "reads %s as %s (NULL: a legacy row, active)",
    (stored, active) => {
      expect(rowToProperty({ ...row, active: stored }).active).toBe(active);
    },
  );
});

// #629 review: the type makes `active` required, but a value that skipped it (a cast, an
// untyped caller) must still write active, never quietly deactivate the property.
describe("propertyToRow writes the active flag", () => {
  const extras = { address: null, garage: null };
  it.each([
    [true, 1],
    [false, 0],
    [undefined, 1],
  ] as const)("writes %s as %s", (active, stored) => {
    const p = { ...property, active } as unknown as Property;
    expect(propertyToRow(p, extras).active).toBe(stored);
  });
});

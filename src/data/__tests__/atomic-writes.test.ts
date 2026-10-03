// P5a step 1 (H-07, D-14): every multi-statement write is all-or-nothing. A statement
// that fails part-way leaves the database exactly as it was.
import { describe, it, expect } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import { seedIfEmpty } from "../seed";
import {
  loadAssumptions,
  upsertAssumptions,
  insertPropertyWithCosts,
  updateValuation,
  deleteLease,
  setPropertyActive,
  updateHoldingCost,
} from "../repositories";
import { DataError } from "../errors";
import { propertyToRow, holdingCostToRow } from "../mappers";
import type { Sql } from "../sql";
import { isoDate } from "../../engine";
import { money } from "../../engine";

/** Wraps a Sql so that any statement matching `pattern` fails — whether it is sent on
 *  its own or inside a transaction (where it fails the whole transaction). */
function failOn(inner: TestSql, pattern: RegExp): Sql {
  const boom = { query: "INSERT INTO no_such_table VALUES (1)" };
  return {
    execute: (q, p) =>
      pattern.test(q)
        ? Promise.reject(new Error("injected failure"))
        : inner.execute(q, p),
    select: (q, p) => inner.select(q, p),
    selectSnapshot: (statements) => inner.selectSnapshot(statements),
    transaction: (statements, options) =>
      inner.transaction(
        statements.map((s) => (pattern.test(s.query) ? boom : s)),
        options,
      ),
    backup: (label) => inner.backup(label),
  };
}

async function ready(): Promise<TestSql> {
  const sql = openMemorySql();
  await migrate(sql);
  return sql;
}

const count = async (sql: Sql, table: string) =>
  Number(
    (await sql.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0]
      .n,
  );

describe("atomic writes", () => {
  it("seeding fails as a whole: no half-seeded sample portfolio", async () => {
    const sql = await ready();
    await expect(
      seedIfEmpty(failOn(sql, /INSERT INTO leases/)),
    ).rejects.toThrow();
    expect(await count(sql, "properties")).toBe(0);
    expect(await count(sql, "mortgage_blocks")).toBe(0);
    // The run can simply be repeated.
    expect(await seedIfEmpty(sql)).toBe(true);
    expect(await count(sql, "properties")).toBe(3);
  });

  it("saving assumptions never leaves the database without its assumptions row", async () => {
    const sql = await ready();
    await seedIfEmpty(sql);
    const before = await loadAssumptions(sql);
    await expect(
      upsertAssumptions(failOn(sql, /INSERT INTO assumptions/), {
        ...before,
        horizonYears: 10,
      }),
    ).rejects.toThrow();
    expect(await loadAssumptions(sql)).toEqual(before);
  });

  it("adding a property and its holding costs is one write", async () => {
    const sql = await ready();
    const p = {
      id: "p-new",
      name: "New flat",
      purchaseDate: isoDate("2025-01-01"),
      purchasePrice: money("5000000"),
    };
    await expect(
      insertPropertyWithCosts(
        failOn(sql, /INSERT INTO holding_costs/),
        propertyToRow(p),
        holdingCostToRow({ id: "hc-p-new", propertyId: "p-new" }),
      ),
    ).rejects.toThrow();
    expect(await count(sql, "properties")).toBe(0);

    await insertPropertyWithCosts(
      sql,
      propertyToRow(p),
      holdingCostToRow({ id: "hc-p-new", propertyId: "p-new" }),
    );
    expect(await count(sql, "properties")).toBe(1);
    expect(await count(sql, "holding_costs")).toBe(1);
  });

  it("deleting a property cascades to all its rows through the FK constraints", async () => {
    const sql = await ready();
    await seedIfEmpty(sql);
    const [{ id }] = await sql.select<{ id: string }>(
      "SELECT property_id AS id FROM mortgage_blocks LIMIT 1",
    );
    await sql.execute("DELETE FROM properties WHERE id = ?", [id]);
    for (const t of [
      "mortgage_blocks",
      "valuations",
      "leases",
      "holding_costs",
    ]) {
      const rows = await sql.select(
        `SELECT 1 FROM ${t} WHERE property_id = ?`,
        [id],
      );
      expect(rows, t).toHaveLength(0);
    }
  });
});

describe("writes to a record that no longer exists (DR-082)", () => {
  it.each([
    [
      "update",
      (sql: Sql) =>
        updateValuation(sql, {
          id: "gone",
          propertyId: "p",
          validFrom: isoDate("2026-01-01"),
          marketValue: money("1"),
        }),
    ],
    ["delete", (sql: Sql) => deleteLease(sql, "gone")],
    ["deactivate", (sql: Sql) => setPropertyActive(sql, "gone", false)],
  ])("%s of a missing id is an error, not a silent success", async (_l, op) => {
    const sql = await ready();
    const e = await op(sql).then(
      () => null,
      (err: unknown) => err,
    );
    expect(e).toBeInstanceOf(DataError);
    expect((e as DataError).code).toBe("ROW_MISSING");
  });
});

describe("saving holding costs", () => {
  it("creates the row when the property has none, instead of silently saving nothing", async () => {
    const sql = await ready();
    await sql.execute(
      "INSERT INTO properties (id, name, purchase_date, purchase_price) VALUES ('p1', 'P', '2025-01-01', '1')",
    );
    await updateHoldingCost(sql, {
      id: "hc-new",
      propertyId: "p1",
      insuranceYr: money("3000"),
    });
    const rows = await sql.select<{
      property_id: string;
      insurance_yr: string;
    }>("SELECT property_id, insurance_yr FROM holding_costs");
    expect(rows).toEqual([{ property_id: "p1", insurance_yr: "3000" }]);
    // Saving again updates that one row (one holding-costs row per property).
    await updateHoldingCost(sql, {
      id: "hc-new",
      propertyId: "p1",
      insuranceYr: money("3500"),
    });
    expect(await count(sql, "holding_costs")).toBe(1);
  });
});

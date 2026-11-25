// #471: one write convention. Every write takes engine values, and one runner sends a
// single statement through `execute` (with the DR-082 row-missing check for an update or
// delete by id) and several through `transaction` (D-14).
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openMemorySql } from "./betterSqlite";
import { migrate } from "../migrations";
import { seedIfEmpty } from "../seed";
import {
  deleteLease,
  insertLease,
  insertPropertyWithCosts,
  upsertAssumptions,
  upsertHoldingCost,
  upsertScenario,
} from "../repositories";
import { loadState } from "../loadState";
import { isoDate, money, rate } from "../../engine";
import type { Sql } from "../sql";
import { noExtras } from "./support/noExtras";

async function recorded() {
  const db = openMemorySql();
  await migrate(db);
  await seedIfEmpty(db);
  const calls: string[] = [];
  const sql: Sql = {
    ...db,
    execute: (q, p) => {
      calls.push("execute");
      return db.execute(q, p);
    },
    transaction: (s) => {
      calls.push(`transaction ${s.length}`);
      return db.transaction(s);
    },
  };
  return { db, sql, calls };
}

describe("one write convention (#471)", () => {
  it("one statement goes through execute, several through one transaction", async () => {
    const { sql, calls } = await recorded();
    const lease = {
      id: "l-x",
      propertyId: "javorova",
      startDate: isoDate("2030-01-01"),
      monthlyRent: money("1"),
    };
    await insertLease(sql, lease);
    await insertPropertyWithCosts(
      sql,
      {
        id: "p-x",
        name: "X",
        purchaseDate: isoDate("2020-01-01"),
        purchasePrice: money("1"),
      },
      noExtras,
      { id: "hc-p-x", propertyId: "p-x" },
    );
    const { assumptions } = await loadState(sql);
    await upsertAssumptions(sql, assumptions);
    await upsertScenario(
      sql,
      { id: "s", name: "S", overrides: { appreciationPa: rate("0.01") } },
      new Date("2026-01-01T00:00:00Z"),
    );
    await deleteLease(sql, "l-x");
    expect(calls).toEqual([
      "execute",
      "transaction 2",
      "transaction 2",
      "execute",
      "execute",
    ]);
  });

  it("a delete by id that hits no row is ROW_MISSING", async () => {
    const { sql } = await recorded();
    await expect(deleteLease(sql, "nope")).rejects.toMatchObject({
      code: "ROW_MISSING",
      details: ["leases nope"],
    });
  });

  it("upsertHoldingCost inserts a missing row and updates an existing one", async () => {
    const { db } = await recorded();
    await db.execute("DELETE FROM holding_costs WHERE property_id = ?", [
      "lipova",
    ]);
    const cost = {
      id: "hc-new",
      propertyId: "lipova",
      svjMonthly: money("900"),
    };
    await upsertHoldingCost(db, cost);
    await upsertHoldingCost(db, {
      ...cost,
      id: "ignored",
      otherYr: money("5"),
    });
    const rows = await db.select(
      "SELECT id, svj_monthly, other_yr FROM holding_costs WHERE property_id = ?",
      ["lipova"],
    );
    expect(rows).toEqual([{ id: "hc-new", svj_monthly: "900", other_yr: "5" }]);
  });

  it("the store hands engine values to the data layer, never a mapped row", () => {
    const dir = join(__dirname, "../../state/portfolio");
    const sources = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => readFileSync(join(dir, f), "utf8"));
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) expect(src).not.toMatch(/\w+ToRow\b/);
  });
});

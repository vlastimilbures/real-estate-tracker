// ADR 0099: adding a valuation/lease and ending the previous open-ended one is one write.
import { describe, it, expect } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import {
  insertProperty,
  insertValuation,
  insertLease,
  insertValuationClosingPrevious,
  insertLeaseClosingPrevious,
  loadPortfolio,
} from "../repositories";
import { propertyToRow, valuationToRow, leaseToRow } from "../mappers";
import type { Sql } from "../sql";
import { isoDate, money, type Lease, type Valuation } from "../../engine";

/** Fails any statement matching `pattern`, including inside a transaction. */
function failOn(inner: TestSql, pattern: RegExp): Sql {
  const boom = { query: "INSERT INTO no_such_table VALUES (1)" };
  return {
    ...inner,
    transaction: (statements, options) =>
      inner.transaction(
        statements.map((s) => (pattern.test(s.query) ? boom : s)),
        options,
      ),
  };
}

const prevV: Valuation = {
  id: "v-old",
  propertyId: "p1",
  validFrom: isoDate("2025-01-01"),
  marketValue: money("5000000"),
};
const newV: Valuation = {
  id: "v-new",
  propertyId: "p1",
  validFrom: isoDate("2026-07-01"),
  marketValue: money("5500000"),
};
const prevL: Lease = {
  id: "l-old",
  propertyId: "p1",
  startDate: isoDate("2025-01-01"),
  monthlyRent: money("15000"),
};
const newL: Lease = {
  id: "l-new",
  propertyId: "p1",
  startDate: isoDate("2026-07-01"),
  monthlyRent: money("16000"),
};

async function ready(): Promise<TestSql> {
  const sql = openMemorySql();
  await migrate(sql);
  await insertProperty(
    sql,
    propertyToRow({
      id: "p1",
      name: "Flat",
      purchaseDate: isoDate("2024-01-01"),
      purchasePrice: money("4000000"),
    }),
  );
  await insertValuation(sql, valuationToRow(prevV));
  await insertLease(sql, leaseToRow(prevL));
  return sql;
}

const ended = (d: Date | undefined) => d?.toISOString().slice(0, 10);

describe("insert closing the previous record", () => {
  it("adds the valuation and ends the previous one", async () => {
    const sql = await ready();
    await insertValuationClosingPrevious(sql, newV, {
      ...prevV,
      validTo: isoDate("2026-06-30"),
    });
    const { valuations } = await loadPortfolio(sql);
    const byId = new Map(valuations.map((v) => [v.id, v]));
    expect(ended(byId.get("v-old")?.validTo)).toBe("2026-06-30");
    expect(byId.get("v-new")?.validTo).toBeUndefined();
  });

  it("adds the lease and ends the previous one", async () => {
    const sql = await ready();
    await insertLeaseClosingPrevious(sql, newL, {
      ...prevL,
      endDate: isoDate("2026-06-30"),
    });
    const { leases } = await loadPortfolio(sql);
    const byId = new Map(leases.map((l) => [l.id, l]));
    expect(ended(byId.get("l-old")?.endDate)).toBe("2026-06-30");
    expect(byId.get("l-new")?.endDate).toBeUndefined();
  });

  it("writes nothing when the end-date update fails", async () => {
    const sql = await ready();
    await expect(
      insertValuationClosingPrevious(failOn(sql, /UPDATE valuations/), newV, {
        ...prevV,
        validTo: isoDate("2026-06-30"),
      }),
    ).rejects.toThrow();
    await expect(
      insertLeaseClosingPrevious(failOn(sql, /UPDATE leases/), newL, {
        ...prevL,
        endDate: isoDate("2026-06-30"),
      }),
    ).rejects.toThrow();
    const { valuations, leases } = await loadPortfolio(sql);
    expect(valuations.map((v) => [v.id, v.validTo])).toEqual([
      ["v-old", undefined],
    ]);
    expect(leases.map((l) => [l.id, l.endDate])).toEqual([
      ["l-old", undefined],
    ]);
  });
});

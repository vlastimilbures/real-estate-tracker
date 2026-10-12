// ADR 0099: adding a valuation/lease and ending the previous open-ended one is one write.
import { describe, it, expect } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { failOn } from "./support/failOn";
import { migrate } from "../migrations";
import {
  insertProperty,
  insertValuation,
  insertLease,
  insertValuationClosingPrevious,
  insertLeaseClosingPrevious,
  loadPortfolio,
  updateLease,
  updateValuation,
} from "../repositories";
import { propertyToRow, valuationToRow, leaseToRow } from "../mappers";
import { isoDate, money, type Lease, type Valuation } from "../../engine";

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

  // ADR 0184 §2: the close writes only the end date, so a correction saved after the
  // prompt took its copy survives, and a record already closed keeps its end date.
  it("keeps a correction saved after the prompt took its copy", async () => {
    const sql = await ready();
    await updateValuation(sql, { ...prevV, marketValue: money("200") });
    await updateLease(sql, { ...prevL, monthlyRent: money("200") });
    await insertValuationClosingPrevious(sql, newV, {
      ...prevV,
      validTo: isoDate("2026-06-30"),
    });
    await insertLeaseClosingPrevious(sql, newL, {
      ...prevL,
      endDate: isoDate("2026-06-30"),
    });
    const { valuations, leases } = await loadPortfolio(sql);
    const v = valuations.find((x) => x.id === "v-old");
    const l = leases.find((x) => x.id === "l-old");
    expect(v?.marketValue.toString()).toBe("200");
    expect(ended(v?.validTo)).toBe("2026-06-30");
    expect(l?.monthlyRent.toString()).toBe("200");
    expect(ended(l?.endDate)).toBe("2026-06-30");
  });

  it("leaves a predecessor closed meanwhile with its own end date", async () => {
    const sql = await ready();
    await updateValuation(sql, { ...prevV, validTo: isoDate("2026-03-31") });
    await updateLease(sql, { ...prevL, endDate: isoDate("2026-03-31") });
    await insertValuationClosingPrevious(sql, newV, {
      ...prevV,
      validTo: isoDate("2026-06-30"),
    });
    await insertLeaseClosingPrevious(sql, newL, {
      ...prevL,
      endDate: isoDate("2026-06-30"),
    });
    const { valuations, leases } = await loadPortfolio(sql);
    expect(ended(valuations.find((x) => x.id === "v-old")?.validTo)).toBe(
      "2026-03-31",
    );
    expect(ended(leases.find((x) => x.id === "l-old")?.endDate)).toBe(
      "2026-03-31",
    );
  });
});

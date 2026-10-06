// ADR 0099: adding a valuation/lease can end the previous open-ended one in the same
// write. Both rows pass the engine input checks, and no computed number changes.
import { beforeEach, describe, expect, it } from "vitest";
import { usePortfolioStore } from "../portfolioStore";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import {
  dayBefore,
  isoDate,
  money,
  openPredecessor,
  portfolioOutputs,
  type Lease,
  type Valuation,
} from "../../engine";
import type { Sql } from "../../data/sql";

async function openSeeded(): Promise<Sql> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  return sql;
}

const store = () => usePortfolioStore.getState();
const pf = () => store().portfolio!;
const START = isoDate("2030-01-01");

/** A fresh seeded database. `init` alone is a no-op once the store is ready. */
async function reset() {
  usePortfolioStore.setState({
    sql: null,
    portfolio: null,
    assumptions: null,
    status: "idle",
    error: null,
    startupError: null,
  });
  await store().init(openSeeded);
}

beforeEach(reset);

/** The seed's first property that has an open-ended valuation before START. */
function openValuation(): Valuation {
  for (const p of pf().properties) {
    const prev = openPredecessor(
      pf().valuations,
      p.id,
      START,
      (v) => v.validFrom,
      (v) => v.validTo,
    );
    if (prev) return prev;
  }
  throw new Error("seed has no open-ended valuation");
}
function openLease(at = START): Lease {
  for (const p of pf().properties) {
    const prev = openPredecessor(
      pf().leases,
      p.id,
      at,
      (l) => l.startDate,
      (l) => l.endDate,
    );
    if (prev) return prev;
  }
  throw new Error("seed has no open-ended lease");
}

const outputs = () =>
  JSON.stringify(portfolioOutputs(pf(), store().assumptions!));

describe("add closing the previous record (ADR 0099)", () => {
  it("adds the valuation and ends the previous one the day before", async () => {
    const prev = openValuation();
    const v: Valuation = {
      id: "v-new",
      propertyId: prev.propertyId,
      validFrom: START,
      marketValue: money("15000000"),
    };
    const result = await store().addValuationClosingPrevious(v, {
      ...prev,
      validTo: dayBefore(START),
    });
    expect(result.ok).toBe(true);
    const old = pf().valuations.find((x) => x.id === prev.id)!;
    expect(old.validTo?.toISOString().slice(0, 10)).toBe("2029-12-31");
    expect(pf().valuations.some((x) => x.id === "v-new")).toBe(true);
  });

  it("adds the lease and ends the previous one the day before", async () => {
    const prev = openLease();
    const l: Lease = {
      id: "l-new",
      propertyId: prev.propertyId,
      startDate: START,
      monthlyRent: money("40000"),
    };
    const result = await store().addLeaseClosingPrevious(l, {
      ...prev,
      endDate: dayBefore(START),
    });
    expect(result.ok).toBe(true);
    const old = pf().leases.find((x) => x.id === prev.id)!;
    expect(old.endDate?.toISOString().slice(0, 10)).toBe("2029-12-31");
    expect(pf().leases.some((x) => x.id === "l-new")).toBe(true);
  });

  it("rejects an end date before the previous start and writes nothing", async () => {
    const prev = openValuation();
    const before = pf().valuations.length;
    const result = await store().addValuationClosingPrevious(
      {
        id: "v-new",
        propertyId: prev.propertyId,
        validFrom: START,
        marketValue: money("1"),
      },
      { ...prev, validTo: dayBefore(prev.validFrom) },
    );
    expect(result.ok).toBe(false);
    expect(pf().valuations).toHaveLength(before);
    expect(pf().valuations.find((x) => x.id === prev.id)!.validTo).toBe(
      undefined,
    );
  });

  it("computes the same outputs as the plain add", async () => {
    const prevV = openValuation();
    const prevL = openLease();
    const v: Valuation = {
      id: "v-new",
      propertyId: prevV.propertyId,
      validFrom: START,
      marketValue: money("15000000"),
    };
    const l: Lease = {
      id: "l-new",
      propertyId: prevL.propertyId,
      startDate: START,
      monthlyRent: money("40000"),
    };
    expect((await store().addValuation(v)).ok).toBe(true);
    expect((await store().addLease(l)).ok).toBe(true);
    const plain = outputs();

    await reset();
    expect(
      await store().addValuationClosingPrevious(v, {
        ...prevV,
        validTo: dayBefore(START),
      }),
    ).toEqual({ ok: true });
    expect(
      await store().addLeaseClosingPrevious(l, {
        ...prevL,
        endDate: dayBefore(START),
      }),
    ).toEqual({ ok: true });
    expect(outputs()).toBe(plain);
  });

  // ADR 0144: with a dated new lease, ending the previous one changes the numbers: after
  // the new lease ends, the previous open lease is back in force. So the UI does not offer
  // it. The dated lease ends before the seed's base date (2026-06-07), where outputs read
  // it. (A valuation's end date is not read since ADR 0122.)
  it("changes the outputs when the new lease has an end date", async () => {
    const from = isoDate("2026-01-01");
    const prev = openLease(from);
    const l: Lease = {
      id: "l-new",
      propertyId: prev.propertyId,
      startDate: from,
      endDate: isoDate("2026-03-31"),
      monthlyRent: money("40000"),
    };
    expect((await store().addLease(l)).ok).toBe(true);
    const plain = outputs();

    await reset();
    expect(
      await store().addLeaseClosingPrevious(l, {
        ...prev,
        endDate: dayBefore(from),
      }),
    ).toEqual({ ok: true });
    expect(outputs()).not.toBe(plain);
  });
});

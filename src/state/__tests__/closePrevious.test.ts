// ADR 0099: adding a valuation can end the previous open-ended one in the same write. Both
// rows pass the engine input checks, and no computed number changes.
// ADR 0163: leases of one apartment never overlap. Adding a lease ends the open lease
// before it the day before, and a write that would overlap another lease is refused.
import { beforeEach, describe, expect, it } from "vitest";
import { usePortfolioStore, type MutationResult } from "../portfolioStore";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { insertLease } from "../../data/repositories";
import { leaseToRow } from "../../data/mappers";
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

/** A fresh database from `open` (default: the seed). `init` alone is a no-op once the
 *  store is ready. */
async function reset(open: () => Promise<Sql> = openSeeded) {
  usePortfolioStore.setState({
    sql: null,
    portfolio: null,
    assumptions: null,
    status: "idle",
    error: null,
    startupError: null,
  });
  await store().init(open);
}

beforeEach(() => reset());

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
const day = (d: Date | undefined) => d?.toISOString().slice(0, 10);
const inputCodes = (r: MutationResult) =>
  r.ok || r.error.kind !== "input" ? [] : r.error.errors.map((e) => e.code);

describe("add closing the previous valuation (ADR 0099)", () => {
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
    expect(day(old.validTo)).toBe("2029-12-31");
    expect(pf().valuations.some((x) => x.id === "v-new")).toBe(true);
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
    const prev = openValuation();
    const v: Valuation = {
      id: "v-new",
      propertyId: prev.propertyId,
      validFrom: START,
      marketValue: money("15000000"),
    };
    expect((await store().addValuation(v)).ok).toBe(true);
    const plain = outputs();

    await reset();
    expect(
      await store().addValuationClosingPrevious(v, {
        ...prev,
        validTo: dayBefore(START),
      }),
    ).toEqual({ ok: true });
    expect(outputs()).toBe(plain);
  });
});

describe("leases never overlap (ADR 0163)", () => {
  it("adding an open-ended lease ends the open lease before it the day before", async () => {
    const prev = openLease();
    const l: Lease = {
      id: "l-new",
      propertyId: prev.propertyId,
      startDate: START,
      monthlyRent: money("40000"),
    };
    expect(await store().addLease(l)).toEqual({ ok: true });
    expect(day(pf().leases.find((x) => x.id === prev.id)!.endDate)).toBe(
      "2029-12-31",
    );
    expect(pf().leases.some((x) => x.id === "l-new")).toBe(true);
  });

  it("adding a dated lease ends the open lease before it too", async () => {
    const from = isoDate("2026-01-01");
    const prev = openLease(from);
    const l: Lease = {
      id: "l-new",
      propertyId: prev.propertyId,
      startDate: from,
      endDate: isoDate("2026-03-31"),
      monthlyRent: money("40000"),
    };
    expect(await store().addLease(l)).toEqual({ ok: true });
    expect(day(pf().leases.find((x) => x.id === prev.id)!.endDate)).toBe(
      "2025-12-31",
    );
  });

  it("a lease after the last one has no open lease to end and is added as is", async () => {
    // lipova: l-lipova-1 ends 2026-08-30, l-lipova-2 is open from 2026-09-01.
    const l: Lease = {
      id: "l-new",
      propertyId: "lipova",
      startDate: START,
      monthlyRent: money("30000"),
    };
    expect(await store().addLease(l)).toEqual({ ok: true });
    const lipova = pf().leases.filter((x) => x.propertyId === "lipova");
    expect(lipova.map((x) => [x.id, day(x.endDate)])).toEqual(
      expect.arrayContaining([
        ["l-lipova-1", "2026-08-30"],
        ["l-lipova-2", "2029-12-31"],
        ["l-new", undefined],
      ]),
    );
  });

  it("refuses a new lease that runs into a later lease and writes nothing", async () => {
    // lipova: a lease for 2026-08-31..09-01 reaches l-lipova-2 (open from 2026-09-01).
    const before = JSON.stringify(pf().leases);
    const r = await store().addLease({
      id: "l-new",
      propertyId: "lipova",
      startDate: isoDate("2026-08-31"),
      endDate: isoDate("2026-09-01"),
      monthlyRent: money("20000"),
    });
    expect(inputCodes(r)).toContain("LEASE_OVERLAP");
    expect(JSON.stringify(pf().leases)).toBe(before);
  });

  it("refuses a new lease with the same start as a stored one", async () => {
    const r = await store().addLease({
      id: "l-new",
      propertyId: "dubova",
      startDate: isoDate("2025-07-01"),
      monthlyRent: money("20000"),
    });
    expect(r.ok).toBe(false);
    expect(pf().leases.some((x) => x.id === "l-new")).toBe(false);
  });

  it("refuses an edit that makes two leases overlap", async () => {
    const lipova1 = pf().leases.find((x) => x.id === "l-lipova-1")!;
    const r = await store().saveLease({
      ...lipova1,
      endDate: isoDate("2026-09-01"),
    });
    expect(inputCodes(r)).toEqual(["LEASE_OVERLAP"]);
    expect(day(pf().leases.find((x) => x.id === "l-lipova-1")!.endDate)).toBe(
      "2026-08-30",
    );
  });

  describe("a stored overlap (written before ADR 0163)", () => {
    // dubova: the seed's open lease from 2025-07-01, plus an open one from 2027-01-01.
    const legacy: Lease = {
      id: "l-dubova-legacy",
      propertyId: "dubova",
      startDate: isoDate("2027-01-01"),
      monthlyRent: money("25000"),
    };
    beforeEach(() =>
      reset(async () => {
        const sql = await openSeeded();
        await insertLease(sql, leaseToRow(legacy));
        return sql;
      }),
    );

    it("loads, and does not block writes to other rows", async () => {
      expect(pf().leases.some((x) => x.id === legacy.id)).toBe(true);
      const javorova = pf().leases.find((x) => x.id === "l-javorova")!;
      expect(
        await store().saveLease({ ...javorova, monthlyRent: money("28000") }),
      ).toEqual({ ok: true });
    });

    it("refuses an edit of either lease while they overlap", async () => {
      const r = await store().saveLease({
        ...legacy,
        monthlyRent: money("26000"),
      });
      expect(inputCodes(r)).toEqual(["LEASE_OVERLAP"]);
    });

    it("is fixed by ending the earlier lease, or by deleting one of them", async () => {
      const dubova = pf().leases.find((x) => x.id === "l-dubova")!;
      expect(
        await store().saveLease({
          ...dubova,
          endDate: isoDate("2026-12-31"),
        }),
      ).toEqual({ ok: true });

      await reset(async () => {
        const sql = await openSeeded();
        await insertLease(sql, leaseToRow(legacy));
        return sql;
      });
      expect(await store().removeLease(legacy.id)).toEqual({ ok: true });
    });
  });
});

// D-23 / DR-031: real terms come from the engine's cumulative CPI index (anchored at
// baseDate), not from a constant UI deflator. With no inflation shock the index is
// (1+inflation)^t, so the seed's real figures are unchanged.
import { describe, it, expect } from "vitest";
import { D, ONE, powInt, powYears } from "../../lib/money";
import { edate, isoDate } from "../dates";
import { portfolioSnapshot, propertySnapshot } from "../metrics";
import {
  cpiIndex,
  portfolioProjection,
  propertyProjection,
} from "../projections";
import { schedulesByProperty } from "../schedule";
import { applyScenario } from "../scenarios";
import {
  cpiAt,
  portfolioSnapshotAtYear,
  propertySnapshotAtYear,
  realPortfolioSnapshot,
  realProjection,
  realPropertySnapshot,
} from "../real";
import { assumptions, portfolio, BASE_DATE } from "./support/seed";
import { rate } from "../brands";

const shocked = applyScenario(assumptions, {
  inflationShock: { deltaPa: rate("0.03"), durationYears: 3 },
});

const near = (a: { toNumber(): number }, b: { toNumber(): number }) =>
  expect(Math.abs(a.toNumber() - b.toNumber())).toBeLessThan(1e-9);

describe("cpiAt — price index at an as-of date (baseDate = 1)", () => {
  it("is 1 at baseDate and before it", () => {
    expect(cpiAt(assumptions, BASE_DATE).toString()).toBe("1");
    expect(cpiAt(assumptions, isoDate("2025-01-01")).toString()).toBe("1");
  });

  it("equals the yearly index on whole projection years", () => {
    const cpi = cpiIndex(shocked);
    for (const t of [1, 2, 3, 4, 10, 30]) {
      expect(cpiAt(shocked, edate(BASE_DATE, t * 12)).toString()).toBe(
        cpi[t].toString(),
      );
    }
  });

  it("matches (1+i)^(months/12) without a shock (today's UI deflator)", () => {
    const asOf = edate(BASE_DATE, 40); // 3 y 4 m
    near(cpiAt(assumptions, asOf), powYears(D("1.025"), 40 / 12));
  });

  it("compounds the shocked rate inside a shocked year", () => {
    const asOf = edate(BASE_DATE, 18); // year 1 + 6 months of year 2 (shocked 5.5 %)
    near(cpiAt(shocked, asOf), D("1.055").times(powYears(D("1.055"), 0.5)));
  });

  it("uses the trend rate after the shock ends", () => {
    const asOf = edate(BASE_DATE, 42); // 3 shocked years + 6 months at 2.5 %
    near(
      cpiAt(shocked, asOf),
      powInt(D("1.055"), 3).times(powYears(D("1.025"), 0.5)),
    );
  });

  // ADR 0150: the as-of resolver never passes a date past the horizon, so a later date is
  // a caller bug and raises instead of returning a stopped index.
  it("raises past baseDate + horizon, and still returns the horizon index on it (#113)", () => {
    const cpi = cpiIndex(assumptions);
    const end = edate(BASE_DATE, assumptions.horizonYears * 12);
    expect(cpiAt(assumptions, end).toString()).toBe(
      cpi[assumptions.horizonYears].toString(),
    );
    const justPast = edate(BASE_DATE, assumptions.horizonYears * 12 + 1);
    expect(() => cpiAt(assumptions, justPast)).toThrow(RangeError);
    const far = edate(BASE_DATE, (assumptions.horizonYears + 5) * 12);
    expect(() => cpiAt(assumptions, far)).toThrow(RangeError);
  });

  // DR-182 (ADR 0080): months count on the D-21 month-end grid, so the index at
  // baseDate + N years is the projection year's index even when baseDate is a month end.
  it("counts months on the month-end grid (baseDate 29 Feb)", () => {
    const leap = { ...shocked, baseDate: isoDate("2028-02-29") };
    const cpi = cpiIndex(leap);
    expect(cpiAt(leap, isoDate("2029-02-28")).toString()).toBe(
      cpi[1].toString(),
    );
    for (const t of [1, 2, 3, 4, 5]) {
      expect(cpiAt(leap, edate(leap.baseDate, t * 12)).toString()).toBe(
        cpi[t].toString(),
      );
    }
    // A day before the grid point the month is not complete yet.
    near(cpiAt(leap, isoDate("2029-02-27")), powYears(D("1.055"), 11 / 12));
  });
});

describe("realProjection — every money field ÷ the year's CPI", () => {
  const nominal = portfolioProjection(portfolio, shocked);
  const real = realProjection(nominal, cpiIndex(shocked));

  it("deflates money fields and keeps ratios, years and periods", () => {
    const cpi = cpiIndex(shocked);
    for (const t of [0, 1, 3, 4, 30]) {
      const n = nominal[t];
      const r = real[t];
      for (const k of [
        "value",
        "balance",
        "equity",
        "grossRent",
        "effectiveRent",
        "holdingCosts",
        "noi",
        "interest",
        "principal",
        "debtService",
        "netCashFlow",
        "draws",
      ] as const) {
        expect(r[k].toString()).toBe(n[k].div(cpi[t]).toString());
      }
      expect(r.ltv).toBe(n.ltv);
      expect(r.dscr).toBe(n.dscr);
      expect(r.ratePa).toBe(n.ratePa);
      expect(r.year).toBe(n.year);
      expect(r.calendarYear).toBe(n.calendarYear);
      expect(r.periodEnd).toBe(n.periodEnd);
    }
  });

  it("year 0 is unchanged (CPI = 1)", () => {
    expect(real[0].value.toString()).toBe(nominal[0].value.toString());
  });

  it("the horizon real equity equals the engine's real net worth basis (D-23)", () => {
    const cpi = cpiIndex(shocked);
    const N = shocked.horizonYears;
    expect(real[N].equity.toString()).toBe(
      nominal[N].equity.div(cpi[N]).toString(),
    );
  });

  it("without a shock equals ÷(1+i)^t (the seed's real figures are unchanged)", () => {
    const base = portfolioProjection(portfolio, assumptions);
    const r = realProjection(base, cpiIndex(assumptions));
    for (const t of [1, 5, 30]) {
      near(r[t].equity, base[t].equity.div(powInt(D("1.025"), t)));
    }
  });
});

describe("snapshot at a projection year and real snapshots", () => {
  const schedules = schedulesByProperty(
    portfolio.mortgages,
    portfolio.properties.map((p) => p.id),
    assumptions,
  );
  const asOf = edate(BASE_DATE, 60);
  const snap = portfolioSnapshot(portfolio, assumptions, asOf, schedules);
  const rows = portfolioProjection(portfolio, assumptions);

  it("portfolioSnapshotAtYear takes stocks, flows and ratios from the row", () => {
    const r = rows[5];
    const s = portfolioSnapshotAtYear(snap, r);
    expect(s.totalValue).toBe(r.value);
    expect(s.totalDebt).toBe(r.balance);
    expect(s.totalEquity).toBe(r.equity);
    expect(s.ltv).toBe(r.ltv);
    expect(s.grossAnnualRent).toBe(r.grossRent);
    expect(s.effectiveGrossIncome).toBe(r.effectiveRent);
    expect(s.holdingCosts).toBe(r.holdingCosts);
    expect(s.noi).toBe(r.noi);
    expect(s.annualDebtService).toBe(r.debtService);
    expect(s.netCashFlow).toBe(r.netCashFlow);
    expect(s.dscr).toBe(r.dscr);
    expect(s.grossYield?.toString()).toBe(r.grossRent.div(r.value).toString());
    expect(s.netYield?.toString()).toBe(r.noi.div(r.value).toString());
    // Kept from the snapshot: the projection has no per-property / rate breakdown.
    expect(s.asOf).toBe(snap.asOf);
    expect(s.perProperty).toBe(snap.perProperty);
    expect(s.weightedAvgRate).toBe(snap.weightedAvgRate);
  });

  it("propertySnapshotAtYear does the same for one property", () => {
    const p = portfolio.properties[0];
    const schedule = schedules.get(p.id) ?? [];
    const ps = propertySnapshot(p, portfolio, assumptions, asOf, schedule);
    const r = propertyProjection(p, portfolio, assumptions, schedule)[5];
    const s = propertySnapshotAtYear(ps, r);
    expect(s.value).toBe(r.value);
    expect(s.debt).toBe(r.balance);
    expect(s.noi).toBe(r.noi);
    expect(s.annualDebtService).toBe(r.debtService);
    expect(s.dscr).toBe(r.dscr);
    expect(s.netYield?.toString()).toBe(r.noi.div(r.value).toString());
    expect(s.propertyId).toBe(p.id);
    expect(s.weightedRateNumerator).toBe(ps.weightedRateNumerator);
  });

  it("zero value gives no yields (ADR 0133), not a division by zero", () => {
    const zero = { ...rows[5], value: D(0) };
    const s = portfolioSnapshotAtYear(snap, zero);
    expect(s.grossYield).toBeNull();
    expect(s.netYield).toBeNull();
  });

  it("real snapshots divide money and keep ratios; k = 1 is the identity", () => {
    const k = D("1.1");
    const r = realPortfolioSnapshot(snap, k);
    expect(r.totalValue.toString()).toBe(snap.totalValue.div(k).toString());
    expect(r.netCashFlow.toString()).toBe(snap.netCashFlow.div(k).toString());
    expect(r.ltv).toBe(snap.ltv);
    expect(r.dscr).toBe(snap.dscr);
    expect(realPortfolioSnapshot(snap, ONE)).toBe(snap);

    const ps = snap.perProperty[0];
    const rp = realPropertySnapshot(ps, k);
    expect(rp.debt.toString()).toBe(ps.debt.div(k).toString());
    expect(rp.grossYield).toBe(ps.grossYield);
    expect(realPropertySnapshot(ps, ONE)).toBe(ps);
  });
});

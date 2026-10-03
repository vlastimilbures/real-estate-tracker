// P02 — characterisation of two hidden conventions (spec findings D and F), so a
// refactor cannot change them silently. See P02-mortgage-audit.md §3.4.
import { describe, it, expect } from "vitest";
import { portfolioSnapshot } from "../../metrics";
import { portfolioProjection } from "../../projections";
import { portfolioKpis } from "../../kpis";
import { edate, isoDate } from "../../dates";
import { D } from "../../../lib/money";
import { assumptions as A0, portfolio as P0 } from "../support/seed";

const value = (asOf: string, portfolio = P0) =>
  portfolioSnapshot(portfolio, A0, isoDate(asOf)).perProperty[0].value;

describe("Finding D — valuation growth granularity", () => {
  it("growth starts at max(validFrom, baseDate): 2026-06-01 valuation is exactly 10,200,000 on baseDate", () => {
    expect(value("2026-06-07").toString()).toBe("10200000");
  });
  it("whole completed months only: no growth until the same day next month", () => {
    expect(value("2026-07-06").toString()).toBe("10200000");
    const oneMonth = D("10200000").times(D("1.04").pow(D(1).div(12)));
    expect(value("2026-07-07").minus(oneMonth).abs().lessThan(1e-6)).toBe(true);
  });
  it("exponent = months / 12 (fractional years), e.g. 18 months", () => {
    const want = D("10200000").times(D("1.04").pow(D(18).div(12)));
    expect(value("2027-12-07").minus(want).abs().lessThan(1e-6)).toBe(true);
  });
  it("a valuation dated before baseDate is NOT grown up to baseDate", () => {
    const P = {
      ...P0,
      valuations: P0.valuations.map((v) =>
        v.propertyId === "javorova"
          ? { ...v, validFrom: isoDate("2024-06-07") }
          : v,
      ),
    };
    expect(value("2026-06-07", P).toString()).toBe("10200000");
  });
});

describe("Finding F — projection year vs calendar-year labels", () => {
  const proj = portfolioProjection(P0, A0);
  const kpis = portfolioKpis(P0, A0);
  it("calendarYear = baseDate year + t (a label, not a calendar span)", () => {
    for (const y of proj) expect(y.calendarYear).toBe(2026 + y.year);
  });
  it("year t spans grid months (t−1)·12+1 … t·12, e.g. year 5 = 2030-07-07 … 2031-06-07", () => {
    expect(
      edate(A0.baseDate, 4 * 12 + 1)
        .toISOString()
        .slice(0, 10),
    ).toBe("2030-07-07");
    expect(
      edate(A0.baseDate, 5 * 12)
        .toISOString()
        .slice(0, 10),
    ).toBe("2031-06-07");
  });
  it("first positive cash-flow year 2031 = projection year 5", () => {
    expect(kpis.firstCashFlowPositiveYear).toBe(2031);
    expect(proj[4].netCashFlow.isNegative()).toBe(true);
    expect(proj[5].netCashFlow.greaterThan(0)).toBe(true);
    expect(proj[5].calendarYear).toBe(2031);
  });
  it("debt-free year 2052 = projection year 26 (last loan paid off in grid month 306)", () => {
    expect(kpis.debtFreeYear).toBe(2052);
    expect(proj[25].balance.greaterThan(0)).toBe(true);
    expect(proj[26].balance.lessThanOrEqualTo(D("0.005"))).toBe(true);
    expect(proj[26].calendarYear).toBe(2052);
  });
});

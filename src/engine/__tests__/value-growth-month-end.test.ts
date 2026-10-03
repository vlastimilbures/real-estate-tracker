// D-45 (DR-123, ADR 0079): value growth counts months with the D-21 month-end rule
// (`lastGridMonthOnOrBefore`) on both the snapshot and the projection, so a 29 Feb
// baseDate (clamped to 28 Feb a year later) still grows a full year.
import { describe, it, expect } from "vitest";
import { growthYears, propertySnapshot } from "../metrics";
import { propertyProjection } from "../projections";
import { schedulesByProperty } from "../schedule";
import { edate, isoDate } from "../dates";
import { money } from "../brands";
import type { Assumptions, Portfolio } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { KC, near } from "./support/tolerance";

const leapBase: Assumptions = {
  ...assumptions,
  baseDate: isoDate("2028-02-29"),
};

const own = <T extends { propertyId: string }>(rows: T[]) =>
  rows.filter((r) => r.propertyId === "javorova");

const javorovaOnly: Portfolio = {
  properties: portfolio.properties.filter((p) => p.id === "javorova"),
  mortgages: own(portfolio.mortgages),
  valuations: own(portfolio.valuations),
  leases: own(portfolio.leases),
  holdingCosts: own(portfolio.holdingCosts),
};

function snapshotVsProjection(p: Portfolio, a: Assumptions, n: number) {
  const prop = p.properties[0]!;
  const sched = schedulesByProperty(p.mortgages, [prop.id], a).get(prop.id)!;
  const proj = propertyProjection(prop, p, a, sched);
  const snap = propertySnapshot(prop, p, a, edate(a.baseDate, n * 12), sched);
  return { snap: snap.value, proj: proj[n]!.value };
}

describe("value growth on a month-end anchor (D-45, DR-123)", () => {
  it("baseDate 2028-02-29: snapshot(baseDate + 1 y) == projection year 1", () => {
    const { snap, proj } = snapshotVsProjection(javorovaOnly, leapBase, 1);
    // Register probe: projection 12,480,000.00 vs snapshot 12,439,277.04 (11 months).
    near(proj, 10_608_000, KC, "projection N=1");
    near(snap, proj.toNumber(), KC, "snapshot N=1");
  });

  it("baseDate 2028-02-29: snapshot == projection for every year of the horizon", () => {
    for (let n = 0; n <= leapBase.horizonYears; n++) {
      const { snap, proj } = snapshotVsProjection(javorovaOnly, leapBase, n);
      near(snap, proj.toNumber(), KC, `N=${n}`);
    }
  });

  it("a 31 Jan valuation anchor counts the clamped 28 Feb as a whole month", () => {
    const jan31 = isoDate("2027-01-31");
    expect(growthYears(jan31, isoDate("2027-02-28"))).toBeCloseTo(1 / 12, 12);
    expect(growthYears(jan31, isoDate("2027-02-27"))).toBe(0);
    expect(growthYears(jan31, isoDate("2028-01-31"))).toBe(1);
    expect(growthYears(jan31, isoDate("2026-12-31"))).toBe(0);
  });

  it("a 31 Jan valuation: snapshot == projection for every year of the horizon", () => {
    const p: Portfolio = {
      ...javorovaOnly,
      valuations: [
        ...javorovaOnly.valuations,
        {
          id: "v-javorova-jan31",
          propertyId: "javorova",
          validFrom: isoDate("2027-01-31"),
          marketValue: money("13000000"),
        },
      ],
    };
    const a: Assumptions = { ...assumptions, baseDate: isoDate("2026-02-28") };
    for (let n = 0; n <= a.horizonYears; n++) {
      const { snap, proj } = snapshotVsProjection(p, a, n);
      near(snap, proj.toNumber(), KC, `N=${n}`);
    }
  });
});

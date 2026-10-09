// Development-property value ramp: a dev property's value scales by construction
// progress (cumulative draws ÷ total principal), so it ramps from 0 to the completed
// valuation as the loan draws down. Non-dev properties are untouched (the seed parity tests
// elsewhere stay green); here we pin the dev behavior and the snapshot↔projection
// consistency invariant that growth.ts exists to guarantee.
import { describe, it, expect } from "vitest";
import { drawnFraction } from "../growth";
import { propertySnapshot } from "../metrics";
import { propertyProjection } from "../projections";
import { portfolioKpis } from "../kpis";
import { buildSchedule, propertySchedule } from "../schedule";
import { D } from "../../lib/money";
import { isoDate, edate } from "../dates";
import { assumptions } from "./support/seed";
import type { MortgageBlock, Portfolio, Property } from "../types";
import { near } from "./support/tolerance";
import { rate } from "../brands";
import { money } from "../brands";

// initial 2.25M + draws 2.30M + 4.00M + 0.70M = 9.25M total principal.
const devBlock: MortgageBlock = {
  id: "m-dev",
  propertyId: "dev",
  startDate: isoDate("2026-06-01"), // on/before baseDate 2026-06-07 → initial drawn
  initialPrincipal: money("2250000"),
  fixationYears: 10,
  interestRatePa: rate("0.05"),
  monthlyInstalment: money("12000"),
  loanTermYears: 30,
  draws: [
    { date: isoDate("2026-09-01"), amount: money("2300000") },
    { date: isoDate("2028-04-05"), amount: money("4000000") },
    { date: isoDate("2028-10-10"), amount: money("700000") },
  ],
  completionDate: isoDate("2028-10-10"),
};
const TOTAL = 9_250_000;

const property: Property = {
  id: "dev",
  name: "Dev unit",
  purchaseDate: isoDate("2025-01-01"), // owned at baseDate
  purchasePrice: money("8000000"),
};

function portfolioWith(block: MortgageBlock): Portfolio {
  return {
    properties: [property],
    mortgages: [block],
    valuations: [
      {
        id: "v",
        propertyId: "dev",
        validFrom: isoDate("2026-06-01"),
        marketValue: money("12000000"),
      },
    ],
    leases: [
      {
        id: "l",
        propertyId: "dev",
        startDate: isoDate("2025-01-01"),
        monthlyRent: money("20000"),
      },
    ],
    holdingCosts: [],
  };
}

describe("drawnFraction", () => {
  it("is 0 before startDate, initialPrincipal/total at start, and steps up at each draw", () => {
    near(
      drawnFraction(devBlock, isoDate("2026-05-01")).toNumber(),
      0,
      0,
      "before start",
    );
    near(
      drawnFraction(devBlock, isoDate("2026-06-07")).toNumber(),
      2_250_000 / TOTAL,
      1e-9,
      "at start",
    );
    near(
      drawnFraction(devBlock, isoDate("2026-09-02")).toNumber(),
      (2_250_000 + 2_300_000) / TOTAL,
      1e-9,
      "after draw 1",
    );
    near(
      drawnFraction(devBlock, isoDate("2028-04-06")).toNumber(),
      (2_250_000 + 2_300_000 + 4_000_000) / TOTAL,
      1e-9,
      "after draw 2",
    );
  });

  it("reaches exactly 1 at/after the last draw (completed property = full value)", () => {
    expect(drawnFraction(devBlock, isoDate("2028-10-10")).toNumber()).toBe(1);
    expect(drawnFraction(devBlock, isoDate("2040-01-01")).toNumber()).toBe(1);
  });

  it("a block with no draws is fully 'drawn' (fraction 1) once started, 0 before", () => {
    const plain = { ...devBlock, draws: undefined };
    expect(drawnFraction(plain, isoDate("2026-06-07")).toNumber()).toBe(1);
    expect(drawnFraction(plain, isoDate("2026-05-01")).toNumber()).toBe(0);
  });
});

describe("snapshot value ramps with construction progress", () => {
  const pf = portfolioWith(devBlock);
  const schedule = buildSchedule(devBlock, assumptions);

  it("at baseDate the value is fraction × completed value (the documented reduction)", () => {
    const s = propertySnapshot(
      property,
      pf,
      assumptions,
      assumptions.baseDate,
      schedule,
    );
    // fraction ≈ 2.25M/9.25M ≈ 0.2432 → 12M × 0.2432 ≈ 2.919M (not the full 12M).
    near(
      s.value.toNumber(),
      12_000_000 * (2_250_000 / TOTAL),
      1,
      "baseDate value",
    );
    expect(s.value.lessThan(D("3500000"))).toBe(true);
    // equity & LTV follow from the ramped value.
    near(s.equity.toNumber(), s.value.minus(s.debt).toNumber(), 1, "equity");
    near(s.ltv!.toNumber(), s.debt.div(s.value).toNumber(), 1e-9, "ltv");
  });

  it("after the last draw the value is the full appreciated completed value", () => {
    const asOf = isoDate("2029-06-07"); // past the final draw
    const s = propertySnapshot(property, pf, assumptions, asOf, schedule);
    const plainPf = portfolioWith({
      ...devBlock,
      draws: undefined,
      completionDate: undefined,
    });
    const full = propertySnapshot(property, plainPf, assumptions, asOf).value;
    near(s.value.toNumber(), full.toNumber(), 1, "completed == full value");
  });
});

describe("snapshot ↔ projection consistency (the invariant anchor)", () => {
  const pf = portfolioWith(devBlock);
  const schedule = propertySchedule([devBlock], assumptions);
  const proj = propertyProjection(property, pf, assumptions, schedule);

  it("propertySnapshot(baseDate+N·12mo).value == projection year N value, across the draw window", () => {
    for (const N of [0, 1, 2, 3, 5, 10]) {
      const asOf = edate(assumptions.baseDate, N * 12);
      const snap = propertySnapshot(
        property,
        pf,
        assumptions,
        asOf,
        schedule.rows,
      ).value;
      near(snap.toNumber(), proj[N].value.toNumber(), 1, `year ${N} value`);
      near(
        proj[N].equity.toNumber(),
        proj[N].value.minus(proj[N].balance).toNumber(),
        1,
        `year ${N} equity`,
      );
    }
  });
});

describe("non-development property is unaffected by the ramp", () => {
  it("a plain-loan property's value is byte-identical with and without the ramp code path", () => {
    const plain = { ...devBlock, draws: undefined, completionDate: undefined };
    const pf = portfolioWith(plain);
    const s = propertySnapshot(
      property,
      pf,
      assumptions,
      assumptions.baseDate,
      buildSchedule(plain, assumptions),
    );
    // No dev block → value is the raw appreciated valuation (12M at baseDate, exponent 0).
    expect(s.value.toString()).toBe("12000000");
  });
});

describe("portfolio KPIs on a ramped dev property", () => {
  it("net worth reflects the ramped (reduced) baseDate value, and the multiple/CAGR are large", () => {
    const kpis = portfolioKpis(portfolioWith(devBlock), assumptions);
    expect(kpis.netWorthNominal.isFinite()).toBe(true);
    expect(kpis.totalPrincipalRepaid.greaterThan(0)).toBe(true);
    // The ramp shrinks year-0 equity (≈ fraction × (completed − total)), so for a
    // standalone dev property the net-worth multiple and CAGR look alarmingly large.
    // This is faithful to the approved model; pin it so it reads as intended, not a bug.
    expect(kpis.netWorthMultiple!.greaterThan(5)).toBe(true);
    expect(kpis.cagrNominal?.isFinite()).toBe(true);
  });

  it("does not produce NaN CAGR when the completed value is below the total principal", () => {
    // completed 5M < total principal 9.25M ⇒ equity0 is negative during construction.
    const pf = portfolioWith(devBlock);
    pf.valuations[0].marketValue = money("5000000");
    const kpis = portfolioKpis(pf, assumptions);
    expect(kpis.cagrNominal).toBeNull(); // non-positive equity0 → null, not NaN (D-34)
    expect(kpis.cagrReal).toBeNull();
  });
});

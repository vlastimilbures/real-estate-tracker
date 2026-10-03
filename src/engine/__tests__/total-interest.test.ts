// ADR 0103 (#31): total interest over the horizon, nominal and real. Nominal is Σ projection
// interest of years 1..N; real deflates each year by its own CPI_t, as the real cumulative
// cash flow does (ADR 0087). Both are left out of the golden hashes (ADDED_FIELDS).
import { describe, it, expect } from "vitest";
import { portfolioKpis } from "../kpis";
import { cpiIndex, portfolioProjection } from "../projections";
import { portfolioOutputs } from "../outputs";
import { applyScenario } from "../scenarios";
import { ZERO } from "../../lib/money";
import { rate } from "../brands";
import type { Assumptions, Portfolio } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { mixed } from "./support/mixed";
import { mixedWithRefi } from "./support/synthetic";
import { expectKc } from "./support/tolerance";

function sums(p: Portfolio, a: Assumptions) {
  const proj = portfolioProjection(p, a);
  const cpi = cpiIndex(a);
  let nominal = ZERO;
  let real = ZERO;
  for (let t = 1; t <= a.horizonYears; t++) {
    nominal = nominal.plus(proj[t].interest);
    real = real.plus(proj[t].interest.div(cpi[t]));
  }
  return { nominal, real };
}

describe("ADR 0103: total interest", () => {
  it.each([
    ["seed", portfolio],
    ["mixed", mixed],
    ["mixedWithRefi", mixedWithRefi],
  ] as const)("%s: equals Σ projection interest, nominal and real", (_, p) => {
    const k = portfolioKpis(p, assumptions);
    const s = sums(p, assumptions);
    expectKc(k.totalInterest, s.nominal.toNumber(), "nominal");
    expectKc(k.totalInterestReal, s.real.toNumber(), "real");
  });

  it("is positive on the sample, and the real figure is smaller", () => {
    const k = portfolioKpis(portfolio, assumptions);
    expect(k.totalInterest.greaterThan(ZERO)).toBe(true);
    expect(k.totalInterestReal.lessThan(k.totalInterest)).toBe(true);
  });

  it("follows a rate shock and an inflation shock", () => {
    const shocked = applyScenario(assumptions, {
      rateShock: { deltaPa: rate("0.02"), durationYears: 3 },
      inflationShock: { deltaPa: rate("0.03"), durationYears: 2 },
    });
    const k = portfolioKpis(portfolio, shocked);
    const s = sums(portfolio, shocked);
    expectKc(k.totalInterest, s.nominal.toNumber(), "shock nominal");
    expectKc(k.totalInterestReal, s.real.toNumber(), "shock real");
    expect(
      k.totalInterest.greaterThan(
        portfolioKpis(portfolio, assumptions).totalInterest,
      ),
    ).toBe(true);
  });

  it("is 0 without debt", () => {
    const k = portfolioKpis({ ...portfolio, mortgages: [] }, assumptions);
    expect(k.totalInterest.isZero()).toBe(true);
    expect(k.totalInterestReal.isZero()).toBe(true);
  });

  it("is the same through portfolioOutputs", () => {
    const k = portfolioOutputs(portfolio, assumptions).kpis;
    expect(k.totalInterest.toString()).toBe(
      portfolioKpis(portfolio, assumptions).totalInterest.toString(),
    );
  });
});

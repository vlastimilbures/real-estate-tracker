// ADR 0087 (#11): the real lens has its own net-worth multiple and cumulative net cash
// flow. The multiple is the deflated net worth over equity₀ (CPI₀ = 1, the base `cagrReal`
// uses); the cumulative cash flow deflates each year by its own CPI_t, like the real IRR.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { portfolioKpis } from "../kpis";
import { cpiIndex, portfolioProjection } from "../projections";
import { applyScenario } from "../scenarios";
import { ZERO } from "../../lib/money";
import { isoDate } from "../dates";
import { rate } from "../brands";
import type { Assumptions } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { KC, RATIO, near } from "./support/tolerance";

const N = assumptions.horizonYears;

/** Σ_{t=1..N} netCF_t / CPI_t, rebuilt from the projection rows. */
function deflatedSum(a: Assumptions) {
  const proj = portfolioProjection(portfolio, a);
  const cpi = cpiIndex(a);
  let total = ZERO;
  for (let t = 1; t <= a.horizonYears; t++) {
    total = total.plus(proj[t].netCashFlow.div(cpi[t]));
  }
  return total;
}

describe("ADR 0087: real net-worth multiple", () => {
  it("is the real net worth over equity₀ (sample ≈ 2.3120x)", () => {
    const k = portfolioKpis(portfolio, assumptions);
    const equity0 = portfolioProjection(portfolio, assumptions)[0].equity;
    expect(k.netWorthMultipleReal!.toString()).toBe(
      k.netWorthReal.div(equity0).toString(),
    );
    near(k.netWorthMultipleReal!, 2.312, RATIO, "real multiple");
    expect(k.netWorthMultipleReal!.lessThan(k.netWorthMultiple!)).toBe(true);
  });

  it("is null when equity₀ is 0, like the nominal multiple (ADR 0126)", () => {
    const later = {
      ...portfolio,
      properties: portfolio.properties.map((p) => ({
        ...p,
        purchaseDate: isoDate("2028-01-15"),
      })),
      mortgages: [],
    };
    const k = portfolioKpis(later, assumptions);
    expect(k.netWorthMultiple).toBeNull();
    expect(k.netWorthMultipleReal).toBeNull();
  });
});

describe("ADR 0087: real cumulative net cash flow", () => {
  it("nominal cumulative CF is Σ netCF on the seed (no acquisitions in the horizon)", () => {
    const proj = portfolioProjection(portfolio, assumptions);
    const sum = proj.slice(1).reduce((s, y) => s.plus(y.netCashFlow), ZERO);
    near(
      portfolioKpis(portfolio, assumptions).cumulativeNetCashFlow,
      sum.toNumber(),
      KC,
      "nominal",
    );
  });

  it("deflates each year by its own CPI_t, not the total by CPI_N", () => {
    const k = portfolioKpis(portfolio, assumptions);
    near(
      k.cumulativeNetCashFlowReal,
      deflatedSum(assumptions).toNumber(),
      KC,
      "real cum CF",
    );
    const byHorizon = k.cumulativeNetCashFlow.div(cpiIndex(assumptions)[N]);
    expect(
      k.cumulativeNetCashFlowReal.minus(byHorizon).abs().greaterThan(1000),
    ).toBe(true);
  });

  it("honours a temporary inflation shock (time-varying CPI)", () => {
    const shocked = applyScenario(assumptions, {
      inflationShock: { deltaPa: rate("0.05"), durationYears: 3 },
    });
    const k = portfolioKpis(portfolio, shocked);
    near(
      k.cumulativeNetCashFlowReal,
      deflatedSum(shocked).toNumber(),
      KC,
      "shocked real cum CF",
    );
    expect(
      k.cumulativeNetCashFlowReal.lessThan(
        portfolioKpis(portfolio, assumptions).cumulativeNetCashFlowReal,
      ),
    ).toBe(true);
  });
});

describe("ADR 0087: with zero inflation real equals nominal", () => {
  it("for the multiple and the cumulative cash flow", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 0, max: 800 }),
        fc.integer({ min: 0, max: 600 }),
        (horizonYears, appBp, rentBp) => {
          const a: Assumptions = {
            ...assumptions,
            horizonYears,
            inflationPa: rate("0"),
            appreciationPa: rate(String(appBp / 10_000)),
            rentIndexationPa: rate(String(rentBp / 10_000)),
          };
          const k = portfolioKpis(portfolio, a);
          expect(k.netWorthMultipleReal!.toString()).toBe(
            k.netWorthMultiple!.toString(),
          );
          expect(k.cumulativeNetCashFlowReal.toString()).toBe(
            k.cumulativeNetCashFlow.toString(),
          );
        },
      ),
      { seed: 20261003, numRuns: 20 },
    );
  });
});

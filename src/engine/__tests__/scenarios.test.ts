import { describe, it, expect } from "vitest";
import { applyScenario } from "../scenarios";
import { portfolioProjection, cpiIndex } from "../projections";
import { portfolioKpis } from "../kpis";
import { rateAt, blockEndDate } from "../amortization";
import { schedulesByProperty } from "../schedule";
import { powInt, ONE, D, type Decimal } from "../../lib/money";
import { edate } from "../dates";
import { assumptions, portfolio } from "./support/seed";
import { KC, near } from "./support/tolerance";
import { rate } from "../brands";

/** Σ principal repaid over the horizon for a given assumptions set. */
function sumPrincipal(assn: typeof assumptions): Decimal {
  const schedules = schedulesByProperty(
    portfolio.mortgages,
    portfolio.properties.map((p) => p.id),
    assn,
  );
  const horizonMonths = assn.horizonYears * 12;
  let total = D(0);
  for (const rows of schedules.values()) {
    for (const r of rows) {
      if (r.month > horizonMonths) break;
      total = total.plus(r.principal);
    }
  }
  return total;
}

describe("Base scenario composition is byte-identical to the raw engine (parity tripwire)", () => {
  // Base = empty overrides (no shock fields) ⇒ must reproduce the parity targets in .claude/rules/engine-parity.md exactly.
  const baseAssn = applyScenario(assumptions, {});
  const baseKpis = portfolioKpis(portfolio, baseAssn);
  const rawKpis = portfolioKpis(portfolio, assumptions);

  it("net worth nominal matches the raw engine and the parity target", () => {
    expect(baseKpis.netWorthNominal.toString()).toBe(
      rawKpis.netWorthNominal.toString(),
    );
    near(baseKpis.netWorthNominal.toNumber(), 93_182_810.46, KC, "nw nominal");
  });

  it("net worth real matches the raw engine and the parity target", () => {
    expect(baseKpis.netWorthReal.toString()).toBe(
      rawKpis.netWorthReal.toString(),
    );
    near(baseKpis.netWorthReal.toNumber(), 44_424_223.27, KC, "nw real");
  });

  it("Σ principal repaid still equals the initial debt (the critical invariant)", () => {
    near(
      baseKpis.totalPrincipalRepaid.toNumber(),
      9_515_405.13,
      KC,
      "Σprincipal",
    );
  });
});

describe("cpiIndex", () => {
  it("equals powInt(1+inflationPa, t) under constant inflation (parity)", () => {
    const cpi = cpiIndex(assumptions);
    expect(cpi).toHaveLength(assumptions.horizonYears + 1);
    expect(cpi[0].toString()).toBe("1");
    // Iterative accumulation matches Decimal.pow to working precision (the parity targets
    // uses ±0.0001 ratio tolerance; holding-cost parity is covered by projection.test).
    for (let t = 0; t <= assumptions.horizonYears; t++) {
      const want = powInt(ONE.plus(assumptions.inflationPa), t);
      near(cpi[t].toNumber(), want.toNumber(), 1e-9, `cpi yr ${t}`);
    }
  });

  it("compounds the shock for its duration, then resumes the trend rate", () => {
    const shocked = applyScenario(assumptions, {
      inflationShock: { deltaPa: rate("0.06"), durationYears: 3 },
    });
    const cpi = cpiIndex(shocked);
    // Years 1..3 grow at 2.5%+6%=8.5%, then 2.5% thereafter.
    const hot = ONE.plus(D("0.085"));
    const trend = ONE.plus(D("0.025"));
    expect(cpi[3].toString()).toBe(powInt(hot, 3).toString());
    expect(cpi[5].toString()).toBe(
      powInt(hot, 3).times(powInt(trend, 2)).toString(),
    );
  });
});

describe("inflation shock", () => {
  const base = portfolioKpis(portfolio, assumptions);
  const assn = applyScenario(assumptions, {
    inflationShock: { deltaPa: rate("0.06"), durationYears: 3 },
  });
  const k = portfolioKpis(portfolio, assn);

  it("leaves nominal net worth unchanged (a price-index effect only)", () => {
    expect(k.netWorthNominal.toString()).toBe(base.netWorthNominal.toString());
  });

  it("lowers real net worth and real CAGR (a higher deflator)", () => {
    expect(k.netWorthReal.lessThan(base.netWorthReal)).toBe(true);
    expect(k.cagrReal).not.toBeNull();
    expect(k.cagrReal?.lessThan(base.cagrReal ?? NaN)).toBe(true);
  });

  it("leaves Σ principal repaid unchanged (debt is untouched)", () => {
    expect(sumPrincipal(assn).toString()).toBe(
      sumPrincipal(assumptions).toString(),
    );
  });
});

describe("value crash at a chosen year", () => {
  const base = portfolioProjection(portfolio, assumptions);

  it("year-0 crash reproduces a flat (1−pct) scale of the whole curve", () => {
    const assn = applyScenario(assumptions, {
      valueShock: { pct: rate("0.2"), atYear: 0 },
    });
    const proj = portfolioProjection(portfolio, assn);
    for (let t = 0; t <= assumptions.horizonYears; t++) {
      const want = base[t].value.times(D("0.8"));
      near(proj[t].value.toNumber(), want.toNumber(), KC, `value yr ${t}`);
    }
  });

  it("a crash at year 5 leaves pre-crash years identical and drops value from year 5", () => {
    const assn = applyScenario(assumptions, {
      valueShock: { pct: rate("0.2"), atYear: 5 },
    });
    const proj = portfolioProjection(portfolio, assn);
    for (let t = 0; t < 5; t++) {
      expect(proj[t].value.toString()).toBe(base[t].value.toString());
    }
    // At year 5 value drops to 80% of the undisturbed curve; balance is untouched, so
    // equity falls and LTV jumps.
    near(
      proj[5].value.toNumber(),
      base[5].value.times(D("0.8")).toNumber(),
      KC,
      "value yr5",
    );
    expect(proj[5].ltv.greaterThan(base[5].ltv)).toBe(true);
    expect(proj[5].balance.toString()).toBe(base[5].balance.toString());
  });

  it("leaves Σ principal repaid unchanged (debt is untouched by a value shock)", () => {
    const assn = applyScenario(assumptions, {
      valueShock: { pct: rate("0.35"), atYear: 10 },
    });
    expect(sumPrincipal(assn).toString()).toBe(
      sumPrincipal(assumptions).toString(),
    );
  });

  it("lowers horizon net worth", () => {
    const assn = applyScenario(assumptions, {
      valueShock: { pct: rate("0.35"), atYear: 0 },
    });
    const k = portfolioKpis(portfolio, assn);
    const baseKpis = portfolioKpis(portfolio, assumptions);
    expect(k.netWorthNominal.lessThan(baseKpis.netWorthNominal)).toBe(true);
  });
});

describe("rate shock at refix (temporary, per-block)", () => {
  const shock = { deltaPa: rate("0.04"), durationYears: 3 };
  const assn = applyScenario(assumptions, { rateShock: shock });

  it("rateAt traces base → base+Δ → base anchored at each block's fixation end", () => {
    const block = portfolio.mortgages[0]; // Javorova, fixation ends 2031-01-17
    const end = blockEndDate(block);
    // Before fixation end: the block's own fixed rate.
    expect(rateAt(edate(end, -1), block, assn).toString()).toBe(
      block.interestRatePa.toString(),
    );
    // Within the shock window after fixation: reset + Δ.
    expect(rateAt(edate(end, 1), block, assn).toString()).toBe(
      assumptions.postFixationResetRatePa.plus(shock.deltaPa).toString(),
    );
    expect(rateAt(edate(end, 36), block, assn).toString()).toBe(
      assumptions.postFixationResetRatePa.plus(shock.deltaPa).toString(),
    );
    // After the window: reverts to the plain reset rate.
    expect(rateAt(edate(end, 40), block, assn).toString()).toBe(
      assumptions.postFixationResetRatePa.toString(),
    );
  });

  it("still retires debt to zero under two re-amortizations (Σ principal == initial debt)", () => {
    near(
      sumPrincipal(assn).toNumber(),
      9_515_405.13,
      KC,
      "Σprincipal under rate shock",
    );
  });

  it("leaves horizon net worth unchanged but lowers cumulative cash flow", () => {
    const k = portfolioKpis(portfolio, assn);
    const base = portfolioKpis(portfolio, assumptions);
    // Terminal net worth = valueN − balanceN: value is rate-independent and the loan is
    // fully retired by the horizon either way, so net worth is identical. The extra
    // interest over the shock window shows up as lower cumulative net cash flow (and IRR).
    expect(k.netWorthNominal.toString()).toBe(base.netWorthNominal.toString());
    expect(k.cumulativeNetCashFlow.lessThan(base.cumulativeNetCashFlow)).toBe(
      true,
    );
    expect(k.leveredIrrNominal!.lessThan(base.leveredIrrNominal!)).toBe(true);
  });
});

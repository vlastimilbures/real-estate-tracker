// Vacancy boundary cases. The seed only ever runs at 5% (support/seed.ts), so the
// 0% and 100% branches of `effectiveGrossIncome = grossRent·(1−vacancy)`
// (metrics.ts `snapshotIncome`) are otherwise unexercised. The 100% case also folds in the parity
// "Σ principal = initial debt" invariant: debt must retire regardless of cash flow.
import { describe, it, expect } from "vitest";
import { portfolioSnapshot } from "../metrics";
import { portfolioKpis } from "../kpis";
import { portfolioProjection } from "../projections";
import { applyScenario } from "../scenarios";
import { assumptions, portfolio } from "./support/seed";
import { KC, near } from "./support/tolerance";
import { rate } from "../brands";

describe("100% vacancy (vacancyAllowance = 1)", () => {
  const a = applyScenario(assumptions, { vacancyAllowance: rate("1") });
  const snap = portfolioSnapshot(portfolio, a);

  it("effective gross income collapses to 0", () =>
    near(snap.effectiveGrossIncome.toNumber(), 0, KC, "egi"));
  it("NOI = −holdingCosts (negative)", () => {
    expect(snap.noi.isNegative()).toBe(true);
    near(snap.noi.toNumber(), -snap.holdingCosts.toNumber(), KC, "noi");
  });
  // ADR 0182: management is charged on collected rent, maintenance on contracted rent.
  // 3 × (2,550 + 2,550 + 850 × 12) fixed + 5 % maintenance × 846,600 = 45,900 + 42,330.
  it("holding costs are the fixed part plus maintenance on contracted rent", () =>
    near(snap.holdingCosts.toNumber(), 88_230, KC, "holding"));
  it("projection year 1: no management fee on rent that is not collected", () => {
    const y1 = portfolioProjection(portfolio, a)[1]!;
    const fixed = 45_900 * 1.025; // fixed0 × CPI_1
    near(
      y1.holdingCosts.toNumber(),
      fixed + 0.05 * y1.grossRent.toNumber(),
      KC,
      "holding y1",
    );
  });
  it("portfolio DSCR is negative (rent covers nothing)", () =>
    expect(snap.dscr!.isNegative()).toBe(true));

  it("Σ principal still == initial debt — amortization is cash-flow-independent", () => {
    const kpis = portfolioKpis(portfolio, a);
    near(kpis.totalPrincipalRepaid.toNumber(), 9_515_405, KC, "Σ principal");
  });
});

describe("0% vacancy (vacancyAllowance = 0)", () => {
  const a = applyScenario(assumptions, { vacancyAllowance: rate("0") });
  const snap = portfolioSnapshot(portfolio, a);

  it("effective gross income == gross annual rent (no-vacancy identity)", () =>
    near(
      snap.effectiveGrossIncome.toNumber(),
      snap.grossAnnualRent.toNumber(),
      KC,
      "egi==gross",
    ));
});

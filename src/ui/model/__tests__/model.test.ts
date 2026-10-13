// View-model parity: the numbers that reach the screen must still be the parity targets (.claude/rules/engine-parity.md)
// numbers, under both the Nominal and Real lens. Drives off the engine fixtures.
import { describe, it, expect } from "vitest";
import {
  portfolio,
  assumptions,
  PARITY,
} from "../../../engine/__tests__/support/seed";
import { KC, near } from "../../../engine/__tests__/support/tolerance";
import {
  portfolioSnapshot,
  portfolioProjection,
  portfolioKpis,
  realPortfolioSnapshot,
} from "../../../engine";
import { projectionSeries, shortPropertyName } from "../projection";
import { monthlyFlow } from "../dashboard";
import { lensKpis } from "../lensKpis";
import { ONE, D } from "../../../lib/money";

const proj = portfolioProjection(portfolio, assumptions);
const kpis = portfolioKpis(portfolio, assumptions);
const snap = portfolioSnapshot(portfolio, assumptions);

describe("projectionSeries — Nominal/Real lens", () => {
  it("nominal year-30 equity == net worth nominal (parity)", () => {
    const rows = projectionSeries(proj, "nominal", assumptions);
    near(
      rows[30].equity.toNumber(),
      PARITY.kpis.netWorthNominal,
      KC,
      "nom equity",
    );
  });
  it("real year-30 equity == net worth real (parity)", () => {
    const rows = projectionSeries(proj, "real", assumptions);
    near(
      rows[30].equity.toNumber(),
      PARITY.kpis.netWorthReal,
      KC,
      "real equity",
    );
  });
  it("LTV is lens-invariant", () => {
    const nom = projectionSeries(proj, "nominal", assumptions);
    const real = projectionSeries(proj, "real", assumptions);
    expect(nom[10].ltv).not.toBeNull();
    expect(nom[10].ltv?.toString()).toBe(real[10].ltv?.toString());
  });
});

describe("monthlyFlow (Dashboard) ", () => {
  it("net baseline == netCashFlow / 12 (≈ −4 249, ADR 0182)", () => {
    const f = monthlyFlow(snap);
    near(
      f.net.toNumber(),
      PARITY.snapshot.netCashFlow / 12,
      0.01,
      "net monthly",
    );
    near(
      f.inflow.toNumber(),
      PARITY.snapshot.effectiveGrossIncome / 12,
      0.01,
      "inflow",
    );
    near(
      f.outflow.toNumber(),
      (PARITY.snapshot.holdingCosts + PARITY.snapshot.annualDebtService) / 12,
      0.01,
      "outflow",
    );
  });
});

describe("lensKpis netWorth", () => {
  it("selects nominal vs real", () => {
    near(
      lensKpis(kpis, "nominal").netWorth.toNumber(),
      PARITY.kpis.netWorthNominal,
      KC,
      "nom",
    );
    near(
      lensKpis(kpis, "real").netWorth.toNumber(),
      PARITY.kpis.netWorthReal,
      KC,
      "real",
    );
  });
});

describe("realPortfolioSnapshot", () => {
  it("k == 1 is an exact no-op (same reference)", () => {
    expect(realPortfolioSnapshot(snap, ONE)).toBe(snap);
  });
  it("deflates money by k, leaves ratios untouched", () => {
    const k = D("1.025");
    const sv = realPortfolioSnapshot(snap, k);
    near(
      sv.totalEquity.toNumber(),
      snap.totalEquity.div(k).toNumber(),
      KC,
      "equity",
    );
    near(
      sv.netCashFlow.toNumber(),
      snap.netCashFlow.div(k).toNumber(),
      KC,
      "ncf",
    );
    expect(snap.ltv).not.toBeNull();
    expect(snap.netYield).not.toBeNull();
    expect(sv.ltv?.toString()).toBe(snap.ltv?.toString());
    expect(sv.netYield?.toString()).toBe(snap.netYield?.toString());
    expect(sv.asOf).toBe(snap.asOf);
  });
});

describe("shortPropertyName", () => {
  it("drops only a leading 'Byt '", () => {
    expect(shortPropertyName("Byt Javorová")).toBe("Javorová");
    expect(shortPropertyName("Dům Byt X")).toBe("Dům Byt X");
    expect(shortPropertyName("Bytová jednotka")).toBe("Bytová jednotka");
  });
});

// ADR 0087 (#11): the multiple and the cumulative net cash flow follow the lens.
import { describe, it, expect } from "vitest";
import { D } from "../../../lib/money";
import type { PortfolioKPIs } from "../../../engine";
import { lensKpis } from "../lensKpis";

const kpis = {
  netWorthMultiple: D("4.85"),
  netWorthMultipleReal: D("2.31"),
  cumulativeNetCashFlow: D("17300824"),
  cumulativeNetCashFlowReal: D("11000000"),
} as unknown as PortfolioKPIs;

describe("lensKpis", () => {
  it("picks the nominal values in the nominal lens", () => {
    expect(lensKpis(kpis, "nominal")).toEqual({
      netWorthMultiple: D("4.85"),
      cumulativeNetCashFlow: D("17300824"),
    });
  });

  it("picks the real values in the real lens", () => {
    expect(lensKpis(kpis, "real")).toEqual({
      netWorthMultiple: D("2.31"),
      cumulativeNetCashFlow: D("11000000"),
    });
  });
});

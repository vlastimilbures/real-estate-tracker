// ADR 0087 (#11, #170): every lensed KPI follows the lens, from one picker.
import { describe, it, expect } from "vitest";
import { D } from "../../../lib/money";
import type { PortfolioKPIs } from "../../../engine";
import { lensKpis } from "../lensKpis";

const kpis = {
  netWorthNominal: D("90000000"),
  netWorthReal: D("50000000"),
  netWorthMultiple: D("4.85"),
  netWorthMultipleReal: D("2.31"),
  cagrNominal: D("0.071"),
  cagrReal: D("0.042"),
  cumulativeNetCashFlow: D("17300824"),
  cumulativeNetCashFlowReal: D("11000000"),
  totalInterest: D("5200000"),
  totalInterestReal: D("3900000"),
  leveredIrrNominal: D("0.0615"),
  leveredIrrNominalReason: null,
  leveredIrrReal: null,
  leveredIrrRealReason: "NOT_UNIQUE",
} as unknown as PortfolioKPIs;

describe("lensKpis", () => {
  it("picks the nominal values in the nominal lens", () => {
    expect(lensKpis(kpis, "nominal")).toEqual({
      netWorth: D("90000000"),
      netWorthMultiple: D("4.85"),
      cagr: D("0.071"),
      cumulativeNetCashFlow: D("17300824"),
      totalInterest: D("5200000"),
      leveredIrr: { rate: D("0.0615"), reason: null },
    });
  });

  it("picks the real values in the real lens", () => {
    expect(lensKpis(kpis, "real")).toEqual({
      netWorth: D("50000000"),
      netWorthMultiple: D("2.31"),
      cagr: D("0.042"),
      cumulativeNetCashFlow: D("11000000"),
      totalInterest: D("3900000"),
      leveredIrr: { rate: null, reason: "NOT_UNIQUE" },
    });
  });
});

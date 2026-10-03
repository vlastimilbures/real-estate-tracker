// Dashboard property filter: narrowing the portfolio to a subset of properties and
// their rows must yield a correct subset snapshot. This mirrors the transformation
// useEngine() applies (rows of other properties would be orphans, D-37) and guards the
// per-property parity targets.
import { describe, it } from "vitest";
import { portfolioSnapshot } from "../metrics";
import { portfolioKpis } from "../kpis";
import { assumptions, portfolio } from "./support/seed";
import type { Portfolio } from "../types";
import { KC, RATIO, near } from "./support/tolerance";

const filterTo = (ids: string[]): Portfolio => {
  const kept = <T extends { propertyId: string }>(rows: T[]) =>
    rows.filter((r) => ids.includes(r.propertyId));
  return {
    properties: portfolio.properties.filter((p) => ids.includes(p.id)),
    mortgages: kept(portfolio.mortgages),
    valuations: kept(portfolio.valuations),
    leases: kept(portfolio.leases),
    holdingCosts: kept(portfolio.holdingCosts),
  };
};

describe("Filtered snapshot — single property (parity targets)", () => {
  const snap = portfolioSnapshot(filterTo(["javorova"]), assumptions);
  it("value", () => near(snap.totalValue.toNumber(), 10_200_000, KC, "value"));
  it("debt", () => near(snap.totalDebt.toNumber(), 1_642_907.31, KC, "debt"));
  it("NOI", () => near(snap.noi.toNumber(), 229_500, KC, "noi"));
  it("debt service", () =>
    near(snap.annualDebtService.toNumber(), 80_661.6, KC, "ds"));
  it("net cash flow", () =>
    near(snap.netCashFlow.toNumber(), 148_838.4, KC, "ncf"));
  it("DSCR", () => near(snap.dscr!.toNumber(), 2.84522, RATIO, "dscr"));
});

describe("Filtered snapshot — two properties sum to their parts", () => {
  const snap = portfolioSnapshot(filterTo(["javorova", "dubova"]), assumptions);
  it("value = 12.0M + 11.3M", () =>
    near(snap.totalValue.toNumber(), 19_805_000, KC, "value"));
  it("debt = sum", () =>
    near(snap.totalDebt.toNumber(), 1_642_907.31 + 2_755_908.88, KC, "debt"));
  it("net cash flow = sum", () =>
    near(snap.netCashFlow.toNumber(), 148_838.4 + -79_141.8, KC, "ncf"));
});

describe("Filtered projection — amortization runs correctly (parity invariant)", () => {
  // Σ principal repaid over the horizon must equal the subset's starting debt.
  it("single property: Σ principal = its starting debt", () => {
    const k = portfolioKpis(filterTo(["javorova"]), assumptions);
    near(
      k.totalPrincipalRepaid.toNumber(),
      1_642_907.31,
      KC,
      "javorova Σ principal",
    );
  });

  // Filter-to-all must match the whole-portfolio horizon targets (regression).
  it("all properties: Σ principal + horizon KPIs match the parity targets", () => {
    const k = portfolioKpis(
      filterTo(["javorova", "lipova", "dubova"]),
      assumptions,
    );
    near(k.totalPrincipalRepaid.toNumber(), 9_515_405, KC, "Σ principal all");
    near(k.netWorthMultiple.toNumber(), 4.8496, RATIO, "multiple all");
  });
});

describe("Empty filter is handled by caller (whole portfolio)", () => {
  // useEngine treats empty as "all"; an explicitly empty property set zeroes out.
  it("empty property set => zero value", () =>
    near(
      portfolioSnapshot(filterTo([]), assumptions).totalValue.toNumber(),
      0,
      KC,
      "empty",
    ));
});

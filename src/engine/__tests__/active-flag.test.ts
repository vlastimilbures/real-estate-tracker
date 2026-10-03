// Deactivating a property (active: false) must drop it from every portfolio
// aggregate and projection while leaving it listed in perProperty. The filter
// predicate is `active !== false`, so the seed fixtures (no `active` field)
// are unaffected — verified by the "reactivated == all-active" equivalence below.
import { describe, it, expect } from "vitest";
import { portfolioSnapshot } from "../metrics";
import { portfolioProjection } from "../projections";
import { portfolioKpis } from "../kpis";
import { assumptions, portfolio } from "./support/seed";
import type { Portfolio } from "../types";
import { KC, near } from "./support/tolerance";

// Same portfolio with Lipova deactivated. Javorova + Dubova remain.
const deactivated = (id: string): Portfolio => ({
  ...portfolio,
  properties: portfolio.properties.map((p) =>
    p.id === id ? { ...p, active: false } : p,
  ),
});

describe("Deactivated property is excluded from aggregates", () => {
  const snap = portfolioSnapshot(deactivated("lipova"), assumptions);

  it("is still listed in perProperty", () => {
    expect(snap.perProperty.map((s) => s.propertyId)).toContain("lipova");
    expect(
      snap.perProperty.find((s) => s.propertyId === "lipova")!.active,
    ).toBe(false);
  });

  it("totals exclude its value (12.0M + 11.3M, no 10.5M)", () =>
    near(snap.totalValue.toNumber(), 10_200_000 + 9_605_000, KC, "value"));

  it("totals exclude its debt", () =>
    near(snap.totalDebt.toNumber(), 1_642_907.31 + 2_755_908.88, KC, "debt"));
});

describe("Deactivated property is excluded from projections & KPIs", () => {
  it("its principal is not in totalPrincipalRepaid", () => {
    const k = portfolioKpis(deactivated("lipova"), assumptions);
    // Remaining two properties' starting debt only (Lipova's 5,116,588.94 dropped).
    near(
      k.totalPrincipalRepaid.toNumber(),
      1_642_907.31 + 2_755_908.88,
      KC,
      "Σ principal",
    );
  });

  it("projection horizon value drops Lipova's contribution", () => {
    const full = portfolioProjection(portfolio, assumptions);
    const sub = portfolioProjection(deactivated("lipova"), assumptions);
    expect(sub.at(-1)!.value.lessThan(full.at(-1)!.value)).toBe(true);
  });
});

describe("active is opt-out: reactivating restores the all-active numbers", () => {
  // Setting active: true explicitly must equal the seed (active undefined) result —
  // this is the parity guarantee for the new predicate.
  const reactivated: Portfolio = {
    ...portfolio,
    properties: portfolio.properties.map((p) => ({ ...p, active: true })),
  };
  it("Σ principal == the whole-portfolio invariant", () => {
    near(
      portfolioKpis(reactivated, assumptions).totalPrincipalRepaid.toNumber(),
      9_515_405,
      KC,
      "Σ",
    );
  });
  it("total value == seed total value", () => {
    near(
      portfolioSnapshot(reactivated, assumptions).totalValue.toNumber(),
      portfolioSnapshot(portfolio, assumptions).totalValue.toNumber(),
      KC,
      "value",
    );
  });
});

// ADR 0181 (#157 B): a property with no valuation at all grows its purchase price by
// whole months from the purchase date to the basis, at its own rate, else the base
// rate (never a scenario level). Before, the price stood in ungrown at the basis, so the
// value stayed flat when the base date moved and jumped when a valuation was entered.
import { describe, it, expect } from "vitest";
import { money, rate } from "../brands";
import { isoDate } from "../dates";
import { portfolioSnapshot, propertySnapshot } from "../metrics";
import { portfolioProjection } from "../projections";
import { applyScenario } from "../scenarios";
import type { Assumptions, Portfolio, Property } from "../types";
import { assumptions, portfolio } from "./support/seed";

// Javorova (bought 2015-06-01 for 4,080,000) with its valuation removed: 132 whole months
// to the base date 2026-06-07, so 4,080,000 × 1.04^11.
const noJavorovaValuation: Portfolio = {
  ...portfolio,
  valuations: portfolio.valuations.filter((v) => v.propertyId !== "javorova"),
};
const javorova = (pf: Portfolio): Property =>
  pf.properties.find((p) => p.id === "javorova") as Property;
const valueOf = (pf: Portfolio, a: Assumptions, asOf = a.baseDate) =>
  propertySnapshot(javorova(pf), pf, a, asOf).value.toFixed(2);
const withJavorova = (patch: Partial<Property>): Portfolio => ({
  ...noJavorovaValuation,
  properties: noJavorovaValuation.properties.map((p) =>
    p.id === "javorova" ? { ...p, ...patch } : p,
  ),
});

describe("ADR 0181: the purchase-price fallback grows to the projection start", () => {
  it("grows the price by whole months from the purchase date to the base date", () => {
    expect(valueOf(noJavorovaValuation, assumptions)).toBe("6280972.55");
    const snap = portfolioSnapshot(noJavorovaValuation, assumptions);
    expect(snap.totalValue.toFixed(2)).toBe("24810972.55");
    expect(snap.ltv?.toFixed(5)).toBe("0.38352");
  });

  it("moving the base date a year forward grows it a year, with no jump", () => {
    const later = { ...assumptions, baseDate: isoDate("2027-06-07") };
    expect(valueOf(noJavorovaValuation, later)).toBe("6532211.45");
  });

  it("year 0 of the projection equals the snapshot at the base date (one rule)", () => {
    const year0 = portfolioProjection(noJavorovaValuation, assumptions)[0];
    expect(year0?.value.toFixed(6)).toBe(
      portfolioSnapshot(noJavorovaValuation, assumptions).totalValue.toFixed(6),
    );
  });

  it("projection year N equals the snapshot at baseDate + N years", () => {
    const years = portfolioProjection(noJavorovaValuation, assumptions);
    for (const n of [1, 5]) {
      const asOf = isoDate(`${2026 + n}-06-07`);
      expect(years[n]?.value.toFixed(6)).toBe(
        portfolioSnapshot(
          noJavorovaValuation,
          assumptions,
          asOf,
        ).totalValue.toFixed(6),
      );
    }
  });

  it("a property's own appreciation rate grows its price", () => {
    const own = withJavorova({ appreciationOverridePa: rate("0.02") });
    // 4,080,000 × 1.02^11
    expect(valueOf(own, assumptions)).toBe("5072967.18");
  });

  it("a scenario level does not change today's value; the base rate grows the price", () => {
    const low = applyScenario(assumptions, { appreciationPa: rate("0.02") });
    expect(valueOf(noJavorovaValuation, low)).toBe("6280972.55");
    // After the base date the scenario level applies: one year at 2 %.
    expect(valueOf(noJavorovaValuation, low, isoDate("2027-06-07"))).toBe(
      "6406592.00",
    );
  });

  it("a property's own rate still wins over a scenario level before the base date", () => {
    const own = withJavorova({ appreciationOverridePa: rate("0.02") });
    const high = applyScenario(assumptions, { appreciationPa: rate("0.06") });
    expect(valueOf(own, high)).toBe("5072967.18");
  });

  it("a future buy with no valuation starts at its price (0 months)", () => {
    const future = withJavorova({ purchaseDate: isoDate("2028-03-01") });
    expect(valueOf(future, assumptions, isoDate("2028-03-01"))).toBe(
      "4080000.00",
    );
    expect(valueOf(future, assumptions, isoDate("2029-03-01"))).toBe(
      "4243200.00",
    );
  });

  it("counts whole months only: a purchase day after the base day counts one month less", () => {
    const midMonth = withJavorova({ purchaseDate: isoDate("2015-06-10") });
    // 131 whole months to 2026-06-07: 4,080,000 × 1.04^(131/12)
    expect(valueOf(midMonth, assumptions)).toBe("6260477.38");
  });

  it("a 29 Feb purchase counts a full month at a 28 Feb base date (D-45)", () => {
    const leap = withJavorova({ purchaseDate: isoDate("2024-02-29") });
    const feb = { ...assumptions, baseDate: isoDate("2026-02-28") };
    // 24 whole months: 4,080,000 × 1.04²
    expect(valueOf(leap, feb)).toBe("4412928.00");
  });

  it("a scenario applied on top of another keeps the base opening rate", () => {
    const twice = applyScenario(
      applyScenario(assumptions, { appreciationPa: rate("0.02") }),
      { appreciationPa: rate("0.06") },
    );
    expect(valueOf(noJavorovaValuation, twice)).toBe("6280972.55");
  });

  it("projection year 0 is the same under a scenario and under Base", () => {
    const low = applyScenario(assumptions, { appreciationPa: rate("0.02") });
    const year0 = (a: Assumptions) =>
      portfolioProjection(noJavorovaValuation, a)[0]?.value.toFixed(6);
    expect(year0(low)).toBe(year0(assumptions));
  });

  it("a loan with a tranche still to draw reports the grown value less the undrawn part", () => {
    const pf: Portfolio = {
      ...noJavorovaValuation,
      mortgages: noJavorovaValuation.mortgages.map((m) =>
        m.propertyId === "javorova"
          ? {
              ...m,
              loanTermYears: 30,
              draws: [{ date: isoDate("2027-01-17"), amount: money("500000") }],
            }
          : m,
      ),
    };
    const snap = propertySnapshot(javorova(pf), pf, assumptions);
    expect(snap.value.toFixed(2)).toBe("6280972.55");
    expect(snap.undrawnDebt.toFixed(2)).toBe("500000.00");
    expect(snap.reportedValue.toFixed(2)).toBe("5780972.55");
  });
});

// ADR 0126 (#129): degenerate KPIs. A multiple or a CAGR needs a positive opening equity
// base, a CAGR also a positive end (a negative base to a fractional power is NaN, ADR 0017),
// and the debt-free year is the year from which the debt stays repaid through year N.
import { describe, it, expect } from "vitest";
import { portfolioKpis } from "../kpis";
import { portfolioProjection } from "../projections";
import { applyScenario } from "../scenarios";
import { validateInputs } from "../validate";
import { isoDate } from "../dates";
import { money, rate } from "../brands";
import { ZERO, type Decimal } from "../../lib/money";
import { DEBT_FREE_EPSILON } from "../constants";
import type { Assumptions, Portfolio, PortfolioKPIs } from "../types";
import { assumptions, portfolio } from "./support/seed";

function crash(
  pct: string,
  atYear: number,
  horizonYears?: number,
): Assumptions {
  return {
    ...applyScenario(assumptions, { valueShock: { pct: rate(pct), atYear } }),
    ...(horizonYears === undefined ? {} : { horizonYears }),
  };
}

function expectFinite(k: PortfolioKPIs) {
  for (const [key, v] of Object.entries(k)) {
    if (v !== null && typeof v === "object")
      expect((v as Decimal).isFinite(), key).toBe(true);
  }
}

describe("ADR 0126: no growth base", () => {
  it.each(["0.7", "0.9"])(
    "a crash of %s at the start leaves equity₀ < 0: multiples and CAGRs are null",
    (pct) => {
      const a = crash(pct, 0);
      expect(portfolioProjection(portfolio, a)[0].equity.lessThan(ZERO)).toBe(
        true,
      );
      const k = portfolioKpis(portfolio, a);
      expect(k.netWorthMultiple).toBeNull();
      expect(k.netWorthMultipleReal).toBeNull();
      expect(k.cagrNominal).toBeNull();
      expect(k.cagrReal).toBeNull();
      expectFinite(k);
    },
  );

  it.each([3, 1])(
    "net worth below 0 at horizon %i: the CAGRs are null, not NaN",
    (h) => {
      const a = crash("0.9", 1, h);
      const k = portfolioKpis(portfolio, a);
      expect(k.netWorthNominal.lessThan(ZERO)).toBe(true);
      expect(k.cagrNominal).toBeNull();
      expect(k.cagrReal).toBeNull();
      // equity₀ > 0: the multiple keeps its (negative) value.
      expect(k.netWorthMultiple?.lessThan(ZERO)).toBe(true);
      expectFinite(k);
    },
  );

  it("equity₀ = 0 (only planned purchases): the multiples are null", () => {
    const later: Portfolio = {
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
    expect(k.cagrNominal).toBeNull();
    expect(k.cagrReal).toBeNull();
  });
});

describe("ADR 0126: debt-free year", () => {
  function withLaterLoan(principal: string, instalment: string): Portfolio {
    return {
      ...portfolio,
      mortgages: [
        ...portfolio.mortgages,
        {
          id: "m-later",
          propertyId: "lipova",
          startDate: isoDate("2053-09-01"),
          initialPrincipal: money(principal),
          fixationYears: 5,
          interestRatePa: rate("0.05"),
          monthlyInstalment: money(instalment),
        },
      ],
    };
  }

  it("debt drawn after the portfolio was debt-free and owed at N: null", () => {
    const p = withLaterLoan("5000000", "30000");
    expect(validateInputs(p, assumptions)).toEqual([]);
    const proj = portfolioProjection(p, assumptions);
    expect(proj[assumptions.horizonYears].balance.greaterThan(ZERO)).toBe(true);
    const k = portfolioKpis(p, assumptions);
    expect(k.debtFreeYear).toBeNull();
    expect(k.debtFreeProjectionYear).toBeNull();
  });

  it("debt repaid again before N: the year from which it stays repaid", () => {
    const p = withLaterLoan("1000000", "100000");
    expect(validateInputs(p, assumptions)).toEqual([]);
    const proj = portfolioProjection(p, assumptions);
    // Repaid 2052 (year 26), borrowed again 2053-09, owed at the end of 2054 (year 28),
    // repaid again in 2055 (year 29) and through N.
    expect(proj[26].balance.lessThanOrEqualTo(DEBT_FREE_EPSILON)).toBe(true);
    expect(proj[28].balance.greaterThan(ZERO)).toBe(true);
    const k = portfolioKpis(p, assumptions);
    expect(k.debtFreeYear).toBe(2055);
    expect(k.debtFreeProjectionYear).toBe(29);
  });

  it("the seed (repaid once, never again) keeps 2052", () => {
    expect(portfolioKpis(portfolio, assumptions).debtFreeYear).toBe(2052);
  });

  /** The portfolio with one loan on Lipova instead of the seed's three. */
  function onlyLoan(start: string, principal: string, instalment: string) {
    const p: Portfolio = {
      ...portfolio,
      mortgages: [
        {
          id: "m-only",
          propertyId: "lipova",
          startDate: isoDate(start),
          initialPrincipal: money(principal),
          fixationYears: 5,
          interestRatePa: rate("0"),
          monthlyInstalment: money(instalment),
        },
      ],
    };
    expect(validateInputs(p, assumptions)).toEqual([]);
    return {
      proj: portfolioProjection(p, assumptions),
      k: portfolioKpis(p, assumptions),
    };
  }

  it("debt first carried in the year before it is repaid still counts", () => {
    // No debt until 2030-01-01; owed at the end of year 4, repaid in year 5.
    const { proj, k } = onlyLoan("2030-01-01", "100000", "10000");
    expect(proj[3].balance.isZero()).toBe(true);
    expect(proj[4].balance.greaterThan(DEBT_FREE_EPSILON)).toBe(true);
    expect(k.debtFreeProjectionYear).toBe(5);
    expect(k.debtFreeYear).toBe(2031);
  });

  it("debt that never exceeds the epsilon, first owed after year 1, was never carried", () => {
    // 0.004 Kč from 2030: 0.0035 Kč at the end of year 4, nothing before.
    const { proj, k } = onlyLoan("2030-01-01", "0.004", "0.0001");
    expect(proj[1].balance.isZero()).toBe(true);
    expect(proj[4].balance.greaterThan(ZERO)).toBe(true);
    expect(k.debtFreeYear).toBeNull();
    expect(k.debtFreeProjectionYear).toBeNull();
  });

  it("debt within the epsilon at baseDate: debt-free from year 1, not year 0", () => {
    const { proj, k } = onlyLoan("2026-06-01", "0.004", "0.001");
    expect(proj[0].balance.toString()).toBe("0.004");
    expect(k.debtFreeProjectionYear).toBe(1);
    expect(k.debtFreeYear).toBe(2027);
  });
});

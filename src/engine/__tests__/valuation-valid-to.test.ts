// ADR 0122 (#110): a valuation's "Valid to" date does not end its value. When no
// valuation is in force, the latest one that started governs, then the nearest
// upcoming one; the purchase price stands in only when the property has none. Before,
// a closed last valuation dropped the value to the purchase price grown from baseDate.
import { describe, it, expect } from "vitest";
import { money } from "../brands";
import { isoDate } from "../dates";
import { propertySnapshot, selectValuation } from "../metrics";
import { portfolioProjection } from "../projections";
import { portfolioKpis } from "../kpis";
import type { Portfolio, Property, Valuation } from "../types";
import { assumptions, portfolio } from "./support/seed";

const withJavorovaValidTo = (validTo: string): Portfolio => ({
  ...portfolio,
  valuations: portfolio.valuations.map((v) =>
    v.propertyId === "javorova" ? { ...v, validTo: isoDate(validTo) } : v,
  ),
});
const values = (p: Portfolio) =>
  portfolioProjection(p, assumptions).map((y) => y.value.toFixed(6));

describe("ADR 0122: a closed last valuation keeps governing", () => {
  it.each(["2028-06-30", "2027-12-31"])(
    "seed: Javorova's valuation closed on %s changes no year's value",
    (validTo) => {
      const closed = withJavorovaValidTo(validTo);
      expect(values(closed)).toEqual(values(portfolio));
      expect(
        portfolioKpis(closed, assumptions).netWorthNominal.toFixed(2),
      ).toBe("93182810.46");
      const javorova = portfolio.properties[0] as Property;
      const asOf = isoDate("2028-07-01");
      expect(
        propertySnapshot(javorova, closed, assumptions, asOf).value.toFixed(6),
      ).toBe(
        propertySnapshot(javorova, portfolio, assumptions, asOf).value.toFixed(
          6,
        ),
      );
    },
  );

  /** Bought 2018-03-01 for 4,000,000; one valuation of 7,000,000 from 2023-09-01. */
  const property: Property = {
    id: "p",
    name: "P",
    purchaseDate: isoDate("2018-03-01"),
    purchasePrice: money(4_000_000),
  };
  const single = (validTo?: string): Portfolio => ({
    properties: [property],
    mortgages: [],
    valuations: [
      {
        id: "v",
        propertyId: "p",
        validFrom: isoDate("2023-09-01"),
        ...(validTo ? { validTo: isoDate(validTo) } : {}),
        marketValue: money(7_000_000),
      },
    ],
    leases: [],
    holdingCosts: [],
  });

  it.each([
    ["open-ended", undefined],
    ["closed inside the projection", "2027-08-31"],
    ["closed before baseDate", "2024-08-31"],
  ])("one valuation, %s: grown from 7,000,000", (_, validTo) => {
    const pf = single(validTo);
    expect(propertySnapshot(property, pf, assumptions).value.toFixed(0)).toBe(
      "7000000",
    );
    const proj = portfolioProjection(pf, assumptions);
    expect(proj[1]?.value.toFixed(0)).toBe("7280000");
    expect(proj[2]?.value.toFixed(0)).toBe("7571200");
    expect(proj[30]?.value.toFixed(0)).toBe("22703783");
  });

  const val = (
    id: string,
    validFrom: string,
    marketValue: number,
    validTo?: string,
  ): Valuation => ({
    id,
    propertyId: "p",
    validFrom: isoDate(validFrom),
    ...(validTo ? { validTo: isoDate(validTo) } : {}),
    marketValue: money(marketValue),
  });

  it("in a gap between valuations, the earlier one governs, not the upcoming one", () => {
    const a = val("a", "2020-01-01", 5_000_000, "2022-12-31");
    const b = val("b", "2028-01-01", 6_000_000);
    expect(selectValuation([a, b], isoDate("2026-06-07"))?.id).toBe("a");
    const pf: Portfolio = { ...single(), valuations: [a, b] };
    expect(propertySnapshot(property, pf, assumptions).value.toFixed(0)).toBe(
      "5000000",
    );
  });

  it("the one in force wins over a later-started closed one", () => {
    const open = val("open", "2020-01-01", 5_000_000);
    const closed = val("closed", "2022-01-01", 6_000_000, "2022-12-31");
    expect(selectValuation([open, closed], isoDate("2026-06-07"))?.id).toBe(
      "open",
    );
  });

  it("before the first valuation, the nearest upcoming one governs (unchanged)", () => {
    const b = val("b", "2028-01-01", 6_000_000);
    const c = val("c", "2029-01-01", 6_500_000);
    expect(selectValuation([c, b], isoDate("2026-06-07"))?.id).toBe("b");
  });

  it("no valuation: the purchase price stands in (unchanged)", () => {
    expect(selectValuation([], isoDate("2026-06-07"))).toBeUndefined();
    const pf: Portfolio = { ...single(), valuations: [] };
    expect(propertySnapshot(property, pf, assumptions).value.toFixed(0)).toBe(
      "4000000",
    );
  });
});

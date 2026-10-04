// Turn-on edges of a future purchase in the projection (DR-168): rent only from the
// first grid month on/after the purchase, even when the lease already runs; a purchase
// in the horizon's last grid month still comes online in the last year.
import { describe, it, expect } from "vitest";
import { propertyProjection } from "../projections";
import { isoDate } from "../dates";
import { money } from "../brands";
import { assumptions, portfolio } from "./support/seed";
import type { Lease, Portfolio, Property } from "../types";

const bought = (purchaseDate: string, leases: Lease[] = []) => {
  const p: Property = {
    id: "nova",
    name: "Byt Nova",
    purchaseDate: isoDate(purchaseDate),
    purchasePrice: money("5000000"),
  };
  const withP: Portfolio = {
    ...portfolio,
    properties: [...portfolio.properties, p],
    leases: [...portfolio.leases, ...leases],
  };
  return propertyProjection(p, withP, assumptions, []);
};

describe("future purchase turn-on (DR-168)", () => {
  it("a lease already running at the purchase pays rent only from the purchase", () => {
    // baseDate 2026-06-07: the first grid date on/after 2027-03-15 is 2027-04-07,
    // grid month 10, so year 1 has 3 rented months (10–12), not 12.
    const proj = bought("2027-03-15", [
      {
        id: "l-nova",
        propertyId: "nova",
        startDate: isoDate("2026-01-01"),
        monthlyRent: money("20000"),
      },
    ]);
    expect(proj[1]?.grossRent.toFixed(2)).toBe("60000.00");
    expect(proj[2]?.grossRent.toFixed(2)).toBe(
      money("20000").times("1.03").times(12).toFixed(2),
    );
  });

  it("a purchase in the horizon's last grid month comes online in the last year", () => {
    // 2056-06-01 falls in grid month 360 (2056-05-07, 2056-06-07]: year 30, not 31.
    const proj = bought("2056-06-01");
    expect(proj[29]?.value.isZero()).toBe(true);
    expect(proj[30]?.value.greaterThan(0)).toBe(true);
  });
});

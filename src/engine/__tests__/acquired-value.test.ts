// ADR 0165 (#126 item 2): a projection year carries the value a purchase brings in, so
// the equity-change chart can show it apart from appreciation. Only a future purchase's
// turn-on year has one: a property owned at baseDate is part of the opening stock.
import { describe, it, expect } from "vitest";
import {
  cpiIndex,
  portfolioProjection,
  propertyProjection,
} from "../projections";
import { realProjection } from "../real";
import { EMPTY_PROPERTY_SCHEDULE } from "../schedule";
import { isoDate } from "../dates";
import { money, rate } from "../brands";
import { D } from "../../lib/money";
import { assumptions, portfolio as seed } from "./support/seed";
import { devBlock, mixed } from "./support/mixed";
import type { MortgageBlock, Portfolio, Property } from "../types";

const future = mixed.properties.find((p) => p.id === "future") as Property;
// Purchase 15.03.2028 on the 2026-06-07 grid: projection year 2 (2028).
const T_START = 2;
// The valuation in force at the purchase date (6,300,000 from 01.03.2028).
const VALUE_AT_PURCHASE = D("6300000");

describe("ProjectionYear.acquiredValue (ADR 0165)", () => {
  it("is the value at the purchase date in the turn-on year, 0 in every other year", () => {
    const proj = propertyProjection(
      future,
      mixed,
      assumptions,
      EMPTY_PROPERTY_SCHEDULE,
    );
    proj.forEach((y) => {
      if (y.year === T_START) {
        expect(y.acquiredValue.equals(VALUE_AT_PURCHASE)).toBe(true);
      } else {
        expect(y.acquiredValue.isZero()).toBe(true);
      }
    });
  });

  it("is 0 for properties owned at baseDate (the seed)", () => {
    const proj = portfolioProjection(seed, assumptions);
    expect(proj.every((y) => y.acquiredValue.isZero())).toBe(true);
  });

  it("sums over the portfolio like every other field", () => {
    const proj = portfolioProjection(mixed, assumptions);
    expect(proj[T_START].acquiredValue.equals(VALUE_AT_PURCHASE)).toBe(true);
    const others = proj.filter((y) => y.year !== T_START);
    expect(others.every((y) => y.acquiredValue.isZero())).toBe(true);
  });

  it("is deflated by the real lens", () => {
    const proj = portfolioProjection(mixed, assumptions);
    const real = realProjection(proj, cpiIndex(assumptions));
    const k = cpiIndex(assumptions)[T_START];
    expect(real[T_START].acquiredValue.equals(VALUE_AT_PURCHASE.div(k))).toBe(
      true,
    );
  });

  it("takes a shock that starts in the turn-on year, like that year's value", () => {
    // The shock applies from year atYear's value on; the bought-in value of that same
    // year is on the same curve, so the loss is not shown as negative appreciation.
    const shocked = {
      ...assumptions,
      valueShock: { pct: rate("0.2"), atYear: T_START },
    };
    const proj = propertyProjection(
      future,
      mixed,
      shocked,
      EMPTY_PROPERTY_SCHEDULE,
    );
    expect(
      proj[T_START].acquiredValue.equals(VALUE_AT_PURCHASE.times(D("0.8"))),
    ).toBe(true);
  });

  it("follows a value shock in force at the turn-on year", () => {
    const shocked = {
      ...assumptions,
      valueShock: { pct: rate("0.2"), atYear: 1 },
    };
    const proj = propertyProjection(
      future,
      mixed,
      shocked,
      EMPTY_PROPERTY_SCHEDULE,
    );
    expect(
      proj[T_START].acquiredValue.equals(VALUE_AT_PURCHASE.times(D("0.8"))),
    ).toBe(true);
  });

  // #299 item 1: the edges the ADR 0165 review listed.
  it("is the completed value at the purchase date for a development future buy (ADR 0166)", () => {
    // The dev-committed-debt.test.ts future buy: purchase 2027-03-01 (turn-on year 1),
    // a development loan drawing after it, valued 9,500,000 from the purchase date.
    const futureDev: MortgageBlock = {
      ...devBlock,
      startDate: isoDate("2027-03-01"),
      loanTermYears: 30,
      draws: [
        { date: isoDate("2027-11-15"), amount: money("1500000") },
        { date: isoDate("2028-08-20"), amount: money("1000000") },
      ],
      completionDate: isoDate("2028-08-20"),
    };
    const pf: Portfolio = {
      properties: [
        {
          id: "dev",
          name: "Dev unit",
          purchaseDate: isoDate("2027-03-01"),
          purchasePrice: money("7000000"),
        },
      ],
      mortgages: [futureDev],
      valuations: [
        {
          id: "v-dev",
          propertyId: "dev",
          validFrom: isoDate("2027-03-01"),
          marketValue: money("9500000"),
        },
      ],
      leases: [],
      holdingCosts: [],
    };
    const proj = portfolioProjection(pf, assumptions);
    expect(proj[1].acquiredValue.equals(D("9500000"))).toBe(true);
    expect(proj.filter((y) => !y.acquiredValue.isZero()).length).toBe(1);
  });

  it("keeps the value at the purchase date when a valuation re-anchors later in the turn-on year", () => {
    // A new valuation between the purchase (15.03.2028) and the year's grid date
    // (07.06.2028) shows as appreciation, not as bought-in value.
    const pf: Portfolio = {
      ...mixed,
      valuations: [
        ...mixed.valuations,
        {
          id: "v-future-2",
          propertyId: "future",
          validFrom: isoDate("2028-05-01"),
          marketValue: money("7000000"),
        },
      ],
    };
    const proj = propertyProjection(
      future,
      pf,
      assumptions,
      EMPTY_PROPERTY_SCHEDULE,
    );
    expect(proj[T_START].acquiredValue.equals(VALUE_AT_PURCHASE)).toBe(true);
    expect(proj[T_START].value.equals(VALUE_AT_PURCHASE)).toBe(false);
  });

  it("equals the turn-on year's value for a purchase on the grid date", () => {
    const onGrid: Property = { ...future, purchaseDate: isoDate("2028-06-07") };
    const pf: Portfolio = {
      ...mixed,
      properties: mixed.properties.map((p) => (p.id === "future" ? onGrid : p)),
    };
    const proj = propertyProjection(
      onGrid,
      pf,
      assumptions,
      EMPTY_PROPERTY_SCHEDULE,
    );
    expect(proj[T_START].acquiredValue.isZero()).toBe(false);
    expect(proj[T_START].acquiredValue.equals(proj[T_START].value)).toBe(true);
  });
});

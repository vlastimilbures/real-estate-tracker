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
import { rate } from "../brands";
import { D } from "../../lib/money";
import { assumptions, portfolio as seed } from "./support/seed";
import { mixed } from "./support/mixed";
import type { Property } from "../types";

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
});

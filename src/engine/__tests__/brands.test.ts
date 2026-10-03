// Brand constructors (D-25, ADR 0074): runtime identity with plain decimals, and the
// compile-time separation of Money, Rate and Decimal (checked by `pnpm typecheck`).
import { describe, it, expect, expectTypeOf } from "vitest";
import { D, type Decimal } from "../../lib/money";
import { money, rate, type Money, type Rate } from "../brands";
import { mortgageBlock } from "../amortization";
import { isoDate } from "../dates";
import type { MortgageBlock } from "../types";

describe("money", () => {
  it("holds the same digits as D(), without rounding", () => {
    expect(money("1234.5678").toString()).toBe(D("1234.5678").toString());
    expect(money(D("0.005")).equals(D("0.005"))).toBe(true);
    expect(money(42).toString()).toBe("42");
  });

  it("is a Decimal whose arithmetic returns plain Decimal", () => {
    expectTypeOf<Money>().toMatchTypeOf<Decimal>();
    expectTypeOf(money(1).plus(1)).toEqualTypeOf<Decimal>();
  });

  it("keeps Money, Rate and plain Decimal apart", () => {
    // @ts-expect-error a plain Decimal is not Money
    const fromDecimal: Money = D(1);
    // @ts-expect-error a Rate is not Money
    const fromRate: Money = rate("0.05");
    // @ts-expect-error Money is not a Rate
    const toRate: Rate = money(1);
    expect([fromDecimal, fromRate, toRate].map(String)).toEqual([
      "1",
      "0.05",
      "1",
    ]);
  });
});

describe("mortgageBlock", () => {
  it("returns the very object it was given", () => {
    const fields = {
      id: "m1",
      propertyId: "p1",
      startDate: isoDate("2024-01-01"),
      initialPrincipal: money(1_000_000),
      fixationYears: 5,
      interestRatePa: rate("0.05"),
      monthlyInstalment: money(6_000),
    };
    const block = mortgageBlock(fields);
    expect(block).toBe(fields);
    expectTypeOf(block).toEqualTypeOf<MortgageBlock>();
  });
});

// The Decimal configuration is set once, in lib/money.ts, and nothing else changes it.
import { describe, it, expect } from "vitest";
import { D, Decimal, DECIMAL_PRECISION, DECIMAL_ROUNDING } from "../money";
import * as engine from "../../engine";

describe("Decimal configuration", () => {
  it("is 40 significant digits with ROUND_HALF_UP", () => {
    expect(DECIMAL_PRECISION).toBe(40);
    expect(DECIMAL_ROUNDING).toBe(Decimal.ROUND_HALF_UP);
    expect(Decimal.precision).toBe(40);
    expect(Decimal.rounding).toBe(Decimal.ROUND_HALF_UP);
  });

  it("is not changed by loading the engine", () => {
    expect(Object.keys(engine).length).toBeGreaterThan(0);
    expect(Decimal.precision).toBe(DECIMAL_PRECISION);
    expect(Decimal.rounding).toBe(DECIMAL_ROUNDING);
  });

  it("keeps 40 digits and rounds half up", () => {
    expect(D(1).div(3).toString()).toBe(
      "0.3333333333333333333333333333333333333333",
    );
    expect(D("2.5").toDecimalPlaces(0).toString()).toBe("3");
    expect(D("-2.5").toDecimalPlaces(0).toString()).toBe("-3");
  });
});

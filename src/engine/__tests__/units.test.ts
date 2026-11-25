// The engine's year/month conversions (#477): the plain `* 12` and `/ 12` they replaced.
import { describe, expect, it } from "vitest";
import { D } from "../../lib/money";
import {
  MONTHS_PER_YEAR,
  monthlyRate,
  monthsToYears,
  yearsToMonths,
} from "../units";

describe("units", () => {
  it("divides an annual rate by 12, to all 40 digits", () => {
    expect(MONTHS_PER_YEAR).toBe(12);
    expect(monthlyRate(D("0.0169")).toFixed()).toBe(
      D("0.0169").div(12).toFixed(),
    );
    expect(monthlyRate(D("0.045")).toFixed()).toBe("0.00375");
    expect(monthlyRate(D(0)).isZero()).toBe(true);
  });

  it("turns years into months and back", () => {
    expect(yearsToMonths(25)).toBe(300);
    expect(yearsToMonths(0)).toBe(0);
    expect(monthsToYears(300)).toBe(25);
    expect(monthsToYears(64)).toBe(64 / 12);
    expect(Math.ceil(monthsToYears(13))).toBe(2);
  });
});

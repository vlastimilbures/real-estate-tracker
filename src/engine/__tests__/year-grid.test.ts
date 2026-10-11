// turnOnYear at the edges of the projection grid (#159.2): 0 on or before baseDate, the
// year of the first month grid point on or after the date inside the horizon, and
// horizon + 1 past the last grid date.
import { describe, it, expect } from "vitest";
import { addDays, edate, isoDate } from "../dates";
import { turnOnYear } from "../yearGrid";
import { assumptions } from "./support/seed";

describe("turnOnYear at the horizon edges", () => {
  const { baseDate, horizonYears: H } = assumptions;

  it("is 0 on or before baseDate", () => {
    expect(turnOnYear(baseDate, assumptions)).toBe(0);
    expect(turnOnYear(isoDate("2020-01-01"), assumptions)).toBe(0);
  });

  it("is 1 from the day after baseDate to the end of year 1", () => {
    expect(turnOnYear(addDays(baseDate, 1), assumptions)).toBe(1);
    expect(turnOnYear(edate(baseDate, 12), assumptions)).toBe(1);
    expect(turnOnYear(addDays(edate(baseDate, 12), 1), assumptions)).toBe(2);
  });

  it("is H on the last grid date and H + 1 the day after", () => {
    const last = edate(baseDate, 12 * H);
    expect(turnOnYear(last, assumptions)).toBe(H);
    expect(turnOnYear(addDays(last, 1), assumptions)).toBe(H + 1);
  });

  it("follows the month-end clamp on a short horizon", () => {
    const a = {
      ...assumptions,
      baseDate: isoDate("2024-01-31"),
      horizonYears: 1,
    };
    expect(turnOnYear(isoDate("2024-02-29"), a)).toBe(1);
    expect(turnOnYear(isoDate("2025-01-31"), a)).toBe(1);
    expect(turnOnYear(isoDate("2025-02-01"), a)).toBe(2);
  });
});

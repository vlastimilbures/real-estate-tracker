// Base-scenario construction + one-line summary, extracted from Scenarios.tsx so
// they're unit-testable without mounting the component.
import { describe, it, expect } from "vitest";
import { baseScenario, summarize } from "../scenarios";
import { en } from "../../../i18n/en";
import { assumptions } from "../../../engine/__tests__/support/seed";
import { rate } from "../../../engine";
import type { Scenario } from "../../../engine";

describe("baseScenario", () => {
  it("has no overrides and is named/dated from the saved assumptions", () => {
    const b = baseScenario(assumptions, en);
    expect(b.id).toBe("base");
    expect(b.name).toBe(en.scenarios.base);
    expect(b.overrides).toEqual({});
    expect(b.createdAt).toBe(assumptions.baseDate);
  });
});

describe("summarize", () => {
  const withOverrides = (overrides: Scenario["overrides"]): Scenario => ({
    id: "s1",
    name: "Stress",
    overrides,
    createdAt: assumptions.baseDate,
  });

  it("reports no overrides when the scenario has none", () => {
    expect(summarize(withOverrides({}), en)).toBe(en.scenarios.noOverrides);
  });

  it("joins each set override into one summary string", () => {
    const s = withOverrides({
      appreciationPa: rate("0.02"),
      vacancyAllowance: rate("0.1"),
    });
    const out = summarize(s, en);
    expect(out).toContain("appreciation");
    expect(out).toContain("vacancy");
    expect(out).toContain(" · ");
  });

  it("includes shock duration in the inflation/rate shock summary", () => {
    const s = withOverrides({
      inflationShock: { deltaPa: rate("0.02"), durationYears: 3 },
      rateShock: { deltaPa: rate("0.01"), durationYears: 5 },
    });
    const out = summarize(s, en);
    expect(out).toContain("3");
    expect(out).toContain("5");
  });

  // ADR 0090: shock deltas are percentage points, not a percentage of the rate.
  it("states shock deltas in percentage points", () => {
    const s = withOverrides({
      inflationShock: { deltaPa: rate("0.03"), durationYears: 3 },
      rateShock: { deltaPa: rate("0.02"), durationYears: 3 },
    });
    expect(summarize(s, en)).toBe(
      "inflation +3,0 pp for 3y · rates +2,0 pp for 3y",
    );
  });

  it("includes the value shock's target year", () => {
    const s = withOverrides({ valueShock: { pct: rate("-0.1"), atYear: 4 } });
    expect(summarize(s, en)).toContain("4");
  });
});

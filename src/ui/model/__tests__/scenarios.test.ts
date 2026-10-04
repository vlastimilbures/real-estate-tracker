// Base-scenario construction + one-line summary, extracted from Scenarios.tsx so
// they're unit-testable without mounting the component.
import { describe, it, expect } from "vitest";
import { baseScenario, findByName, summarize } from "../scenarios";
import { en } from "../../../i18n/en";
import { rate } from "../../../engine";
import type { Scenario } from "../../../engine";

describe("baseScenario", () => {
  it("has no overrides and is named Base", () => {
    const b = baseScenario(en);
    expect(b.id).toBe("base");
    expect(b.name).toBe(en.scenarios.base);
    expect(b.overrides).toEqual({});
  });
});

describe("summarize", () => {
  const withOverrides = (overrides: Scenario["overrides"]): Scenario => ({
    id: "s1",
    name: "Stress",
    overrides,
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

  // ADR 0100: the rate shock's reach note follows the rate shock.
  it("puts the reach note right after the rate shock", () => {
    const s = withOverrides({
      rateShock: { deltaPa: rate("0.02"), durationYears: 3 },
      valueShock: { pct: rate("0.1"), atYear: 0 },
    });
    expect(summarize(s, en, "hits 3 of 3 loans (refix 2029, 2031)")).toBe(
      "rates +2,0 pp for 3y, hits 3 of 3 loans (refix 2029, 2031) · value −10,0 %",
    );
  });

  it("includes the value shock's target year", () => {
    const s = withOverrides({ valueShock: { pct: rate("-0.1"), atYear: 4 } });
    expect(summarize(s, en)).toContain("4");
  });
});

// ADR 0093: a preset whose name is already saved creates no row (#48), and a new
// scenario joins the compare while there is room (#49).
describe("findByName", () => {
  const saved: Scenario[] = [
    {
      id: "a",
      name: "Rates +2 pp for 3y",
      overrides: {},
    },
    { id: "b", name: "Stress", overrides: {} },
  ];

  it("finds a saved scenario with exactly that name", () => {
    expect(findByName(saved, "Stress")?.id).toBe("b");
  });

  it("returns undefined when no name matches exactly", () => {
    expect(findByName(saved, "stress")).toBeUndefined();
    expect(findByName([], "Stress")).toBeUndefined();
  });
});

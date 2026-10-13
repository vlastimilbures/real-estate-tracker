// Base-scenario construction + one-line summary, extracted from Scenarios.tsx so
// they're unit-testable without mounting the component.
import { describe, it, expect } from "vitest";
import {
  baseScenario,
  COMBINED_RECIPES,
  combinedPreset,
  findSaved,
  ratePreset,
  summarize,
} from "../scenarios";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { rate } from "../../../engine";
import type { Scenario, ScenarioOverrides } from "../../../engine";

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

  // ADR 0178 (#146 R4-04): a negative shock is signed once, by the formatter.
  it("signs a negative shock once", () => {
    const s = withOverrides({
      inflationShock: { deltaPa: rate("-0.005"), durationYears: 3 },
      rateShock: { deltaPa: rate("-0.01"), durationYears: 2 },
    });
    expect(summarize(s, en)).toBe(
      "inflation −0,5 pp for 3y · rates −1,0 pp for 2y",
    );
    expect(summarize(s, cs)).not.toContain("+");
    expect(summarize(s, cs)).toContain("inflace −0,5 p. b.");
    expect(summarize(s, cs)).toContain("sazby −1,0 p. b.");
    expect(summarize(s, ru)).toContain("инфляция −0,5 п. п.");
    expect(summarize(s, ru)).toContain("ставки −1,0 п. п.");
    expect(summarize(s, ru)).not.toContain("+");
  });

  // Wording log 2026-10-11 (#146 R4-04): the Czech summary declines the year word;
  // preset names keep "l." so a saved preset is still found by its name (ADR 0093).
  it("declines the Czech year word in the summary only", () => {
    const shock = (years: number) =>
      summarize(
        withOverrides({
          rateShock: { deltaPa: rate("0.02"), durationYears: years },
        }),
        cs,
      );
    expect(shock(1)).toBe("sazby +2,0 p. b. na 1 rok");
    expect(shock(3)).toBe("sazby +2,0 p. b. na 3 roky");
    expect(shock(5)).toBe("sazby +2,0 p. b. na 5 let");
    expect(
      summarize(
        withOverrides({
          inflationShock: { deltaPa: rate("0.03"), durationYears: 2 },
        }),
        cs,
      ),
    ).toBe("inflace +3,0 p. b. na 2 roky");
    expect(cs.scenarios.rateForYears("+2 p. b.", 3)).toBe(
      "Sazby +2 p. b. na 3 l.",
    );
  });

  // ADR 0100: the rate shock's reach note follows the rate shock.
  it("puts the reach note right after the rate shock", () => {
    const s = withOverrides({
      rateShock: { deltaPa: rate("0.02"), durationYears: 3 },
      valueShock: { pct: rate("0.1"), atYear: 0 },
    });
    expect(
      summarize(s, en, "hits 3 of 3 loans (fixation end 2029, 2031)"),
    ).toBe(
      "rates +2,0 pp for 3y, hits 3 of 3 loans (fixation end 2029, 2031) · value −10,0 %",
    );
  });

  it("includes the value shock's target year", () => {
    const s = withOverrides({ valueShock: { pct: rate("-0.1"), atYear: 4 } });
    expect(summarize(s, en)).toContain("4");
  });
});

// ADR 0191 §3 (#162): a preset matches a saved scenario by its settings, not its name.
describe("findSaved", () => {
  const preset = ratePreset(2, en);
  const saved = (id: string, overrides: ScenarioOverrides): Scenario => ({
    id,
    name: preset.name,
    overrides,
  });

  it("finds a saved scenario with equal settings, whatever its name", () => {
    const list = [
      saved("a", {}),
      { id: "b", name: "My rate test", overrides: preset.overrides },
    ];
    expect(findSaved(list, preset.overrides)?.id).toBe("b");
  });

  it("compares amounts by value, not by how they are written", () => {
    const list = [
      saved("a", {
        rateShock: { deltaPa: rate("0.020"), durationYears: 3 },
      }),
    ];
    expect(findSaved(list, preset.overrides)?.id).toBe("a");
  });

  it("finds nothing when one setting differs or is missing", () => {
    const shock = preset.overrides.rateShock!;
    expect(
      findSaved(
        [
          saved("years", { rateShock: { ...shock, durationYears: 5 } }),
          saved("delta", { rateShock: { ...shock, deltaPa: rate("0.03") } }),
          saved("extra", { ...preset.overrides, inflationPa: rate("0.02") }),
          saved("none", {}),
        ],
        preset.overrides,
      ),
    ).toBeUndefined();
    expect(findSaved([], preset.overrides)).toBeUndefined();
  });

  it("matches a combined preset whatever the order of its parts", () => {
    const combined = combinedPreset(COMBINED_RECIPES[0], 5, en);
    const o = combined.overrides;
    const reordered: ScenarioOverrides = {
      valueShock: o.valueShock!,
      ...(o.inflationShock && { inflationShock: o.inflationShock }),
      rateShock: o.rateShock!,
    };
    expect(findSaved([saved("c", reordered)], o)?.id).toBe("c");
  });
});

// #469 (ADR 0123): the compare runs only the scenarios whose own overrides break no
// engine rule. The filter is an engine rule, so it lives in the engine, not in a hook.
import { describe, it, expect } from "vitest";
import { rate } from "../brands";
import {
  comparableScenarios,
  scenarioErrorsAddedBy,
  scenarioRuleErrors,
} from "../validate";
import type { Scenario } from "../scenarios";
import { assumptions } from "./support/seed";

const base: Scenario = { id: "b", name: "Base", overrides: {} };
const low: Scenario = {
  id: "low",
  name: "Low",
  overrides: { appreciationPa: rate("0.01") },
};
const bad: Scenario = {
  id: "bad",
  name: "Crash typed as −20 %",
  overrides: { valueShock: { pct: rate("-0.2"), atYear: 0 } },
};

describe("comparableScenarios", () => {
  it("leaves out a scenario that breaks a rule and keeps the order", () => {
    expect(scenarioRuleErrors(assumptions, bad.overrides)).not.toEqual([]);
    expect(comparableScenarios(assumptions, [low, bad, base])).toEqual([
      low,
      base,
    ]);
  });

  it("returns the scenarios themselves", () => {
    const [first] = comparableScenarios(assumptions, [low]);
    expect(first).toBe(low);
  });

  it("returns none for none", () => {
    expect(comparableScenarios(assumptions, [])).toEqual([]);
  });
});

// ADR 0128 §6: an assumptions edit is blocked only by the rules it newly breaks; a rule
// the scenario already broke on another field does not hide it.
describe("scenarioErrorsAddedBy", () => {
  const shock = (deltaPa: string) => ({
    deltaPa: rate(deltaPa),
    durationYears: 3,
  });
  const overrides = {
    rateShock: shock("-0.05"),
    inflationShock: shock("-0.6"),
  };
  const lowInflation = { ...assumptions, inflationPa: rate("-0.5") };

  it("lists the new problem beside one the scenario already had", () => {
    expect(scenarioRuleErrors(assumptions, overrides)).toEqual([
      {
        code: "SHOCKED_RATE_OUT_OF_RANGE",
        entity: "assumptions",
        field: "rateShock",
      },
    ]);
    expect(scenarioErrorsAddedBy(assumptions, lowInflation, overrides)).toEqual(
      [
        {
          code: "SHOCKED_INFLATION_OUT_OF_RANGE",
          entity: "assumptions",
          field: "inflationShock",
        },
      ],
    );
  });
});

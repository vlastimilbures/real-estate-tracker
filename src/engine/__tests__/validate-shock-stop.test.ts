// A shock with a non-finite delta or percentage reports NON_FINITE_NUMBER alone, not
// also SHOCK_OUT_OF_RANGE for its duration or year (ADR 0251 §3).
import { describe, expect, it } from "vitest";
import { rate } from "../brands";
import { EngineInputError } from "../errors";
import { scenarioRuleErrors } from "../index";
import { assertAssumptions, validateInputs } from "../validate";
import type { Assumptions } from "../types";
import { assumptions, portfolio } from "./support/seed";

const errors = (a: Partial<Assumptions>) =>
  validateInputs(portfolio, { ...assumptions, ...a });

const on = (code: string, field: string) => [
  { code, entity: "assumptions", field },
];

const NON_FINITE = [NaN, Infinity, -Infinity];

describe("a non-finite shock reports once (ADR 0251 §3)", () => {
  for (const field of ["inflationShock", "rateShock"] as const)
    it(`${field}: a non-finite delta with a bad duration`, () => {
      for (const v of NON_FINITE)
        for (const durationYears of [-1, 1.5])
          expect(
            errors({ [field]: { deltaPa: rate(v), durationYears } }),
            `${v} ${durationYears}`,
          ).toStrictEqual(on("NON_FINITE_NUMBER", field));
    });

  it("valueShock: a non-finite percentage with a bad year", () => {
    for (const v of NON_FINITE)
      for (const atYear of [-1, 0.5])
        expect(
          errors({ valueShock: { pct: rate(v), atYear } }),
          `${v} ${atYear}`,
        ).toStrictEqual(on("NON_FINITE_NUMBER", "valueShock"));
  });

  it("a finite delta or percentage keeps SHOCK_OUT_OF_RANGE", () => {
    expect(
      errors({ rateShock: { deltaPa: rate("0.01"), durationYears: -1 } }),
    ).toStrictEqual(on("SHOCK_OUT_OF_RANGE", "rateShock"));
    expect(
      errors({ valueShock: { pct: rate("0.2"), atYear: 1.5 } }),
    ).toStrictEqual(on("SHOCK_OUT_OF_RANGE", "valueShock"));
    expect(
      errors({ valueShock: { pct: rate("1.2"), atYear: 1 } }),
    ).toStrictEqual(on("SHOCK_OUT_OF_RANGE", "valueShock"));
  });

  it("the assumptions assert raises the one error", () => {
    const a = {
      ...assumptions,
      inflationShock: { deltaPa: rate(NaN), durationYears: -1 },
    };
    expect(() => assertAssumptions(a)).toThrow(EngineInputError);
    try {
      assertAssumptions(a);
    } catch (e) {
      expect((e as EngineInputError).errors).toStrictEqual(
        on("NON_FINITE_NUMBER", "inflationShock"),
      );
      expect((e as EngineInputError).message).toBe(
        "Invalid assumptions: NON_FINITE_NUMBER (inflationShock)",
      );
    }
  });

  it("a scenario's shock override reports the one error", () => {
    expect(
      scenarioRuleErrors(assumptions, {
        rateShock: { deltaPa: rate(Infinity), durationYears: 1.5 },
        valueShock: { pct: rate(NaN), atYear: -2 },
      }),
    ).toStrictEqual([
      ...on("NON_FINITE_NUMBER", "rateShock"),
      ...on("NON_FINITE_NUMBER", "valueShock"),
    ]);
  });
});

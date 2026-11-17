// #464: the engine's input rules are open-ended above the form bounds today, and a
// negative zero is outside a unit rate. Pinned so moving the rules cannot change them.
import { describe, it, expect } from "vitest";
import { rate, validateInputs } from "..";
import { assumptions, portfolio } from "./support/seed";

const withBlock = (fixationYears: number, loanTermYears: number) => ({
  ...portfolio,
  mortgages: portfolio.mortgages.map((m, i) =>
    i === 0 ? { ...m, fixationYears, loanTermYears } : m,
  ),
});

describe("engine rules above the form bounds", () => {
  it("accept a fixation and a loan term of 60 years", () => {
    expect(validateInputs(withBlock(60, 60), assumptions)).toEqual([]);
  });

  it("accept a horizon of 150 years", () => {
    expect(
      validateInputs(portfolio, { ...assumptions, horizonYears: 150 }),
    ).toEqual([]);
  });

  it("accept a shock lasting 0 or 500 years and a crash at year 500", () => {
    for (const durationYears of [0, 500])
      expect(
        validateInputs(portfolio, {
          ...assumptions,
          rateShock: { deltaPa: rate("0.01"), durationYears },
          inflationShock: { deltaPa: rate("0.01"), durationYears },
        }),
        String(durationYears),
      ).toEqual([]);
    expect(
      validateInputs(portfolio, {
        ...assumptions,
        valueShock: { pct: rate("0.1"), atYear: 500 },
      }),
    ).toEqual([]);
  });
});

describe("a negative zero unit rate", () => {
  it("is refused as a vacancy", () => {
    expect(
      validateInputs(portfolio, {
        ...assumptions,
        vacancyAllowance: rate("-0"),
      }),
    ).toEqual([
      {
        code: "RATE_OUT_OF_RANGE",
        entity: "assumptions",
        field: "vacancyAllowance",
      },
    ]);
  });
});

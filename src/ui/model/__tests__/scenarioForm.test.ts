// Scenario draft parsing, extracted from ScenarioForm.tsx so it's unit-testable
// without mounting the component (mirrors mortgageForm.test.ts).
import { describe, it, expect } from "vitest";
import {
  parseScenarioDraft,
  scenarioWriteErrors,
  DEFAULT_SHOCK_YEARS,
  type ScenarioDraftFields,
} from "../scenarioForm";
import { en } from "../../../i18n/en";
import type { EngineValidationError } from "../../../engine";
import type { WriteError } from "../../../state/writeError";

const blank: ScenarioDraftFields = {
  name: "",
  appreciationPa: "",
  rentIndexationPa: "",
  vacancyAllowance: "",
  postFixationResetRatePa: "",
  inflationPa: "",
  inflationShockDelta: "",
  inflationShockYears: "",
  rateShockDelta: "",
  rateShockYears: "",
  valueShockPct: "",
  valueShockYear: "",
};

describe("parseScenarioDraft", () => {
  it("requires a name", () => {
    const { errors } = parseScenarioDraft(blank, en);
    expect(errors.name).toBe(en.forms.required);
  });

  it("leaves overrides empty when every field is blank (inherits Base)", () => {
    const { errors, overrides } = parseScenarioDraft(
      { ...blank, name: "Stress test" },
      en,
    );
    expect(errors).toEqual({});
    expect(overrides).toEqual({});
  });

  it("parses level overrides as ratios", () => {
    const { errors, overrides } = parseScenarioDraft(
      { ...blank, name: "S", appreciationPa: "2.5", vacancyAllowance: "5" },
      en,
    );
    expect(errors).toEqual({});
    expect(overrides.appreciationPa?.toString()).toBe("0.025");
    expect(overrides.vacancyAllowance?.toString()).toBe("0.05");
  });

  it("rejects an unparseable level override", () => {
    const { errors } = parseScenarioDraft(
      { ...blank, name: "S", appreciationPa: "abc" },
      en,
    );
    expect(errors.appreciationPa).toBe(en.forms.invalidHint.pct);
  });

  it("parses an inflation shock with default duration when years is blank", () => {
    const { errors, overrides } = parseScenarioDraft(
      { ...blank, name: "S", inflationShockDelta: "1.5" },
      en,
    );
    expect(errors).toEqual({});
    expect(overrides.inflationShock).toEqual({
      deltaPa: overrides.inflationShock?.deltaPa,
      durationYears: DEFAULT_SHOCK_YEARS,
    });
    expect(overrides.inflationShock?.deltaPa.toString()).toBe("0.015");
  });

  it("parses an explicit shock duration", () => {
    const { overrides } = parseScenarioDraft(
      {
        ...blank,
        name: "S",
        rateShockDelta: "1",
        rateShockYears: "5",
      },
      en,
    );
    expect(overrides.rateShock?.durationYears).toBe(5);
  });

  it("rejects a shock duration below 1", () => {
    const { errors } = parseScenarioDraft(
      { ...blank, name: "S", rateShockDelta: "1", rateShockYears: "0" },
      en,
    );
    expect(errors.rateShockYears).toBe(en.forms.intRange("1", "100"));
  });

  it("ignores the years field when delta is blank (no shock)", () => {
    const { errors, overrides } = parseScenarioDraft(
      { ...blank, name: "S", inflationShockYears: "10" },
      en,
    );
    expect(errors).toEqual({});
    expect(overrides.inflationShock).toBeUndefined();
  });

  // Parsing is shape-only: the store refuses a negative crash with the engine rule
  // (ADR 0123), see scenarioWriteErrors below.
  it("parses a value shock defaulting atYear to 0 (today)", () => {
    const { errors, overrides } = parseScenarioDraft(
      { ...blank, name: "S", valueShockPct: "-10" },
      en,
    );
    expect(errors).toEqual({});
    expect(overrides.valueShock?.atYear).toBe(0);
    expect(overrides.valueShock?.pct.toString()).toBe("-0.1");
  });

  it("rejects a negative value-shock year", () => {
    const { errors } = parseScenarioDraft(
      { ...blank, name: "S", valueShockPct: "-10", valueShockYear: "-1" },
      en,
    );
    expect(errors.valueShockYear).toBe(en.forms.intRange("0", "100"));
  });
});

describe("scenarioWriteErrors (ADR 0123)", () => {
  const input = (...errors: EngineValidationError[]): WriteError => ({
    kind: "input",
    errors,
  });

  it("shows a vacancy or value-crash rule on its field, in the engine's words", () => {
    expect(
      scenarioWriteErrors(
        en,
        input(
          {
            code: "RATE_OUT_OF_RANGE",
            entity: "assumptions",
            field: "vacancyAllowance",
          },
          {
            code: "SHOCK_OUT_OF_RANGE",
            entity: "assumptions",
            field: "valueShock",
          },
        ),
      ),
    ).toEqual({
      fieldErrors: {
        vacancyAllowance: en.inputRules.RATE_OUT_OF_RANGE,
        valueShockPct: en.inputRules.SHOCK_OUT_OF_RANGE,
      },
      formError: null,
    });
  });

  it("puts any other failure above the buttons", () => {
    expect(
      scenarioWriteErrors(
        en,
        input({
          code: "SHOCK_OUT_OF_RANGE",
          entity: "assumptions",
          field: "rateShock",
        }),
      ),
    ).toEqual({ fieldErrors: {}, formError: en.inputRules.SHOCK_OUT_OF_RANGE });
    const other = scenarioWriteErrors(en, {
      kind: "other",
      message: "disk full",
    });
    expect(other.fieldErrors).toEqual({});
    expect(other.formError).toBeTruthy();
  });
});

// ADR 0128: a level rule shows on its level field, a shocked level on the shock's delta.
describe("scenarioWriteErrors — ADR 0128 bounds", () => {
  const input = (...errors: EngineValidationError[]): WriteError => ({
    kind: "input",
    errors,
  });

  it("puts a level rule on its field and a shocked level on the delta", () => {
    expect(
      scenarioWriteErrors(
        en,
        input(
          {
            code: "GROWTH_OUT_OF_RANGE",
            entity: "assumptions",
            field: "inflationPa",
          },
          {
            code: "RATE_OUT_OF_RANGE",
            entity: "assumptions",
            field: "postFixationResetRatePa",
          },
          {
            code: "SHOCKED_RATE_OUT_OF_RANGE",
            entity: "assumptions",
            field: "rateShock",
          },
          {
            code: "SHOCKED_INFLATION_OUT_OF_RANGE",
            entity: "assumptions",
            field: "inflationShock",
          },
        ),
      ),
    ).toEqual({
      fieldErrors: {
        inflationPa: en.inputRules.GROWTH_OUT_OF_RANGE,
        postFixationResetRatePa: en.inputRules.RATE_OUT_OF_RANGE,
        rateShockDelta: en.inputRules.SHOCKED_RATE_OUT_OF_RANGE,
        inflationShockDelta: en.inputRules.SHOCKED_INFLATION_OUT_OF_RANGE,
      },
      formError: null,
    });
  });
});

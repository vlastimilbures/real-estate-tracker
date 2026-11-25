// #490 PR 3: which scenario-form field a refused save shows on, pinned before the form
// names its fields through one `errorField` (ADR 0261, #440, ADR 0257 §1).
import { describe, it, expect } from "vitest";
import { scenarioWriteErrors } from "../scenarioForm";
import { getDict } from "../../../i18n";
import type { EngineValidationError, ValidationCode } from "../../../engine";
import type { WriteError } from "../../../state/writeError";

const en = getDict("en");

const refusal = (
  field: string | undefined,
  code: ValidationCode = "NEGATIVE_AMOUNT",
  index?: number,
): WriteError => ({
  kind: "input",
  errors: [
    {
      code,
      entity: "assumptions",
      id: "s",
      // Any name, the engine's or not, to pin where each one goes.
      ...(field !== undefined && {
        field: field as EngineValidationError["field"],
      }),
      ...(index !== undefined && { index }),
    },
  ],
});

/** The form key a one-rule refusal shows on, or "form" for the line above the buttons. */
function placeOf(e: WriteError): string {
  const split = scenarioWriteErrors(en, e);
  const keys = Object.keys(split.fieldErrors);
  if (split.formError !== null) keys.push("form");
  return keys.join(",");
}

describe("scenario save errors (ADR 0261, #490)", () => {
  it.each([
    ["appreciationPa", "appreciationPa"],
    ["rentIndexationPa", "rentIndexationPa"],
    ["vacancyAllowance", "vacancyAllowance"],
    ["postFixationResetRatePa", "postFixationResetRatePa"],
    ["inflationPa", "inflationPa"],
    ["valueShock", "valueShockPct"],
    ["valueShockPct", "valueShockPct"],
    ["rateShockDelta", "rateShockDelta"],
    ["inflationShockDelta", "inflationShockDelta"],
    ["inflationShockYears", "inflationShockYears"],
    ["rateShockYears", "rateShockYears"],
    ["valueShockYear", "valueShockYear"],
    ["defaults.inflationPa", "inflationPa"],
    ["name", "form"],
    ["rateShock", "form"],
    ["horizonYears", "form"],
    [undefined, "form"],
  ])("a rule on %s shows on %s", (field, place) => {
    expect(placeOf(refusal(field))).toBe(place);
  });

  it("a shocked level shows on its shock, whatever field it names", () => {
    expect(placeOf(refusal("x", "SHOCKED_RATE_OUT_OF_RANGE"))).toBe(
      "rateShockDelta",
    );
    expect(placeOf(refusal("x", "SHOCKED_INFLATION_OUT_OF_RANGE"))).toBe(
      "inflationShockDelta",
    );
  });

  it("an index does not make a row key", () => {
    expect(placeOf(refusal("inflationPa", "NEGATIVE_AMOUNT", 2))).toBe(
      "inflationPa",
    );
  });

  it("any other failure shows above the buttons", () => {
    expect(
      scenarioWriteErrors(en, { kind: "other", message: "disk is full" }),
    ).toEqual({ fieldErrors: {}, formError: "disk is full" });
  });
});

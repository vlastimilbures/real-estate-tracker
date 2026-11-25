// #464: today's form refusals and their English messages at each bound, pinned with
// literal values so moving the input rules into one module cannot change them.
import { describe, it, expect } from "vitest";
import {
  collectValues,
  formRules,
  parseDate,
  type FieldSpec,
} from "../formParse";
import { BLANK_PROPERTY_FORM, parsePropertyForm } from "../propertyForm";
import { parseScenarioDraft, type ScenarioDraftFields } from "../scenarioForm";
import { en } from "../../../i18n/en";

/** The thousands separator fmtCzk writes: a plain space. */
const GROUP = " ";

/** One int field with a literal range, parsed by the forms' rules. */
function intField(min: number, max: number, raw: string) {
  const specs = [
    {
      name: "n",
      label: "N",
      kind: "int",
      range: { min, max },
    },
  ] as const satisfies readonly FieldSpec[];
  return collectValues(specs, { n: raw }, formRules(en));
}

describe("whole-number fields at their bounds (forms)", () => {
  it("horizon 1–100", () => {
    const msg = "Must be a whole number from 1 to 100";
    expect(intField(1, 100, "0").errors).toEqual({ n: msg });
    expect(intField(1, 100, "1")).toEqual({ values: { n: 1 }, errors: {} });
    expect(intField(1, 100, "100")).toEqual({
      values: { n: 100 },
      errors: {},
    });
    expect(intField(1, 100, "101").errors).toEqual({ n: msg });
  });

  it("fixation 0–50", () => {
    const msg = "Must be a whole number from 0 to 50";
    expect(intField(0, 50, "-1").errors).toEqual({ n: msg });
    expect(intField(0, 50, "0")).toEqual({ values: { n: 0 }, errors: {} });
    expect(intField(0, 50, "50")).toEqual({ values: { n: 50 }, errors: {} });
    expect(intField(0, 50, "51").errors).toEqual({ n: msg });
  });

  it("loan term 1–50", () => {
    const msg = "Must be a whole number from 1 to 50";
    expect(intField(1, 50, "0").errors).toEqual({ n: msg });
    expect(intField(1, 50, "1")).toEqual({ values: { n: 1 }, errors: {} });
    expect(intField(1, 50, "50")).toEqual({ values: { n: 50 }, errors: {} });
    expect(intField(1, 50, "51").errors).toEqual({ n: msg });
  });
});

describe("the property size (form)", () => {
  const form = (sizeM2: string) =>
    parsePropertyForm(
      {
        ...BLANK_PROPERTY_FORM,
        name: "A",
        purchaseDate: "01.01.2020",
        purchasePrice: "100",
        sizeM2,
      },
      "p1",
      [],
      en,
    );
  const msg = `Must be a number from 1 to 10${GROUP}000 with at most one decimal place`;

  it("refuses 0, 54.55 and 10000.1 with the size range", () => {
    for (const raw of ["0", "54.55", "10000.1"])
      expect(form(raw).errors, raw).toEqual({ sizeM2: msg });
  });

  it("accepts 1, 54.5 and 10000", () => {
    expect(form("1").property?.sizeM2).toBe(1);
    expect(form("54.5").property?.sizeM2).toBe(54.5);
    expect(form("10000").property?.sizeM2).toBe(10000);
  });
});

describe("the scenario shock years and crash year (form)", () => {
  const blank: ScenarioDraftFields = {
    name: "S",
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

  it("shock years 1–100", () => {
    const draft = (years: string) =>
      parseScenarioDraft(
        { ...blank, inflationShockDelta: "1", inflationShockYears: years },
        en,
      );
    const msg = "Must be a whole number from 1 to 100";
    expect(draft("0").errors).toEqual({ inflationShockYears: msg });
    expect(draft("101").errors).toEqual({ inflationShockYears: msg });
    expect(draft("1").overrides.inflationShock?.durationYears).toBe(1);
    expect(draft("100").overrides.inflationShock?.durationYears).toBe(100);
  });

  it("crash year 0–100", () => {
    const draft = (year: string) =>
      parseScenarioDraft(
        { ...blank, valueShockPct: "10", valueShockYear: year },
        en,
      );
    const msg = "Must be a whole number from 0 to 100";
    expect(draft("-1").errors).toEqual({ valueShockYear: msg });
    expect(draft("101").errors).toEqual({ valueShockYear: msg });
    expect(draft("0").overrides.valueShock?.atYear).toBe(0);
    expect(draft("100").overrides.valueShock?.atYear).toBe(100);
  });
});

describe("the date floor (forms)", () => {
  it("refuses 31.12.1899 with the date hint and accepts 01.01.1900", () => {
    expect(parseDate("31.12.1899")).toBeNull();
    expect(parseDate("01.01.1900")?.toISOString()).toBe(
      "1900-01-01T00:00:00.000Z",
    );
    const specs = [
      { name: "d", label: "D", kind: "date" },
    ] as const satisfies readonly FieldSpec[];
    expect(
      collectValues(specs, { d: "31.12.1899" }, formRules(en)).errors,
    ).toEqual({ d: "Enter a date from 01.01.1900 as dd.mm.yyyy" });
  });
});

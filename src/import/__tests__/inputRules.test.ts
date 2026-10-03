// The restore rule set (P5b) applies the whole-number bounds of the forms and CSV import
// on top of the engine rules (ADR 0086, #38). The engine itself stays open-ended.
import { describe, it, expect } from "vitest";
import { checkInputRules } from "../inputRules";
import { parseMortgages, parseProperties } from "../csv";
import { INT_RANGES, type IntRange } from "../../lib/intRanges";
import { collectValues } from "../../ui/model/formParse";
import { FORM_PARSERS } from "../../ui/model/formParsers";
import { validateInputs } from "../../engine";
import type { Assumptions, Portfolio } from "../../engine";
import { assumptions, portfolio } from "../../engine/__tests__/support/seed";

type Field = keyof typeof INT_RANGES;

/** The seed inputs with one whole-number field set to `n`. */
function withValue(field: Field, n: number): [Portfolio, Assumptions] {
  const [p0, ...ps] = portfolio.properties;
  const [m0, ...ms] = portfolio.mortgages;
  switch (field) {
    case "horizonYears":
      return [portfolio, { ...assumptions, horizonYears: n }];
    case "sizeM2":
      return [
        { ...portfolio, properties: [{ ...p0!, sizeM2: n }, ...ps] },
        assumptions,
      ];
    case "fixationYears":
    case "loanTermYears":
      return [
        { ...portfolio, mortgages: [{ ...m0!, [field]: n }, ...ms] },
        assumptions,
      ];
  }
}

const target: Record<Field, { entity: string; id?: string }> = {
  horizonYears: { entity: "assumptions" },
  sizeM2: { entity: "property", id: portfolio.properties[0]!.id },
  fixationYears: { entity: "mortgage", id: portfolio.mortgages[0]!.id },
  loanTermYears: { entity: "mortgage", id: portfolio.mortgages[0]!.id },
};

const fields = Object.keys(INT_RANGES) as Field[];
const probes = (r: IntRange) => [r.min - 1, r.min, r.max, r.max + 1];

describe("checkInputRules whole-number bounds (ADR 0086)", () => {
  it("the seed inputs pass", () => {
    expect(checkInputRules(portfolio, assumptions)).toEqual([]);
  });

  for (const field of fields) {
    const range = INT_RANGES[field];
    it(`${field}: ${range.min}–${range.max}`, () => {
      // Below a minimum of 1 the engine rule fires instead (see the dedupe test).
      for (const n of [range.min, range.max])
        expect(checkInputRules(...withValue(field, n)), `${n}`).toEqual([]);
      expect(checkInputRules(...withValue(field, range.max + 1))).toEqual([
        { code: "OUT_OF_RANGE", ...target[field], field, range },
      ]);
    });
  }

  it("an engine rule on the same field is listed alone", () => {
    for (const [field, n, code] of [
      ["horizonYears", 0, "HORIZON_NOT_POSITIVE"],
      ["fixationYears", -1, "INVALID_TERM"],
    ] as const) {
      const [p, a] = withValue(field, n);
      const engine = validateInputs(p, a);
      expect(engine, field).toEqual([expect.objectContaining({ code, field })]);
      expect(checkInputRules(p, a), field).toEqual(engine);
    }
  });

  it("without assumptions, only the portfolio fields are checked", () => {
    const [p] = withValue("sizeM2", 10_001);
    expect(checkInputRules(p)).toEqual([
      expect.objectContaining({ code: "OUT_OF_RANGE", field: "sizeM2" }),
    ]);
  });

  it("the engine stays open-ended", () => {
    expect(validateInputs(...withValue("horizonYears", 150))).toEqual([]);
  });
});

// Form, CSV import and restore refuse the same values (ADR 0075, 0076, 0086).
describe("every entry point applies INT_RANGES", () => {
  const MH =
    "property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment,loan_term_years";
  const H =
    "name,address,type,size_m2,garage,purchase_date,purchase_price,appreciation_override_pa,rent_index_override_pa";
  /** CSV import's verdict; horizon is not a CSV column. */
  const csv: Record<Field, ((n: number) => boolean) | undefined> = {
    horizonYears: undefined,
    fixationYears: (n) =>
      parseMortgages(`${MH}\nA,2025-01-01,100000,${n},0.03,2000,30`).errors
        .length === 0,
    loanTermYears: (n) =>
      parseMortgages(`${MH}\nA,2025-01-01,100000,5,0.03,2000,${n}`).errors
        .length === 0,
    sizeM2: (n) =>
      parseProperties(`${H}\nA,,,${n},,2020-01-01,100,,`).errors.length === 0,
  };
  const form = (field: Field, n: number) =>
    Object.keys(
      collectValues(
        [{ name: field, label: field, kind: "int", range: INT_RANGES[field] }],
        { [field]: String(n) },
        { parsers: FORM_PARSERS, blank: () => "blank", invalid: () => "bad" },
      ).errors,
    ).length === 0;
  const restore = (field: Field, n: number) =>
    checkInputRules(...withValue(field, n)).length === 0;

  for (const field of fields)
    it(field, () => {
      for (const n of probes(INT_RANGES[field])) {
        const accepted =
          n >= INT_RANGES[field].min && n <= INT_RANGES[field].max;
        expect(form(field, n), `form ${n}`).toBe(accepted);
        expect(restore(field, n), `restore ${n}`).toBe(accepted);
        const viaCsv = csv[field];
        if (viaCsv) expect(viaCsv(n), `csv ${n}`).toBe(accepted);
      }
    });
});

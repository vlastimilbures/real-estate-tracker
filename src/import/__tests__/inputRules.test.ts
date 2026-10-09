// The restore rule set (P5b) applies the whole-number bounds of the forms and CSV import
// on top of the engine rules (ADR 0086, #38). The engine itself stays open-ended.
import { describe, it, expect } from "vitest";
import {
  checkInputRules,
  scenarioErrorsAddedBy,
  scenarioRuleErrors,
} from "../inputRules";
import { parseMortgages, parseProperties } from "../csv";
import { INT_RANGES, type IntRange } from "../../lib/intRanges";
import { collectValues } from "../../ui/model/formParse";
import { FORM_PARSERS } from "../../ui/model/formParsers";
import { isoDate, rate, validateInputs } from "../../engine";
import type { Assumptions, Portfolio, ScenarioOverrides } from "../../engine";
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
      ["loanTermYears", 1.5, "INVALID_TERM"], // restore refuses it (ADR 0135)
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

// ADR 0123 (#107, #108): a scenario is checked by the engine's assumption rules on top
// of the saved assumptions, counting only the fields the scenario sets.
describe("scenarioRuleErrors (ADR 0123)", () => {
  /** One value per override the engine refuses. `Required` makes a new override key a
   *  compile error here until it gets a case: the store, restore and the compare rely on
   *  every engine field name being the override's own key. */
  const BAD = {
    appreciationPa: rate("NaN"),
    rentIndexationPa: rate("NaN"),
    vacancyAllowance: rate("1.5"),
    postFixationResetRatePa: rate("NaN"),
    inflationPa: rate("NaN"),
    inflationShock: { deltaPa: rate("0.01"), durationYears: -1 },
    rateShock: { deltaPa: rate("0.01"), durationYears: -1 },
    valueShock: { pct: rate("1.5"), atYear: 0 },
  } satisfies Required<ScenarioOverrides>;

  it.each(Object.entries(BAD))(
    "an engine rule on %s names that override",
    (key, value) => {
      const errors = scenarioRuleErrors(assumptions, { [key]: value });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.map((e) => e.field)).toEqual(errors.map(() => key));
    },
  );

  it("passes no overrides and the seed's own values", () => {
    expect(scenarioRuleErrors(assumptions, {})).toEqual([]);
    expect(
      scenarioRuleErrors(assumptions, {
        appreciationPa: rate("-0.05"), // growth may be negative (ADR 0038, 0128)
        vacancyAllowance: rate("1"),
        valueShock: { pct: rate("0"), atYear: 0 },
      }),
    ).toEqual([]);
  });

  it("never blames a problem in the base assumptions on the scenario", () => {
    const badBase = { ...assumptions, vacancyAllowance: rate("1.5") };
    expect(
      scenarioRuleErrors(badBase, { appreciationPa: rate("0.01") }),
    ).toEqual([]);
    // An override that replaces the bad base value is fine too.
    expect(
      scenarioRuleErrors(badBase, { vacancyAllowance: rate("0.1") }),
    ).toEqual([]);
  });
});

// ADR 0128 (#114): a shock meets the base level it shifts. The cross-field rules are the
// one place where a scenario's verdict depends on the base assumptions.
describe("cross-field scenario rules (ADR 0128)", () => {
  const shock = (deltaPa: string) => ({
    deltaPa: rate(deltaPa),
    durationYears: 3,
  });
  const shocked = (field: "rateShock" | "inflationShock") => [
    {
      code:
        field === "rateShock"
          ? "SHOCKED_RATE_OUT_OF_RANGE"
          : "SHOCKED_INFLATION_OUT_OF_RANGE",
      entity: "assumptions",
      field,
    },
  ];

  it("a scenario's shock on the saved level names the shock", () => {
    // Seed reset rate 4.5 %, inflation 2.5 %.
    expect(
      scenarioRuleErrors(assumptions, { rateShock: shock("-0.10") }),
    ).toEqual(shocked("rateShock"));
    expect(
      scenarioRuleErrors(assumptions, { inflationShock: shock("-1.2") }),
    ).toEqual(shocked("inflationShock"));
    // The scenario's own level counts, not the saved one.
    expect(
      scenarioRuleErrors(assumptions, {
        postFixationResetRatePa: rate("0.01"),
        rateShock: shock("-0.02"),
      }),
    ).toEqual(shocked("rateShock"));
    expect(
      scenarioRuleErrors(assumptions, {
        postFixationResetRatePa: rate("0.10"),
        rateShock: shock("-0.08"),
      }),
    ).toEqual([]);
  });

  it("an invalid saved level is not blamed on the scenario's shock", () => {
    const badBase = { ...assumptions, postFixationResetRatePa: rate("1.5") };
    expect(scenarioRuleErrors(badBase, { rateShock: shock("-0.2") })).toEqual(
      [],
    );
  });

  describe("scenarioErrorsAddedBy", () => {
    const lowered = { ...assumptions, postFixationResetRatePa: rate("0.03") };

    it("lists a rule the new assumptions break and the old did not", () => {
      const overrides = { rateShock: shock("-0.04") };
      expect(scenarioRuleErrors(assumptions, overrides)).toEqual([]);
      expect(scenarioErrorsAddedBy(assumptions, lowered, overrides)).toEqual(
        shocked("rateShock"),
      );
      expect(
        scenarioErrorsAddedBy(
          assumptions,
          { ...assumptions, inflationPa: rate("-0.5") },
          { inflationShock: shock("-0.6") },
        ),
      ).toEqual(shocked("inflationShock"));
    });

    it("ignores a scenario that already broke the rule", () => {
      const overrides = { rateShock: shock("-0.05") };
      expect(scenarioRuleErrors(assumptions, overrides)).toEqual(
        shocked("rateShock"),
      );
      expect(scenarioErrorsAddedBy(assumptions, lowered, overrides)).toEqual(
        [],
      );
    });

    it("ignores a scenario that sets the level itself", () => {
      expect(
        scenarioErrorsAddedBy(assumptions, lowered, {
          postFixationResetRatePa: rate("0.05"),
          rateShock: shock("-0.04"),
        }),
      ).toEqual([]);
    });
  });
});

// ADR 0128 §7: restore applies the new assumption and property rules (scenario rows only
// need to be readable, ADR 0123 §4).
describe("restore applies the ADR 0128 bounds", () => {
  it("reports a reset rate outside 0–1 and a growth override at −100 %", () => {
    const [p0, ...ps] = portfolio.properties;
    const p: Portfolio = {
      ...portfolio,
      properties: [{ ...p0!, appreciationOverridePa: rate("-1") }, ...ps],
    };
    expect(
      checkInputRules(p, {
        ...assumptions,
        postFixationResetRatePa: rate("-0.05"),
      }),
    ).toEqual([
      {
        code: "RATE_OUT_OF_RANGE",
        entity: "assumptions",
        field: "postFixationResetRatePa",
      },
      {
        code: "GROWTH_OUT_OF_RANGE",
        entity: "property",
        id: p0!.id,
        field: "appreciationOverridePa",
      },
    ]);
  });
});

describe("overlapping leases (ADR 0163)", () => {
  it("are not a restore problem: a backup with them restores, the Data check lists them", () => {
    const [l0] = portfolio.leases;
    const later = {
      ...l0!,
      id: "l-later",
      startDate: isoDate("2027-01-01"),
    };
    const p = { ...portfolio, leases: [...portfolio.leases, later] };
    expect(checkInputRules(p, assumptions)).toEqual([]);
    expect(checkInputRules(p)).toEqual([]);
  });
});

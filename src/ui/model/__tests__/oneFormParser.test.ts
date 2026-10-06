// ADR 0140 (#125): every form parses through collectValues with one message set, and a
// money field refuses an amount shaped like an English thousands separator.
import { describe, it, expect } from "vitest";
import {
  collectValues,
  parseDraws,
  parseMoney,
  parsePercentToRatio,
} from "../formParse";
import { FORM_PARSERS, formRules } from "../formParsers";
import { parsePropertyForm, BLANK_PROPERTY_FORM } from "../propertyForm";
import { parseScenarioDraft, type ScenarioDraftFields } from "../scenarioForm";
import { en } from "../../../i18n/en";

const THOUSANDS_SHAPED = [
  "450,000",
  "450.000",
  "1,250",
  "1.250",
  "1 250,000",
  "1 250.000",
  "-450,000",
];

describe("money refuses a thousands-shaped amount (ADR 0140 §3)", () => {
  it.fails("refuses each shape (#125)", () => {
    for (const raw of THOUSANDS_SHAPED) {
      expect(parseMoney(raw), raw).toBeNull();
      expect(FORM_PARSERS.money(raw), raw).toBeNull();
    }
  });

  it.fails("refuses it in a development draw line (#125)", () => {
    expect(parseDraws("01.02.2024 = 450,000")).toBeNull();
  });

  it.each([
    ["1 250 000", "1250000"],
    ["25 000,50", "25000.5"],
    ["1000.005", "1000.005"], // a lossless draft (ADR 0131) still saves
    ["0.005", "0.005"],
    ["1250.1234", "1250.1234"],
    ["450,00", "450"],
  ])("still parses %s", (raw, value) => {
    expect(FORM_PARSERS.money(raw)?.toString()).toBe(value);
  });

  it("leaves percentages alone", () => {
    expect(parsePercentToRatio("4,125")?.toString()).toBe("0.04125");
  });
});

const validProperty = {
  ...BLANK_PROPERTY_FORM,
  name: "Vinohrady",
  purchase_date: "01.03.2021",
  purchase_price: "5200000",
};

const blankScenario: ScenarioDraftFields = {
  name: "Stress",
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

describe("one message set across forms (ADR 0140 §1)", () => {
  it.fails(
    "gives a bad percentage the same message in the property, scenario and record forms (#125)",
    () => {
      const pct = en.forms.invalidHint.pct;
      const property = parsePropertyForm(
        { ...validProperty, appreciation_override_pa: "4,5%" },
        "p",
        [],
        en,
      );
      expect(property.errors.appreciation_override_pa).toBe(pct);
      const scenario = parseScenarioDraft(
        { ...blankScenario, appreciationPa: "4,5%" },
        en,
      );
      expect(scenario.errors.appreciationPa).toBe(pct);
      const record = collectValues(
        [{ name: "rate", label: "Rate", kind: "pct" }],
        { rate: "4,5%" },
        formRules(en),
      );
      expect(record.errors.rate).toBe(pct);
    },
  );

  it.fails(
    "uses the shared required, date, money and range messages in the property form (#125)",
    () => {
      const { errors } = parsePropertyForm(
        {
          ...BLANK_PROPERTY_FORM,
          purchase_date: "2021-03-01",
          purchase_price: "450,000",
          size_m2: "58.5",
        },
        "p",
        [],
        en,
      );
      expect(errors).toEqual({
        name: en.forms.required,
        purchase_date: en.forms.invalidHint.date,
        purchase_price: en.forms.invalidHint.money,
        size_m2: en.forms.intRange("1", "10 000"),
      });
    },
  );

  it("requires a scenario name with the shared message", () => {
    const { errors } = parseScenarioDraft({ ...blankScenario, name: " " }, en);
    expect(errors.name).toBe(en.forms.required);
  });

  it.fails(
    "bounds scenario years by the 100-year horizon (ADR 0140 §4, #125)",
    () => {
      const { errors } = parseScenarioDraft(
        {
          ...blankScenario,
          inflationShockDelta: "2",
          inflationShockYears: "0",
          rateShockDelta: "1",
          rateShockYears: "101",
          valueShockPct: "20",
          valueShockYear: "101",
        },
        en,
      );
      expect(errors).toEqual({
        inflationShockYears: en.forms.intRange("1", "100"),
        rateShockYears: en.forms.intRange("1", "100"),
        valueShockYear: en.forms.intRange("0", "100"),
      });
    },
  );

  it("still accepts the horizon's edge years", () => {
    const { errors, overrides } = parseScenarioDraft(
      {
        ...blankScenario,
        rateShockDelta: "1",
        rateShockYears: "100",
        valueShockPct: "20",
        valueShockYear: "100",
      },
      en,
    );
    expect(errors).toEqual({});
    expect(overrides.rateShock?.durationYears).toBe(100);
    expect(overrides.valueShock?.atYear).toBe(100);
  });
});

describe("the property form refuses a negative amount (ADR 0140 §2)", () => {
  it.fails("refuses a negative price or funding amount (#125)", () => {
    for (const key of [
      "purchase_price",
      "own_cash",
      "transaction_costs",
      "initial_works",
    ] as const) {
      const result = parsePropertyForm(
        { ...validProperty, [key]: "-5" },
        "p",
        [],
        en,
      );
      expect(result.valid, key).toBe(false);
      expect(result.errors).toEqual({ [key]: en.forms.invalidHint.money });
    }
  });
});

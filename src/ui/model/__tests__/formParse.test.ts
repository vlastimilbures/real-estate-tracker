// Form draft ⇄ engine-type parsing. These pure helpers guard the edit forms: a bad
// parse must return null/undefined (rejected) rather than a wrong value, and the
// draft formatters must round-trip back to the same value.
import { describe, it, expect, expectTypeOf } from "vitest";
import {
  parseDecimal,
  parsePercentToRatio,
  parseIntField,
  parseDate,
  moneyDraft,
  percentDraft,
  dateDraft,
  parseMoney,
  collectValues,
  fieldHint,
  type FieldSpec,
  type ParsedValues,
  type CollectRules,
} from "../formParse";
import { FORM_PARSERS } from "../formParsers";
import { INT_RANGES } from "../../../lib/intRanges";
import { D } from "../../../lib/money";
import { getDict } from "../../../i18n";
import {
  type IsoDate,
  type Money,
  type LoanRecast,
  type MortgageDraw,
  type MortgagePrepayment,
  type Rate,
} from "../../../engine";

describe("parseDecimal", () => {
  it("accepts both Czech-grouped and plain forms, equally", () => {
    const grouped = parseDecimal("1 234 567,89");
    const plain = parseDecimal("1234567.89");
    expect(grouped).not.toBeNull();
    expect(plain).not.toBeNull();
    expect(grouped!.equals(D("1234567.89"))).toBe(true);
    expect(grouped!.equals(plain!)).toBe(true);
  });

  it("parses a negative value", () => {
    expect(parseDecimal("-42.5")!.equals(D("-42.5"))).toBe(true);
  });

  it("rejects empty and non-numeric input", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("   ")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("1.2.3")).toBeNull();
  });
});

describe("parsePercentToRatio", () => {
  it("converts a percent figure to a ratio", () => {
    expect(parsePercentToRatio("4.5")!.equals(D("0.045"))).toBe(true);
    expect(parsePercentToRatio("0")!.equals(D("0"))).toBe(true);
  });

  it("rejects invalid input", () => {
    expect(parsePercentToRatio("")).toBeNull();
    expect(parsePercentToRatio("x")).toBeNull();
  });
});

describe("parseIntField", () => {
  it("accepts whitespace-padded positive integers", () => {
    expect(parseIntField(" 30 ")).toBe(30);
    expect(parseIntField("0")).toBe(0);
  });

  it("rejects negatives, decimals, and non-numbers", () => {
    expect(parseIntField("-1")).toBeNull();
    expect(parseIntField("3.5")).toBeNull();
    expect(parseIntField("x")).toBeNull();
    expect(parseIntField("")).toBeNull();
  });

  it("rejects more than 9 digits instead of returning Infinity (ADR 0075, DR-078)", () => {
    expect(parseIntField("999 999 999")).toBe(999_999_999);
    expect(parseIntField("1000000000")).toBeNull();
    expect(parseIntField("9".repeat(400))).toBeNull();
  });
});

describe("parseDate", () => {
  it("parses dd.mm.yyyy as a UTC date", () => {
    const d = parseDate("17.01.2031");
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2031);
    expect(d!.getUTCMonth()).toBe(0); // January
    expect(d!.getUTCDate()).toBe(17);
  });

  it("rejects calendar overflow and malformed strings", () => {
    expect(parseDate("31.02.2031")).toBeNull(); // Feb has no 31st → overflow guard
    expect(parseDate("00.01.2031")).toBeNull();
    expect(parseDate("17.13.2031")).toBeNull();
    expect(parseDate("2031-01-17")).toBeNull();
    expect(parseDate("")).toBeNull();
  });

  it("rejects a year before 1900 (DR-035, UX-052)", () => {
    // Date.UTC would map 0099 to 1999; a typo must not save as a real date.
    expect(parseDate("01.01.0099")).toBeNull();
    expect(parseDate("31.12.1899")).toBeNull();
    expect(parseDate("01.01.1900")!.getUTCFullYear()).toBe(1900);
  });
});

describe("draft formatters round-trip", () => {
  it("moneyDraft → parseDecimal preserves the value", () => {
    const v = D("12000000.55");
    expect(parseDecimal(moneyDraft(v))!.equals(v)).toBe(true);
    expect(moneyDraft(undefined)).toBe("");
  });

  // ADR 0131 (#201): a form saves the record it shows, so the draft keeps the stored
  // precision (CSV import and restore accept any) — never rounded, never exponent form.
  it("moneyDraft keeps a stored amount's full precision in plain notation", () => {
    for (const [stored, draft] of [
      ["1000.005", "1000.005"],
      ["0.00000001", "0.00000001"],
      ["1e21", "1000000000000000000000"],
      ["12000000.50", "12000000.5"],
      ["-0", "0"],
    ] as const) {
      const v = D(stored);
      expect(moneyDraft(v)).toBe(draft);
      expect(parseDecimal(moneyDraft(v))!.equals(v)).toBe(true);
    }
  });

  // ADR 0131 (#208): the rate twin of moneyDraft — a stored ratio of up to 40 significant
  // digits drafts as its exact percentage, so a save writes back the rate it read.
  it("percentDraft keeps a stored rate's full precision in plain notation", () => {
    for (const [stored, draft] of [
      ["0.03591234", "3.591234"],
      ["0.0359", "3.59"],
      ["1e-12", "0.0000000001"],
      ["-0.1", "-10"],
      ["-0", "0"],
      ["1e+20", "10000000000000000000000"],
    ] as const) {
      const v = D(stored);
      expect(percentDraft(v)).toBe(draft);
      expect(parsePercentToRatio(percentDraft(v))!.equals(v)).toBe(true);
    }
    expect(percentDraft(undefined)).toBe("");
  });

  it("dateDraft → parseDate preserves the date", () => {
    const d = new Date(Date.UTC(2031, 0, 17));
    expect(dateDraft(d)).toBe("17.01.2031");
    expect(parseDate(dateDraft(d))!.getTime()).toBe(d.getTime());
    expect(dateDraft(undefined)).toBe("");
  });
});

describe("FORM_PARSERS", () => {
  it("dispatches to the right parser per kind", () => {
    expect(FORM_PARSERS.money("1234.5")?.equals(D("1234.5"))).toBe(true);
    expect(FORM_PARSERS.pct("4.5")?.equals(D("0.045"))).toBe(true);
    expect(FORM_PARSERS.int("30")).toBe(30);
    expect(FORM_PARSERS.date("17.01.2031")).toBeInstanceOf(Date);
  });

  it("returns null (invalid) for bad input", () => {
    expect(FORM_PARSERS.money("abc")).toBeNull();
    expect(FORM_PARSERS.pct("")).toBeNull();
    expect(FORM_PARSERS.int("-1")).toBeNull();
    expect(FORM_PARSERS.date("bad")).toBeNull();
  });

  it("rejects negative money but still allows signed percentages", () => {
    expect(FORM_PARSERS.money("-5")).toBeNull();
    expect(FORM_PARSERS.money("-0.01")).toBeNull();
    expect(FORM_PARSERS.money("0")).not.toBeNull(); // zero is fine
    // a declining-market appreciation override is legitimately negative
    expect(FORM_PARSERS.pct("-1")?.equals(D("-0.01"))).toBe(true);
  });
});

describe("parseMoney", () => {
  it("keeps the sign (callers decide whether negatives are allowed)", () => {
    expect(parseMoney("-5")?.toString()).toBe("-5");
    expect(parseMoney("1 234,5")?.toString()).toBe("1234.5");
    expect(parseMoney("x")).toBeNull();
  });
});

describe("collectValues", () => {
  const rules: CollectRules = {
    parsers: FORM_PARSERS,
    blank: (s) => `required ${s.name}`,
    invalid: (s) => `invalid ${s.kind}`,
  };
  const specs = [
    { name: "price", label: "Price", kind: "money" },
    { name: "from", label: "From", kind: "date", optional: true },
    { name: "rate", label: "Rate", kind: "pct" },
    { name: "years", label: "Years", kind: "int", optional: false },
    { name: "draws", label: "Draws", kind: "draws", optional: true },
  ] as const;

  it("types each value by its spec's kind (null only for optional fields)", () => {
    expectTypeOf<ParsedValues<typeof specs>>().toEqualTypeOf<{
      price: Money;
      from: IsoDate | null;
      rate: Rate;
      years: number;
      draws: MortgageDraw[] | null;
    }>();
    // A spec typed as plain FieldSpec may be optional, so its values include null.
    expectTypeOf<ParsedValues<FieldSpec[]>>().toEqualTypeOf<{
      [name: string]:
        | Money
        | IsoDate
        | Rate
        | number
        | MortgageDraw[]
        | MortgagePrepayment[]
        | LoanRecast[]
        | null;
    }>();
  });

  it("parses trimmed text, and an optional blank to null", () => {
    const { values, errors } = collectValues(
      specs,
      { price: " 1 000 ", from: "  ", rate: "4,5", years: "30" },
      rules,
    );
    expect(errors).toEqual({});
    expect(values.price.toString()).toBe("1000");
    expect(values.from).toBeNull();
    expect(values.rate.toString()).toBe("0.045");
    expect(values.years).toBe(30);
    expect(values.draws).toBeNull();
    // @ts-expect-error not a field of these specs
    expect(values.other).toBeUndefined();
  });

  it("reports a blank required field and an unparseable field", () => {
    const { values, errors } = collectValues(
      specs,
      { price: "", from: "31.02.2030", rate: "x", years: "-1" },
      rules,
    );
    expect(errors).toEqual({
      price: "required price",
      from: "invalid date",
      rate: "invalid pct",
      years: "invalid int",
    });
    expect(values).toEqual({ draws: null });
  });

  it("reports a whole number outside its spec's range (ADR 0075, DR-078)", () => {
    const ranged = [
      {
        name: "years",
        label: "Years",
        kind: "int",
        range: { min: 1, max: 50 },
      },
    ] as const;
    const at = (years: string) => collectValues(ranged, { years }, rules);
    expect(at("0").errors).toEqual({ years: "invalid int" });
    expect(at("51").errors).toEqual({ years: "invalid int" });
    expect(at("1").values.years).toBe(1);
    expect(at("50").values.years).toBe(50);
  });
});

describe("fieldHint (ADR 0075, DR-078)", () => {
  const en = getDict("en");
  it("names the range of a bounded whole-number field, grouped like amounts", () => {
    expect(fieldHint(en, { kind: "int", range: INT_RANGES.horizonYears })).toBe(
      "Enter a whole number from 1 to 100",
    );
    expect(fieldHint(en, { kind: "int", range: INT_RANGES.sizeM2 })).toBe(
      "Enter a whole number from 1 to 10 000",
    );
  });
  it("falls back to the kind's format hint", () => {
    expect(fieldHint(en, { kind: "int" })).toBe(en.forms.invalidHint.int);
    expect(fieldHint(en, { kind: "money" })).toBe(en.forms.invalidHint.money);
  });
  // ADR 0149 §5: a date before the floor is refused with a message that names it.
  it("the date hint names the 01.01.1900 floor in every language (#119)", () => {
    for (const lang of ["en", "cs", "ru"] as const)
      expect(fieldHint(getDict(lang), { kind: "date" })).toContain(
        "01.01.1900",
      );
  });
  it("refuses a date before 1900 and accepts the floor", () => {
    expect(parseDate("31.12.1899")).toBeNull();
    expect(parseDate("01.01.1900")?.toISOString()).toBe(
      "1900-01-01T00:00:00.000Z",
    );
  });
  it("has the ADR 0075 bounds", () => {
    expect(INT_RANGES).toEqual({
      horizonYears: { min: 1, max: 100 },
      fixationYears: { min: 0, max: 50 },
      loanTermYears: { min: 1, max: 50 },
      sizeM2: { min: 1, max: 10_000 },
    });
  });
  it("is translated in every language", () => {
    for (const lang of ["cs", "ru"] as const) {
      const hint = fieldHint(getDict(lang), {
        kind: "int",
        range: INT_RANGES.sizeM2,
      });
      expect(hint).toMatch(/1\b.*10 000/);
      expect(hint).not.toBe(
        fieldHint(en, { kind: "int", range: INT_RANGES.sizeM2 }),
      );
    }
  });
});

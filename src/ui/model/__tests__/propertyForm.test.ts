// Property form validation + DTO assembly, extracted from PropertyFormModal so it's
// unit-testable without mounting the component (mirrors mortgageForm.test.ts).
import { describe, it, expect } from "vitest";
import {
  parsePropertyForm,
  fundingDraft,
  hasFundingError,
  BLANK_PROPERTY_FORM,
  type PropertyFormState,
} from "../propertyForm";
import { percentDraft } from "../formParse";
import { money, rate, type AcquisitionFunding } from "../../../engine";
import { en } from "../../../i18n/en";

const valid: PropertyFormState = {
  ...BLANK_PROPERTY_FORM,
  name: "Vinohrady 2+kk",
  address: "Korunní 100",
  type: "flat",
  sizeM2: "58",
  garage: true,
  purchaseDate: "01.03.2021",
  purchasePrice: "5200000",
  appreciationOverridePa: "",
  rentIndexOverridePa: "",
};

describe("parsePropertyForm", () => {
  it("accepts a fully valid add-mode form and assembles the Property + extras", () => {
    const result = parsePropertyForm(valid, "p-new", [], en);
    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error("expected valid");
    expect(result.errors).toEqual({});
    expect(result.property.id).toBe("p-new");
    expect(result.property.name).toBe("Vinohrady 2+kk");
    expect(result.property.sizeM2).toBe(58);
    expect(result.address).toBe("Korunní 100");
    expect(result.garage).toBe(true);
  });

  it("keeps a stored growth override's precision, so a rename saves it unchanged (ADR 0131, #208)", () => {
    const appreciation = rate("0.03591234");
    const rentIndex = rate("-0.0000001");
    const result = parsePropertyForm(
      {
        ...valid,
        name: "Renamed",
        appreciationOverridePa: percentDraft(appreciation),
        rentIndexOverridePa: percentDraft(rentIndex),
      },
      "vinohrady",
      [],
      en,
    );
    if (!result.valid) throw new Error("expected valid");
    expect(result.property.appreciationOverridePa!.equals(appreciation)).toBe(
      true,
    );
    expect(result.property.rentIndexOverridePa!.equals(rentIndex)).toBe(true);
  });

  it("requires name and purchase date/price", () => {
    const result = parsePropertyForm(BLANK_PROPERTY_FORM, "p-new", [], en);
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected invalid");
    expect(result.errors.name).toBe(en.forms.required);
    expect(result.errors.purchaseDate).toBe(en.forms.required);
    expect(result.errors.purchasePrice).toBe(en.forms.required);
  });

  it("rejects a name that collides with another property (case-insensitive)", () => {
    const result = parsePropertyForm(valid, "p-new", ["vinohrady 2+kk"], en);
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected invalid");
    expect(result.errors.name).toBe(en.propertyForm.errNameExists);
  });

  // ADR 0184 §4: names match like CSV import (propertyKey: trimmed, case-insensitive).
  it("rejects a name that differs from a stored one only by spaces and case", () => {
    const result = parsePropertyForm(valid, "p-new", ["  VINOHRADY 2+kk "], en);
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected invalid");
    expect(result.errors.name).toBe(en.propertyForm.errNameExists);
  });

  // ADR 0237: names are compared in NFC. Escapes keep the two forms apart in the source.
  it("rejects a decomposed (NFD) name that matches a stored composed (NFC) one", () => {
    const result = parsePropertyForm(
      { ...valid, name: "Na\u0301rodni\u0301 12" },
      "p-new",
      ["N\u00e1rodn\u00ed 12"],
      en,
    );
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected invalid");
    expect(result.errors.name).toBe(en.propertyForm.errNameExists);
  });

  it("accepts an edit that keeps its name once the caller leaves it out of existingNames", () => {
    const result = parsePropertyForm(valid, "vinohrady-2kk", [], en);
    expect(result.valid).toBe(true);
  });

  it("uses the id it is given, never one made from the name (ADR 0127)", () => {
    const result = parsePropertyForm(valid, "some-fixed-id", [], en);
    if (!result.valid) throw new Error("expected valid");
    expect(result.property.id).toBe("some-fixed-id");
  });

  it("rejects an unparseable purchase date", () => {
    const result = parsePropertyForm(
      { ...valid, purchaseDate: "not-a-date" },
      "p-new",
      [],
      en,
    );
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected invalid");
    expect(result.errors.purchaseDate).toBe(en.forms.invalidHint.date);
  });

  it("rejects an unparseable purchase price", () => {
    const result = parsePropertyForm(
      { ...valid, purchasePrice: "not-a-number" },
      "p-new",
      [],
      en,
    );
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected invalid");
    expect(result.errors.purchasePrice).toBe(en.forms.invalidHint.money);
  });

  // ADR 0236 §1: one decimal place is accepted, two are refused naming the limit.
  it("rejects a size with two decimals and an invalid percentage override, leaving optional fields blank as valid", () => {
    const result = parsePropertyForm(
      { ...valid, sizeM2: "54.55", appreciationOverridePa: "abc" },
      "p-new",
      [],
      en,
    );
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected invalid");
    expect(result.errors.sizeM2).toBe(
      "Must be a number from 1 to 10 000 with at most one decimal place",
    );
    expect(result.errors.appreciationOverridePa).toBe(en.forms.invalidHint.pct);
  });

  it("treats optional overrides as valid when blank", () => {
    const result = parsePropertyForm(valid, "p-new", [], en);
    if (!result.valid) throw new Error("expected valid");
    expect(result.property.appreciationOverridePa).toBeUndefined();
    expect(result.property.rentIndexOverridePa).toBeUndefined();
  });

  it("accepts a size with one decimal place, comma or dot (ADR 0236 §1)", () => {
    // Trailing zeros count by value: "58,50" is one decimal place.
    for (const sizeM2 of ["58.5", "58,5", "58.50", "58,50"]) {
      const result = parsePropertyForm({ ...valid, sizeM2 }, "p-new", [], en);
      expect(result.valid && result.property.sizeM2, sizeM2).toBe(58.5);
    }
  });

  it("bounds the size to 1–10 000 m² (ADR 0075, DR-078; wording ADR 0236 §1)", () => {
    const hint =
      "Must be a number from 1 to 10 000 with at most one decimal place";
    for (const sizeM2 of ["0", "10001", "9".repeat(400)]) {
      const result = parsePropertyForm({ ...valid, sizeM2 }, "p-new", [], en);
      expect(result.valid).toBe(false);
      expect(result.errors.sizeM2).toBe(hint);
    }
    const max = parsePropertyForm(
      { ...valid, sizeM2: "10000" },
      "p-new",
      [],
      en,
    );
    expect(max.valid && max.property.sizeM2).toBe(10_000);
  });
});

// ADR 0119 §8–§9: the form is the only place that clears an amount or sets the note, so it
// always sends the record it shows; an empty one clears the stored record.
describe("parsePropertyForm — acquisition funding", () => {
  const funding = (form: Partial<PropertyFormState>): AcquisitionFunding => {
    const result = parsePropertyForm(
      { ...valid, ...form },
      "vinohrady",
      [],
      en,
    );
    if (!result.valid) throw new Error("expected valid");
    return result.property.funding!;
  };
  const text = (f: AcquisitionFunding) =>
    Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v)]));

  it("records every part and trims the note", () => {
    expect(
      text(
        funding({
          ownCash: "1 500 000",
          transactionCosts: "95000,50",
          initialWorks: "0",
          fundingNote: "  Deposit from savings  ",
        }),
      ),
    ).toEqual({
      ownCash: "1500000",
      transactionCosts: "95000.5",
      initialWorks: "0",
      note: "Deposit from savings",
    });
  });

  it("sends an empty record when every field is blank, which clears the stored one", () => {
    expect(funding({})).toStrictEqual({});
    expect(
      funding({ ownCash: "  ", transactionCosts: "", fundingNote: " " }),
    ).toStrictEqual({});
  });

  it("leaves a blank amount unknown, never 0, and a blank note out", () => {
    const f = funding({ ownCash: "800000", fundingNote: "   " });
    expect(Object.keys(f)).toEqual(["ownCash"]);
    expect(f.ownCash?.toString()).toBe("800000");
  });

  it("puts an unparseable amount on its own field", () => {
    const result = parsePropertyForm(
      {
        ...valid,
        ownCash: "abc",
        transactionCosts: "1.2.3",
        initialWorks: "x",
      },
      "p-new",
      [],
      en,
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual({
      ownCash: en.forms.invalidHint.money,
      transactionCosts: en.forms.invalidHint.money,
      initialWorks: en.forms.invalidHint.money,
    });
  });

  it("refuses a negative amount in the form, as every money field (ADR 0140)", () => {
    const result = parsePropertyForm(
      { ...valid, ownCash: "-5" },
      "vinohrady",
      [],
      en,
    );
    expect(result.errors).toEqual({ ownCash: en.forms.invalidHint.money });
  });
});

describe("fundingDraft", () => {
  it("drafts a stored record into the form's fields", () => {
    expect(
      fundingDraft({
        ownCash: money("1500000"),
        initialWorks: money("0"),
        note: "Deposit",
      }),
    ).toEqual({
      ownCash: "1500000",
      transactionCosts: "",
      initialWorks: "0",
      fundingNote: "Deposit",
    });
  });

  it("keeps a stored amount's precision, so an unrelated edit saves it unchanged (ADR 0131)", () => {
    const stored: AcquisitionFunding = {
      ownCash: money("1000.005"),
      transactionCosts: money("95000.125"),
      initialWorks: money("0.0001"),
    };
    const result = parsePropertyForm(
      { ...valid, name: "Renamed", ...fundingDraft(stored) },
      "vinohrady",
      [],
      en,
    );
    if (!result.valid) throw new Error("expected valid");
    const saved = result.property.funding!;
    expect(saved.ownCash!.equals(stored.ownCash!)).toBe(true);
    expect(saved.transactionCosts!.equals(stored.transactionCosts!)).toBe(true);
    expect(saved.initialWorks!.equals(stored.initialWorks!)).toBe(true);
  });

  it("drafts no record as blank fields", () => {
    expect(fundingDraft(undefined)).toEqual({
      ownCash: "",
      transactionCosts: "",
      initialWorks: "",
      fundingNote: "",
    });
  });
});

describe("hasFundingError", () => {
  it("is true only for an error on a funding field", () => {
    expect(hasFundingError({ initialWorks: "x" })).toBe(true);
    expect(hasFundingError({ name: "x", purchasePrice: "y" })).toBe(false);
    expect(hasFundingError({})).toBe(false);
  });
});

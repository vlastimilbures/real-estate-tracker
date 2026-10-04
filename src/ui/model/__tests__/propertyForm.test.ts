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
  size_m2: "58",
  garage: true,
  purchase_date: "01.03.2021",
  purchase_price: "5200000",
  appreciation_override_pa: "",
  rent_index_override_pa: "",
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
        appreciation_override_pa: percentDraft(appreciation),
        rent_index_override_pa: percentDraft(rentIndex),
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
    expect(result.errors.name).toBe(en.propertyForm.errRequired);
    expect(result.errors.purchase_date).toBe(en.propertyForm.errRequired);
    expect(result.errors.purchase_price).toBe(en.propertyForm.errRequired);
  });

  it("rejects a name that collides with another property (case-insensitive)", () => {
    const result = parsePropertyForm(valid, "p-new", ["vinohrady 2+kk"], en);
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
      { ...valid, purchase_date: "not-a-date" },
      "p-new",
      [],
      en,
    );
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected invalid");
    expect(result.errors.purchase_date).toBe(en.propertyForm.errUseDate);
  });

  it("rejects an unparseable purchase price", () => {
    const result = parsePropertyForm(
      { ...valid, purchase_price: "not-a-number" },
      "p-new",
      [],
      en,
    );
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected invalid");
    expect(result.errors.purchase_price).toBe(en.propertyForm.errInvalidNumber);
  });

  it("rejects a non-whole size and an invalid percentage override, leaving optional fields blank as valid", () => {
    const result = parsePropertyForm(
      { ...valid, size_m2: "58.5", appreciation_override_pa: "abc" },
      "p-new",
      [],
      en,
    );
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected invalid");
    expect(result.errors.size_m2).toBe(en.propertyForm.errWholeNumber);
    expect(result.errors.appreciation_override_pa).toBe(
      en.propertyForm.errInvalidPercentage,
    );
  });

  it("treats optional overrides as valid when blank", () => {
    const result = parsePropertyForm(valid, "p-new", [], en);
    if (!result.valid) throw new Error("expected valid");
    expect(result.property.appreciationOverridePa).toBeUndefined();
    expect(result.property.rentIndexOverridePa).toBeUndefined();
  });

  it("bounds the size to 1–10 000 m² (ADR 0075, DR-078)", () => {
    const hint = "Enter a whole number from 1 to 10 000";
    for (const size_m2 of ["0", "10001", "9".repeat(400)]) {
      const result = parsePropertyForm({ ...valid, size_m2 }, "p-new", [], en);
      expect(result.valid).toBe(false);
      expect(result.errors.size_m2).toBe(
        size_m2.length > 9 ? en.propertyForm.errWholeNumber : hint,
      );
    }
    const max = parsePropertyForm(
      { ...valid, size_m2: "10000" },
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
          own_cash: "1 500 000",
          transaction_costs: "95000,50",
          initial_works: "0",
          funding_note: "  Deposit from savings  ",
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
      funding({ own_cash: "  ", transaction_costs: "", funding_note: " " }),
    ).toStrictEqual({});
  });

  it("leaves a blank amount unknown, never 0, and a blank note out", () => {
    const f = funding({ own_cash: "800000", funding_note: "   " });
    expect(Object.keys(f)).toEqual(["ownCash"]);
    expect(f.ownCash?.toString()).toBe("800000");
  });

  it("puts an unparseable amount on its own field", () => {
    const result = parsePropertyForm(
      {
        ...valid,
        own_cash: "abc",
        transaction_costs: "1.2.3",
        initial_works: "x",
      },
      "p-new",
      [],
      en,
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual({
      own_cash: en.propertyForm.errInvalidNumber,
      transaction_costs: en.propertyForm.errInvalidNumber,
      initial_works: en.propertyForm.errInvalidNumber,
    });
  });

  it("passes a negative amount on for the engine to refuse, as the purchase price", () => {
    expect(funding({ own_cash: "-5" }).ownCash?.toString()).toBe("-5");
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
      own_cash: "1500000",
      transaction_costs: "",
      initial_works: "0",
      funding_note: "Deposit",
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
      own_cash: "",
      transaction_costs: "",
      initial_works: "",
      funding_note: "",
    });
  });
});

describe("hasFundingError", () => {
  it("is true only for an error on a funding field", () => {
    expect(hasFundingError({ initial_works: "x" })).toBe(true);
    expect(hasFundingError({ name: "x", purchase_price: "y" })).toBe(false);
    expect(hasFundingError({})).toBe(false);
  });
});

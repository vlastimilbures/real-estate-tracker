// Property form validation + DTO assembly, extracted from PropertyFormModal so it's
// unit-testable without mounting the component (mirrors mortgageForm.test.ts).
import { describe, it, expect } from "vitest";
import {
  parsePropertyForm,
  BLANK_PROPERTY_FORM,
  type PropertyFormState,
} from "../propertyForm";
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
    const result = parsePropertyForm(valid, "add", undefined, [], en);
    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error("expected valid");
    expect(result.errors).toEqual({});
    expect(result.property.id).toBe("vinohrady-2-kk");
    expect(result.property.name).toBe("Vinohrady 2+kk");
    expect(result.property.sizeM2).toBe(58);
    expect(result.address).toBe("Korunní 100");
    expect(result.garage).toBe(true);
  });

  it("requires name and purchase date/price", () => {
    const result = parsePropertyForm(
      BLANK_PROPERTY_FORM,
      "add",
      undefined,
      [],
      en,
    );
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected invalid");
    expect(result.errors.name).toBe(en.propertyForm.errRequired);
    expect(result.errors.purchase_date).toBe(en.propertyForm.errRequired);
    expect(result.errors.purchase_price).toBe(en.propertyForm.errRequired);
  });

  it("rejects a name that collides with another property (case-insensitive)", () => {
    const result = parsePropertyForm(
      valid,
      "add",
      undefined,
      ["vinohrady 2+kk"],
      en,
    );
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected invalid");
    expect(result.errors.name).toBe(en.propertyForm.errNameExists);
  });

  it("allows an edit-mode save to keep its own (excluded) name", () => {
    // Caller excludes the property's own current name from existingNames.
    const result = parsePropertyForm(valid, "edit", "vinohrady-2kk", [], en);
    expect(result.valid).toBe(true);
  });

  it("keeps the edit-mode id stable rather than re-deriving it from the name", () => {
    const result = parsePropertyForm(valid, "edit", "some-fixed-id", [], en);
    if (!result.valid) throw new Error("expected valid");
    expect(result.property.id).toBe("some-fixed-id");
  });

  it("rejects an unparseable purchase date", () => {
    const result = parsePropertyForm(
      { ...valid, purchase_date: "not-a-date" },
      "add",
      undefined,
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
      "add",
      undefined,
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
      "add",
      undefined,
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
    const result = parsePropertyForm(valid, "add", undefined, [], en);
    if (!result.valid) throw new Error("expected valid");
    expect(result.property.appreciationOverridePa).toBeUndefined();
    expect(result.property.rentIndexOverridePa).toBeUndefined();
  });

  it("bounds the size to 1–10 000 m² (ADR 0075, DR-078)", () => {
    const hint = "Enter a whole number from 1 to 10 000";
    for (const size_m2 of ["0", "10001", "9".repeat(400)]) {
      const result = parsePropertyForm(
        { ...valid, size_m2 },
        "add",
        undefined,
        [],
        en,
      );
      expect(result.valid).toBe(false);
      expect(result.errors.size_m2).toBe(
        size_m2.length > 9 ? en.propertyForm.errWholeNumber : hint,
      );
    }
    const max = parsePropertyForm(
      { ...valid, size_m2: "10000" },
      "add",
      undefined,
      [],
      en,
    );
    expect(max.valid && max.property.sizeM2).toBe(10_000);
  });
});

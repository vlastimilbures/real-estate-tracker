// UX-046 (DR-133): a failed write reads as a translated sentence, tied to the form field
// when one field is at fault — never SQLite's raw text.
import { describe, it, expect } from "vitest";
import { describeWriteError } from "../writeError";
import { getDict } from "../../../i18n";
import { V7_TABLES } from "../../../data/migrations";
import type { WriteError } from "../../../state/writeError";

const en = getDict("en");
const unique = (table: string, ...columns: string[]): WriteError => ({
  kind: "constraint",
  constraint: { kind: "unique", table, columns },
});
const check = (name: string): WriteError => ({
  kind: "constraint",
  constraint: { kind: "check", check: name },
});

describe("describeWriteError", () => {
  it("names a duplicate property name on the name field", () => {
    expect(describeWriteError(en, unique("properties", "name"))).toEqual({
      message: "A property with this name already exists",
      field: "name",
    });
  });

  it("maps the natural-key clashes to their date fields", () => {
    expect(
      describeWriteError(en, unique("valuations", "property_id", "valid_from")),
    ).toEqual({
      message: en.writeErrors.duplicateValuationDate,
      field: "validFrom",
    });
    expect(
      describeWriteError(en, unique("leases", "property_id", "start_date")),
    ).toEqual({
      message: en.writeErrors.duplicateLeaseStart,
      field: "startDate",
    });
    expect(
      describeWriteError(
        en,
        unique("mortgage_blocks", "property_id", "start_date"),
      ),
    ).toEqual({
      message: en.inputRules.DUPLICATE_BLOCK_START,
      field: "startDate",
    });
  });

  it("explains a generated-id clash (DR-137) without a field", () => {
    expect(describeWriteError(en, unique("mortgage_blocks", "id"))).toEqual({
      message: en.writeErrors.duplicateId,
    });
  });

  it("uses the engine rule wording for a CHECK, on its field", () => {
    expect(describeWriteError(en, check("lease_rent_not_negative"))).toEqual({
      message: en.inputRules.NEGATIVE_AMOUNT,
      field: "monthlyRent",
    });
    expect(describeWriteError(en, check("mortgage_rate_0_to_1"))).toEqual({
      message: en.inputRules.RATE_OUT_OF_RANGE,
      field: "interestRatePa",
    });
    expect(describeWriteError(en, check("property_garage_flag"))).toEqual({
      message: en.writeErrors.invalidFlag,
      field: "garage",
    });
  });

  it("translates every v7 CHECK constraint (tripwire for new ones)", () => {
    const names = V7_TABLES.flatMap((t) => t.checks.map((c) => c.name));
    expect(names.length).toBeGreaterThan(20);
    for (const name of names) {
      expect(describeWriteError(en, check(name)).message, name).not.toBe(
        en.writeErrors.otherConstraint,
      );
    }
  });

  it("falls back to a generic sentence for an unknown constraint", () => {
    expect(describeWriteError(en, check("future_rule")).message).toBe(
      en.writeErrors.otherConstraint,
    );
    expect(describeWriteError(en, unique("x", "y")).message).toBe(
      en.writeErrors.otherConstraint,
    );
  });

  it("translates ROW_MISSING, FOREIGN KEY and NOT NULL", () => {
    expect(
      describeWriteError(en, { kind: "data", code: "ROW_MISSING", details: [] })
        .message,
    ).toBe(en.dataErrors.ROW_MISSING);
    expect(
      describeWriteError(en, {
        kind: "constraint",
        constraint: { kind: "foreignKey" },
      }).message,
    ).toBe(en.inputRules.ORPHAN_ROW);
    expect(
      describeWriteError(en, {
        kind: "constraint",
        constraint: { kind: "notNull", table: "properties", columns: ["name"] },
      }).message,
    ).toBe(en.writeErrors.missingValue);
  });

  it("is in the user's language", () => {
    const cs = getDict("cs");
    const ru = getDict("ru");
    expect(describeWriteError(cs, unique("properties", "name")).message).toBe(
      cs.writeErrors.duplicatePropertyName,
    );
    expect(describeWriteError(ru, unique("properties", "name")).message).toBe(
      ru.writeErrors.duplicatePropertyName,
    );
    expect(cs.writeErrors.duplicatePropertyName).not.toBe(
      en.writeErrors.duplicatePropertyName,
    );
  });

  it("passes an untyped failure's text through", () => {
    expect(
      describeWriteError(en, { kind: "other", message: "disk is full" }),
    ).toEqual({ message: "disk is full" });
  });
});

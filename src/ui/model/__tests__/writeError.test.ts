// UX-046 (DR-133): a failed write reads as a translated sentence, tied to the form field
// when one field is at fault — never SQLite's raw text.
import { describe, it, expect } from "vitest";
import { describeWriteError, formWriteErrors } from "../writeError";
import { getDict } from "../../../i18n";
import { MIGRATIONS, V7_TABLES } from "../../../data/migrations";
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

  it("translates the v9 JSON checks added outside V7_TABLES (ADR 0109)", () => {
    for (const name of ["mortgage_prepayments_json", "mortgage_recasts_json"]) {
      expect(describeWriteError(en, check(name)).message, name).not.toBe(
        en.writeErrors.otherConstraint,
      );
    }
    expect(describeWriteError(en, check("mortgage_recasts_json")).field).toBe(
      "recasts",
    );
  });

  it("translates every CHECK a later migration adds by name (tripwire)", () => {
    const names = MIGRATIONS.flatMap((m) =>
      [...m.sql.matchAll(/CONSTRAINT (\w+) CHECK/g)].map((x) => x[1]),
    );
    expect(names).toEqual(
      expect.arrayContaining([
        "mortgage_prepayments_json",
        "property_own_cash_not_negative",
      ]),
    );
    for (const name of names) {
      expect(describeWriteError(en, check(name)).message, name).not.toBe(
        en.writeErrors.otherConstraint,
      );
    }
  });

  it("puts a negative funding amount on its field (ADR 0119)", () => {
    for (const [column, field] of [
      ["own_cash", "ownCash"],
      ["transaction_costs", "transactionCosts"],
      ["initial_works", "initialWorks"],
    ]) {
      expect(
        describeWriteError(en, check(`property_${column}_not_negative`)),
      ).toEqual({ message: en.inputRules.NEGATIVE_AMOUNT, field });
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

// ADR 0116 §11: an error on one prepayment or recast shows on its row.
describe("formWriteErrors with list rows", () => {
  const event = (index?: number) => ({
    code: "EVENT_BEFORE_START" as const,
    entity: "mortgage" as const,
    id: "m1",
    field: "prepayments",
    ...(index === undefined ? {} : { index }),
  });
  const input: WriteError = {
    kind: "input",
    errors: [
      event(1),
      event(0),
      {
        code: "INVALID_RECAST",
        entity: "mortgage",
        id: "m1",
        field: "recasts",
      },
    ],
  };
  const fields = ["startDate", "prepayments", "recasts"];

  it("keys an indexed error by its draft row", () => {
    const rowOf = (field: string, i: number) =>
      field === "prepayments" ? ([2, 5][i] ?? null) : null;
    expect(formWriteErrors(en, input, fields, rowOf)).toEqual({
      fieldErrors: {
        "prepayments.5": en.inputRules.EVENT_BEFORE_START,
        "prepayments.2": en.inputRules.EVENT_BEFORE_START,
        recasts: en.inputRules.INVALID_RECAST,
      },
      formError: null,
    });
  });

  it("one sentence names a rule once, however many items break it (ADR 0160)", () => {
    expect(describeWriteError(en, input).message).toBe(
      `${en.inputRules.EVENT_BEFORE_START} · ${en.inputRules.INVALID_RECAST}`,
    );
  });

  it("falls back to the field when the row is unknown", () => {
    expect(
      formWriteErrors(en, input, fields, () => null).fieldErrors.prepayments,
    ).toBe(en.inputRules.EVENT_BEFORE_START);
    expect(formWriteErrors(en, input, fields).fieldErrors.prepayments).toBe(
      en.inputRules.EVENT_BEFORE_START,
    );
  });
});

// ADR 0128 §6: an assumptions edit that newly breaks a saved scenario names the scenario,
// on the base field the scenario's shock shifts.
describe("a scenario the assumptions edit would break (ADR 0128)", () => {
  const breaks = (field: string, code: string): WriteError =>
    ({
      kind: "input",
      scenario: "Rate cut",
      errors: [{ code, entity: "assumptions", field }],
    }) as WriteError;
  const fields = ["postFixationResetRatePa", "inflationPa"];

  it("shows the rule with the scenario's name on the base field", () => {
    expect(
      formWriteErrors(
        en,
        breaks("rateShock", "SHOCKED_RATE_OUT_OF_RANGE"),
        fields,
      ),
    ).toEqual({
      fieldErrors: {
        postFixationResetRatePa: en.writeErrors.scenarioBreaks(
          "Rate cut",
          en.inputRules.SHOCKED_RATE_OUT_OF_RANGE,
        ),
      },
      formError: null,
    });
    expect(
      formWriteErrors(
        en,
        breaks("inflationShock", "SHOCKED_INFLATION_OUT_OF_RANGE"),
        fields,
      ).fieldErrors,
    ).toEqual({
      inflationPa: en.writeErrors.scenarioBreaks(
        "Rate cut",
        en.inputRules.SHOCKED_INFLATION_OUT_OF_RANGE,
      ),
    });
  });

  it("the banner names the scenario too", () => {
    expect(
      describeWriteError(en, breaks("rateShock", "SHOCKED_RATE_OUT_OF_RANGE"))
        .message,
    ).toBe(
      en.writeErrors.scenarioBreaks(
        "Rate cut",
        en.inputRules.SHOCKED_RATE_OUT_OF_RANGE,
      ),
    );
  });
});

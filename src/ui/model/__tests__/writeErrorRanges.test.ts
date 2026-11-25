// ADR 0245: an out-of-range value the store refused reads as the form's own range
// message (forms.intRange, forms.sizeRange) on the form's own field; a field the form is
// not showing gets it above the buttons (ADR 0243).
import { describe, it, expect } from "vitest";
import {
  describeWriteError,
  fieldsIn,
  formWriteErrors,
  writeErrorTexts,
} from "../writeError";
import { fieldHint } from "../formParse";
import { getDict } from "../../../i18n";
import { INT_RANGES, type BoundedField } from "../../../lib/rules";
import type { WriteError } from "../../../state/writeError";

const en = getDict("en");

const refusal = (...fields: [BoundedField, number][]): WriteError => ({
  kind: "input",
  errors: [],
  ranges: fields.map(([field, value]) => ({
    code: "OUT_OF_RANGE",
    entity: field === "horizonYears" ? "assumptions" : "mortgage",
    id: field === "horizonYears" ? undefined : "m1",
    field,
    value,
    range: INT_RANGES[field],
  })),
});

describe("a refused out-of-range value (ADR 0245)", () => {
  it("uses the form's whole-number range on each whole-number field", () => {
    expect(
      writeErrorTexts(
        en,
        refusal(
          ["fixationYears", 51],
          ["loanTermYears", 51],
          ["horizonYears", 101],
        ),
      ),
    ).toEqual([
      { message: en.forms.intRange("0", "50"), field: "fixationYears" },
      { message: en.forms.intRange("1", "50"), field: "loanTermYears" },
      { message: en.forms.intRange("1", "100"), field: "horizonYears" },
    ]);
  });

  it("uses the size range on the size, as the property form's own hint", () => {
    const [text] = writeErrorTexts(en, refusal(["sizeM2", 54.55]));
    expect(text).toEqual({
      message: fieldHint(en, { kind: "size", range: INT_RANGES.sizeM2 }),
      field: "sizeM2",
    });
    expect(text!.message).toBe(en.forms.sizeRange("1", "10 000"));
  });

  it("shows on the field when the form shows it, else above the buttons", () => {
    const e = refusal(["fixationYears", 51], ["loanTermYears", 51]);
    expect(formWriteErrors(en, e, fieldsIn(["fixationYears"]))).toEqual({
      fieldErrors: { fixationYears: en.forms.intRange("0", "50") },
      formError: en.forms.intRange("1", "50"),
    });
  });

  it("reads as one sentence in the banner", () => {
    expect(describeWriteError(en, refusal(["horizonYears", 150]))).toEqual({
      message: en.forms.intRange("1", "100"),
      field: "horizonYears",
    });
  });
});

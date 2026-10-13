// UX-079 (DR-158, ADR 0079): the reason shown when the levered IRR has no value.
import { describe, it, expect } from "vitest";
import { en } from "../../../i18n/en";
import { irrReasonText } from "../irr";

describe("irrReasonText", () => {
  it("explains each reason, and nothing when there is a rate", () => {
    expect(irrReasonText(en, "NOT_UNIQUE")).toBe(en.common.irrNotUnique);
    expect(irrReasonText(en, "NO_ROOT")).toBe(en.common.irrNoRoot);
    expect(irrReasonText(en, null)).toBeUndefined();
  });
});

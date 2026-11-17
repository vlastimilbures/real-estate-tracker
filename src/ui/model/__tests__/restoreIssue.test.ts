// The restore issue table's problem column (P5b, ADR 0086).
import { describe, it, expect } from "vitest";
import { restoreIssueText } from "../restoreIssue";
import { getDict } from "../../../i18n";

const en = getDict("en");

describe("restoreIssueText", () => {
  it("names the allowed range of an out-of-range field, never the value", () => {
    expect(
      restoreIssueText(en, {
        table: "assumptions",
        column: "horizon_years",
        rule: "OUT_OF_RANGE",
        range: { min: 1, max: 100 },
      }),
    ).toBe("Must be a whole number from 1 to 100");
  });

  // ADR 0236 §1: a size names its own rule, one decimal place, and groups thousands like
  // the form hint.
  const size = {
    table: "properties",
    id: "p1",
    column: "size_m2",
    rule: "OUT_OF_RANGE",
    range: { min: 1, max: 10_000 },
  } as const;
  it("groups thousands like the form hint and names one decimal place for a size", () => {
    expect(restoreIssueText(en, size)).toMatch(
      /^Must be a number from 1 to 10\s000 with at most one decimal place$/,
    );
    expect(restoreIssueText(en, { ...size, rule: "BEYOND_LIMIT" })).toBe(
      restoreIssueText(en, size),
    );
  });

  it("the size text is translated in every language", () => {
    const texts = (["en", "cs", "ru"] as const).map((l) =>
      restoreIssueText(getDict(l), size),
    );
    for (const s of texts) expect(s).toMatch(/1.*10\s000/);
    expect(new Set(texts).size).toBe(3);
    const t = getDict("cs");
    expect(restoreIssueText(t, size)).not.toBe(
      restoreIssueText(t, { ...size, column: "horizon_years" }),
    );
  });

  it("is translated in every language", () => {
    const issue = {
      table: "mortgage_blocks",
      rule: "OUT_OF_RANGE",
      range: { min: 0, max: 50 },
    } as const;
    const texts = (["en", "cs", "ru"] as const).map((l) =>
      restoreIssueText(getDict(l), issue),
    );
    for (const s of texts) expect(s).toMatch(/0.*50/);
    expect(new Set(texts).size).toBe(3);
  });

  it("keeps the engine rule text for engine codes", () => {
    expect(
      restoreIssueText(en, {
        table: "assumptions",
        rule: "HORIZON_NOT_POSITIVE",
      }),
    ).toBe(en.inputRules.HORIZON_NOT_POSITIVE);
  });
});

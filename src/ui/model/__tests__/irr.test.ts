// UX-079 (DR-158, ADR 0079): the levered IRR under the lens, and the reason shown when
// it has no value.
import { describe, it, expect } from "vitest";
import { D } from "../../../lib/money";
import type { PortfolioKPIs } from "../../../engine";
import { en } from "../../../i18n/en";
import { irrReasonText, leveredIrr } from "../irr";

const kpis = {
  leveredIrrNominal: D("0.0615"),
  leveredIrrReal: null,
  leveredIrrNominalReason: null,
  leveredIrrRealReason: "NOT_UNIQUE",
} as unknown as PortfolioKPIs;

describe("leveredIrr", () => {
  it("picks the rate and reason of the lens", () => {
    expect(leveredIrr(kpis, "nominal")).toEqual({
      rate: D("0.0615"),
      reason: null,
    });
    expect(leveredIrr(kpis, "real")).toEqual({
      rate: null,
      reason: "NOT_UNIQUE",
    });
  });
});

describe("irrReasonText", () => {
  it("explains each reason, and nothing when there is a rate", () => {
    expect(irrReasonText(en, "NOT_UNIQUE")).toBe(en.common.irrNotUnique);
    expect(irrReasonText(en, "NO_ROOT")).toBe(en.common.irrNoRoot);
    expect(irrReasonText(en, null)).toBeUndefined();
  });
});

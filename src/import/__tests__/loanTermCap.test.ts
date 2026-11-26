// The recast cap is the longest loan term a form or CSV accepts, 50 × 12 (ADR 0109,
// ADR 0244).
import { describe, it, expect } from "vitest";
import { INT_RANGES } from "../../lib/rules";
import { MAX_LOAN_TERM_MONTHS } from "../../engine/__tests__/support/seams";

describe("ADR 0109: the recast cap", () => {
  it("is the longest loan term a form or CSV accepts", () => {
    expect(INT_RANGES.loanTermYears.max).toBe(50);
    expect(MAX_LOAN_TERM_MONTHS).toBe(600);
  });
});

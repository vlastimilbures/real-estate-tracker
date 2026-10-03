// ADR 0109: a recast may run a loan to its start + 50 years, the longest loan term
// a form or CSV accepts. The engine may not import lib/intRanges, so this pins the two.
import { describe, it, expect } from "vitest";
import { INT_RANGES } from "../../lib/intRanges";
import { MAX_LOAN_TERM_MONTHS } from "../../engine";

describe("ADR 0109: the recast cap", () => {
  it("is the longest loan term a form or CSV accepts", () => {
    expect(MAX_LOAN_TERM_MONTHS).toBe(INT_RANGES.loanTermYears.max * 12);
  });
});

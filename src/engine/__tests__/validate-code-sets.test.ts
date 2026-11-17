// #479: the code sets each gate raises on are derived from one table. These are the
// lists the engine kept by hand before, so deriving them moved no code into or out of
// a gate.
import { describe, expect, it } from "vitest";
import { codesRaisedBy, type ValidationCode } from "../validate";

const DATA: ValidationCode[] = [
  "INVALID_DATE",
  "NON_FINITE_NUMBER",
  "NEGATIVE_AMOUNT",
  "ORPHAN_ROW",
  "END_BEFORE_START",
  "DUPLICATE_HOLDING_COST",
];

const RANGE: ValidationCode[] = [
  "HORIZON_NOT_POSITIVE",
  "RATE_OUT_OF_RANGE",
  "SHOCK_OUT_OF_RANGE",
  "GROWTH_OUT_OF_RANGE",
  "SHOCKED_RATE_OUT_OF_RANGE",
  "SHOCKED_INFLATION_OUT_OF_RANGE",
];

const LOAN: ValidationCode[] = [
  "INSTALMENT_BELOW_INTEREST",
  "ZERO_RATE_ZERO_INSTALMENT",
  "MISSING_TERM_FOR_DEV_LOAN",
  "NEGATIVE_PRINCIPAL",
  "NON_POSITIVE_DRAW",
  "DRAW_BEFORE_START",
  "DRAW_AFTER_SCHEDULE_END",
  "DRAW_IN_LAST_TWO_PAYMENTS",
  "COMPLETION_BEFORE_START",
  "INVALID_TERM",
  "RATE_OUT_OF_RANGE",
  "NON_POSITIVE_PREPAYMENT",
  "EVENT_BEFORE_START",
  "EVENT_AFTER_SCHEDULE_END",
  "INVALID_RECAST",
  "INVALID_RECAST_MATURITY",
  "RECAST_INSTALMENT_BEFORE_COMPLETION",
];

/** Raised on their own paths, by no gate. */
const OWN_PATH: ValidationCode[] = [
  "DUPLICATE_BLOCK_START",
  "REFINANCE_WITHIN_A_MONTH",
  "ASOF_BEFORE_BASEDATE",
  "LEASE_OVERLAP",
];

const sorted = (codes: Iterable<ValidationCode>) => [...codes].sort();

describe("#479 — the code sets come from one table", () => {
  it("data codes", () => {
    expect(sorted(codesRaisedBy("data"))).toEqual(sorted(DATA));
  });

  it("range codes", () => {
    expect(sorted(codesRaisedBy("range"))).toEqual(sorted(RANGE));
  });

  it("entry codes are the data and the range codes", () => {
    expect(sorted(codesRaisedBy("data", "range"))).toEqual(
      sorted(new Set([...DATA, ...RANGE])),
    );
  });

  it("loan codes", () => {
    expect(sorted(codesRaisedBy("loan"))).toEqual(sorted(LOAN));
  });

  it("every code is in a gate or on its own path", () => {
    const gated = codesRaisedBy("data", "range", "loan");
    expect(gated.size + OWN_PATH.length).toBe(32);
    for (const c of OWN_PATH) expect(gated.has(c)).toBe(false);
  });
});

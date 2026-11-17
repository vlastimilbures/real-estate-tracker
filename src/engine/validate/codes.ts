// The validation codes, their entities and the gates that raise them (#479).

export type ValidationCode =
  | "INVALID_DATE"
  | "NON_FINITE_NUMBER"
  | "NEGATIVE_AMOUNT"
  | "NEGATIVE_PRINCIPAL"
  | "RATE_OUT_OF_RANGE"
  | "INSTALMENT_BELOW_INTEREST"
  | "ZERO_RATE_ZERO_INSTALMENT"
  | "MISSING_TERM_FOR_DEV_LOAN"
  | "NON_POSITIVE_DRAW"
  | "DRAW_BEFORE_START"
  | "DRAW_AFTER_SCHEDULE_END"
  | "DRAW_IN_LAST_TWO_PAYMENTS"
  | "COMPLETION_BEFORE_START"
  | "DUPLICATE_BLOCK_START"
  | "REFINANCE_WITHIN_A_MONTH"
  | "END_BEFORE_START"
  | "DUPLICATE_HOLDING_COST"
  | "ORPHAN_ROW"
  | "HORIZON_NOT_POSITIVE"
  | "INVALID_TERM"
  | "SHOCK_OUT_OF_RANGE"
  | "GROWTH_OUT_OF_RANGE"
  | "SHOCKED_RATE_OUT_OF_RANGE"
  | "SHOCKED_INFLATION_OUT_OF_RANGE"
  | "ASOF_BEFORE_BASEDATE"
  | "NON_POSITIVE_PREPAYMENT"
  | "EVENT_BEFORE_START"
  | "EVENT_AFTER_SCHEDULE_END"
  | "INVALID_RECAST"
  | "INVALID_RECAST_MATURITY"
  | "RECAST_INSTALMENT_BEFORE_COMPLETION"
  | "LEASE_OVERLAP";

export type ValidationEntity =
  | "assumptions"
  | "property"
  | "mortgage"
  | "valuation"
  | "lease"
  | "holdingCost";

export interface EngineValidationError {
  code: ValidationCode;
  entity: ValidationEntity;
  /** Row id; undefined for assumptions. */
  id?: string | undefined;
  /** Offending field, when the problem is in one field. */
  field?: string | undefined;
  /** The item's position in a list field (prepayments, recasts) as given (ADR 0116). */
  index?: number | undefined;
}

/** The gates that raise a code: "data" is corrupt data (D-37) and "range" the ranges
 *  (D-38, ADR 0128), raised at every entry point by `assertInputs` / `assertAssumptions`;
 *  "loan" is an invalid loan (D-17, D-36), raised by `assertLoanInputs`. A code with no
 *  gate is raised on its own path: `assertBlockStarts`, `assertAsOf`, or a write-time
 *  rule (LEASE_OVERLAP). */
type Gate = "data" | "range" | "loan";

/** Every code's gates, in one table: a code left out fails `tsc` (#479). */
const RAISED_BY = {
  INVALID_DATE: ["data"],
  NON_FINITE_NUMBER: ["data"],
  NEGATIVE_AMOUNT: ["data"],
  NEGATIVE_PRINCIPAL: ["loan"],
  RATE_OUT_OF_RANGE: ["range", "loan"],
  INSTALMENT_BELOW_INTEREST: ["loan"],
  ZERO_RATE_ZERO_INSTALMENT: ["loan"],
  MISSING_TERM_FOR_DEV_LOAN: ["loan"],
  NON_POSITIVE_DRAW: ["loan"],
  DRAW_BEFORE_START: ["loan"],
  DRAW_AFTER_SCHEDULE_END: ["loan"],
  DRAW_IN_LAST_TWO_PAYMENTS: ["loan"],
  COMPLETION_BEFORE_START: ["loan"],
  DUPLICATE_BLOCK_START: [],
  REFINANCE_WITHIN_A_MONTH: [],
  END_BEFORE_START: ["data"],
  DUPLICATE_HOLDING_COST: ["data"],
  ORPHAN_ROW: ["data"],
  HORIZON_NOT_POSITIVE: ["range"],
  INVALID_TERM: ["loan"],
  SHOCK_OUT_OF_RANGE: ["range"],
  GROWTH_OUT_OF_RANGE: ["range"],
  SHOCKED_RATE_OUT_OF_RANGE: ["range"],
  SHOCKED_INFLATION_OUT_OF_RANGE: ["range"],
  ASOF_BEFORE_BASEDATE: [],
  NON_POSITIVE_PREPAYMENT: ["loan"],
  EVENT_BEFORE_START: ["loan"],
  EVENT_AFTER_SCHEDULE_END: ["loan"],
  INVALID_RECAST: ["loan"],
  INVALID_RECAST_MATURITY: ["loan"],
  RECAST_INSTALMENT_BEFORE_COMPLETION: ["loan"],
  LEASE_OVERLAP: [],
} as const satisfies Record<ValidationCode, readonly Gate[]>;

/** @internal The codes any of `gates` raises (exported for the set test). */
export function codesRaisedBy(...gates: Gate[]): ReadonlySet<ValidationCode> {
  const codes = Object.keys(RAISED_BY) as ValidationCode[];
  return new Set(
    codes.filter((c) => RAISED_BY[c].some((g: Gate) => gates.includes(g))),
  );
}

/** Corrupt-data codes the engine raises on at every entry point (D-37). */
export const DATA_ERROR_CODES = codesRaisedBy("data");

/** The codes `assertInputs` and `assertAssumptions` raise on: data and ranges. */
export const ENTRY_ERROR_CODES = codesRaisedBy("data", "range");

/** The invalid-loan codes the engine raises on (D-17, D-36). */
export const LOAN_ERROR_CODES = codesRaisedBy("loan");

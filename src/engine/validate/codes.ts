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

/** The holding-cost fields: a holding-cost row's own, and the assumption defaults'. */
type CostField =
  | "propertyTaxYr"
  | "insuranceYr"
  | "mgmtPctRent"
  | "maintPctRent"
  | "svjMonthly"
  | "otherYr";

/**
 * @internal Each entity's fields an error can name (ADR 0251 §4), exported for tests.
 * The assumptions name a default both bare (NON_FINITE_NUMBER) and as `defaults.<key>`
 * (its range), a known mismatch left as it is. An extra default key the type does not name is reported
 * as given (`Object.keys(a.defaults)`), outside this list: unreachable from the app, and
 * it is left as it is too.
 */
export const VALIDATION_FIELDS = {
  assumptions: [
    "baseDate",
    "appreciationPa",
    "rentIndexationPa",
    "vacancyAllowance",
    "postFixationResetRatePa",
    "inflationPa",
    "sellingCostPct",
    "horizonYears",
    "propertyTaxYr",
    "insuranceYr",
    "mgmtPctRent",
    "maintPctRent",
    "svjMonthly",
    "otherYr",
    "defaults.propertyTaxYr",
    "defaults.insuranceYr",
    "defaults.mgmtPctRent",
    "defaults.maintPctRent",
    "defaults.svjMonthly",
    "defaults.otherYr",
    "inflationShock",
    "rateShock",
    "valueShock",
    "asOf",
  ],
  property: [
    "purchaseDate",
    "purchasePrice",
    "appreciationOverridePa",
    "rentIndexOverridePa",
    "ownCash",
    "transactionCosts",
    "initialWorks",
  ],
  mortgage: [
    "propertyId",
    "startDate",
    "completionDate",
    "contractMaturityDate",
    "initialPrincipal",
    "interestRatePa",
    "monthlyInstalment",
    "fixationYears",
    "loanTermYears",
    "draws",
    "prepayments",
    "recasts",
  ],
  valuation: ["propertyId", "validFrom", "validTo", "marketValue"],
  lease: ["propertyId", "startDate", "endDate", "monthlyRent"],
  holdingCost: [
    "propertyId",
    "propertyTaxYr",
    "insuranceYr",
    "mgmtPctRent",
    "maintPctRent",
    "svjMonthly",
    "otherYr",
  ],
} as const satisfies Record<ValidationEntity, readonly string[]>;

/** The fields an error on entity `E` can name. */
export type FieldOf<E extends ValidationEntity> =
  (typeof VALIDATION_FIELDS)[E][number];

/** Any entity's field: what `EngineValidationError.field` names. */
export type ValidationField = FieldOf<ValidationEntity>;

/** The cost fields as a row names them, or the defaults with their prefix. */
export type CostFieldAs<P extends "" | "defaults."> = `${P}${CostField}`;

export interface EngineValidationError {
  code: ValidationCode;
  entity: ValidationEntity;
  /** Row id; undefined for assumptions. */
  id?: string | undefined;
  /** Offending field, when the problem is in one field (ADR 0251 §4). */
  field?: ValidationField | undefined;
  /** The item's position in a list field (prepayments, recasts) as given (ADR 0116). */
  index?: number | undefined;
}

/** The gates that raise a code: "data" is corrupt data (ADR 0037) and "range" the ranges
 *  (ADR 0038, ADR 0128), raised at every entry point by `assertInputs` / `assertAssumptions`;
 *  "loan" is an invalid loan (ADR 0017, ADR 0036), raised by `assertLoanInputs`. A code with no
 *  gate is raised on its own path: `assertBlockStarts`, `assertAsOf`, or a write-time
 *  rule (LEASE_OVERLAP). INSTALMENT_BELOW_INTEREST and ZERO_RATE_ZERO_INSTALMENT keep the
 *  "loan" gate for a loan without a term and are also raised by a write-time rule for a
 *  loan with one (`instalmentBelowInterestErrors`, ADR 0264). */
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

/** Corrupt-data codes the engine raises on at every entry point (ADR 0037). */
export const DATA_ERROR_CODES = codesRaisedBy("data");

/** The codes `assertInputs` and `assertAssumptions` raise on: data and ranges. */
export const ENTRY_ERROR_CODES = codesRaisedBy("data", "range");

/** The invalid-loan codes the engine raises on (ADR 0017, ADR 0036). */
export const LOAN_ERROR_CODES = codesRaisedBy("loan");

/** A loan's own amounts: NON_FINITE_NUMBER on one of them is also a "loan" problem, so
 *  `assertLoanInputs` refuses the loan instead of computing it (ADR 0251 §2). */
const LOAN_AMOUNT_FIELDS: ReadonlySet<string | undefined> = new Set([
  "initialPrincipal",
  "monthlyInstalment",
]);

/** True when the "loan" gate raises `code` on `field`: a loan code, or a non-finite
 *  loan amount (ADR 0251 §2). */
export function raisedByLoanGate(
  code: ValidationCode,
  field: string | undefined,
): boolean {
  return (
    LOAN_ERROR_CODES.has(code) ||
    (code === "NON_FINITE_NUMBER" && LOAN_AMOUNT_FIELDS.has(field))
  );
}

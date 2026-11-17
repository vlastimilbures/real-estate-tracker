// Engine-boundary validation (P4a): a pure check of the inputs the engine would
// otherwise turn into NaN, Infinity, an endless loop or a silently wrong number.
// `validateInputs` only reports. The engine raises a typed error per approved
// decision: the D-17 loan codes via `assertLoanInputs` (P4b), D-27 overlap via
// `assertBlockStarts` (P4b), D-19 as-of before baseDate via `assertAsOf` (P4b), D-37
// corrupt data and D-38 ranges via `assertInputs` / `assertAssumptions` (P4b).
// Entry-point rejection is P5b/P7; messages belong to P7.
import { ZERO, type Decimal } from "../lib/money";
import { atOrBelowGrowthFloor, outsideUnitRate } from "../lib/rules";
import { edate, isAfter, isOnOrBefore } from "./dates";
import {
  derivedTermProblem,
  dueDate,
  eventTermMonths,
  maxTermMonths,
  paymentOnOrAfter,
  paymentsDueBy,
  termMonths,
} from "./amortization";
import { EngineInputError } from "./errors";
import { COST_KEYS, COST_MONEY_KEYS, COST_RATE_KEYS } from "./figures";
import { overlappingLeases } from "./succession";
import type {
  AcquisitionFunding,
  Assumptions,
  CostDefaults,
  HoldingCost,
  LoanRecast,
  MortgageBlock,
  Portfolio,
  Property,
  ShockBand,
} from "./types";

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

type Report = (code: ValidationCode, field?: string, index?: number) => void;

/** Where a reporter puts the errors it builds. */
type Add = (e: EngineValidationError) => void;

/** The entities that are rows with an id: all but the assumptions. */
type RowEntity = Exclude<ValidationEntity, "assumptions">;

/** A row's error: `field` always present, `index` only for a list item (ADR 0116). */
function rowError(
  entity: RowEntity,
  id: string,
  code: ValidationCode,
  field: string | undefined,
  index?: number,
): EngineValidationError {
  return {
    code,
    entity,
    id,
    field,
    ...(index === undefined ? {} : { index }),
  };
}

/** An assumptions error: no row id. */
function assumptionError(
  code: ValidationCode,
  field: string | undefined,
): EngineValidationError {
  return { code, entity: "assumptions", field };
}

/** The reporter of one row: every problem becomes `rowError` on it (#479). */
function rowReporter(entity: RowEntity, id: string, add: Add): Report {
  return (code, field, index) => add(rowError(entity, id, code, field, index));
}

/** The reporter of the assumptions: every problem becomes `assumptionError`. */
function assumptionReporter(add: Add): Report {
  return (code, field) => add(assumptionError(code, field));
}

const badDate = (d: Date | undefined) =>
  d !== undefined && Number.isNaN(d.getTime());
const badNumber = (d: Decimal | undefined) => d !== undefined && !d.isFinite();
/** A fraction that must lie in [0, 1] (vacancy, cost shares, a value haircut). */
const outsideUnit = (d: Decimal | undefined) =>
  d !== undefined && d.isFinite() && outsideUnitRate(d);

/** A growth rate at or below −100 % (ADR 0128): a yearly factor of zero or less. */
const belowGrowthFloor = (d: Decimal | undefined) =>
  d !== undefined && d.isFinite() && atOrBelowGrowthFloor(d);

/** A finite amount below zero (a non-finite one is NON_FINITE_NUMBER instead). */
const isNegativeAmount = (d: Decimal | undefined) =>
  d !== undefined && d.isFinite() && d.isNegative();

/** Below zero, unguarded: for a required amount, so −Infinity reports here as well as
 *  NON_FINITE_NUMBER (kept as it is, #479). */
const isNegative = (d: Decimal) => d.isNegative();
const notPositive = (d: Decimal) => !d.greaterThan(ZERO);

/** Finite-number / valid-date checks over an object's fields: the dates, then the
 *  numbers. */
function checkFields<D extends string, N extends string>(
  row: { readonly [F in D]?: Date | undefined } & {
    readonly [F in N]?: Decimal | undefined;
  },
  dates: readonly D[],
  numbers: readonly N[],
  report: Report,
): void {
  for (const f of dates) {
    if (badDate(row[f])) report("INVALID_DATE", f);
  }
  for (const f of numbers) {
    if (badNumber(row[f])) report("NON_FINITE_NUMBER", f);
  }
}

/** One sign or range rule of a row: `test` true ⇒ `code` on `field`. A rule on an
 *  optional field needs a test that takes undefined. */
type SignRule<R, K extends keyof R> = readonly [
  field: K,
  test: (d: R[K]) => boolean,
  code: ValidationCode,
];

/** Sign and range rules over a row, in table order: each rule is one pass over its
 *  field, so a row with several bad fields reports rule by rule (#479). `prefix` goes
 *  before each field name. */
function checkSigns<R, K extends keyof R & string>(
  row: R,
  rules: readonly SignRule<R, K>[],
  report: Report,
  prefix = "",
): void {
  for (const [f, test, code] of rules) {
    if (test(row[f])) report(code, `${prefix}${f}`);
  }
}

/** An amount: NON_FINITE_NUMBER, else `code` when `bad`. */
function checkAmount<T extends Decimal | undefined>(
  amount: T,
  bad: (amount: T) => boolean,
  code: ValidationCode,
  issue: (code: ValidationCode) => void,
): void {
  if (badNumber(amount)) issue("NON_FINITE_NUMBER");
  else if (bad(amount)) issue(code);
}

/** A shock band's duration: whole years ≥ 0 (D-38). */
const badDuration = (band: ShockBand) =>
  !Number.isInteger(band.durationYears) || band.durationYears < 0;

function checkShock(
  band: ShockBand | undefined,
  field: string,
  report: Report,
): void {
  if (!band) return;
  if (badNumber(band.deltaPa)) report("NON_FINITE_NUMBER", field);
  if (badDuration(band)) report("SHOCK_OUT_OF_RANGE", field);
}

/** D-38 shares and ADR 0075 (DR-176) non-negative costs on the assumption defaults
 *  (`prefix` "defaults."), and the same bounds on a holding-cost row (D-54, DR-127).
 *  The Kč fields are reported first, then the shares. */
function checkCostRanges(
  c: CostDefaults | HoldingCost,
  prefix: string,
  report: Report,
): void {
  checkSigns(c, COST_SIGNS, report, prefix);
}

/** The holding costs' rules: the Kč fields, then the shares. */
const COST_SIGNS: readonly SignRule<
  CostDefaults | HoldingCost,
  (typeof COST_KEYS)[number]
>[] = [
  ...COST_MONEY_KEYS.map(
    (f) => [f, isNegativeAmount, "NEGATIVE_AMOUNT"] as const,
  ),
  ...COST_RATE_KEYS.map((f) => [f, outsideUnit, "RATE_OUT_OF_RANGE"] as const),
];

function checkAssumptions(a: Assumptions, report: Report): void {
  const rates = [
    "appreciationPa",
    "rentIndexationPa",
    "vacancyAllowance",
    "postFixationResetRatePa",
    "inflationPa",
    "sellingCostPct",
  ] as const;
  checkFields(a, ["baseDate"], rates, report);
  // Every own key in its own order, a key the type does not name too.
  const defaults = Object.keys(a.defaults) as (keyof CostDefaults)[];
  checkFields(a.defaults, [], defaults, report);
  if (!Number.isInteger(a.horizonYears) || a.horizonYears <= 0) {
    report("HORIZON_NOT_POSITIVE", "horizonYears");
  }
  checkLevelRanges(a, report);
  checkCostRanges(a.defaults, "defaults.", report);
  checkShock(a.inflationShock, "inflationShock", report);
  checkShock(a.rateShock, "rateShock", report);
  // ADR 0128 §3: a shock shifts a level, so the shifted level keeps the level's bound.
  checkShiftedLevel(a.postFixationResetRatePa, a.rateShock, outsideUnit, () =>
    report("SHOCKED_RATE_OUT_OF_RANGE", "rateShock"),
  );
  checkShiftedLevel(a.inflationPa, a.inflationShock, belowGrowthFloor, () =>
    report("SHOCKED_INFLATION_OUT_OF_RANGE", "inflationShock"),
  );
  checkValueShock(a.valueShock, report);
}

/** The assumption levels bounded below by −100 % (ADR 0128 §2). */
const GROWTH_FIELDS = [
  "appreciationPa",
  "rentIndexationPa",
  "inflationPa",
] as const;

/** D-38 and ADR 0128 §1–2 ranges of the assumption levels. */
function checkLevelRanges(a: Assumptions, report: Report): void {
  checkSigns(a, LEVEL_SIGNS, report);
}

const LEVEL_SIGNS: readonly SignRule<
  Assumptions,
  | "vacancyAllowance"
  | "sellingCostPct"
  | "postFixationResetRatePa"
  | (typeof GROWTH_FIELDS)[number]
>[] = [
  ["vacancyAllowance", outsideUnit, "RATE_OUT_OF_RANGE"],
  // ADR 0183: a fraction of the projected value at the horizon.
  ["sellingCostPct", outsideUnit, "RATE_OUT_OF_RANGE"],
  // ADR 0128 §1: the reset rate is an interest rate (ADR 0038).
  ["postFixationResetRatePa", outsideUnit, "RATE_OUT_OF_RANGE"],
  ...GROWTH_FIELDS.map(
    (f) => [f, belowGrowthFloor, "GROWTH_OUT_OF_RANGE"] as const,
  ),
];

/**
 * ADR 0128 §3: `level` + the shock's delta must stay in the level's own range. Checked
 * only when the level and the shock pass their own rules, so one typo gives one message.
 */
function checkShiftedLevel(
  level: Decimal,
  band: ShockBand | undefined,
  outOfRange: (d: Decimal) => boolean,
  report: () => void,
): void {
  if (!band || badNumber(band.deltaPa) || badDuration(band)) return;
  if (badNumber(level)) return;
  if (outOfRange(level)) return;
  if (outOfRange(level.plus(band.deltaPa))) report();
}

/** A value crash: a finite haircut within 0–1 at a whole year ≥ 0 (D-38, ADR 0128 §4). */
function checkValueShock(vs: Assumptions["valueShock"], report: Report): void {
  if (!vs) return;
  if (badNumber(vs.pct)) report("NON_FINITE_NUMBER", "valueShock");
  if (outsideUnit(vs.pct) || !Number.isInteger(vs.atYear) || vs.atYear < 0) {
    report("SHOCK_OUT_OF_RANGE", "valueShock");
  }
}

/** Term problems of a loan whose term comes from its instalment (NPER). */
function checkDerivedTerm(b: MortgageBlock, report: Report): void {
  const problem = derivedTermProblem(b);
  if (problem) report(problem.code, problem.field);
}

/** The due date of payment `term − back` (term = the loan term in payments), or
 *  undefined without a valid term (then MISSING_TERM_FOR_DEV_LOAN or INVALID_TERM
 *  reports instead). */
function paymentFromEnd(b: MortgageBlock, back: number): Date | undefined {
  return b.loanTermYears != null && Number.isInteger(b.loanTermYears)
    ? dueDate(b, b.loanTermYears * 12 - back)
    : undefined;
}

/** The last-but-one payment date (start + term − 1 month). */
const lastDrawDate = (b: MortgageBlock) => paymentFromEnd(b, 1);

/** The last-but-two payment date (start + term − 2 months): the last date a tranche
 *  may have (ADR 0226 §1). */
const lastButTwoDate = (b: MortgageBlock) => paymentFromEnd(b, 2);

/** The last-but-one and last-but-two payment dates a draw is checked against. */
interface DrawLimits {
  lastDraw: Date | undefined;
  lastButTwo: Date | undefined;
}

function checkDrawDate(
  date: Date,
  b: MortgageBlock,
  { lastDraw, lastButTwo }: DrawLimits,
  i: number,
  report: Report,
): void {
  if (badDate(date)) report("INVALID_DATE", "draws", i);
  // A draw on the start date itself belongs in the initial principal (D-42).
  else if (isOnOrBefore(date, b.startDate))
    report("DRAW_BEFORE_START", "draws", i);
  // A later draw lands on the final payment, which would repay it in one shot
  // (DR-074, ADR 0129 §3).
  else if (lastDraw && isAfter(date, lastDraw))
    report("DRAW_AFTER_SCHEDULE_END", "draws", i);
  // A draw in the last two payment months is not modelled (ADR 0226 §1).
  else if (lastButTwo && isAfter(date, lastButTwo))
    report("DRAW_IN_LAST_TWO_PAYMENTS", "draws", i);
}

function checkDevFeatures(b: MortgageBlock, report: Report): void {
  const limits = { lastDraw: lastDrawDate(b), lastButTwo: lastButTwoDate(b) };
  (b.draws ?? []).forEach((d, i) => {
    checkDrawDate(d.date, b, limits, i, report);
    checkAmount(d.amount, notPositive, "NON_POSITIVE_DRAW", (code) =>
      report(code, "draws", i),
    );
  });
  if (b.completionDate && isAfter(b.startDate, b.completionDate)) {
    report("COMPLETION_BEFORE_START", "completionDate");
  }
}

/** The contract term in payments, or undefined when it is invalid (another code
 *  reports that) or cannot be derived from non-finite inputs. */
function contractTerm(b: MortgageBlock): number | undefined {
  if (b.loanTermYears != null) {
    return Number.isInteger(b.loanTermYears) && b.loanTermYears > 0
      ? b.loanTermYears * 12
      : undefined;
  }
  const finite =
    b.initialPrincipal.isFinite() &&
    b.interestRatePa.isFinite() &&
    b.monthlyInstalment.isFinite();
  return finite && !derivedTermProblem(b) ? termMonths(b) : undefined;
}

/** A prepayment or recast date: after the start, before the last payment the loan
 *  can reach (ADR 0109). */
function checkEventDate(
  date: Date,
  b: MortgageBlock,
  end: Date | undefined,
  report: (code: ValidationCode) => void,
): boolean {
  if (badDate(date)) report("INVALID_DATE");
  else if (isOnOrBefore(date, b.startDate)) report("EVENT_BEFORE_START");
  else if (end && isOnOrBefore(end, date)) report("EVENT_AFTER_SCHEDULE_END");
  else return true;
  return false;
}

function checkPrepayments(
  b: MortgageBlock,
  end: Date | undefined,
  report: Report,
): void {
  (b.prepayments ?? []).forEach((p, i) => {
    const issue = (code: ValidationCode) => report(code, "prepayments", i);
    checkEventDate(p.date, b, end, issue);
    checkAmount(p.amount, notPositive, "NON_POSITIVE_PREPAYMENT", issue);
    checkAmount(p.fee, isNegativeAmount, "NEGATIVE_AMOUNT", issue);
  });
}

/** A recast maturity must leave at least the next payment, stay within the cap and,
 *  on a development loan, fall after the completion's payment (ADR 0116). */
function checkRecastMaturity(
  b: MortgageBlock,
  r: LoanRecast,
  term: number | undefined,
  issue: (code: ValidationCode) => void,
): void {
  if (r.maturity === undefined || term === undefined) return;
  if (badDate(r.maturity)) return issue("INVALID_DATE");
  const last = paymentsDueBy(b, r.maturity);
  const next = paymentOnOrAfter(b, r.date) + 1;
  // On a development loan the maturity must follow the payment the completion (the
  // last tranche) lands on, else that tranche restores the contract term (ADR 0116).
  const beforeCompletion =
    b.completionDate != null && last <= paymentOnOrAfter(b, b.completionDate);
  if (last < next || last > maxTermMonths(term) || beforeCompletion)
    issue("INVALID_RECAST_MATURITY");
}

function checkRecastInstalment(
  b: MortgageBlock,
  r: LoanRecast,
  issue: (code: ValidationCode) => void,
): void {
  if (r.instalment === undefined) return;
  checkAmount(r.instalment, notPositive, "INVALID_RECAST", issue);
  // Before completion the payment is interest only: no instalment to set.
  if (b.completionDate && isOnOrBefore(r.date, b.completionDate))
    issue("RECAST_INSTALMENT_BEFORE_COMPLETION");
}

function checkRecasts(
  b: MortgageBlock,
  term: number | undefined,
  end: Date | undefined,
  report: Report,
): void {
  (b.recasts ?? []).forEach((r, i) => {
    const issue = (code: ValidationCode) => report(code, "recasts", i);
    const dated = checkEventDate(r.date, b, end, issue);
    if ((r.maturity === undefined) === (r.instalment === undefined))
      return issue("INVALID_RECAST");
    checkRecastInstalment(b, r, issue);
    if (dated) checkRecastMaturity(b, r, term, issue);
  });
}

/** Prepayments and recasts (ADR 0109). */
function checkLoanEvents(b: MortgageBlock, report: Report): void {
  if (!b.prepayments?.length && !b.recasts?.length) return;
  const term = contractTerm(b);
  const end =
    term === undefined || badDate(b.startDate)
      ? undefined
      : dueDate(b, eventTermMonths(withValidRecasts(b), term));
  checkPrepayments(b, end, report);
  checkRecasts(b, term, end, report);
}

/** The block without recasts whose dates could not place a maturity. */
function withValidRecasts(b: MortgageBlock): MortgageBlock {
  const recasts = (b.recasts ?? []).filter(
    (r) => r.maturity === undefined || !badDate(r.maturity),
  );
  return { ...b, recasts };
}

/** Fixation and loan term are whole years (the loan term ADR 0135). */
function checkTerms(b: MortgageBlock, report: Report): void {
  if (!Number.isInteger(b.fixationYears) || b.fixationYears < 0)
    report("INVALID_TERM", "fixationYears");
  if (
    b.loanTermYears != null &&
    !(Number.isInteger(b.loanTermYears) && b.loanTermYears > 0)
  )
    report("INVALID_TERM", "loanTermYears");
}

/** The block's own amounts and rate, in this order. */
const LOAN_SIGNS: readonly SignRule<
  MortgageBlock,
  "initialPrincipal" | "monthlyInstalment" | "interestRatePa"
>[] = [
  ["initialPrincipal", isNegative, "NEGATIVE_PRINCIPAL"],
  ["monthlyInstalment", isNegative, "NEGATIVE_AMOUNT"],
  ["interestRatePa", outsideUnit, "RATE_OUT_OF_RANGE"],
];

function checkMortgage(b: MortgageBlock, report: Report): void {
  checkFields(
    b,
    ["startDate", "completionDate", "contractMaturityDate"],
    ["initialPrincipal", "interestRatePa", "monthlyInstalment"],
    report,
  );
  checkSigns(b, LOAN_SIGNS, report);
  checkTerms(b, report);
  checkDevFeatures(b, report);
  if (b.initialPrincipal.isFinite() && b.interestRatePa.isFinite())
    checkDerivedTerm(b, report);
  checkLoanEvents(b, report);
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
const DATA_ERROR_CODES = codesRaisedBy("data");

/** The codes `assertInputs` and `assertAssumptions` raise on: data and ranges. */
const ENTRY_ERROR_CODES = codesRaisedBy("data", "range");

/** The invalid-loan codes the engine raises on (D-17, D-36). */
const LOAN_ERROR_CODES = codesRaisedBy("loan");

/**
 * Raise an EngineInputError when a loan the engine is about to compute has a D-17
 * problem, instead of letting it become a NaN term, an endless schedule or vanished
 * debt (DR-014, DR-018, DR-043). Every D-17 problem of the block is listed.
 */
export function assertLoanInputs(block: MortgageBlock): void {
  const errors: EngineValidationError[] = [];
  checkMortgage(block, (code, field, index) => {
    if (LOAN_ERROR_CODES.has(code)) {
      errors.push(rowError("mortgage", block.id, code, field, index));
    }
  });
  if (errors.length > 0) throw new EngineInputError(errors);
}

/**
 * Raise the D-37 data problems of every block of a property, before the block chain
 * is chosen (a block with an invalid start date would otherwise just drop out).
 */
export function assertLoanRows(blocks: MortgageBlock[]): void {
  const errors: EngineValidationError[] = [];
  for (const b of blocks) {
    checkMortgage(b, (code, field, index) => {
      if (DATA_ERROR_CODES.has(code)) {
        errors.push(rowError("mortgage", b.id, code, field, index));
      }
    });
  }
  if (errors.length > 0) throw new EngineInputError(errors);
}

/** Effective-dated rows: valid dates, finite non-negative amount, end ≥ start. */
function checkDated(
  start: Date,
  end: Date | undefined,
  amount: Decimal,
  fields: [string, string, string],
  report: Report,
): void {
  if (badDate(start)) report("INVALID_DATE", fields[0]);
  if (badDate(end)) report("INVALID_DATE", fields[1]);
  if (end && isAfter(start, end)) report("END_BEFORE_START", fields[1]);
  checkAmount(amount, isNegative, "NEGATIVE_AMOUNT", (code) =>
    report(code, fields[2]),
  );
}

type ReporterFor = (
  entity: RowEntity,
  id: string,
  propertyId?: string,
) => Report;

/** A holding-cost row's numbers: the Kč fields, then the shares. */
const HOLDING_COST_FIELDS = [...COST_KEYS];

/** The Kč parts of a property's funding record (ADR 0119). */
const FUNDING_MONEY = ["ownCash", "transactionCosts", "initialWorks"] as const;

const FUNDING_SIGNS: readonly SignRule<
  AcquisitionFunding,
  (typeof FUNDING_MONEY)[number]
>[] = FUNDING_MONEY.map(
  (f) => [f, isNegativeAmount, "NEGATIVE_AMOUNT"] as const,
);

const PRICE_SIGNS: readonly SignRule<Property, "purchasePrice">[] = [
  ["purchasePrice", isNegative, "NEGATIVE_AMOUNT"],
];

const GROWTH_OVERRIDES: readonly SignRule<
  Property,
  "appreciationOverridePa" | "rentIndexOverridePa"
>[] = [
  ["appreciationOverridePa", belowGrowthFloor, "GROWTH_OUT_OF_RANGE"],
  ["rentIndexOverridePa", belowGrowthFloor, "GROWTH_OUT_OF_RANGE"],
];

function checkProperties(p: Portfolio, on: ReporterFor): void {
  for (const x of p.properties) {
    const report = on("property", x.id);
    checkFields(
      x,
      ["purchaseDate"],
      ["purchasePrice", "appreciationOverridePa", "rentIndexOverridePa"],
      report,
    );
    checkSigns(x, PRICE_SIGNS, report);
    // ADR 0128 §2: a property's own growth keeps the assumption floor.
    checkSigns(x, GROWTH_OVERRIDES, report);
    // ADR 0119 §7: flat field names, so a restore maps them to their columns.
    const funding = x.funding ?? {};
    checkFields(funding, [], FUNDING_MONEY, report);
    checkSigns(funding, FUNDING_SIGNS, report);
  }
}

/**
 * Blocks that start on the same date as an earlier-listed block of the same property.
 * Only these overlap; a later start is a successor (D-27, D-43).
 */
function duplicateStarts(blocks: MortgageBlock[]): Set<MortgageBlock> {
  const starts = new Set<string>();
  const dupes = new Set<MortgageBlock>();
  for (const b of blocks) {
    const key = `${b.propertyId}|${b.startDate.getTime()}`;
    if (starts.has(key)) dupes.add(b);
    starts.add(key);
  }
  return dupes;
}

/** Each property's blocks with a valid start date, in input order. */
function blocksByProperty(blocks: MortgageBlock[]): MortgageBlock[][] {
  const byProperty = new Map<string, MortgageBlock[]>();
  for (const b of blocks) {
    if (badDate(b.startDate)) continue; // INVALID_DATE reports it
    byProperty.set(b.propertyId, [...(byProperty.get(b.propertyId) ?? []), b]);
  }
  return [...byProperty.values()];
}

/**
 * Blocks that start on or before EDATE(the property's next-earlier start, 1), and the
 * blocks on that earlier start: two refinancings within one month are not modelled
 * (ADR 0226 §2). Blocks on one start are DUPLICATE_BLOCK_START only. Checking every
 * earlier start names the same blocks: a start between the two is within the month too.
 */
function refinancesWithinAMonth(blocks: MortgageBlock[]): Set<MortgageBlock> {
  const flagged = new Set<MortgageBlock>();
  for (const own of blocksByProperty(blocks)) {
    for (const a of own) {
      const month = edate(a.startDate, 1);
      for (const b of own) {
        if (
          isAfter(b.startDate, a.startDate) &&
          isOnOrBefore(b.startDate, month)
        )
          flagged.add(a).add(b);
      }
    }
  }
  return flagged;
}

/** A start-date problem on a block. */
const startError = (code: ValidationCode, b: MortgageBlock) =>
  rowError("mortgage", b.id, code, "startDate");

/** Raise DUPLICATE_BLOCK_START for overlapping blocks of one property (D-27, D-43),
 *  then REFINANCE_WITHIN_A_MONTH for blocks starting within a month of the one they
 *  replace (ADR 0226 §2). */
export function assertBlockStarts(blocks: MortgageBlock[]): void {
  const quick = refinancesWithinAMonth(blocks);
  const errors = [
    ...[...duplicateStarts(blocks)].map((b) =>
      startError("DUPLICATE_BLOCK_START", b),
    ),
    ...blocks
      .filter((b) => quick.has(b))
      .map((b) => startError("REFINANCE_WITHIN_A_MONTH", b)),
  ];
  if (errors.length > 0) throw new EngineInputError(errors);
}

/** ASOF_BEFORE_BASEDATE when `asOf` precedes the projection window start (D-19). */
function asOfProblem(
  asOf: Date,
  baseDate: Date,
): EngineValidationError | undefined {
  return isAfter(baseDate, asOf)
    ? assumptionError("ASOF_BEFORE_BASEDATE", "asOf")
    : undefined;
}

/** Raise ASOF_BEFORE_BASEDATE for an as-of date before baseDate (D-19, DR-015). */
export function assertAsOf(asOf: Date, baseDate: Date): void {
  const problem = asOfProblem(asOf, baseDate);
  if (problem) throw new EngineInputError([problem]);
}

function checkMortgages(p: Portfolio, on: ReporterFor): void {
  const dupes = duplicateStarts(p.mortgages);
  const quick = refinancesWithinAMonth(p.mortgages);
  for (const b of p.mortgages) {
    const report = on("mortgage", b.id, b.propertyId);
    checkMortgage(b, report);
    if (dupes.has(b)) report("DUPLICATE_BLOCK_START", "startDate");
    if (quick.has(b)) report("REFINANCE_WITHIN_A_MONTH", "startDate");
  }
}

function checkValuationsAndLeases(p: Portfolio, on: ReporterFor): void {
  for (const v of p.valuations) {
    checkDated(
      v.validFrom,
      v.validTo,
      v.marketValue,
      ["validFrom", "validTo", "marketValue"],
      on("valuation", v.id, v.propertyId),
    );
  }
  for (const l of p.leases) {
    checkDated(
      l.startDate,
      l.endDate,
      l.monthlyRent,
      ["startDate", "endDate", "monthlyRent"],
      on("lease", l.id, l.propertyId),
    );
  }
}

function checkHoldingCosts(p: Portfolio, on: ReporterFor): void {
  const owners = new Set<string>();
  for (const h of p.holdingCosts) {
    const report = on("holdingCost", h.id, h.propertyId);
    checkFields(h, [], HOLDING_COST_FIELDS, report);
    checkCostRanges(h, "", report); // D-54 (DR-127): the defaults' bounds
    if (owners.has(h.propertyId)) report("DUPLICATE_HOLDING_COST"); // DR-071
    owners.add(h.propertyId);
  }
}

/** Every per-row check, plus orphans and duplicates across rows. */
function checkPortfolio(
  p: Portfolio,
  add: (e: EngineValidationError) => void,
): void {
  const ids = new Set(p.properties.map((x) => x.id));
  const on: ReporterFor = (entity, id, propertyId) => {
    const report = rowReporter(entity, id, add);
    // Reported as the reporter is made, so a row's ORPHAN_ROW comes first.
    if (propertyId !== undefined && !ids.has(propertyId))
      report("ORPHAN_ROW", "propertyId");
    return report;
  };
  checkProperties(p, on);
  checkMortgages(p, on);
  checkValuationsAndLeases(p, on);
  checkHoldingCosts(p, on);
}

/**
 * The portfolio rows' problems only (validateInputs without the assumptions), for
 * entry points that write portfolio rows: CSV import and restore (P5b).
 */
export function validatePortfolio(
  portfolio: Portfolio,
): EngineValidationError[] {
  const errors: EngineValidationError[] = [];
  checkPortfolio(portfolio, (e) => errors.push(e));
  return errors;
}

/**
 * LEASE_OVERLAP on each lease that overlaps another lease of its property (ADR 0163),
 * once per lease, in start order. A write-time rule: the store and CSV import apply it to
 * the rows they write. It is not part of `validatePortfolio`/`validateInputs`, so a
 * stored overlap from before the rule still loads and restores (the Data check lists it).
 */
export function leaseOverlapErrors(
  portfolio: Portfolio,
): EngineValidationError[] {
  const named = new Set<string>();
  for (const pair of overlappingLeases(portfolio.leases))
    for (const l of pair) named.add(l.id);
  return [...named].map((id) =>
    rowError("lease", id, "LEASE_OVERLAP", "startDate"),
  );
}

/**
 * Every problem in the engine inputs, in a stable order (assumptions, then each
 * portfolio collection in input order). Empty when the inputs are valid. `asOf`, when
 * given, is checked against the projection window start (D-19).
 */
export function validateInputs(
  portfolio: Portfolio,
  assumptions: Assumptions,
  asOf?: Date,
): EngineValidationError[] {
  const errors: EngineValidationError[] = [];
  const add = (e: EngineValidationError) => errors.push(e);
  checkAssumptions(assumptions, assumptionReporter(add));
  const asOfError = asOf && asOfProblem(asOf, assumptions.baseDate);
  if (asOfError) add(asOfError);
  checkPortfolio(portfolio, add);
  return errors;
}

function raiseEntryErrors(errors: EngineValidationError[]): void {
  const raised = errors.filter((e) => ENTRY_ERROR_CODES.has(e.code));
  if (raised.length > 0) throw new EngineInputError(raised);
}

/** Raise the D-37 / D-38 problems of the assumptions (entry points without a portfolio). */
export function assertAssumptions(assumptions: Assumptions): void {
  const errors: EngineValidationError[] = [];
  checkAssumptions(
    assumptions,
    assumptionReporter((e) => errors.push(e)),
  );
  raiseEntryErrors(errors);
}

/**
 * Raise an EngineInputError listing every D-37 / D-38 problem in the inputs (validateInputs
 * order), instead of computing NaN, a rolled-over date or a silent first-row pick.
 */
export function assertInputs(
  portfolio: Portfolio,
  assumptions: Assumptions,
): void {
  raiseEntryErrors(validateInputs(portfolio, assumptions));
}

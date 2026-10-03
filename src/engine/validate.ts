// Engine-boundary validation (P4a): a pure check of the inputs the engine would
// otherwise turn into NaN, Infinity, an endless loop or a silently wrong number.
// `validateInputs` only reports. The engine raises a typed error per approved
// decision: the D-17 loan codes via `assertLoanInputs` (P4b), D-27 overlap via
// `assertBlockStarts` (P4b), D-19 as-of before baseDate via `assertAsOf` (P4b), D-37
// corrupt data and D-38 ranges via `assertInputs` / `assertAssumptions` (P4b).
// Entry-point rejection is P5b/P7; messages belong to P7.
import { ONE, ZERO, type Decimal } from "../lib/money";
import { edate, isAfter, isOnOrBefore } from "./dates";
import {
  derivedTermProblem,
  eventTermMonths,
  maxTermMonths,
  paymentOnOrAfter,
  paymentsDueBy,
  termMonths,
} from "./amortization";
import { EngineInputError } from "./errors";
import type {
  Assumptions,
  LoanRecast,
  MortgageBlock,
  Portfolio,
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
  | "COMPLETION_BEFORE_START"
  | "DUPLICATE_BLOCK_START"
  | "END_BEFORE_START"
  | "DUPLICATE_HOLDING_COST"
  | "ORPHAN_ROW"
  | "HORIZON_NOT_POSITIVE"
  | "INVALID_TERM"
  | "SHOCK_OUT_OF_RANGE"
  | "ASOF_BEFORE_BASEDATE"
  | "NON_POSITIVE_PREPAYMENT"
  | "EVENT_BEFORE_START"
  | "EVENT_AFTER_SCHEDULE_END"
  | "INVALID_RECAST"
  | "INVALID_RECAST_MATURITY"
  | "RECAST_INSTALMENT_BEFORE_COMPLETION";

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

const badDate = (d: Date | undefined) =>
  d !== undefined && Number.isNaN(d.getTime());
const badNumber = (d: Decimal | undefined) => d !== undefined && !d.isFinite();
/** A fraction that must lie in [0, 1] (vacancy, cost shares, a value haircut). */
const outsideUnit = (d: Decimal | undefined) =>
  d !== undefined && d.isFinite() && (d.isNegative() || d.greaterThan(ONE));

/** A finite amount below zero (a non-finite one is NON_FINITE_NUMBER instead). */
const isNegativeAmount = (d: Decimal | undefined) =>
  d !== undefined && d.isFinite() && d.isNegative();

/** Finite-number / valid-date checks over an object's fields. */
function checkFields(
  row: object,
  dates: string[],
  numbers: string[],
  report: Report,
): void {
  const r = row as Record<string, unknown>;
  for (const f of dates) {
    if (badDate(r[f] as Date | undefined)) report("INVALID_DATE", f);
  }
  for (const f of numbers) {
    if (badNumber(r[f] as Decimal | undefined)) report("NON_FINITE_NUMBER", f);
  }
}

function checkShock(
  band: ShockBand | undefined,
  field: string,
  report: Report,
): void {
  if (!band) return;
  if (badNumber(band.deltaPa)) report("NON_FINITE_NUMBER", field);
  if (!Number.isInteger(band.durationYears) || band.durationYears < 0) {
    report("SHOCK_OUT_OF_RANGE", field);
  }
}

/** The Kč fields of a holding-cost row and of the assumption cost defaults. */
const HOLDING_COST_MONEY = [
  "propertyTaxYr",
  "insuranceYr",
  "svjMonthly",
  "otherYr",
] as const;

/** D-38 shares and ADR 0075 (DR-176) non-negative costs: the bounds D-54 puts on the
 *  overrides. */
function checkDefaultRanges(d: Assumptions["defaults"], report: Report): void {
  for (const f of HOLDING_COST_MONEY) {
    if (isNegativeAmount(d[f])) report("NEGATIVE_AMOUNT", `defaults.${f}`);
  }
  if (outsideUnit(d.mgmtPctRent))
    report("RATE_OUT_OF_RANGE", "defaults.mgmtPctRent");
  if (outsideUnit(d.maintPctRent))
    report("RATE_OUT_OF_RANGE", "defaults.maintPctRent");
}

function checkAssumptions(a: Assumptions, report: Report): void {
  const rates = [
    "appreciationPa",
    "rentIndexationPa",
    "vacancyAllowance",
    "postFixationResetRatePa",
    "inflationPa",
    "acquisitionCostPct",
  ];
  checkFields(a, ["baseDate"], rates, report);
  checkFields(a.defaults, [], Object.keys(a.defaults), report);
  if (!Number.isInteger(a.horizonYears) || a.horizonYears <= 0) {
    report("HORIZON_NOT_POSITIVE", "horizonYears");
  }
  if (outsideUnit(a.vacancyAllowance))
    report("RATE_OUT_OF_RANGE", "vacancyAllowance");
  checkDefaultRanges(a.defaults, report);
  checkShock(a.inflationShock, "inflationShock", report);
  checkShock(a.rateShock, "rateShock", report);
  const vs = a.valueShock;
  if (
    vs &&
    (outsideUnit(vs.pct) || !Number.isInteger(vs.atYear) || vs.atYear < 0)
  ) {
    report("SHOCK_OUT_OF_RANGE", "valueShock");
  }
}

/** Term problems of a loan whose term comes from its instalment (NPER). */
function checkDerivedTerm(b: MortgageBlock, report: Report): void {
  const problem = derivedTermProblem(b);
  if (problem) report(problem.code, problem.field);
}

/** The final payment date (start + term), or undefined without a valid term (then
 *  MISSING_TERM_FOR_DEV_LOAN or INVALID_TERM reports instead). */
function finalPaymentDate(b: MortgageBlock): Date | undefined {
  return b.loanTermYears != null && Number.isInteger(b.loanTermYears)
    ? edate(b.startDate, b.loanTermYears * 12)
    : undefined;
}

function checkDrawDate(
  date: Date,
  b: MortgageBlock,
  end: Date | undefined,
  report: Report,
): void {
  if (badDate(date)) report("INVALID_DATE", "draws");
  // A draw on the start date itself belongs in the initial principal (D-42).
  else if (isOnOrBefore(date, b.startDate))
    report("DRAW_BEFORE_START", "draws");
  // A draw on or after the final payment has no payment left to repay it (DR-074).
  else if (end && isOnOrBefore(end, date))
    report("DRAW_AFTER_SCHEDULE_END", "draws");
}

function checkDevFeatures(b: MortgageBlock, report: Report): void {
  const end = finalPaymentDate(b);
  for (const d of b.draws ?? []) {
    checkDrawDate(d.date, b, end, report);
    if (badNumber(d.amount)) report("NON_FINITE_NUMBER", "draws");
    else if (!d.amount.greaterThan(ZERO)) report("NON_POSITIVE_DRAW", "draws");
  }
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
    if (badNumber(p.amount)) issue("NON_FINITE_NUMBER");
    else if (!p.amount.greaterThan(ZERO)) issue("NON_POSITIVE_PREPAYMENT");
    if (badNumber(p.fee)) issue("NON_FINITE_NUMBER");
    else if (p.fee?.isNegative()) issue("NEGATIVE_AMOUNT");
  });
}

/** A recast maturity must leave at least the next payment, stay within the cap and,
 *  on a development loan, fall after the completion (ADR 0116). */
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
  const beforeCompletion =
    b.completionDate != null &&
    isOnOrBefore(edate(b.startDate, last), b.completionDate);
  if (last < next || last > maxTermMonths(term) || beforeCompletion)
    issue("INVALID_RECAST_MATURITY");
}

function checkRecastInstalment(
  b: MortgageBlock,
  r: LoanRecast,
  issue: (code: ValidationCode) => void,
): void {
  if (r.instalment === undefined) return;
  if (badNumber(r.instalment)) issue("NON_FINITE_NUMBER");
  else if (!r.instalment.greaterThan(ZERO)) issue("INVALID_RECAST");
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
      : edate(b.startDate, eventTermMonths(withValidRecasts(b), term));
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

function checkMortgage(b: MortgageBlock, report: Report): void {
  checkFields(
    b,
    ["startDate", "completionDate", "contractMaturityDate"],
    ["initialPrincipal", "interestRatePa", "monthlyInstalment"],
    report,
  );
  if (b.initialPrincipal.isNegative())
    report("NEGATIVE_PRINCIPAL", "initialPrincipal");
  if (b.monthlyInstalment.isNegative())
    report("NEGATIVE_AMOUNT", "monthlyInstalment");
  if (outsideUnit(b.interestRatePa))
    report("RATE_OUT_OF_RANGE", "interestRatePa");
  if (!Number.isInteger(b.fixationYears) || b.fixationYears < 0)
    report("INVALID_TERM", "fixationYears");
  if (b.loanTermYears != null && !(b.loanTermYears > 0))
    report("INVALID_TERM", "loanTermYears");
  checkDevFeatures(b, report);
  if (b.initialPrincipal.isFinite() && b.interestRatePa.isFinite())
    checkDerivedTerm(b, report);
  checkLoanEvents(b, report);
}

/** Corrupt-data codes the engine raises on at every entry point (D-37). */
const DATA_ERROR_CODES: ReadonlySet<ValidationCode> = new Set([
  "INVALID_DATE",
  "NON_FINITE_NUMBER",
  "NEGATIVE_AMOUNT",
  "ORPHAN_ROW",
  "END_BEFORE_START",
  "DUPLICATE_HOLDING_COST",
]);

/** Range codes the engine raises on at every entry point (D-38). */
const RANGE_ERROR_CODES: ReadonlySet<ValidationCode> = new Set([
  "HORIZON_NOT_POSITIVE",
  "RATE_OUT_OF_RANGE",
  "SHOCK_OUT_OF_RANGE",
]);

/** The codes `assertInputs` and `assertAssumptions` raise on. */
const ENTRY_ERROR_CODES: ReadonlySet<ValidationCode> = new Set([
  ...DATA_ERROR_CODES,
  ...RANGE_ERROR_CODES,
]);

/** The invalid-loan codes the engine raises on (D-17, D-36). */
const LOAN_ERROR_CODES: ReadonlySet<ValidationCode> = new Set([
  "INSTALMENT_BELOW_INTEREST",
  "ZERO_RATE_ZERO_INSTALMENT",
  "MISSING_TERM_FOR_DEV_LOAN",
  "NEGATIVE_PRINCIPAL",
  "NON_POSITIVE_DRAW",
  "DRAW_BEFORE_START",
  "DRAW_AFTER_SCHEDULE_END",
  "COMPLETION_BEFORE_START",
  "INVALID_TERM",
  "RATE_OUT_OF_RANGE",
  "NON_POSITIVE_PREPAYMENT",
  "EVENT_BEFORE_START",
  "EVENT_AFTER_SCHEDULE_END",
  "INVALID_RECAST",
  "INVALID_RECAST_MATURITY",
  "RECAST_INSTALMENT_BEFORE_COMPLETION",
]);

/**
 * Raise an EngineInputError when a loan the engine is about to compute has a D-17
 * problem, instead of letting it become a NaN term, an endless schedule or vanished
 * debt (DR-014, DR-018, DR-043). Every D-17 problem of the block is listed.
 */
export function assertLoanInputs(block: MortgageBlock): void {
  const errors: EngineValidationError[] = [];
  checkMortgage(block, (code, field) => {
    if (LOAN_ERROR_CODES.has(code)) {
      errors.push({ code, entity: "mortgage", id: block.id, field });
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
    checkMortgage(b, (code, field) => {
      if (DATA_ERROR_CODES.has(code)) {
        errors.push({ code, entity: "mortgage", id: b.id, field });
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
  if (badNumber(amount)) report("NON_FINITE_NUMBER", fields[2]);
  else if (amount.isNegative()) report("NEGATIVE_AMOUNT", fields[2]);
}

type ReporterFor = (
  entity: ValidationEntity,
  id: string,
  propertyId?: string,
) => Report;

const HOLDING_COST_FIELDS = [
  "propertyTaxYr",
  "insuranceYr",
  "mgmtPctRent",
  "maintPctRent",
  "svjMonthly",
  "otherYr",
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
    if (x.purchasePrice.isNegative())
      report("NEGATIVE_AMOUNT", "purchasePrice");
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

/** Raise DUPLICATE_BLOCK_START for overlapping blocks of one property (D-27, D-43). */
export function assertBlockStarts(blocks: MortgageBlock[]): void {
  const errors: EngineValidationError[] = [...duplicateStarts(blocks)].map(
    (b) => ({
      code: "DUPLICATE_BLOCK_START",
      entity: "mortgage",
      id: b.id,
      field: "startDate",
    }),
  );
  if (errors.length > 0) throw new EngineInputError(errors);
}

/** ASOF_BEFORE_BASEDATE when `asOf` precedes the projection window start (D-19). */
function asOfProblem(
  asOf: Date,
  baseDate: Date,
): EngineValidationError | undefined {
  return isAfter(baseDate, asOf)
    ? { code: "ASOF_BEFORE_BASEDATE", entity: "assumptions", field: "asOf" }
    : undefined;
}

/** Raise ASOF_BEFORE_BASEDATE for an as-of date before baseDate (D-19, DR-015). */
export function assertAsOf(asOf: Date, baseDate: Date): void {
  const problem = asOfProblem(asOf, baseDate);
  if (problem) throw new EngineInputError([problem]);
}

function checkMortgages(p: Portfolio, on: ReporterFor): void {
  const dupes = duplicateStarts(p.mortgages);
  for (const b of p.mortgages) {
    const report = on("mortgage", b.id, b.propertyId);
    checkMortgage(b, report);
    if (dupes.has(b)) report("DUPLICATE_BLOCK_START", "startDate");
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
    // D-54 (DR-127): the same bounds D-38 puts on the assumption defaults.
    for (const f of HOLDING_COST_MONEY) {
      if (isNegativeAmount(h[f])) report("NEGATIVE_AMOUNT", f);
    }
    if (outsideUnit(h.mgmtPctRent)) report("RATE_OUT_OF_RANGE", "mgmtPctRent");
    if (outsideUnit(h.maintPctRent))
      report("RATE_OUT_OF_RANGE", "maintPctRent");
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
    const report: Report = (code, field, index) =>
      add({
        code,
        entity,
        id,
        field,
        ...(index === undefined ? {} : { index }),
      });
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
  checkAssumptions(assumptions, (code, field) =>
    add({ code, entity: "assumptions", field }),
  );
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
  checkAssumptions(assumptions, (code, field) =>
    errors.push({ code, entity: "assumptions", field }),
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

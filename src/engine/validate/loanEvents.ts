// A block's prepayments and recasts (ADR 0109, ADR 0116).
import {
  derivedTermProblem,
  dueDate,
  eventTermMonths,
  maxTermMonths,
  paymentOnOrAfter,
  paymentsDueBy,
  termMonths,
} from "../loanTerm";
import { isOnOrBefore } from "../dates";
import type { LoanRecast, MortgageBlock } from "../types";
import type { FieldOf, ValidationCode } from "./codes";
import {
  badDate,
  checkAmount,
  isNegativeAmount,
  notPositive,
  type Report,
} from "./check";

/** A block's reporter: a problem on a mortgage field. */
type LoanReport = Report<FieldOf<"mortgage">>;

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
 *  can reach (ADR 0109). Without a valid start only the date itself is checked: the
 *  block reports its start (ADR 0247). */
function checkEventDate(
  date: Date,
  b: MortgageBlock,
  end: Date | undefined,
  report: (code: ValidationCode) => void,
): boolean {
  if (badDate(date)) report("INVALID_DATE");
  else if (badDate(b.startDate)) return true;
  else if (isOnOrBefore(date, b.startDate)) report("EVENT_BEFORE_START");
  else if (end && isOnOrBefore(end, date)) report("EVENT_AFTER_SCHEDULE_END");
  else return true;
  return false;
}

function checkPrepayments(
  b: MortgageBlock,
  end: Date | undefined,
  report: LoanReport,
): void {
  (b.prepayments ?? []).forEach((p, i) => {
    const issue = (code: ValidationCode) => report(code, "prepayments", i);
    checkEventDate(p.date, b, end, issue);
    checkAmount(p.amount, notPositive, "NON_POSITIVE_PREPAYMENT", issue);
    checkAmount(p.fee, isNegativeAmount, "NEGATIVE_AMOUNT", issue);
  });
}

/** A recast maturity must leave at least the next payment, stay within the cap and,
 *  on a development loan, fall after the completion's payment (ADR 0116). Counting the
 *  payments needs a valid start: without one only the maturity date is checked
 *  (ADR 0247, #543). */
function checkRecastMaturity(
  b: MortgageBlock,
  r: LoanRecast,
  term: number | undefined,
  issue: (code: ValidationCode) => void,
): void {
  if (r.maturity === undefined || term === undefined) return;
  if (badDate(r.maturity)) return issue("INVALID_DATE");
  if (badDate(b.startDate)) return;
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
  report: LoanReport,
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
export function checkLoanEvents(b: MortgageBlock, report: LoanReport): void {
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

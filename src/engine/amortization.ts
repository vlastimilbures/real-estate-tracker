// Loan facts (SPEC §4.4): fixation-aware rate, term, closed-form balance and health,
// block selection. The month-by-month schedules live in ./schedule.
import { FV, PMT, NPER, ZERO, ceilCzk, type Decimal } from "../lib/money";
import {
  addDays,
  edate,
  firstGridMonthOnOrAfter,
  lastGridMonthOnOrBefore,
  isAfter,
  isOnOrBefore,
  inForceOrUpcoming,
} from "./dates";
import type {
  Assumptions,
  DevelopmentLoan,
  IsoDate,
  MortgageBlock,
  MortgageBlockFields,
  Property,
} from "./types";
import type { ValidationCode } from "./validate";
import { EngineInputError } from "./errors";
import { FULLY_AMORTIZES_TOLERANCE, MAX_LOAN_TERM_MONTHS } from "./constants";

/** A block starting up to this many days after the purchase funded it (ADR 0119 §3). */
const ACQUISITION_LOAN_WINDOW_DAYS = 90;

/** ADR 0119 §3: the property's earliest block funded the purchase when it starts no later
 *  than 90 days after it; any earlier start counts too (an off-plan loan drawn before
 *  handover). A development loan funds it whatever its start: the bank pays the developer,
 *  never the owner (ADR 0168). */
export function fundedThePurchase(
  property: Property,
  block: MortgageBlock,
): boolean {
  if (isDevLoan(block)) return true;
  const latest = addDays(property.purchaseDate, ACQUISITION_LOAN_WINDOW_DAYS);
  return isOnOrBefore(block.startDate, latest);
}

/** End of the fixation period: startDate + fixationYears*12 months (EDATE). */
export function blockEndDate(block: MortgageBlock): Date {
  return edate(block.startDate, block.fixationYears * 12);
}

/**
 * The last date the entered rate applies: the fixation end, or for a 0-year (floating)
 * block the later of its start and baseDate. A floating block's entered rate is the
 * rate it paid so far; after baseDate it floats at the reset rate (ADR 0162).
 */
export function rateFixedUntil(block: MortgageBlock, baseDate: Date): Date {
  if (block.fixationYears > 0) return blockEndDate(block);
  return isAfter(block.startDate, baseDate) ? block.startDate : baseDate;
}

/**
 * True when the block's fixation ended on or before `baseDate`: every payment from
 * baseDate on is at the assumed reset rate, so the owner should enter the refix terms
 * as a new block (D-30). A floating (0-year) block has no fixation to end (ADR 0162).
 * The engine reports it; the wording is UI (P7).
 */
export function fixationExpired(block: MortgageBlock, baseDate: Date): boolean {
  return block.fixationYears > 0 && isOnOrBefore(blockEndDate(block), baseDate);
}

/**
 * The interest rate in force for a block at `date`, fixation- and shock-aware.
 * Schedules pass the payment's due date EDATE(start, k), so the payment due on the
 * fixation end is still at the fixed rate (D-21):
 *   • on/before `rateFixedUntil` → the block's own entered rate;
 *   • after it → `postFixationResetRatePa`.
 * For a floating block `rateFixedUntil` is baseDate (or its later start), so the
 * payments due by baseDate are at its entered rate (ADR 0162).
 * A scenario `rateShock` elevates the post-fixation rate by `deltaPa` for the first
 * `durationYears` after that date (a temporary spike at refix), then it reverts to
 * `postFixationResetRatePa`. Only payments due after baseDate are shocked: a what-if
 * never reprices history or the opening balance (DR-117). With no `rateShock` this is exactly the legacy 2-state
 * rate, so the amortization targets are unchanged. The schedule re-amortizes the
 * instalment on every change this returns.
 */
export function rateAt(
  date: Date,
  block: MortgageBlock,
  assumptions: Assumptions,
): Decimal {
  const endDate = rateFixedUntil(block, assumptions.baseDate);
  if (isOnOrBefore(date, endDate)) return block.interestRatePa;
  const { postFixationResetRatePa, rateShock, baseDate } = assumptions;
  if (
    rateShock &&
    isAfter(date, baseDate) &&
    isOnOrBefore(date, edate(endDate, rateShock.durationYears * 12))
  ) {
    return postFixationResetRatePa.plus(rateShock.deltaPa);
  }
  return postFixationResetRatePa;
}

/**
 * Why a loan's term cannot come from its instalment (NPER), or undefined when it can
 * (or when an explicit `loanTermYears` makes NPER irrelevant): a development loan
 * needs an explicit term; at 0 % the instalment must be positive; otherwise it must
 * exceed the first month's interest (DR-014). Expects finite principal and rate.
 */
export function derivedTermProblem(
  block: MortgageBlock,
): { code: ValidationCode; field: string } | undefined {
  if (block.loanTermYears != null) return undefined;
  if (isDevLoan(block)) {
    return { code: "MISSING_TERM_FOR_DEV_LOAN", field: "loanTermYears" };
  }
  const field = "monthlyInstalment";
  if (block.interestRatePa.isZero()) {
    return block.monthlyInstalment.greaterThan(ZERO)
      ? undefined
      : { code: "ZERO_RATE_ZERO_INSTALMENT", field };
  }
  const firstInterest = block.initialPrincipal.times(
    block.interestRatePa.div(12),
  );
  return block.monthlyInstalment.lessThanOrEqualTo(firstInterest)
    ? { code: "INSTALMENT_BELOW_INTEREST", field }
    : undefined;
}

/**
 * Total amortization term in months. When the block carries an explicit
 * `loanTermYears` that is authoritative (loanTermYears*12); otherwise the term is
 * derived from the instalment via NPER (legacy behaviour — preserves the parity
 * targets). Drives the constant-maturity remaining term at refix and the schedule
 * length for a future-drawn loan.
 */
export function termMonths(block: MortgageBlock): number {
  if (block.loanTermYears != null) return block.loanTermYears * 12;
  // A dev loan without a term, a 0 % loan with no instalment, or an instalment that
  // never covers the interest has no NPER term (NaN or Infinity): raise a typed error
  // rather than emit an empty or endless schedule (D-17).
  const problem = derivedTermProblem(block);
  if (problem) {
    throw new EngineInputError([
      { ...problem, entity: "mortgage", id: block.id },
    ]);
  }
  return nperMonths(
    block.interestRatePa.div(12),
    block.monthlyInstalment,
    block.initialPrincipal,
  );
}

/** Payment number of the first payment due on or after `date`: the payment a
 *  prepayment or recast dated `date` follows (ADR 0109). */
export function paymentOnOrAfter(block: MortgageBlock, date: Date): number {
  return firstGridMonthOnOrAfter(block.startDate, date);
}

/** Payment number of the last payment due on or before `date` (DR-070): a recast
 *  maturity as the loan's last payment (ADR 0109). */
export function paymentsDueBy(block: MortgageBlock, date: Date): number {
  return lastGridMonthOnOrBefore(block.startDate, date);
}

/** The latest last payment a recast may set: loan start + 50 years, or the contract
 *  term when that is longer (ADR 0109). */
export function maxTermMonths(contractTerm: number): number {
  return Math.max(MAX_LOAN_TERM_MONTHS, contractTerm);
}

/** The latest payment the loan can reach with its recasts (ADR 0109): the contract
 *  term, a later recast maturity, or the cap when a recast sets an instalment. */
export function eventTermMonths(
  block: MortgageBlock,
  contractTerm: number,
): number {
  let term = contractTerm;
  for (const r of block.recasts ?? []) {
    const reach =
      r.maturity === undefined
        ? maxTermMonths(contractTerm)
        : paymentsDueBy(block, r.maturity);
    term = Math.max(term, reach);
  }
  return term;
}

/** Whole monthly payments of `instalment` that repay `balance` at `rateMonthly`
 *  (NPER rounded up; the last payment may be smaller). NaN or Infinity when the
 *  instalment never repays the balance. */
export function nperMonths(
  rateMonthly: Decimal,
  instalment: Decimal,
  balance: Decimal,
): number {
  const n = NPER(rateMonthly, instalment.negated(), balance);
  // eslint-disable-next-line no-restricted-syntax -- an NPER month count, not money
  return Math.ceil(n.toNumber());
}

/**
 * The baseDate-anchored grid month a future loan draws in: the first month whose
 * grid date is on/after `startDate` (matching where `buildSchedule` opens the
 * balance). 0 for a loan already running at baseDate.
 */
export function drawMonth(block: MortgageBlock, baseDate: Date): number {
  if (!isAfter(block.startDate, baseDate)) return 0;
  return firstGridMonthOnOrAfter(baseDate, block.startDate);
}

/**
 * Number of monthly rows to generate: at least the horizon, but long enough that
 * the loan amortizes over its full term. The draw month carries no payment, so a
 * future loan needs `drawMonth + term` rows; a loan already running needs
 * `term − paymentsDueByBaseDate` rows from baseDate.
 */
export function scheduleMonths(
  block: MortgageBlock,
  assumptions: Assumptions,
): number {
  const { baseDate, horizonYears } = assumptions;
  const term = termMonths(block);
  const d = drawMonth(block, baseDate);
  const payoffMonth =
    d > 0
      ? d + term
      : Math.max(0, term - lastGridMonthOnOrBefore(block.startDate, baseDate));
  return Math.max(horizonYears * 12, payoffMonth);
}

/** Annuity instalment that amortizes `principal` over `termYears` at `ratePa`. */
export function instalmentFor(
  principal: Decimal,
  ratePa: Decimal,
  termYears: number,
): Decimal {
  return PMT(ratePa.div(12), termYears * 12, principal.negated());
}

/**
 * Whole-CZK instalment to suggest for a new loan: the annuity rounded UP, so paying it
 * always retires the loan within the term (a nearest-rounded figure can fall short).
 */
export function suggestedInstalment(
  principal: Decimal,
  ratePa: Decimal,
  termYears: number,
): Decimal {
  return ceilCzk(instalmentFor(principal, ratePa, termYears));
}

/**
 * Instalment a schedule opens with: the entered one for a plain loan, or, for a
 * development loan, the annuity of its principal over the required term at the block
 * rate (D-31) — the entered field is not used for development loans.
 */
export function scheduledInstalment(block: MortgageBlock): Decimal {
  return isDevLoan(block)
    ? instalmentFor(
        block.initialPrincipal,
        block.interestRatePa,
        block.loanTermYears,
      )
    : block.monthlyInstalment;
}

export interface AmortizationHealth {
  /** Instalment that exactly amortizes the principal over the term at the block rate. */
  suggestedInstalment: Decimal;
  /** False when the entered instalment will not retire the loan by its term. */
  fullyAmortizes: boolean;
  /** Residual balance at term end at the entered instalment (≈0 when healthy). */
  shortfall: Decimal;
}

/**
 * Closed-form check (independent of the schedule, which re-amortizes at refix and
 * masks a bad instalment): does the entered instalment retire the loan by its term?
 * Uses the block's *original* rate over the full term. A loan whose term is derived
 * from the instalment (no explicit `loanTermYears`) amortizes by construction.
 */
export function amortizationHealth(block: MortgageBlock): AmortizationHealth {
  const rateMonthly = block.interestRatePa.div(12);
  const term = termMonths(block);
  const suggestedInstalment = PMT(
    rateMonthly,
    term,
    block.initialPrincipal.negated(),
  );
  // Residual balance after `term` payments of the entered instalment.
  const shortfall = FV(
    rateMonthly,
    term,
    block.monthlyInstalment.negated(),
    block.initialPrincipal,
  ).negated();
  const firstInterest = block.initialPrincipal.times(rateMonthly);
  const fullyAmortizes =
    block.monthlyInstalment.greaterThan(firstInterest) &&
    shortfall.lessThanOrEqualTo(FULLY_AMORTIZES_TOLERANCE);
  return { suggestedInstalment, fullyAmortizes, shortfall };
}

/**
 * Outstanding balance of a block as of `asOf` after every payment due by then
 * (D-21), using the *original* rate & instalment, so it holds only before any refix
 * (the schedule's plain-loan opening uses it at baseDate). Floored at 0.
 */
export function currentBalance(block: MortgageBlock, asOf: Date): Decimal {
  const n = lastGridMonthOnOrBefore(block.startDate, asOf);
  if (n <= 0) return block.initialPrincipal;
  const bal = FV(
    block.interestRatePa.div(12),
    n,
    block.monthlyInstalment.negated(),
    block.initialPrincipal,
  ).negated();
  return bal.isNegative() ? ZERO : bal;
}

/**
 * True when the block uses development-loan features — gradual tranche draws or an
 * interest-only-until-completion period. Plain single-draw loans return false and
 * take `buildSchedule`'s legacy path verbatim (the parity gate).
 */
export function isDevLoan(block: MortgageBlock): block is DevelopmentLoan {
  return (block.draws?.length ?? 0) > 0 || block.completionDate != null;
}

/**
 * Type stored or entered loan fields as a `MortgageBlock`, returning the same object.
 * Not value-checked: a development loan without a term can exist in the DB, and
 * `validateInputs` / `termMonths` reject it (DR-051, D-17). The one sanctioned
 * `as MortgageBlock` (ADR 0074).
 */
export function mortgageBlock(fields: MortgageBlockFields): MortgageBlock {
  // eslint-disable-next-line no-restricted-syntax -- the sanctioned MortgageBlock constructor
  return fields as MortgageBlock;
}

/**
 * The maturity the loan's own terms imply (D-29): the due date of its last payment,
 * `termMonths` after the start (D-08). Null for a development loan, whose term is
 * explicit. Unchanged by a refix (constant maturity).
 */
export function impliedMaturity(block: MortgageBlock): IsoDate | null {
  return isDevLoan(block) ? null : edate(block.startDate, termMonths(block));
}

/**
 * The implied and contract maturities when they differ by more than one month (D-29),
 * else null. One month absorbs NPER rounding (P02 §5). The warning itself is UI (P7).
 */
export function maturityMismatch(
  block: MortgageBlock,
): { implied: IsoDate; contract: IsoDate } | null {
  const contract = block.contractMaturityDate;
  const implied = impliedMaturity(block);
  if (!contract || !implied) return null;
  const outside =
    isAfter(edate(implied, -1), contract) ||
    isAfter(contract, edate(implied, 1));
  return outside ? { implied, contract } : null;
}

/**
 * The block that drives a property's schedule (and its initial principal): the block
 * active at `baseDate`, or — if none yet (a future loan) — the earliest upcoming block,
 * so the property still gets a future-drawn schedule. `blocks` must already be the
 * single property's blocks.
 */
export function selectBlock(
  blocks: MortgageBlock[],
  baseDate: Date,
): MortgageBlock | undefined {
  // No end accessor: a block stays active until a later one starts. With none active,
  // every block starts after baseDate, so "nearest upcoming" is the earliest block.
  return inForceOrUpcoming(blocks, baseDate, (b) => b.startDate);
}

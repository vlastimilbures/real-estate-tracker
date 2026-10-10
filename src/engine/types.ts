// Engine domain & output types. Pure data — no React/Tauri/DB imports.
// Money is Decimal (CLAUDE.md §5). Input amounts are branded `Money`, input rates
// `Rate` and input dates `IsoDate` (UTC-midnight calendar days), see ./dates and
// ./brands (D-25, ADR 0074). Outputs are plain Decimal.
// The engine never reads the system clock: every time-dependent function takes
// `baseDate` (or an `asOf`) explicitly.
import type { Decimal } from "../lib/money";
import type { IsoDate, Money, Rate } from "./brands";

export type { IsoDate, Money, Rate } from "./brands";

// ---------------------------------------------------------------------------
// Inputs (SPEC §4.1)
// ---------------------------------------------------------------------------

export interface CostDefaults {
  propertyTaxYr: Money;
  insuranceYr: Money;
  mgmtPctRent: Rate;
  maintPctRent: Rate;
  svjMonthly: Money;
  otherYr: Money;
}

/** A temporary deviation from trend: `+deltaPa` for `durationYears`, then revert. */
export interface ShockBand {
  deltaPa: Rate;
  durationYears: number;
}

/** A permanent one-off value correction landing at projection year `atYear`. */
export interface ValueShock {
  pct: Rate; // 0..1 fraction knocked off market value
  atYear: number; // projection year (0 = today); growth resumes from the lower base
}

export interface Assumptions {
  baseDate: IsoDate;
  appreciationPa: Rate;
  rentIndexationPa: Rate;
  vacancyAllowance: Rate;
  postFixationResetRatePa: Rate;
  horizonYears: number;
  inflationPa: Rate;
  /** Transaction costs of acquiring a property, as a fraction of its purchase price in
   *  [0, 1] (broker, legal and cadastre fees; the Czech acquisition tax ended in 2020).
   *  The fallback for a property bought *after* baseDate whose funding record has no
   *  transaction costs (ADR 0119 §6). Optional; undefined ⇒ 0 ⇒ engine output is
   *  byte-identical to the parity targets. Engine-only (no DB/UI wiring). */
  acquisitionCostPct?: Rate | undefined;
  defaults: CostDefaults;
  // --- Scenario-only shock descriptors (SPEC §7 what-ifs). Portfolio/seed
  // Assumptions NEVER set these; they are populated solely by `applyScenario`.
  // All undefined ⇒ engine output is byte-identical to the parity targets. ---
  /** Inflation elevated by `deltaPa` for the first `durationYears`, then reverts to
   *  `inflationPa`. Affects holding-cost growth, the real-terms deflator, and real IRR. */
  inflationShock?: ShockBand | undefined;
  /** At each mortgage's fixation end (a floating block's: baseDate or its later start,
   *  ADR 0162) the reset rate is `postFixationResetRatePa + deltaPa` for
   *  `durationYears`, then reverts to `postFixationResetRatePa`. */
  rateShock?: ShockBand | undefined;
  /** A permanent value haircut applied from year `atYear` onward. */
  valueShock?: ValueShock | undefined;
}

export interface Property {
  id: string;
  name: string;
  type?: string | undefined;
  sizeM2?: number | undefined;
  purchaseDate: IsoDate;
  purchasePrice: Money;
  appreciationOverridePa?: Rate | undefined;
  rentIndexOverridePa?: Rate | undefined;
  active?: boolean | undefined; // false ⇒ excluded from portfolio aggregates & projections; default active
  /** How the purchase was funded, as the owner recorded it (ADR 0119). Undefined ⇒
   *  nothing recorded. */
  funding?: AcquisitionFunding | undefined;
}

/** The owner's record of a purchase's funding (ADR 0119). Each part is optional on its
 *  own: undefined is unknown, never 0. The acquisition loan is derived from the mortgage
 *  blocks, not recorded here. */
export interface AcquisitionFunding {
  /** All own money paid in at acquisition: the owner's share of the price, the
   *  transaction costs and the initial works together. */
  ownCash?: Money | undefined;
  /** Broker, legal, cadastre, valuation and similar fees. */
  transactionCosts?: Money | undefined;
  /** Renovation or furnishing paid at or right after the purchase. */
  initialWorks?: Money | undefined;
  note?: string | undefined;
}

/** A construction tranche: additional principal drawn down at a future milestone. */
export interface MortgageDraw {
  date: IsoDate;
  amount: Money; // additional principal drawn this month (> 0)
}

/** What the bank does after a prepayment (ADR 0109): keep the maturity and lower the
 *  instalment, or keep the instalment and shorten the term. */
export type PrepaymentEffect = "lowerInstalment" | "shortenTerm";

/** A one-off extra principal payment (ADR 0109), applied after the first payment due
 *  on or after `date`. */
export interface MortgagePrepayment {
  date: IsoDate;
  amount: Money; // principal repaid (> 0)
  effect: PrepaymentEffect;
  /** Fee paid with it, as entered (no automatic legal fee). */
  fee?: Money | undefined;
}

/** A change of the loan's maturity (ADR 0109) from the first payment after the first
 *  payment due on or after `date`: to a new maturity date, or to a new instalment
 *  (the maturity then follows from NPER). Exactly one of the two. */
export type LoanRecast =
  | { date: IsoDate; maturity: IsoDate; instalment?: undefined }
  | { date: IsoDate; instalment: Money; maturity?: undefined };

/** Fields every mortgage block has. */
interface LoanBase {
  id: string;
  propertyId: string;
  startDate: IsoDate;
  initialPrincipal: Money;
  fixationYears: number;
  interestRatePa: Rate;
  monthlyInstalment: Money;
  /** Contract maturity date, when entered (D-29). Informational: the term stays
   *  derived from the instalment (D-08); see `maturityMismatch`. */
  contractMaturityDate?: IsoDate | undefined;
  /** One-off prepayments, sorted by date (ADR 0109). They never make a plain loan a
   *  development loan. */
  prepayments?: MortgagePrepayment[] | undefined;
  /** Maturity changes, sorted by date (ADR 0109). */
  recasts?: LoanRecast[] | undefined;
}

/**
 * A plain single-draw annuity loan: no tranches, no interest-only period, so
 * `buildSchedule` reproduces the legacy schedule byte-for-byte (the parity gate).
 */
export interface PlainLoan extends LoanBase {
  /** Explicit term in years; when unset the term is derived from the instalment
   *  via NPER (legacy behaviour — preserves the parity targets). */
  loanTermYears?: number | undefined;
  draws?: undefined;
  completionDate?: undefined;
}

/**
 * A development loan (gradual utilization): tranche draws and/or interest-only until
 * completion. Not a clean annuity, so the term cannot come from NPER and
 * `loanTermYears` is required (DR-051). The schedule derives the instalment from that
 * term (D-31, `scheduledInstalment`); the entered `monthlyInstalment` is not used.
 * `isDevLoan` is the runtime test; a block with an empty `draws` array and no
 * `completionDate` still runs as a plain loan.
 */
export interface DevelopmentLoan extends LoanBase {
  loanTermYears: number;
  /** Additional principal tranches drawn after the initial draw, sorted by date.
   *  When a tranche lands (outside interest-only) the instalment re-amortizes. */
  draws?: MortgageDraw[] | undefined;
  /** Construction-completion date. While set, the borrower pays interest only
   *  (no principal) up to and including this date; the first month after it the
   *  loan re-amortizes the fully-drawn balance over the term remaining to
   *  startDate+term. Presence ⇒ interest-only-until-completion is on. */
  completionDate?: IsoDate | undefined;
}

export type MortgageBlock = PlainLoan | DevelopmentLoan;

/** A mortgage block's fields before the plain / development split is known (stored
 *  rows, form values); `mortgageBlock` turns them into a `MortgageBlock`. */
export interface MortgageBlockFields extends LoanBase {
  loanTermYears?: number | undefined;
  draws?: MortgageDraw[] | undefined;
  completionDate?: IsoDate | undefined;
}

export interface Valuation {
  id: string;
  propertyId: string;
  validFrom: IsoDate;
  validTo?: IsoDate | undefined;
  marketValue: Money;
}

export interface Lease {
  id: string;
  propertyId: string;
  startDate: IsoDate;
  endDate?: IsoDate | undefined;
  monthlyRent: Money;
}

/** Holding-cost overrides; any blank field falls back to Assumptions.defaults. */
export interface HoldingCost {
  id: string;
  propertyId: string;
  propertyTaxYr?: Money | undefined;
  insuranceYr?: Money | undefined;
  mgmtPctRent?: Rate | undefined;
  maintPctRent?: Rate | undefined;
  svjMonthly?: Money | undefined;
  otherYr?: Money | undefined;
}

/** The full portfolio handed to the engine. 1..N properties, no fixed slots. */
export interface Portfolio {
  properties: Property[];
  mortgages: MortgageBlock[];
  valuations: Valuation[];
  leases: Lease[];
  holdingCosts: HoldingCost[];
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface PropertySnapshot {
  propertyId: string;
  name: string;
  owned: boolean; // false if purchaseDate is after baseDate (not yet acquired)
  active: boolean; // false ⇒ deactivated: listed but excluded from portfolio totals
  value: Decimal;
  debt: Decimal;
  // ADR 0166: debt + the development tranches not drawn yet; equity and LTV use it.
  // Equals `debt` except while a development loan is still drawing.
  committedDebt: Decimal;
  // ADR 0169: committedDebt − debt, the development tranches not drawn yet.
  undrawnDebt: Decimal;
  // ADR 0169: the value shown beside the drawn debt: value − undrawnDebt, so
  // reportedValue − debt = equity. Equals `value` once every tranche is drawn.
  reportedValue: Decimal;
  equity: Decimal;
  ltv: Decimal | null; // null when debt is owed on no value (ADR 0133)
  grossAnnualRent: Decimal;
  effectiveGrossIncome: Decimal;
  holdingCosts: Decimal;
  noi: Decimal;
  annualDebtService: Decimal;
  netCashFlow: Decimal;
  grossYield: Decimal | null; // null when there is no value (ADR 0133)
  netYield: Decimal | null;
  dscr: Decimal | null; // null when debt service is 0
  weightedRateNumerator: Decimal; // balance*rate, for portfolio weighting
}

export interface PortfolioSnapshot {
  asOf: IsoDate; // the date this snapshot was evaluated at (defaults to baseDate)
  perProperty: PropertySnapshot[];
  totalValue: Decimal;
  totalDebt: Decimal;
  totalCommittedDebt: Decimal; // ADR 0166: Σ committedDebt; totalEquity and ltv use it
  totalUndrawnDebt: Decimal; // ADR 0169: totalCommittedDebt − totalDebt
  totalReportedValue: Decimal; // ADR 0169: totalValue − totalUndrawnDebt
  totalEquity: Decimal;
  ltv: Decimal | null; // null when debt is owed on no value (ADR 0133)
  grossAnnualRent: Decimal;
  effectiveGrossIncome: Decimal;
  holdingCosts: Decimal;
  noi: Decimal;
  annualDebtService: Decimal;
  netCashFlow: Decimal;
  grossYield: Decimal | null; // null when there is no value (ADR 0133)
  netYield: Decimal | null;
  dscr: Decimal | null;
  weightedAvgRate: Decimal;
}

export interface AmortizationRow {
  month: number; // 1-based, from baseDate
  /** Grid date EDATE(baseDate, month): the projection buckets the row by it (D-21). */
  date: IsoDate;
  /** Due date of the payment this row carries, on the paying block's own cadence
   *  EDATE(startDate, p) (ADR 0164). Null when no payment is due: an undrawn month,
   *  the draw row, a repaid loan, or a handover row the successor's draw replaces. */
  dueDate: IsoDate | null;
  ratePa: Decimal;
  instalment: Decimal;
  interest: Decimal;
  principal: Decimal;
  /** New debt drawn in this grid month, dated after baseDate (DR-092): a loan's draw
   *  or a tranche, not a refinance (ADR 0130). Debt dated on/before baseDate is
   *  opening debt. So endBalance = previous endBalance − principal − prepaid +
   *  drawn + refinanced, from the baseDate debt (`openingDebt`). */
  drawn: Decimal;
  /** A refinance handover's difference: the successor's draw less the predecessor
   *  balance it pays off (ADR 0130). Zero in every other month. */
  refinanced: Decimal;
  /** Extra principal repaid after this month's payment (ADR 0109). */
  prepaid: Decimal;
  /** Fee paid with that prepayment (cash, not principal). */
  prepaymentFee: Decimal;
  endBalance: Decimal;
}

/** Why a prepayment or recast did less than asked (ADR 0109). Reported, never
 *  raised: the balance it meets depends on the assumptions and the scenario. */
export type LoanEventIssue =
  | "PREPAYMENT_EXCEEDS_BALANCE"
  | "PREPAYMENT_AFTER_PAYOFF"
  | "PREPAYMENT_REPLACED"
  | "RECAST_AFTER_PAYOFF"
  | "RECAST_REPLACED"
  | "RECAST_INSTALMENT_BELOW_INTEREST"
  | "RECAST_TERM_CAPPED";

/** What one prepayment or recast did in the schedule (ADR 0109). */
export interface LoanEventOutcome {
  blockId: string;
  kind: "prepayment" | "recast";
  date: IsoDate;
  /** Grid month it applied after (≤ 0: replayed before baseDate); null when a
   *  successor block replaced the loan first. */
  month: number | null;
  /** A prepayment's amount asked for, the principal it repaid and the fee charged
   *  (zero after payoff); zero for a recast. */
  requested: Decimal;
  applied: Decimal;
  fee: Decimal;
  issue: LoanEventIssue | null;
}

/** A successor block paying off its predecessor on the baseDate grid (D-27, D-47). */
export interface Refinance {
  /** Grid month the successor draws in. */
  month: number;
  /** Predecessor balance the successor pays off. */
  paidOff: Decimal;
  /** Successor balance drawn in that month. */
  drawn: Decimal;
}

export interface ProjectionYear {
  year: number; // 0..horizon
  calendarYear: number;
  // D-22: the year's grid months are the dates (periodStart, periodEnd]; year 0 is the
  // baseDate point (periodStart = periodEnd = baseDate).
  periodStart: IsoDate;
  periodEnd: IsoDate;
  // stocks
  value: Decimal;
  balance: Decimal;
  // ADR 0166: balance + the development tranches not drawn yet (interest and
  // payments stay on `balance`); equity = value − committedDebt, LTV uses it too.
  committedDebt: Decimal;
  // ADR 0169: committedDebt − balance, the development tranches not drawn yet.
  undrawnDebt: Decimal;
  // ADR 0169: the value shown beside the drawn balance: value − undrawnDebt, so
  // reportedValue − balance = equity.
  reportedValue: Decimal;
  equity: Decimal;
  ltv: Decimal | null; // null when debt is owed on no value (ADR 0133)
  // flows (blank/zero in year 0)
  grossRent: Decimal;
  effectiveRent: Decimal;
  holdingCosts: Decimal;
  noi: Decimal;
  interest: Decimal;
  principal: Decimal;
  debtService: Decimal;
  netCashFlow: Decimal;
  // DR-092: new debt drawn in the year (0 in year 0); with principal, prepaid and
  // refinanced it explains the balance move: balance[t] = balance[t−1] − principal[t]
  // − prepaid[t] + draws[t] + refinanced[t].
  draws: Decimal;
  // ADR 0166: the change in committed debt from new borrowing: draws[t] less the part
  // that was already committed (a development tranche), plus the undrawn part of a loan
  // that came in this year. committedDebt[t] = committedDebt[t−1] − principal[t]
  // − prepaid[t] + committedDraws[t] + refinanced[t]; 0 in year 0.
  committedDraws: Decimal;
  // ADR 0165: the value a future purchase comes online with, in its turn-on year (its
  // value at the purchase date); 0 in every other year and for a property owned at
  // baseDate. Lets the equity change split a purchase from appreciation.
  acquiredValue: Decimal;
  // ADR 0130: the year's refinance handover differences (Σ row `refinanced`).
  refinanced: Decimal;
  // ADR 0109: extra principal prepaid in the year and the fees paid with it. Owner
  // cash outside debt service and net cash flow, like an acquisition; cumulative cash
  // flow and the IRR subtract both.
  prepaid: Decimal;
  prepaymentFees: Decimal;
  // ADR 0161: net cash flow minus the cash outside it (acquisitions, refinance cash,
  // prepayments with their fees, debt service before a future buy); 0 in year 0.
  // Σ of the portfolio's years 1..N is the cumulative cash flow KPI.
  cashToOwner: Decimal;
  dscr: Decimal | null;
  ratePa: Decimal | null; // dominant mortgage rate in effect; null if no debt
}

/** Why a levered IRR has no value (DR-158): no root in the search range, or the NPV
 *  has more than one root there. */
export type IrrNoRateReason = "NO_ROOT" | "NOT_UNIQUE";

export interface PortfolioKPIs {
  netWorthNominal: Decimal;
  netWorthReal: Decimal;
  netWorthMultiple: Decimal | null; // null when equity₀ ≤ 0 (ADR 0126)
  netWorthMultipleReal: Decimal | null; // real net worth / equity₀ (ADR 0087, 0126)
  cagrNominal: Decimal | null; // null when equity₀ ≤ 0 or the end ≤ 0 (D-34, ADR 0126)
  cagrReal: Decimal | null;
  // Cumulative cash to owner: Σ cashToOwner_t, years 1..N (ADR 0161; the name predates it).
  cumulativeNetCashFlow: Decimal;
  cumulativeNetCashFlowReal: Decimal; // Σ flow_t / CPI_t (ADR 0087)
  firstCashFlowPositiveYear: number | null; // calendar year
  firstCashFlowPositiveProjectionYear: number | null; // D-22: its projection year
  debtFreeYear: number | null; // calendar year
  debtFreeProjectionYear: number | null; // D-22: its projection year
  leveredIrrNominal: Decimal | null;
  leveredIrrReal: Decimal | null;
  /** Why `leveredIrrNominal` is null; null when it has a value. */
  leveredIrrNominalReason: IrrNoRateReason | null;
  /** Why `leveredIrrReal` is null; null when it has a value. */
  leveredIrrRealReason: IrrNoRateReason | null;
  /** Σ scheduled principal + Σ prepaid over the horizon; == initial debt + draws when loans retire (ADR 0109). */
  totalPrincipalRepaid: Decimal;
  /** Σ interest, years 1..N (ADR 0103): the projection's plus what a future buy's loan
   *  charges before the property turns on (ADR 0124). */
  totalInterest: Decimal;
  /** Σ interest_t / CPI_t, years 1..N, like `cumulativeNetCashFlowReal` (ADR 0103). */
  totalInterestReal: Decimal;
}

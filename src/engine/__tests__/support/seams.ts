// The engine's test seams (#480): exports tests pin that the app does not use, kept out
// of the public barrel (src/engine/index.ts). Test code only: depcruise's
// `no-prod-to-tests` rule refuses an import from app code.
export {
  /** UI model tests (loan-term hints). */
  impliedMaturity,
} from "../../loanChecks";
export {
  /** CSV import tests (the longest loan term the forms accept). */
  MAX_LOAN_TERM_MONTHS,
} from "../../loanConstants";
export {
  /** Tests; the app runs `portfolioOutputs`. */
  portfolioSnapshot,
} from "../../metrics";
export {
  /** Tests; the app runs `portfolioOutputs`. */
  portfolioKpis,
} from "../../kpis";
export {
  /** Store tests (the seed's open records); the app runs `valuationClosedBy` and
   *  `leaseClosedBy`. */
  openPredecessor,
} from "../../effectiveDating";

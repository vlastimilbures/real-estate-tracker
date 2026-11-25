// The engine's public API: the only module code outside src/engine may import
// (enforced by ESLint no-restricted-imports). Pure: no React/Tauri/DB imports anywhere
// under src/engine. Everything not listed here is internal to the engine; engine
// tests may import internal modules directly.

// Types (inputs, outputs, brands)
export * from "./types";
export type { Scenario, ScenarioOverrides } from "./scenarios";
export type {
  EngineValidationError,
  ValidationCode,
  ValidationEntity,
} from "./validate";

// Brand constructors and calendar-date helpers
export { money, rate } from "./brands";
export {
  addYears,
  calendarDay,
  dayBefore,
  edate,
  isoDate,
  lastGridMonthOnOrBefore,
  monthsBetween,
  utc,
} from "./dates";
export { openPredecessor, overlappingLeases } from "./succession";

// Loans
export { isDevLoan, mortgageBlock } from "./loanBlock";
export { blockEndDate, fixationExpired } from "./loanRate";
export { suggestedInstalment } from "./loanInstalment";
export {
  amortizationHealth,
  /** @internal test seam (UI model tests) */
  impliedMaturity,
  maturityMismatch,
} from "./loanChecks";
export { selectBlock } from "./loan/blockChain";
export {
  /** @internal test seam (CSV import tests) */
  MAX_LOAN_TERM_MONTHS,
  /** The IRR search range the "no IRR" note names (#441). */
  IRR_BRACKET_LOW,
  IRR_BRACKET_MAX,
} from "./constants";
export { basisDate, scheduledPrincipal } from "./growth";
export { monthlyFlow } from "./figures";
export { EMPTY_PROPERTY_SCHEDULE, propertySchedules } from "./schedule";
export type { PropertySchedule } from "./schedule";

// Snapshot, projection, KPIs, scenarios, validation
export {
  leaseInForce,
  /** @internal test seam (tests; the app runs `portfolioOutputs`) */
  portfolioSnapshot,
  propertySnapshot,
  selectValuation,
} from "./metrics";
export {
  cpiIndex,
  portfolioProjection,
  propertyProjection,
  propertyProjections,
  renewedLease,
} from "./projections";
export {
  cpiAt,
  portfolioSnapshotAtYear,
  propertySnapshotAtYear,
  realPortfolioSnapshot,
  realProjection,
  realPropertySnapshot,
} from "./real";
export { acquisitionSummary } from "./acquisition";
export { equityBridge, purchasedValue } from "./equityBridge";
export type { AcquisitionSummary } from "./acquisition";
export {
  /** @internal test seam (tests; the app runs `portfolioOutputs`) */
  portfolioKpis,
  projectionAndKpis,
} from "./kpis";
export { portfolioOutputs } from "./outputs";
export {
  debtResettingWithin,
  leaseEndWithoutFollowOn,
  propertyLoanExposure,
  upcomingEvents,
} from "./financing";
export type {
  Drawdown,
  DrawdownTranche,
  FinancingEventKind,
  FinancingExposure,
  FixationReset,
  PropertyLoan,
} from "./financing";
export { applyScenario } from "./scenarios";
export { blocksReachedByShock } from "./shockReach";
export type { BlockShockReach } from "./shockReach";
export {
  comparableScenarios,
  leaseOverlapErrors,
  scenarioErrorsAddedBy,
  scenarioRuleErrors,
  validateInputs,
  validatePortfolio,
} from "./validate";
export { loanChainChanges } from "./chainChanges";
export { EngineInputError } from "./errors";

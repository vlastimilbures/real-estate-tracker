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
export {
  amortizationHealth,
  blockEndDate,
  fixationExpired,
  rateFixedUntil,
  impliedMaturity,
  instalmentFor,
  isDevLoan,
  suggestedInstalment,
  maturityMismatch,
  mortgageBlock,
  selectBlock,
} from "./amortization";
export { MAX_LOAN_TERM_MONTHS } from "./constants";
export { basisDate, scheduledPrincipal } from "./growth";
export {
  EMPTY_PROPERTY_SCHEDULE,
  effectiveMaturity,
  propertySchedules,
} from "./schedule";

// Snapshot, projection, KPIs, scenarios, validation
export {
  leaseInForce,
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
export type { AcquisitionSummary } from "./acquisition";
export { portfolioKpis, projectionAndKpis } from "./kpis";
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
export {
  leaseOverlapErrors,
  validateInputs,
  validatePortfolio,
} from "./validate";
export { loanChainChanges } from "./chainChanges";
export { EngineInputError } from "./errors";

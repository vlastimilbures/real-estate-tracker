// The engine's public API: the only module code outside src/engine may import
// (enforced by ESLint no-restricted-imports). Pure: no React/Tauri/DB imports anywhere
// under src/engine. Everything not listed here is internal to the engine; engine
// tests may import internal modules directly.

// Types (inputs, outputs, brands)
export * from "./types";
export type { Scenario, ScenarioOverrides } from "./scenarios";
export type { AmortizationHealth } from "./amortization";
export type { YearFigures } from "./real";
export type {
  EngineValidationError,
  ValidationCode,
  ValidationEntity,
} from "./validate";

// Brand constructors and calendar-date helpers
export { money, rate } from "./brands";
export {
  addYears,
  dayBefore,
  edate,
  isoDate,
  monthsBetween,
  utc,
} from "./dates";
export { openPredecessor } from "./succession";

// Loans
export {
  amortizationHealth,
  blockEndDate,
  fixationExpired,
  impliedMaturity,
  instalmentFor,
  isDevLoan,
  suggestedInstalment,
  maturityMismatch,
  mortgageBlock,
  selectBlock,
} from "./amortization";
export { MAX_LOAN_TERM_MONTHS } from "./constants";
export { scheduledPrincipal } from "./growth";
export {
  effectiveMaturity,
  propertySchedules,
  schedulesByProperty,
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
} from "./projections";
export {
  cpiAt,
  portfolioSnapshotAtYear,
  propertySnapshotAtYear,
  realPortfolioSnapshot,
  realProjection,
  realPropertySnapshot,
} from "./real";
export { portfolioKpis } from "./kpis";
export { portfolioOutputs, projectionAndKpis } from "./outputs";
export {
  debtResettingWithin,
  financingExposure,
  leaseEndWithoutFollowOn,
  propertyLoanExposure,
  upcomingEvents,
} from "./financing";
export type {
  FinancingEvent,
  FinancingEventKind,
  FinancingExposure,
  FixationReset,
  LoanExposure,
} from "./financing";
export type { PortfolioOutputs } from "./outputs";
export { applyScenario } from "./scenarios";
export { validateInputs, validatePortfolio } from "./validate";
export { EngineInputError } from "./errors";

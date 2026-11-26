// The engine's public API: the only module code outside src/engine may import
// (enforced by ESLint no-restricted-imports). Pure: no React/Tauri/DB imports anywhere
// under src/engine. Everything not listed here is internal to the engine; engine
// tests may import internal modules directly. The test seams (exports only tests use)
// live in __tests__/support/seams.ts, not here (#480).

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
export { openPredecessor, overlappingLeases } from "./effectiveDating";

// Loans
export { isDevLoan, mortgageBlock } from "./loanBlock";
export { blockEndDate, fixationExpired } from "./loanRate";
export { suggestedInstalment } from "./loanInstalment";
export type { InstalmentCode } from "./loanTerm";
export { amortizationHealth, maturityMismatch } from "./loanChecks";
export { selectBlock } from "./loan/blockChain";
export {
  /** The IRR search range the "no IRR" note names (#441). */
  IRR_BRACKET_LOW,
  IRR_BRACKET_MAX,
} from "./irrConstants";
export { basisDate, scheduledPrincipal } from "./growth";
export { monthlyFlow } from "./figures";
export { EMPTY_PROPERTY_SCHEDULE, propertySchedules } from "./schedule";
export type { PropertySchedule } from "./schedule";

// Snapshot, projection, KPIs, scenarios, validation
export { propertySnapshot } from "./metrics";
export { leaseInForce, selectValuation } from "./selectors";
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
export { projectionAndKpis } from "./kpis";
export { portfolioOutputs } from "./outputs";
export { debtResettingWithin, propertyLoanExposure } from "./financing";
export type {
  Drawdown,
  DrawdownTranche,
  FinancingExposure,
  FixationReset,
  PropertyLoan,
} from "./financing";
export { leaseEndWithoutFollowOn, upcomingEvents } from "./upcomingEvents";
export type { FinancingEventKind } from "./upcomingEvents";
export { applyScenario } from "./scenarios";
export { blocksReachedByShock } from "./shockReach";
export type { BlockShockReach } from "./shockReach";
export {
  comparableScenarios,
  instalmentBelowInterest,
  instalmentBelowInterestErrors,
  leaseOverlapErrors,
  scenarioErrorsAddedBy,
  scenarioRuleErrors,
  validateInputs,
  validatePortfolio,
} from "./validate";
export { loanChainChanges } from "./chainChanges";
export { EngineInputError } from "./errors";

// Engine-boundary validation: a pure check of the inputs the engine would otherwise turn
// into NaN, Infinity, an endless loop or a silently wrong number. `validateInputs` only
// reports. The asserts raise a typed `EngineInputError`: the loan codes (ADR 0017) via
// `assertLoanInputs`, overlapping block starts (ADR 0027) via `assertBlockStarts`, an
// as-of date before baseDate (ADR 0019) via `assertAsOf`, and corrupt data and ranges
// (ADR 0037, ADR 0038) via `assertInputs` / `assertAssumptions`, which return the inputs
// branded `ValidInputs` / `ValidAssumptions`. The error names codes; the UI words them.
export type {
  EngineValidationError,
  ValidationCode,
  ValidationEntity,
} from "./codes";
export {
  assertLoanInputs,
  assertLoanRows,
  instalmentBelowInterest,
} from "./loan";
export { assertBlockStarts } from "./blockStarts";
export {
  instalmentBelowInterestErrors,
  leaseOverlapErrors,
  validatePortfolio,
} from "./rows";
export {
  assertAsOf,
  assertAssumptions,
  assertInputs,
  validateInputs,
} from "./entry";
export type { ValidAssumptions, ValidInputs } from "./entry";
export {
  comparableScenarios,
  scenarioErrorsAddedBy,
  scenarioRuleErrors,
} from "./scenarioRules";

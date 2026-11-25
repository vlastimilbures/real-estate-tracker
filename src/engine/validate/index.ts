// Engine-boundary validation: a pure check of the inputs the engine would otherwise turn
// into NaN, Infinity, an endless loop or a silently wrong number. `validateInputs` only
// reports. The asserts raise a typed `EngineInputError`: the loan codes (D-17) via
// `assertLoanInputs`, overlapping block starts (D-27) via `assertBlockStarts`, an as-of
// date before baseDate (D-19) via `assertAsOf`, and corrupt data and ranges (D-37, D-38)
// via `assertInputs` / `assertAssumptions`, which return the inputs branded
// `ValidInputs` / `ValidAssumptions`. The error names codes; the UI words them.
export type {
  EngineValidationError,
  ValidationCode,
  ValidationEntity,
} from "./codes";
export { assertLoanInputs, assertLoanRows } from "./loan";
export { assertBlockStarts } from "./blockStarts";
export { leaseOverlapErrors, validatePortfolio } from "./rows";
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

// Engine-boundary validation (P4a): a pure check of the inputs the engine would
// otherwise turn into NaN, Infinity, an endless loop or a silently wrong number.
// `validateInputs` only reports. The engine raises a typed error per approved
// decision: the D-17 loan codes via `assertLoanInputs` (P4b), D-27 overlap via
// `assertBlockStarts` (P4b), D-19 as-of before baseDate via `assertAsOf` (P4b), D-37
// corrupt data and D-38 ranges via `assertInputs` / `assertAssumptions` (P4b).
// Entry-point rejection is P5b/P7; messages belong to P7.
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

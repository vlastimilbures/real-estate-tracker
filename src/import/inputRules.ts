// The engine's input rules as the restore check (P5b), plus the whole-number bounds the
// forms and CSV import apply (ADR 0086), and the scenario check the store and the compare
// use (ADR 0123). Lives outside src/data because the data layer never calls engine functions
// (DB → mappers → engine).
import { applyScenario, validateInputs, validatePortfolio } from "../engine";
import type {
  Assumptions,
  EngineValidationError,
  Portfolio,
  ScenarioOverrides,
} from "../engine";
import type { InputRules, RangeProblem } from "../data/backup";
import { outOfRangeFields } from "../lib/intRanges";

/** Every bounded whole-number field outside INT_RANGES (unset optional fields pass). */
function rangeProblems(
  portfolio: Portfolio,
  assumptions: Assumptions | undefined,
): RangeProblem[] {
  return outOfRangeFields(portfolio, assumptions).map(
    ({ entity, id, field, range, beyondLimit }) => ({
      code: beyondLimit ? "BEYOND_LIMIT" : "OUT_OF_RANGE",
      entity,
      id,
      field,
      range,
    }),
  );
}

const NO_ROWS: Portfolio = {
  properties: [],
  mortgages: [],
  valuations: [],
  leases: [],
  holdingCosts: [],
};

/** The engine rules a scenario's own overrides break, applied on top of the saved
 *  assumptions (ADR 0123). A problem in a base field is never blamed on the scenario.
 *  Most rules on a scenario field ignore the base; the cross-field rules (a shock on the
 *  level it shifts, ADR 0128 §3) run only when that level is valid, so they can change
 *  with the base: see `scenarioErrorsAddedBy`. */
export function scenarioRuleErrors(
  base: Assumptions,
  overrides: ScenarioOverrides,
): EngineValidationError[] {
  const set = overrides as Record<string, unknown>;
  return validateInputs(NO_ROWS, applyScenario(base, overrides)).filter(
    (e) =>
      e.entity === "assumptions" &&
      e.field !== undefined &&
      set[e.field] !== undefined,
  );
}

/** The rules a scenario breaks on `newBase` that it did not break on `oldBase` (ADR 0128
 *  §6): what an assumptions edit would newly break. A scenario that already broke a rule
 *  does not block the edit. */
export function scenarioErrorsAddedBy(
  oldBase: Assumptions,
  newBase: Assumptions,
  overrides: ScenarioOverrides,
): EngineValidationError[] {
  const key = (e: EngineValidationError) => `${e.code}\u0000${e.field ?? ""}`;
  const before = new Set(scenarioRuleErrors(oldBase, overrides).map(key));
  return scenarioRuleErrors(newBase, overrides).filter(
    (e) => !before.has(key(e)),
  );
}

/** Every engine input rule over a restored portfolio (without assumptions, the
 *  portfolio rules only), then the whole-number bounds on fields no engine rule
 *  already reported. */
export const checkInputRules: InputRules = (portfolio, assumptions) => {
  const engine = assumptions
    ? validateInputs(portfolio, assumptions)
    : validatePortfolio(portfolio);
  const key = (e: EngineValidationError | RangeProblem) =>
    `${e.entity}\u0000${e.id ?? ""}\u0000${e.field ?? ""}`;
  const reported = new Set(engine.map(key));
  return [
    ...engine,
    ...rangeProblems(portfolio, assumptions).filter(
      (p) => !reported.has(key(p)),
    ),
  ];
};

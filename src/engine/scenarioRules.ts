// The engine rules a scenario's own overrides break (ADR 0123): the store checks a
// scenario with them before writing it, and the compare before running it. Pure.
import { applyScenario, type ScenarioOverrides } from "./scenarios";
import type { Assumptions, Portfolio } from "./types";
import { validateInputs, type EngineValidationError } from "./validate";

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

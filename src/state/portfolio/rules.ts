// The store's pre-write rule checks (#465): pure, they throw before anything is written
// so a form shows the rule. The store reads their inputs inside the queued op.
import {
  EngineInputError,
  instalmentBelowInterestErrors,
  leaseOverlapErrors,
  scenarioErrorsAddedBy,
  scenarioRuleErrors,
  validateInputs,
  validatePortfolio,
} from "../../engine";
import type {
  Portfolio,
  Assumptions,
  Scenario,
  EngineValidationError,
} from "../../engine";
import { ScenarioRuleError } from "../writeError";
import {
  assertHorizonRange,
  assertPortfolioRanges,
  assertScenarioRanges,
} from "../writeRanges";
import type { PortfolioState } from "./types";

/** What the rules read of the store's state. */
type RuleState = Pick<
  PortfolioState,
  "portfolio" | "assumptions" | "scenarios"
>;

/** `rows` with `row` in place of the row with its id, moved last: the engine reports a
 *  clash between two rows (DUPLICATE_BLOCK_START) on the later-listed one, so the
 *  edited row is the one named. */
export function withRow<T extends { id: string }>(rows: T[], row: T): T[] {
  return [...rows.filter((r) => r.id !== row.id), row];
}

/** Throw the engine input rules broken by the rows `ids` of the candidate portfolio
 *  (ADR 0017, ADR 0024, ADR 0027, ADR 0036, ADR 0037), and the write-time instalment
 *  (ADR 0264) and lease overlap (ADR 0163) rules, so a form shows the rule before
 *  anything is written. Problems in other rows are not this edit's to report: a stored
 *  overlap or a stored loan below its interest does not block other edits. `overlapIds`
 *  (default `ids`) narrows the overlap rule to the rows that can add one. Then the
 *  out-of-range values the edit adds to the `stored` portfolio (ADR 0245). */
function assertRows(
  stored: Portfolio,
  candidate: Portfolio,
  ids: string[],
  overlapIds: string[] = ids,
): void {
  const of = (rows: string[]) => (e: EngineValidationError) =>
    e.id !== undefined && rows.includes(e.id);
  const errors = [
    ...validatePortfolio(candidate).filter(of(ids)),
    ...instalmentBelowInterestErrors(candidate).filter(of(ids)),
    ...leaseOverlapErrors(candidate).filter(of(overlapIds)),
  ];
  if (errors.length > 0) throw new EngineInputError(errors);
  assertPortfolioRanges(stored, candidate);
}

/** Check the `stored` portfolio with `edit` applied for the rows `ids` (`overlapIds`:
 *  see assertRows). The caller reads `stored` inside the queued op, so it sees every
 *  earlier write. */
export function checkEdit(
  stored: Portfolio | null,
  edit: (p: Portfolio) => Portfolio,
  ids: string[],
  overlapIds?: string[],
): void {
  if (stored) assertRows(stored, edit(stored), ids, overlapIds);
}

/** Engine rules of the assumptions themselves (horizon, rates, shocks, ADR 0038), then an
 *  out-of-range horizon the edit adds to the `stored` assumptions (ADR 0245). */
function assertAssumptionRules(
  p: Portfolio,
  stored: Assumptions | null,
  a: Assumptions,
): void {
  const errors = validateInputs(p, a).filter((e) => e.entity === "assumptions");
  if (errors.length > 0) throw new EngineInputError(errors);
  assertHorizonRange(stored, a);
}

/** The assumptions' own rules and range (assertAssumptionRules), then the saved
 *  scenarios the edit would newly break (ADR 0128 §6). `s` is the store's state. */
export function checkAssumptions(s: RuleState, a: Assumptions): void {
  const p = s.portfolio;
  const old = s.assumptions;
  if (!p) return;
  assertAssumptionRules(p, old, a);
  // ADR 0128 §6: a shock meets the level it shifts, so an edit can break a saved
  // scenario. Refuse only one the edit newly breaks, and name the first.
  if (!old) return;
  for (const sc of s.scenarios) {
    const added = scenarioErrorsAddedBy(old, a, sc.overrides);
    if (added.length > 0) throw new ScenarioRuleError(sc.name, added);
  }
}

/** Engine rules a scenario's own overrides break on top of the saved assumptions
 *  (ADR 0123): refused before writing, like the assumptions themselves. Then the shock
 *  and crash years `sc` adds to `source` (ADR 0257 §1): by default the scenario stored
 *  under its id, none for an add; a duplicate passes its source. `s` is the store's
 *  state. */
export function checkScenario(
  s: RuleState,
  sc: Scenario,
  source = s.scenarios.find((x) => x.id === sc.id),
): void {
  const a = s.assumptions;
  const errors = a ? scenarioRuleErrors(a, sc.overrides) : [];
  if (errors.length > 0) throw new EngineInputError(errors);
  assertScenarioRanges(source?.overrides, sc.overrides);
}

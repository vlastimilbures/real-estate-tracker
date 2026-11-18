// What a failed write tells the UI (P7a, DR-133): a typed value the UI translates
// (ui/model/writeError.ts), never SQLite's raw text as the message.
import {
  DataError,
  constraintOf,
  messageOf,
  type ConstraintFailure,
  type DataErrorCode,
} from "../data/errors";
import { EngineInputError, type EngineValidationError } from "../engine";
import type { RangeProblem, ScenarioRangeProblem } from "../lib/rules";

/** An out-of-range value a write adds: a bounded field (ADR 0245) or a scenario's shock or
 *  crash year (ADR 0257). */
export type WriteRangeProblem = RangeProblem | ScenarioRangeProblem;

export type WriteError =
  /** Engine input rules the edit breaks, checked before writing (UX-047). `scenario`
   *  names the saved scenario an assumptions edit would break (ADR 0128 §6); the errors
   *  are then the scenario's. `ranges`: the out-of-range values the edit adds, then with
   *  no engine error (ADR 0245), or a scenario's shock and crash years (ADR 0257). */
  | {
      kind: "input";
      errors: readonly EngineValidationError[];
      scenario?: string | undefined;
      ranges?: readonly WriteRangeProblem[] | undefined;
    }
  /** A schema constraint refused the write (UNIQUE, CHECK, FOREIGN KEY, NOT NULL). */
  | { kind: "constraint"; constraint: ConstraintFailure }
  /** A typed data-layer failure (e.g. ROW_MISSING). */
  | { kind: "data"; code: DataErrorCode; details: string[] }
  /** Anything else; `message` is the underlying text, shown as a detail only. */
  | { kind: "other"; message: string };

/** An assumptions edit refused because it would newly break the saved scenario
 *  `scenario` (ADR 0128 §6). `errors` are that scenario's, on its own fields. */
export class ScenarioRuleError extends EngineInputError {
  readonly scenario: string;

  constructor(scenario: string, errors: readonly EngineValidationError[]) {
    super(errors);
    this.name = "ScenarioRuleError";
    this.scenario = scenario;
  }
}

/** A write refused because it adds a value outside the bounded ranges (ADR 0245): an
 *  input error like the engine's (ADR 0141), with no engine error, since OUT_OF_RANGE
 *  is not an engine rule (ADR 0086 §3). */
export class RangeRuleError extends EngineInputError {
  readonly ranges: readonly WriteRangeProblem[];

  constructor(ranges: readonly WriteRangeProblem[]) {
    super([]);
    this.name = "RangeRuleError";
    this.ranges = ranges;
  }
}

export function toWriteError(e: unknown): WriteError {
  if (e instanceof RangeRuleError)
    return { kind: "input", errors: [], ranges: e.ranges };
  if (e instanceof ScenarioRuleError)
    return { kind: "input", errors: e.errors, scenario: e.scenario };
  if (e instanceof EngineInputError) return { kind: "input", errors: e.errors };
  if (e instanceof DataError)
    return { kind: "data", code: e.code, details: e.details };
  const constraint = constraintOf(e);
  if (constraint) return { kind: "constraint", constraint };
  return { kind: "other", message: messageOf(e) };
}

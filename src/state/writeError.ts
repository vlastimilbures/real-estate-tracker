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

export type WriteError =
  /** Engine input rules the edit breaks, checked before writing (UX-047). `scenario`
   *  names the saved scenario an assumptions edit would break (ADR 0128 §6); the errors
   *  are then the scenario's. */
  | {
      kind: "input";
      errors: readonly EngineValidationError[];
      scenario?: string | undefined;
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

export function toWriteError(e: unknown): WriteError {
  if (e instanceof ScenarioRuleError)
    return { kind: "input", errors: e.errors, scenario: e.scenario };
  if (e instanceof EngineInputError) return { kind: "input", errors: e.errors };
  if (e instanceof DataError)
    return { kind: "data", code: e.code, details: e.details };
  const constraint = constraintOf(e);
  if (constraint) return { kind: "constraint", constraint };
  return { kind: "other", message: messageOf(e) };
}

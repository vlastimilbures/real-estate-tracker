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
  /** Engine input rules the edit breaks, checked before writing (UX-047). */
  | { kind: "input"; errors: readonly EngineValidationError[] }
  /** A schema constraint refused the write (UNIQUE, CHECK, FOREIGN KEY, NOT NULL). */
  | { kind: "constraint"; constraint: ConstraintFailure }
  /** A typed data-layer failure (e.g. ROW_MISSING). */
  | { kind: "data"; code: DataErrorCode; details: string[] }
  /** Anything else; `message` is the underlying text, shown as a detail only. */
  | { kind: "other"; message: string };

export function toWriteError(e: unknown): WriteError {
  if (e instanceof EngineInputError) return { kind: "input", errors: e.errors };
  if (e instanceof DataError)
    return { kind: "data", code: e.code, details: e.details };
  const constraint = constraintOf(e);
  if (constraint) return { kind: "constraint", constraint };
  return { kind: "other", message: messageOf(e) };
}

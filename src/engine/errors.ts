// Typed engine errors (D-17): the engine raises these instead of producing NaN,
// Infinity or an endless loop from input it cannot compute. The message names codes,
// not user wording — translated messages belong to the UI (P7).
import type { EngineValidationError } from "./validate";

const describe = (e: EngineValidationError) =>
  e.field ? `${e.code} (${e.field})` : e.code;

/** Invalid engine input. `errors` lists every problem found, in check order. */
export class EngineInputError extends Error {
  readonly errors: readonly EngineValidationError[];

  constructor(errors: readonly EngineValidationError[]) {
    const first = errors[0];
    const where =
      first?.id !== undefined ? `${first.entity} ${first.id}` : first?.entity;
    super(`Invalid ${where ?? "input"}: ${errors.map(describe).join(", ")}`);
    this.name = "EngineInputError";
    this.errors = errors;
  }
}

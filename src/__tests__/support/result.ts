// Store action results, for tests (#467): a success's value, where a failure throws as
// the action itself did before it returned a Result, and a mocked action's outcomes.
import type { Result } from "../../state/result";
import { toActionError, type ActionError } from "../../state/actionError";
import { CsvImportProblemsError } from "../../import/csvImport";
import { toWriteError } from "../../state/writeError";
export { success } from "../../state/result";

export function unwrap<T>(result: Result<T, unknown>): T {
  if (!result.ok)
    throw new Error(`expected a success: ${JSON.stringify(result.error)}`);
  return (result as unknown as { value: T }).value;
}

/** A mocked store action's failure: `e` as the store returns it, a refused CSV plan
 *  included. */
export const failure = (e: unknown) => ({
  ok: false as const,
  error:
    e instanceof CsvImportProblemsError
      ? ({ kind: "planRefused", preview: e.preview } satisfies ActionError)
      : toActionError(e),
});

/** A mocked read's failure, as a write error. */
export const writeFailure = (e: unknown) => ({
  ok: false as const,
  error: toWriteError(e),
});

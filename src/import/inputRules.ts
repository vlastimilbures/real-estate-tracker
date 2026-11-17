// The engine's input rules as the restore check (P5b), plus the whole-number bounds the
// forms and CSV import apply (ADR 0086). The scenario check the store and the compare use
// (ADR 0123) is the engine's (src/engine/scenarioRules.ts). A stored date before the date
// floor is not checked (ADR 0232). Lives outside src/data because the data layer never
// calls engine functions (DB → mappers → engine).
import { validateInputs, validatePortfolio } from "../engine";
import type { EngineValidationError } from "../engine";
import type { InputRules } from "../data/backup";
import { rangeProblems, type RangeProblem } from "../lib/rules";

/** Every engine input rule over a restored portfolio (without assumptions, the
 *  portfolio rules only), then the whole-number form bounds on fields no engine rule
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
    ...rangeProblems(portfolio, assumptions)
      .filter((p) => !reported.has(key(p)))
      .map(withoutValue),
  ];
};

/** A range problem as restore reports it: never the stored value (ADR 0086). */
const withoutValue = ({
  code,
  entity,
  id,
  field,
  range,
}: RangeProblem): Omit<RangeProblem, "value"> => ({
  code,
  entity,
  id,
  field,
  range,
});

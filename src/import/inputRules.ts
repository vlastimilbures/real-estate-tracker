// The engine's input rules as the restore check (P5b), plus the whole-number bounds the
// forms and CSV import apply (ADR 0086). Lives outside src/data because the data layer
// never calls engine functions (DB → mappers → engine).
import { validateInputs, validatePortfolio } from "../engine";
import type {
  Assumptions,
  EngineValidationError,
  Portfolio,
  ValidationEntity,
} from "../engine";
import type { InputRules, RangeProblem } from "../data/backup";
import { inRange, INT_RANGES } from "../lib/intRanges";

type BoundedField = keyof typeof INT_RANGES;

/** Every bounded whole-number field outside INT_RANGES (unset optional fields pass). */
function rangeProblems(
  portfolio: Portfolio,
  assumptions: Assumptions | undefined,
): RangeProblem[] {
  const problems: RangeProblem[] = [];
  const check = (
    entity: ValidationEntity,
    id: string | undefined,
    field: BoundedField,
    n: number | undefined,
  ) => {
    const range = INT_RANGES[field];
    if (n !== undefined && !inRange(n, range))
      problems.push({ code: "OUT_OF_RANGE", entity, id, field, range });
  };
  if (assumptions)
    check("assumptions", undefined, "horizonYears", assumptions.horizonYears);
  for (const p of portfolio.properties)
    check("property", p.id, "sizeM2", p.sizeM2);
  for (const m of portfolio.mortgages) {
    check("mortgage", m.id, "fixationYears", m.fixationYears);
    check("mortgage", m.id, "loanTermYears", m.loanTermYears);
  }
  return problems;
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

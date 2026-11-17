// The bounded ranges at the store (ADR 0245): a write is refused when it adds a value
// outside them, or changes a stored one to another. A value already stored out of range
// (ADR 0148: "Restore anyway") blocks no other write, and a fix saves.
import { rangeProblems, type RangeProblem } from "../lib/rules";
import type { Assumptions, Portfolio } from "../engine";
import { RangeRuleError } from "./writeError";

const keyOf = (p: RangeProblem) => `${p.entity}|${p.id ?? ""}|${p.field}`;

/** The problems of `after` that `before` does not have with the same value: new ones,
 *  and stored ones the write changes. */
export function rangeProblemsAddedBy(
  before: readonly RangeProblem[],
  after: readonly RangeProblem[],
): RangeProblem[] {
  const stored = new Map(before.map((p) => [keyOf(p), p.value]));
  return after.filter((p) => {
    const key = keyOf(p);
    return !stored.has(key) || !Object.is(stored.get(key), p.value);
  });
}

function refuseAdded(
  before: readonly RangeProblem[],
  after: readonly RangeProblem[],
): void {
  const added = rangeProblemsAddedBy(before, after);
  if (added.length > 0) throw new RangeRuleError(added);
}

/** Throw the range problems the `candidate` portfolio adds to the `stored` one. */
export function assertPortfolioRanges(
  stored: Portfolio,
  candidate: Portfolio,
): void {
  refuseAdded(rangeProblems(stored), rangeProblems(candidate));
}

const NO_ROWS = { properties: [], mortgages: [] };

/** Throw when `next` adds an out-of-range horizon to the `stored` assumptions. */
export function assertHorizonRange(
  stored: Assumptions | null,
  next: Assumptions,
): void {
  refuseAdded(
    stored ? rangeProblems(NO_ROWS, stored) : [],
    rangeProblems(NO_ROWS, next),
  );
}

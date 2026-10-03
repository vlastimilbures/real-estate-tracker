// Named numeric thresholds used by the engine (DR-076). Values are unchanged from the
// literals they replace; changing one moves outputs and needs an approved decision.
import { D } from "../lib/money";

/** IRR bisection bracket: annual rates from −90 % to +100 %. */
export const IRR_BRACKET_LOW = D(-0.9);
export const IRR_BRACKET_HIGH = D(1);
/** Upper bounds tried in turn when [LOW, HIGH] brackets no root, up to +1000 %
 *  (DR-158, ADR 0079). */
export const IRR_BRACKET_EXTENSIONS = [2, 4, 8, 10].map((x) => D(x));
/** Rates the NPV sign scan checks for more than one root over [−90 %, +1000 %]
 *  (DR-158): dense around typical returns, sparse in the tails. */
export const IRR_SCAN_GRID = [
  ...steps(-0.9, -0.1, 0.1),
  ...steps(-0.05, 0.3, 0.025),
  ...steps(0.35, 1, 0.05),
  ...[1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10].map((x) => D(x)),
];
/** Stop bisecting once |NPV| is below this (Kč). */
export const IRR_NPV_TOLERANCE = D("1e-9");
/** Upper bound on bisection steps (converges long before this). */
export const IRR_MAX_ITERATIONS = 200;

/** A portfolio balance at or below this (Kč) counts as debt-free. */
export const DEBT_FREE_EPSILON = D("0.005");

/** Residual balance at term end (Kč) up to which an instalment "fully amortizes". */
export const FULLY_AMORTIZES_TOLERANCE = D("1");

/** Decimal rates from `from` to `to` inclusive in steps of `step`. */
function steps(from: number, to: number, step: number) {
  const n = Math.round((to - from) / step);
  return Array.from({ length: n + 1 }, (_, i) =>
    D(from).plus(D(step).times(i)),
  );
}

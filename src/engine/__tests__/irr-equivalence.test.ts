// P9 (DR-041): `irr` evaluates the NPV by Horner's rule instead of one `pow` per cash
// flow. The bisection midpoints are computed exactly as before and the NPV is read only
// for its sign and the tolerance test, so the result must be the identical Decimal.
// The pre-P9 implementation is kept here as the oracle. DR-158 (ADR 0079) changed the
// rules outside its bracket: where the oracle finds no root, the widened search may find
// one above +100 %, and a vector whose NPV has several roots has no IRR (NOT_UNIQUE).
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { D, ONE, ZERO, type Decimal } from "../../lib/money";
import {
  IRR_BRACKET_HIGH,
  IRR_BRACKET_LOW,
  IRR_MAX_ITERATIONS,
  IRR_NPV_TOLERANCE,
  IRR_SCAN_GRID,
} from "../constants";
import { irrResult } from "../kpis";

/** The NPV with one `pow` per cash flow, as before P9. */
const oracleNpv =
  (cashflows: Decimal[]) =>
  (r: Decimal): Decimal =>
    cashflows.reduce(
      (acc, cf, i) => acc.plus(cf.div(ONE.plus(r).pow(i))),
      ZERO,
    );

/** `irr` before P9 (kpis.ts at 4e8be1d). */
function oracleIrr(cashflows: Decimal[]): Decimal | null {
  const npv = oracleNpv(cashflows);
  let lo = IRR_BRACKET_LOW;
  let hi = IRR_BRACKET_HIGH;
  let nlo = npv(lo);
  const nhi = npv(hi);
  if (nlo.times(nhi).isPositive()) return null;
  for (let iter = 0; iter < IRR_MAX_ITERATIONS; iter++) {
    const mid = lo.plus(hi).div(2);
    const nmid = npv(mid);
    if (nmid.abs().lessThan(IRR_NPV_TOLERANCE)) return mid;
    if (nlo.times(nmid).isNegative()) {
      hi = mid;
    } else {
      lo = mid;
      nlo = nmid;
    }
  }
  return lo.plus(hi).div(2);
}

/** Sign changes of the pre-P9 NPV over the scan grid (exact zeros skipped). */
function oracleSignChanges(v: Decimal[]): number {
  const signs = IRR_SCAN_GRID.map(oracleNpv(v))
    .filter((n) => !n.isZero())
    .map((n) => (n.isNegative() ? -1 : 1));
  return signs.filter((x, i) => i > 0 && x !== signs[i - 1]).length;
}

const same = (v: Decimal[]) => {
  const got = irrResult(v);
  const want = oracleIrr(v);
  if (got.reason === "NOT_UNIQUE") {
    // DR-158: the NPV really has several roots.
    expect(oracleSignChanges(v)).toBeGreaterThan(1);
  } else if (want !== null) {
    expect(got.rate?.toString()).toBe(want.toString());
  } else if (got.rate !== null) {
    // DR-158: found only by widening above +100 %, and it is a root.
    expect(got.rate.greaterThan(IRR_BRACKET_HIGH.minus("1e-9"))).toBe(true);
    const scale = v[0]!.abs().plus(1);
    expect(oracleNpv(v)(got.rate).abs().div(scale).lessThan("1e-6")).toBe(true);
  }
};

describe("irr = the pre-P9 bisection, digit for digit, where that finds a unique root", () => {
  it("random levered vectors (equity in, yearly cash flows, sale)", () => {
    const money = fc.integer({ min: -2_000_000, max: 2_000_000 });
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000_000, max: 50_000_000 }),
        fc.array(money, { minLength: 1, maxLength: 40 }),
        fc.integer({ min: 0, max: 200_000_000 }),
        (equity, flows, sale) => {
          const v = [D(-equity), ...flows.map((x) => D(x))];
          v[v.length - 1] = v[v.length - 1]!.plus(sale);
          same(v);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("vectors with fractional amounts and no sign change", () => {
    same([D("-100.25"), D("60.5"), D("60.125")]);
    same([D(1), D(1), D(1)]);
    same([D(-1), D(-1), D(-1)]);
    same([D(-1000), D(0), D(0), D(5000)]);
  });
  // The fixtures' own IRRs (seed, mixed, edge portfolios) are pinned at 40 digits by
  // golden.test.ts.
});

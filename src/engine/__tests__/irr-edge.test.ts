// `irr` is bisection (projections.ts:373) and returns null when no sign change is
// bracketed. Every KPI consumer dereferences the result with `!`
// (`kpis.leveredIrrNominal!`), so an all-positive cash-flow vector that returns null
// would surface undefined to the UI. Pin both the null branch and a happy anchor.
import { describe, it, expect } from "vitest";
import { D } from "../../lib/money";
import { irr, irrResult, portfolioKpis } from "../kpis";
import { assumptions, portfolio } from "./support/seed";
import { RATIO, near } from "./support/tolerance";

describe("irr — no sign change", () => {
  it("returns null for an all-positive vector (no root bracketed)", () =>
    expect(irr([D(1), D(1), D(1)])).toBeNull());
  it("returns null for an all-negative vector", () =>
    expect(irr([D(-1), D(-1), D(-1)])).toBeNull());
});

describe("irr — well-behaved vector (sanity anchor)", () => {
  // -100 now, +60 +60 over two periods. Root: 3x²+3x−5=0 with x=1/(1+r) ⇒
  // x = (√69 − 3)/6, r = 1/x − 1 = 0.130662… Asserted at the ±0.0001 ratio rule (DR-061).
  const r = irr([D(-100), D(60), D(60)]);
  it("converges to 13.0662 % within ±0.0001", () => {
    expect(r).not.toBeNull();
    const x = (Math.sqrt(69) - 3) / 6;
    near(r!, 1 / x - 1, RATIO, "irr");
  });
});

describe("levered IRR reasons (DR-158)", () => {
  it("the seed has both IRRs and no reason", () => {
    const k = portfolioKpis(portfolio, assumptions);
    expect(k.leveredIrrNominal).not.toBeNull();
    expect(k.leveredIrrNominalReason).toBeNull();
    expect(k.leveredIrrReal).not.toBeNull();
    expect(k.leveredIrrRealReason).toBeNull();
  });
});

describe("irr — widened search and non-unique roots (DR-158, ADR 0079)", () => {
  it("finds an IRR of 150 % above the [−90 %, 100 %] bracket", () => {
    near(irr([D(-100), D(250)])!, 1.5, RATIO, "irr 150 %");
  });

  it("finds an IRR up to 1000 %", () => {
    near(irr([D(-1), D(10.5)])!, 9.5, RATIO, "irr 950 %");
  });

  it("no root up to 1000 % ⇒ NO_ROOT", () => {
    expect(irrResult([D(-1), D(20)])).toEqual({
      rate: null,
      reason: "NO_ROOT",
    });
    expect(irrResult([D(1), D(1), D(1)])).toEqual({
      rate: null,
      reason: "NO_ROOT",
    });
  });

  it("the classic [−1, 5, −6] vector (roots 100 % and 200 %) ⇒ NOT_UNIQUE", () => {
    expect(irrResult([D(-1), D(5), D(-6)])).toEqual({
      rate: null,
      reason: "NOT_UNIQUE",
    });
  });

  it("two roots inside the old bracket (10 % and 20 %) ⇒ NOT_UNIQUE", () => {
    expect(irrResult([D(-100), D(230), D(-132)]).reason).toBe("NOT_UNIQUE");
  });

  it("several cash-flow sign changes but one NPV root still has an IRR", () => {
    // A future purchase gives a negative year mid-vector; NPV still has one root.
    near(irr([D(-100), D(10), D(-50), D(20), D(200)])!, 0.145, 0.001, "irr");
    near(
      irr([D(-100), D(-20), D(30), D(-10), D(40), D(150)])!,
      0.14,
      0.001,
      "irr",
    );
  });
});

describe("irr — an exact root on a bracket end (#185, ADR 0121)", () => {
  // decimal.js: Decimal(0).isPositive() is true, so a bracket whose end NPV is exactly 0
  // must not be tested by the sign of a product (0 × x is ±0).
  const rateOf = (flows: number[]) =>
    irrResult(flows.map((x) => D(x))).rate?.toString();

  it("a root exactly on the last upper bound (+1000 %)", () => {
    expect(rateOf([-1, 11])).toBe("10");
  });

  it("a root exactly on a widened upper bound (+400 %)", () => {
    // 1 / (1 + 4) = 0.2 is exact, so the NPV there is exactly 0.
    expect(rateOf([-1, 5])).toBe("4");
  });

  it("a root exactly on the lower bound (−90 %), NPV positive above it", () => {
    // 10 now, −1 in a year: 10 = 1 / (1 + r) ⇒ r = −0.9.
    expect(rateOf([10, -1])).toBe("-0.9");
  });

  it("a root exactly on the lower bound (−90 %), NPV negative above it", () => {
    expect(rateOf([-10, 1])).toBe("-0.9");
  });

  it("a bound whose NPV is within the bisection tolerance of 0, not exactly 0", () => {
    // 1 / 3 and 1 / 9 do not round back exactly: the NPV is about −1e-40 there.
    expect(rateOf([-1, 3])).toBe("2");
    expect(rateOf([-1, 9])).toBe("8");
  });

  it("a root on a bound plus a second root is not unique", () => {
    // −90 % and 0 %; −90 % and 13 %; a crossing at 25 % and a touch at +100 %.
    for (const flows of [
      [-10, 11, -1],
      [10, -11, 1],
      [-10, 12.3, -1.13],
      [-4, 21, -36, 20],
    ]) {
      expect(irrResult(flows.map((x) => D(x))), String(flows)).toEqual({
        rate: null,
        reason: "NOT_UNIQUE",
      });
    }
  });

  it("all-zero flows (NPV 0 at every rate) still have no IRR", () => {
    expect(irrResult([D(0), D(0), D(0)])).toEqual({
      rate: null,
      reason: "NO_ROOT",
    });
  });
});

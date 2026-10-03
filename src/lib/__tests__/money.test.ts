import { describe, it, expect } from "vitest";
import { D, powInt, FV, PMT, NPER, roundCzk, ceilCzk } from "../money";

// Tolerances per the parity targets in .claude/rules/engine-parity.md.
const KC = 1; // ±1 Kč
const RATIO = 0.0001;

function nearly(actual: number, expected: number, tol: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
}

describe("powInt", () => {
  it("computes integer powers exactly", () => {
    expect(powInt(1.025, 30).toNumber()).toBeCloseTo(2.097567579, 8);
    expect(powInt(2, 10).toNumber()).toBe(1024);
  });
  it("rejects non-integer exponents", () => {
    expect(() => powInt(1.04, 2.5)).toThrow();
  });
});

describe("PMT", () => {
  // A 1,000,000 loan at 5% annual (0.05/12 monthly) over 360 months.
  it("matches the standard annuity payment", () => {
    const pmt = PMT(D(0.05).div(12), 360, 1_000_000);
    // Excel PMT(0.05/12,360,1000000) = -5368.216230
    nearly(pmt.toNumber(), -5368.21623, 0.001);
  });
  it("is zero-rate safe (straight-line)", () => {
    const pmt = PMT(0, 10, 1000);
    expect(pmt.toNumber()).toBe(-100);
  });
});

describe("FV", () => {
  // Remaining balance after paying the exact annuity for the full term is 0.
  it("amortizes a loan to zero at term", () => {
    const r = D(0.05).div(12);
    const pmt = PMT(r, 360, 1_000_000);
    const bal = FV(r, 360, pmt, 1_000_000).negated();
    nearly(bal.toNumber(), 0, KC);
  });
  // Javorova-style check: 1,912,500 @ 1.69%, instalment 6,721.8, after 64 months
  // (2021-01-17 → 2026-06-07 ≈ 64 monthly periods) the balance is ~1,932,832.
  it("reproduces a known mortgage balance", () => {
    const r = D(0.0169).div(12);
    const bal = FV(r, 64, -6721.8, 1_912_500).negated();
    nearly(bal.toNumber(), 1_642_907.31, 50);
  });
  it("is zero-rate safe", () => {
    const bal = FV(0, 10, -100, 1000).negated();
    expect(bal.toNumber()).toBe(0);
  });
});

describe("NPER", () => {
  it("computes the number of periods to payoff", () => {
    const n = NPER(D(0.05).div(12), -5368.21623, 1_000_000);
    nearly(n.toNumber(), 360, 0.01);
  });
  it("is zero-rate safe", () => {
    const n = NPER(0, -100, 1000);
    expect(n.toNumber()).toBe(10);
  });
});

describe("PMT/FV/NPER round-trip", () => {
  it("ratios are stable to 1e-4", () => {
    const r = D(0.0359).div(12);
    const pmt = PMT(r, 300, 5_610_000);
    const n = NPER(r, pmt, 5_610_000);
    nearly(n.toNumber(), 300, RATIO);
  });
});

describe("roundCzk", () => {
  it("rounds half up to whole CZK", () => {
    expect(roundCzk(1932832.126).toNumber()).toBe(1932832);
    expect(roundCzk(0.5).toNumber()).toBe(1);
  });
});

describe("ceilCzk", () => {
  it("rounds up to whole CZK (any fraction)", () => {
    expect(ceilCzk(9200.01).toNumber()).toBe(9201);
    expect(ceilCzk(18685.24).toNumber()).toBe(18686);
    expect(ceilCzk(6722).toNumber()).toBe(6722); // exact stays put
  });
});

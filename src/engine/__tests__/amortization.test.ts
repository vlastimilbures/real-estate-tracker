// Non-parity amortization unit tests. The Javorova parity rows live in
// parity/amortization.test.ts.
import { describe, it, expect } from "vitest";
import {
  instalmentFor,
  suggestedInstalment,
  amortizationHealth,
  fixationExpired,
} from "../amortization";
import { isoDate } from "../dates";
import { D, PMT, roundCzk, ceilCzk } from "../../lib/money";
import type { MortgageBlock } from "../types";
import { near } from "./support/tolerance";
import { rate } from "../brands";
import type { IsoDate } from "../brands";
import { money } from "../brands";

describe("instalmentFor — annuity instalment from principal/rate/term", () => {
  it("equals PMT(rate/12, term*12, −principal)", () => {
    const got = instalmentFor(D("1912500"), D("0.0169"), 25);
    const want = PMT(D("0.0169").div(12), 300, D("1912500").negated());
    expect(got.toString()).toBe(want.toString());
  });
  it("matches the hand-checked annuity (≈ 7,821 Kč/mo)", () => {
    near(
      instalmentFor(D("1912500"), D("0.0169"), 25).toNumber(),
      7821,
      2,
      "instalment",
    );
  });

  // A derived instalment must be ceil-rounded, not nearest: when the exact PMT's
  // fractional part is < 0.5, nearest underpays, and that deficit compounds past the
  // fully-amortizes threshold — wrongly flagging a loan the user just auto-calculated.
  // This case (exact ≈ 18,685.24) underpays at 18,685 but is healthy at 18,686.
  const blockWith = (instalment: ReturnType<typeof D>): MortgageBlock => ({
    id: "x",
    propertyId: "dubova",
    startDate: new Date(Date.UTC(2024, 2, 12)) as IsoDate,
    initialPrincipal: money("3034500"),
    fixationYears: 7,
    interestRatePa: rate("0.0449"),
    monthlyInstalment: money(instalment),
    loanTermYears: 28,
  });
  const exact28 = instalmentFor(D("3034500"), D("0.0449"), 28);
  it("ceil-rounded derived instalment fully amortizes", () => {
    expect(amortizationHealth(blockWith(ceilCzk(exact28))).fullyAmortizes).toBe(
      true,
    );
  });
  it("nearest-rounded instalment would NOT fully amortize (why we ceil)", () => {
    expect(
      amortizationHealth(blockWith(roundCzk(exact28))).fullyAmortizes,
    ).toBe(false);
  });
});

describe("fixationExpired — refix terms needed (D-30)", () => {
  const block = (start: string, fixationYears: number): MortgageBlock => ({
    id: "m",
    propertyId: "p",
    startDate: isoDate(start),
    initialPrincipal: money("3000000"),
    fixationYears,
    interestRatePa: rate("0.02"),
    monthlyInstalment: money("12000"),
  });
  const base = isoDate("2026-06-07");
  it("is true when the fixation ended before baseDate", () => {
    expect(fixationExpired(block("2018-03-15", 5), base)).toBe(true);
  });
  it("is true when the fixation ends exactly on baseDate (next payment resets)", () => {
    expect(fixationExpired(block("2019-06-07", 7), base)).toBe(true);
  });
  it("is false while the fixation runs past baseDate (seed Javorova)", () => {
    expect(fixationExpired(block("2021-01-17", 10), base)).toBe(false);
    expect(fixationExpired(block("2019-06-08", 7), base)).toBe(false);
  });
});

describe("suggestedInstalment — whole-CZK annuity rounded up", () => {
  it("equals ceilCzk(instalmentFor(...)) and never falls short of the annuity", () => {
    const cases: [string, string, number][] = [
      ["1912500", "0.0169", 25],
      ["9605000", "0.045", 30],
      ["500000", "0.0001", 5],
    ];
    for (const [p, r, n] of cases) {
      const exact = instalmentFor(D(p), D(r), n);
      const got = suggestedInstalment(D(p), D(r), n);
      expect(got.toString()).toBe(ceilCzk(exact).toString());
      expect(got.gte(exact)).toBe(true);
      expect(got.isInteger()).toBe(true);
    }
  });
});

// Non-parity amortization unit tests. The Javorova parity rows live in
// parity/amortization.test.ts.
import { describe, it, expect } from "vitest";
import {
  instalmentFor,
  suggestedInstalment,
  amortizationHealth,
  fixationExpired,
  blockEndDate,
  currentBalance,
  rateAt,
  rateFixedUntil,
} from "../amortization";
import { buildSchedule, openingBalance } from "../schedule";
import { edate, isoDate } from "../dates";
import { D, PMT, roundCzk, ceilCzk } from "../../lib/money";
import type { Assumptions, MortgageBlock } from "../types";
import { assumptions, BASE_DATE } from "./support/seed";
import { loan } from "./support/loan";
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

// A 0-year (floating) block: the entered rate up to baseDate, the reset rate after it
// (ADR 0162, #124). Javorova-like loan from support/loan: start 2021-01-17, so payment 64
// (2026-05-17) is the last due by baseDate 2026-06-07; schedule row k is payment 64 + k.
describe("0-year floating block (ADR 0162)", () => {
  const floating = loan({ fixationYears: 0 });
  const RESET = assumptions.postFixationResetRatePa;
  const shocked = (durationYears: number): Assumptions => ({
    ...assumptions,
    rateShock: { deltaPa: rate("0.02"), durationYears },
  });

  it("rateFixedUntil: the fixation end, or for a floating block the later of start and baseDate", () => {
    expect(rateFixedUntil(loan({}), BASE_DATE)).toEqual(blockEndDate(loan({})));
    expect(rateFixedUntil(floating, BASE_DATE)).toEqual(BASE_DATE);
    const future = loan({ fixationYears: 0, startDate: isoDate("2027-01-31") });
    expect(rateFixedUntil(future, BASE_DATE)).toEqual(isoDate("2027-01-31"));
  });

  it("payment 1 and the last payment due by baseDate are at the entered rate", () => {
    const due = (k: number) => edate(floating.startDate, k);
    expect(rateAt(due(1), floating, assumptions).toString()).toBe("0.0169");
    expect(rateAt(due(64), floating, assumptions).toString()).toBe("0.0169");
  });

  it("the opening balance is the closed form at the entered rate", () => {
    expect(openingBalance(floating, assumptions).toString()).toBe(
      currentBalance(floating, BASE_DATE).toString(),
    );
  });

  it("the first payment after baseDate is at the reset rate, re-amortized there", () => {
    const rows = buildSchedule(floating, assumptions);
    expect(rows[0]!.ratePa.toString()).toBe(RESET.toString());
    expect(rows[0]!.instalment.equals(floating.monthlyInstalment)).toBe(false);
  });

  it("a rate shock starts at baseDate and reverts N years later", () => {
    const rows = buildSchedule(floating, shocked(1));
    const up = RESET.plus("0.02").toString();
    expect(rows[0]!.ratePa.toString()).toBe(up);
    expect(rows[11]!.ratePa.toString()).toBe(up); // due 2027-05-17
    expect(rows[12]!.ratePa.toString()).toBe(RESET.toString()); // due 2027-06-17
  });

  it("a shock never reprices the payments due by baseDate", () => {
    expect(openingBalance(floating, shocked(1)).toString()).toBe(
      currentBalance(floating, BASE_DATE).toString(),
    );
  });

  it("is never an ended fixation", () => {
    expect(fixationExpired(floating, BASE_DATE)).toBe(false);
  });

  it("a future floating block runs at the reset rate from its first payment, shocked from its start", () => {
    const future = loan({ fixationYears: 0, startDate: isoDate("2027-01-31") });
    const due1 = edate(future.startDate, 1);
    expect(rateAt(due1, future, assumptions).toString()).toBe(RESET.toString());
    expect(rateAt(due1, future, shocked(1)).toString()).toBe(
      RESET.plus("0.02").toString(),
    );
    const after = edate(future.startDate, 13);
    expect(rateAt(after, future, shocked(1)).toString()).toBe(RESET.toString());
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

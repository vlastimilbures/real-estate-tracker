// ADR 0116 §7: the maturity in force of a block, after its prepayments and recasts —
// what the Scenarios rate-shock reach reads instead of the contract term.
import { describe, it, expect } from "vitest";
import { money, rate } from "../brands";
import { edate, isoDate } from "../dates";
import { termMonths } from "../amortization";
import { effectiveMaturity } from "../schedule";
import type { MortgageBlock } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { devBlock } from "./support/mixed";

const seedJavorova = portfolio.mortgages.find(
  (m) => m.propertyId === "javorova",
);
if (!seedJavorova) throw new Error("seed block missing");
const javorova: MortgageBlock = seedJavorova;
const day = (d: Date) => d.toISOString().slice(0, 10);

describe("ADR 0116: effective maturity", () => {
  it("is the contract maturity without events", () => {
    expect(day(effectiveMaturity(javorova, assumptions))).toBe(
      day(edate(javorova.startDate, termMonths(javorova))),
    );
    const dev = { ...devBlock, id: "m-dev" } as MortgageBlock;
    expect(day(effectiveMaturity(dev, assumptions))).toBe("2056-03-01");
  });

  it("is the schedule's payoff when the instalment beats the entered term", () => {
    // 30-year term, but 12,000 Kč a month repays 1M at 3 % in 94 payments.
    const fast = {
      id: "fast",
      propertyId: "p",
      startDate: isoDate("2020-01-10"),
      initialPrincipal: money(1000000),
      fixationYears: 10,
      interestRatePa: rate("0.03"),
      monthlyInstalment: money(12000),
      loanTermYears: 30,
    } as MortgageBlock;
    expect(day(effectiveMaturity(fast, assumptions))).toBe("2027-11-10");
  });

  it("moves to the shortened term (ADR 0109 example: 2043-03-17)", () => {
    const b = {
      ...javorova,
      prepayments: [
        {
          date: isoDate("2031-01-17"),
          amount: money(500000),
          effect: "shortenTerm" as const,
        },
      ],
    } as MortgageBlock;
    expect(day(effectiveMaturity(b, assumptions))).toBe("2043-03-17");
  });

  it("follows a maturity recast", () => {
    const b = {
      ...javorova,
      recasts: [
        { date: isoDate("2031-01-17"), maturity: isoDate("2045-01-17") },
      ],
    } as MortgageBlock;
    expect(day(effectiveMaturity(b, assumptions))).toBe("2045-01-17");
  });

  it("ends at a prepayment that repays the loan", () => {
    const b = {
      ...javorova,
      prepayments: [
        {
          date: isoDate("2028-02-01"),
          amount: money(5000000),
          effect: "lowerInstalment" as const,
        },
      ],
    } as MortgageBlock;
    expect(day(effectiveMaturity(b, assumptions))).toBe("2028-02-17");
  });

  it("ignores events dated after the successor's start", () => {
    const b = {
      ...javorova,
      prepayments: [
        {
          date: isoDate("2033-02-01"),
          amount: money(5000000),
          effect: "lowerInstalment" as const,
        },
      ],
    } as MortgageBlock;
    const next = {
      id: "refi",
      propertyId: javorova.propertyId,
      startDate: isoDate("2033-01-17"),
      initialPrincipal: money(900000),
      fixationYears: 5,
      interestRatePa: rate("0.039"),
      monthlyInstalment: money(9800),
    } as MortgageBlock;
    expect(day(effectiveMaturity(b, assumptions, next))).toBe(
      day(edate(javorova.startDate, termMonths(javorova))),
    );
  });
});

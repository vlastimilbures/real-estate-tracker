// ADR 0235: a plain loan whose instalment cannot repay it by its explicit term opens at
// the balance its payments leave as scheduled (the replay), not at the closed form's.
// The two odd cases the owner accepted on 2026-11-18 (#449, option A).
import { describe, it, expect } from "vitest";
import { D } from "../../lib/money";
import { money, rate } from "./../brands";
import { isoDate } from "../dates";
import { buildSchedule, openingBalance } from "../schedule";
import type { MortgageBlock } from "../types";
import { assumptions as A0 } from "./support/seed";
import { referenceBalanceAt } from "./reference/mortgageReference";
import { mortgageBlock } from "../loanBlock";

const block = (b: Partial<MortgageBlock>): MortgageBlock =>
  mortgageBlock({
    id: "x",
    propertyId: "javorova",
    startDate: isoDate("2021-01-17"),
    initialPrincipal: money("2000000"),
    fixationYears: 10,
    interestRatePa: rate("0.05"),
    monthlyInstalment: money("10000"),
    loanTermYears: 20,
    ...b,
  });

const sumPrincipal = (b: MortgageBlock) =>
  buildSchedule(b, A0).reduce((s, r) => s.plus(r.principal), D(0));

describe("ADR 0235 case A: an explicit term, an instalment at or below the interest", () => {
  // 2,000,000 Kč at 5 %: the month's interest is 8,333.33 Kč, the instalment 8,000 Kč.
  const loan = block({ monthlyInstalment: money("8000") });

  it("opens at the principal: no payment so far repaid any principal", () => {
    // The closed form added the unpaid interest: 2,024,390.56… Kč.
    expect(openingBalance(loan, A0).toString()).toBe("2000000");
  });

  it("repays the opening balance over the horizon", () => {
    // Exact up to the 40th significant digit of the Decimal sums.
    expect(sumPrincipal(loan).minus(2_000_000).abs().toNumber()).toBeLessThan(
      1e-20,
    );
  });

  it("an instalment equal to the interest opens at the principal too", () => {
    // The month's interest exactly as the engine computes it, to 40 digits.
    const interest = D("2000000").times(D("0.05").div(12));
    const equal = block({ monthlyInstalment: money(interest.toString()) });
    expect(openingBalance(equal, A0).toString()).toBe("2000000");
  });
});

describe("ADR 0235 case B: an instalment too small for the term, viewed after maturity", () => {
  // 2,000,000 Kč over 10 years at 4.5 % (the seed's reset rate, so every payment so
  // far was at the original rate) with 10,000 Kč a month: the payment at maturity
  // (2024-01-15) clears the balance (D-40, ADR 0021).
  const loan = block({
    startDate: isoDate("2014-01-15"),
    interestRatePa: rate("0.045"),
    loanTermYears: 10,
  });

  it("opens at 0, as the reference model's replay does", () => {
    // The closed form kept a residual of 1,506,577.51… Kč and paid it in month 1.
    expect(openingBalance(loan, A0).toString()).toBe("0");
    expect(
      referenceBalanceAt(
        {
          start: "2014-01-15",
          principal: "2000000",
          ratePa: "0.045",
          instalment: "10000",
          fixationMonths: 120,
          termMonths: 120,
        },
        { resetRatePa: "0.045" },
        "2026-06-07",
      ).toString(),
    ).toBe("0");
  });

  it("has no debt service after maturity", () => {
    expect(sumPrincipal(loan).toString()).toBe("0");
    expect(buildSchedule(loan, A0).every((r) => r.instalment.isZero())).toBe(
      true,
    );
  });
});

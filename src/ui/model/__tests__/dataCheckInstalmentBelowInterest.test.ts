// ADR 0264 §4: a stored plain loan with a term whose instalment is at or below its first
// month's interest is a "needs attention" finding. It is a stored value, listed at any
// as-of date, for every stored block that fails, replaced past blocks included (owner,
// 2026-11-26). The interest comes from the engine.
import { describe, it, expect } from "vitest";
import {
  edate,
  isoDate,
  money,
  rate,
  type MortgageBlock,
  type Portfolio,
  mortgageBlock,
} from "../../../engine";
import {
  BASE_DATE,
  assumptions,
  portfolio,
} from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { fmtCzk } from "../../../lib/format";
import {
  dashboardDataCheck,
  findingFix,
  propertyDataCheck,
  type DataFinding,
} from "../dataCheck";
import { dataCheckGroups, findingText } from "../dataCheckText";

const resetRate = assumptions.postFixationResetRatePa;

/** A Dubova refinance from 2027-03-12: 3,000,000 Kč at 5 % (first interest 12,500 Kč),
 *  a 30-year term, instalment 1,000 Kč. */
const fields = {
  id: "m-below",
  propertyId: "dubova",
  startDate: isoDate("2027-03-12"),
  initialPrincipal: money("3000000"),
  fixationYears: 3,
  interestRatePa: rate("0.05"),
  monthlyInstalment: money("1000"),
  loanTermYears: 30,
};
const below: MortgageBlock = mortgageBlock(fields);
const withBlocks = (...blocks: MortgageBlock[]): Portfolio => ({
  ...portfolio,
  mortgages: [...portfolio.mortgages, ...blocks],
});
function attention(p: Portfolio, asOf: Date = BASE_DATE) {
  const dubova = p.properties.find((x) => x.id === "dubova")!;
  return propertyDataCheck(dubova, p, asOf, BASE_DATE).attention.filter(
    (f) => f.kind === "instalmentBelowInterest",
  );
}
/** A finding as plain values, for comparing. */
const plain = (f: DataFinding) =>
  f.kind === "instalmentBelowInterest"
    ? {
        loanStart: f.loanStart.toISOString().slice(0, 10),
        instalment: f.instalment.toFixed(),
        interest: f.interest.toFixed(),
      }
    : f;

describe("the Data check lists a stored loan below its first interest (ADR 0264)", () => {
  it("needs attention, with the start date, the instalment and the interest", () => {
    expect(attention(withBlocks(below)).map(plain)).toEqual([
      { loanStart: "2027-03-12", instalment: "1000", interest: "12500" },
    ]);
  });

  it("is listed at an as-of date before and after the block's start", () => {
    for (const asOf of [BASE_DATE, isoDate("2035-01-01")])
      expect(attention(withBlocks(below), asOf).map(plain)).toEqual([
        { loanStart: "2027-03-12", instalment: "1000", interest: "12500" },
      ]);
  });

  it("is listed for a replaced past block", () => {
    const later: MortgageBlock = {
      ...below,
      id: "m-later",
      startDate: isoDate("2029-03-12"),
      monthlyInstalment: money("16200"),
    };
    expect(
      attention(withBlocks(below, later), isoDate("2032-01-01")).map(plain),
    ).toEqual([
      { loanStart: "2027-03-12", instalment: "1000", interest: "12500" },
    ]);
  });

  it("is absent for the sample portfolio and for a development loan", () => {
    expect(attention(portfolio)).toEqual([]);
    expect(
      attention(
        withBlocks(
          mortgageBlock({
            ...fields,
            completionDate: edate(fields.startDate, 12),
          }),
        ),
      ),
    ).toEqual([]);
  });

  it("links to Financing and says what to do", () => {
    const [f] = attention(withBlocks(below));
    expect(findingFix(f!)).toBe("financing");
    expect(findingText(en, f!, resetRate)).toBe(
      `Mortgage from 12.03.2027: the instalment ${fmtCzk(money("1000"))} does not cover the first month's interest ${fmtCzk(money("12500"))}. The figures leave the unpaid interest out until the next rate reset. Raise the instalment to save this loan again.`,
    );
    // Its own line, as the sentence holds the loan's values.
    const [g] = dataCheckGroups(
      en,
      [{ propertyId: "dubova", name: "Byt Dubova", finding: f! }],
      resetRate,
    );
    expect(g!.headline).toBe(findingText(en, f!, resetRate));
    expect(g!.chips[0]!.detail).toBeNull();
  });

  it("words a 0 % loan with a 0 Kč instalment by its own code", () => {
    const zero: MortgageBlock = {
      ...below,
      interestRatePa: rate("0"),
      monthlyInstalment: money("0"),
    };
    const [f] = attention(withBlocks(zero));
    expect(f).toMatchObject({ code: "ZERO_RATE_ZERO_INSTALMENT" });
    expect(findingFix(f!)).toBe("financing");
    expect(findingText(en, f!, resetRate)).toBe(
      "Mortgage from 12.03.2027: an interest-free loan with a term needs an instalment above 0 Kč. Raise the instalment to save this loan again.",
    );
    expect(findingText(cs, f!, resetRate)).toBe(
      cs.dataCheck.zeroRateZeroInstalment("12.03.2027"),
    );
    expect(findingText(ru, f!, resetRate)).toBe(
      ru.dataCheck.zeroRateZeroInstalment("12.03.2027"),
    );
    const [g] = attention(withBlocks(below));
    expect(g).toMatchObject({ code: "INSTALMENT_BELOW_INTEREST" });
  });

  it("adds one to the Dashboard's review count", () => {
    const count = (p: Portfolio) =>
      dashboardDataCheck(p, BASE_DATE, BASE_DATE, 30).attention.length;
    expect(count(withBlocks(below))).toBe(count(portfolio) + 1);
  });
});

// #484: the record panels' rules, out of the components: one property's rows and the
// development summary of the mortgage table (ADR 0167).
import { describe, expect, it } from "vitest";
import { money } from "../../../engine";
import { devBlock } from "../../../engine/__tests__/support/mixed";
import { portfolio } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { fmtCzk } from "../../../lib/format";
import { developmentSummary, propertyRecords } from "../propertyRecords";

const pd = en.propertyDetail;

describe("propertyRecords", () => {
  it("picks one property's rows; nothing before a portfolio loads", () => {
    const loan = portfolio.mortgages[0]!;
    const r = propertyRecords(portfolio, loan.propertyId);
    expect(r.mortgages).toEqual([loan]);
    expect(r.valuations.every((v) => v.propertyId === loan.propertyId)).toBe(
      true,
    );
    expect(r.valuations).toHaveLength(1);
    expect(r.leases).toHaveLength(1);
    expect(r.holding?.propertyId).toBe(loan.propertyId);
    expect(propertyRecords(null, loan.propertyId)).toEqual({
      valuations: [],
      leases: [],
      mortgages: [],
      holding: undefined,
    });
  });
});

describe("developmentSummary (ADR 0167)", () => {
  it("names the tranches, the total loan and the interest-only end", () => {
    expect(developmentSummary(en, devBlock)).toBe(
      [
        pd.tranches(2),
        pd.totalLoan(fmtCzk(money(4500000))),
        pd.ioUntil("20.08.2027"),
      ].join(" · "),
    );
  });

  it("is a dash for a standard loan", () => {
    expect(developmentSummary(en, portfolio.mortgages[0]!)).toBe("—");
  });
});

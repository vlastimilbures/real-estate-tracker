// #484: the record panels' rules, out of the components: the development summary of the
// mortgage table (ADR 0167) and the valuation an added one closes (ADR 0227, 0144).
import { describe, expect, it } from "vitest";
import { isoDate, money, type Valuation } from "../../../engine";
import { devBlock } from "../../../engine/__tests__/support/mixed";
import { portfolio } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { fmtCzk } from "../../../lib/format";
import { developmentSummary, valuationClosedBy } from "../propertyRecords";

const pd = en.propertyDetail;

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

describe("valuationClosedBy (ADR 0227)", () => {
  const open: Valuation = {
    id: "v1",
    propertyId: "p",
    validFrom: isoDate("2024-01-01"),
    marketValue: money(100),
  };
  const added: Valuation = {
    id: "v2",
    propertyId: "p",
    validFrom: isoDate("2026-03-01"),
    marketValue: money(200),
  };

  it("an open-ended new valuation ends the open one before it the day before", () => {
    expect(valuationClosedBy([open], added)).toEqual({
      ...open,
      validTo: isoDate("2026-02-28"),
    });
  });

  it("a dated one closes nothing (ADR 0144)", () => {
    expect(
      valuationClosedBy([open], { ...added, validTo: isoDate("2026-12-31") }),
    ).toBeUndefined();
  });

  it("nothing to close: another property's, or none open", () => {
    expect(
      valuationClosedBy([{ ...open, propertyId: "q" }], added),
    ).toBeUndefined();
    expect(valuationClosedBy([], added)).toBeUndefined();
  });
});

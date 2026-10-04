// ADR 0118 (#35): the data check's findings (stale, missing and defaulted inputs) at an
// explicit as-of date, from the engine's own selectors.
import { describe, it, expect } from "vitest";
import {
  edate,
  isoDate,
  money,
  rate,
  type IsoDate,
  type MortgageBlock,
  type Portfolio,
} from "../../../engine";
import {
  BASE_DATE,
  assumptions,
  portfolio,
} from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { fmtCzk } from "../../../lib/format";
import {
  LEASE_ENDING_MONTHS,
  VALUATION_STALE_MONTHS,
  findingFix,
  findingText,
  portfolioDataCheck,
  propertyDataCheck,
  type DataFinding,
} from "../dataCheck";
import { loanWarningText } from "../propertyDetail";

function check(id: string, asOf: Date = BASE_DATE, p: Portfolio = portfolio) {
  const property = p.properties.find((x) => x.id === id);
  if (!property) throw new Error(`no property ${id}`);
  return propertyDataCheck(property, p, asOf);
}

function block(id: string): MortgageBlock {
  const b = portfolio.mortgages.find((x) => x.id === id);
  if (!b) throw new Error(`no block ${id}`);
  return b;
}

const kinds = (fs: DataFinding[]) => fs.map((f) => f.kind);

const without = (p: Portfolio, ids: string[]): Portfolio => ({
  ...p,
  valuations: p.valuations.filter((v) => !ids.includes(v.id)),
  leases: p.leases.filter((l) => !ids.includes(l.id)),
  holdingCosts: p.holdingCosts.filter((h) => !ids.includes(h.id)),
});

const javorovaPrice = portfolio.properties[0].purchasePrice;

describe("data check thresholds (ADR 0118)", () => {
  it("are 12 months for a valuation and 3 months for a lease end", () => {
    expect(VALUATION_STALE_MONTHS).toBe(12);
    expect(LEASE_ENDING_MONTHS).toBe(3);
  });
});

describe("data check: valuation (ADR 0118)", () => {
  // Javorova's valuation is dated 2026-06-01.
  it("a valuation exactly 12 months old is not stale; one day older is", () => {
    expect(check("javorova", isoDate("2027-06-01")).attention).toEqual([]);
    expect(check("javorova", isoDate("2027-06-02")).attention).toEqual([
      {
        kind: "valuationStale",
        validFrom: isoDate("2026-06-01"),
        months: 12,
      },
    ]);
    expect(check("javorova", isoDate("2028-08-15")).attention).toEqual([
      {
        kind: "valuationStale",
        validFrom: isoDate("2026-06-01"),
        months: 26,
      },
    ]);
  });

  it("no valuation: the purchase price stands in", () => {
    const p = without(portfolio, ["v-javorova"]);
    expect(check("javorova", BASE_DATE, p).attention).toEqual([
      { kind: "noValuation", purchasePrice: javorovaPrice },
    ]);
  });

  it("an expired valuation counts as none, as in the engine", () => {
    const p: Portfolio = {
      ...without(portfolio, ["v-javorova"]),
      valuations: [
        {
          id: "v-old",
          propertyId: "javorova",
          validFrom: isoDate("2025-01-01"),
          validTo: isoDate("2026-01-01"),
          marketValue: money("9000000"),
        },
      ],
    };
    expect(kinds(check("javorova", BASE_DATE, p).attention)).toEqual([
      "noValuation",
    ]);
  });

  it("a valuation that only starts later is used by the engine and not flagged", () => {
    const p: Portfolio = {
      ...portfolio,
      valuations: [
        {
          id: "v-later",
          propertyId: "javorova",
          validFrom: isoDate("2026-09-01"),
          marketValue: money("10500000"),
        },
      ],
    };
    expect(check("javorova", BASE_DATE, p).attention).toEqual([]);
  });

  it("a fresh valuation resolves the stale finding", () => {
    const asOf = isoDate("2027-09-01");
    expect(kinds(check("javorova", asOf).attention)).toEqual([
      "valuationStale",
    ]);
    const p: Portfolio = {
      ...portfolio,
      valuations: [
        ...portfolio.valuations,
        {
          id: "v-new",
          propertyId: "javorova",
          validFrom: isoDate("2027-08-01"),
          marketValue: money("10600000"),
        },
      ],
    };
    expect(check("javorova", asOf, p).attention).toEqual([]);
  });
});

describe("data check: lease (ADR 0118)", () => {
  // Lipova's first lease ends 2026-08-30; without the second there is no follow-on.
  const noFollowOn = without(portfolio, ["l-lipova-2"]);

  it("no lease in force: rent counts as 0; a lease resolves it", () => {
    const p = without(portfolio, ["l-javorova"]);
    expect(check("javorova", BASE_DATE, p).attention).toEqual([
      { kind: "noLease", asOf: BASE_DATE },
    ]);
    const leased: Portfolio = {
      ...p,
      leases: [
        ...p.leases,
        {
          id: "l-new",
          propertyId: "javorova",
          startDate: isoDate("2026-01-01"),
          monthlyRent: money("27000"),
        },
      ],
    };
    expect(check("javorova", BASE_DATE, leased).attention).toEqual([]);
  });

  it("a lease ending on the as-of date is flagged; the day after it is no lease", () => {
    const end = isoDate("2026-08-30");
    expect(check("lipova", end, noFollowOn).attention).toEqual([
      { kind: "leaseEnding", endDate: end },
    ]);
    expect(
      check("lipova", isoDate("2026-08-31"), noFollowOn).attention,
    ).toEqual([{ kind: "noLease", asOf: isoDate("2026-08-31") }]);
  });

  it("a lease ending exactly 3 months after the as-of date is flagged; one day later is not", () => {
    const ending = (endDate: IsoDate): Portfolio => ({
      ...noFollowOn,
      leases: noFollowOn.leases.map((l) =>
        l.id === "l-lipova-1" ? { ...l, endDate } : l,
      ),
    });
    const edge = edate(BASE_DATE, 3); // 2026-09-07
    expect(check("lipova", BASE_DATE, ending(edge)).attention).toEqual([
      { kind: "leaseEnding", endDate: edge },
    ]);
    expect(
      check("lipova", BASE_DATE, ending(isoDate("2026-09-08"))).attention,
    ).toEqual([]);
  });

  it("a lease followed by a later lease is not flagged", () => {
    expect(check("lipova").attention).toEqual([]);
    expect(kinds(check("lipova", BASE_DATE, noFollowOn).attention)).toEqual([
      "leaseEnding",
    ]);
  });
});

describe("data check: fixation (ADR 0118)", () => {
  // Lipova's 7-year fixation from 2022-01-15 ends 2029-01-15.
  it("a fixation that ended with no follow-on block is flagged from its end date", () => {
    expect(
      kinds(check("lipova", isoDate("2029-01-14")).attention),
    ).not.toContain("fixationEnded");
    const { attention } = check("lipova", isoDate("2029-01-15"));
    expect(kinds(attention)).toEqual(["valuationStale", "fixationEnded"]);
    expect(attention).toContainEqual({
      kind: "fixationEnded",
      block: block("m-lipova"),
      fixationEnd: isoDate("2029-01-15"),
    });
  });

  it("a follow-on block resolves it", () => {
    const p: Portfolio = {
      ...portfolio,
      mortgages: [
        ...portfolio.mortgages,
        {
          id: "m-lipova-2",
          propertyId: "lipova",
          startDate: isoDate("2029-01-15"),
          initialPrincipal: money("4300000"),
          fixationYears: 5,
          interestRatePa: rate("0.049"),
          monthlyInstalment: money("27500"),
        },
      ],
    };
    expect(
      kinds(check("lipova", isoDate("2029-02-01"), p).attention),
    ).not.toContain("fixationEnded");
  });
});

describe("data check: portfolio defaults (ADR 0118)", () => {
  it("no own growth: the portfolio appreciation and rent indexation apply", () => {
    expect(check("javorova").defaults).toEqual([
      { kind: "growthDefault", appreciation: true, rentIndexation: true },
    ]);
  });

  it("an own appreciation leaves only rent indexation; both own leave none", () => {
    const own = (overrides: object): Portfolio => ({
      ...portfolio,
      properties: portfolio.properties.map((x) =>
        x.id === "javorova" ? { ...x, ...overrides } : x,
      ),
    });
    expect(
      check(
        "javorova",
        BASE_DATE,
        own({ appreciationOverridePa: rate("0.05") }),
      ).defaults,
    ).toEqual([
      { kind: "growthDefault", appreciation: false, rentIndexation: true },
    ]);
    expect(
      check("javorova", BASE_DATE, own({ rentIndexOverridePa: rate("0.02") }))
        .defaults,
    ).toEqual([
      { kind: "growthDefault", appreciation: true, rentIndexation: false },
    ]);
    expect(
      check(
        "javorova",
        BASE_DATE,
        own({
          appreciationOverridePa: rate("0.05"),
          rentIndexOverridePa: rate("0.02"),
        }),
      ).defaults,
    ).toEqual([]);
  });

  it("holding costs: no row lists every field; blank fields are listed; a full row none", () => {
    const none = without(portfolio, ["hc-javorova"]);
    expect(check("javorova", BASE_DATE, none).defaults).toContainEqual({
      kind: "costDefaults",
      fields: [
        "propertyTaxYr",
        "insuranceYr",
        "svjMonthly",
        "otherYr",
        "mgmtPctRent",
        "maintPctRent",
      ],
    });
    const partial: Portfolio = {
      ...portfolio,
      holdingCosts: portfolio.holdingCosts.map((h) =>
        h.id === "hc-javorova"
          ? { ...h, svjMonthly: undefined, otherYr: undefined }
          : h,
      ),
    };
    expect(check("javorova", BASE_DATE, partial).defaults).toContainEqual({
      kind: "costDefaults",
      fields: ["svjMonthly", "otherYr"],
    });
    expect(kinds(check("javorova").defaults)).not.toContain("costDefaults");
  });

  it("the first holding-cost row wins, as in the engine", () => {
    const p: Portfolio = {
      ...portfolio,
      holdingCosts: [
        { id: "hc-blank", propertyId: "javorova" },
        ...portfolio.holdingCosts,
      ],
    };
    expect(kinds(check("javorova", BASE_DATE, p).defaults)).toContain(
      "costDefaults",
    );
  });
});

describe("data check: scope (ADR 0118)", () => {
  const future: Portfolio = {
    ...portfolio,
    properties: [
      ...portfolio.properties,
      {
        id: "future",
        name: "Byt Future",
        purchaseDate: isoDate("2027-01-01"),
        purchasePrice: money("5000000"),
      },
    ],
  };

  it("a property bought after the as-of date has no findings until its purchase date", () => {
    expect(check("future", BASE_DATE, future)).toEqual({
      attention: [],
      defaults: [],
    });
    const onPurchase = check("future", isoDate("2027-01-01"), future);
    expect(kinds(onPurchase.attention)).toEqual(["noValuation", "noLease"]);
    expect(kinds(onPurchase.defaults)).toEqual([
      "growthDefault",
      "costDefaults",
    ]);
    expect(
      portfolioDataCheck(future, BASE_DATE).map((c) => c.propertyId),
    ).toEqual(["javorova", "lipova", "dubova"]);
  });

  it("the portfolio check leaves out inactive properties and those with no finding", () => {
    const p: Portfolio = {
      ...portfolio,
      properties: portfolio.properties.map((x) =>
        x.id === "dubova"
          ? { ...x, active: false }
          : x.id === "lipova"
            ? {
                ...x,
                appreciationOverridePa: rate("0.05"),
                rentIndexOverridePa: rate("0.02"),
              }
            : x,
      ),
    };
    expect(portfolioDataCheck(p, BASE_DATE).map((c) => c.propertyId)).toEqual([
      "javorova",
    ]);
  });
});

describe("data check: the sample portfolio (ADR 0118)", () => {
  const growth: DataFinding = {
    kind: "growthDefault",
    appreciation: true,
    rentIndexation: true,
  };

  it("at the base date nothing needs attention; all three use the portfolio growth", () => {
    expect(portfolioDataCheck(portfolio, BASE_DATE)).toEqual([
      {
        propertyId: "javorova",
        name: "Byt Javorova",
        attention: [],
        defaults: [growth],
      },
      {
        propertyId: "lipova",
        name: "Byt Lipova",
        attention: [],
        defaults: [growth],
      },
      {
        propertyId: "dubova",
        name: "Byt Dubova",
        attention: [],
        defaults: [growth],
      },
    ]);
  });

  it("five years on, every valuation is stale and every fixation has ended", () => {
    const asOf = edate(BASE_DATE, 60); // 2031-06-07
    const checks = portfolioDataCheck(portfolio, asOf);
    expect(checks.map((c) => [c.propertyId, kinds(c.attention)])).toEqual([
      ["javorova", ["valuationStale", "fixationEnded"]],
      ["lipova", ["valuationStale", "fixationEnded"]],
      ["dubova", ["valuationStale", "fixationEnded"]],
    ]);
    expect(checks[0].attention[0]).toEqual({
      kind: "valuationStale",
      validFrom: isoDate("2026-06-01"),
      months: 60,
    });
  });
});

describe("data check: text and fix (ADR 0118)", () => {
  const resetRate = assumptions.postFixationResetRatePa;
  const text = (f: DataFinding) => findingText(en, f, resetRate);
  const fixation: DataFinding = {
    kind: "fixationEnded",
    block: block("m-lipova"),
    fixationEnd: isoDate("2029-01-15"),
  };

  it("states each finding's effect in the user's language", () => {
    expect(
      text({
        kind: "valuationStale",
        validFrom: isoDate("2024-08-01"),
        months: 26,
      }),
    ).toBe(
      "The latest valuation is 26 months old (01.08.2024). Value, equity and LTV rest on it and the appreciation assumption.",
    );
    expect(text({ kind: "noValuation", purchasePrice: javorovaPrice })).toBe(
      `No valuation is entered, so the purchase price of ${fmtCzk(javorovaPrice)} stands in as the market value.`,
    );
    expect(text({ kind: "noLease", asOf: BASE_DATE })).toBe(
      "No lease is in force on 07.06.2026, so rent counts as 0.",
    );
    expect(text({ kind: "leaseEnding", endDate: isoDate("2026-08-30") })).toBe(
      "The lease ends on 30.08.2026 and no next lease is entered. The projection assumes it is renewed.",
    );
    expect(text(fixation)).toBe(loanWarningText(en, fixation, resetRate));
    expect(
      text({ kind: "growthDefault", appreciation: true, rentIndexation: true }),
    ).toBe("Uses the portfolio appreciation and rent indexation.");
    expect(
      text({
        kind: "growthDefault",
        appreciation: true,
        rentIndexation: false,
      }),
    ).toBe("Uses the portfolio appreciation.");
    expect(
      text({
        kind: "growthDefault",
        appreciation: false,
        rentIndexation: true,
      }),
    ).toBe("Uses the portfolio rent indexation.");
    expect(
      text({ kind: "costDefaults", fields: ["svjMonthly", "otherYr"] }),
    ).toBe("Holding costs use the portfolio defaults for: SVJ /mo, Other /yr.");
  });

  it("links each finding to the place that fixes it", () => {
    expect(findingFix({ kind: "noLease", asOf: BASE_DATE })).toBe("records");
    expect(
      findingFix({ kind: "noValuation", purchasePrice: javorovaPrice }),
    ).toBe("records");
    expect(
      findingFix({
        kind: "valuationStale",
        validFrom: BASE_DATE,
        months: 13,
      }),
    ).toBe("records");
    expect(findingFix({ kind: "leaseEnding", endDate: BASE_DATE })).toBe(
      "records",
    );
    expect(findingFix(fixation)).toBe("financing");
    expect(findingFix({ kind: "costDefaults", fields: ["otherYr"] })).toBe(
      "holding",
    );
    expect(
      findingFix({
        kind: "growthDefault",
        appreciation: true,
        rentIndexation: true,
      }),
    ).toBe("edit");
  });
});

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
  dataCheckItems,
  findingFix,
  findingText,
  fixLabel,
  propertyDataCheck,
  type DataFinding,
} from "../dataCheck";
import { loanWarningText } from "../propertyDetail";

function check(id: string, asOf: Date = BASE_DATE, p: Portfolio = portfolio) {
  const property = p.properties.find((x) => x.id === id);
  if (!property) throw new Error(`no property ${id}`);
  return propertyDataCheck(property, p, asOf, BASE_DATE);
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
      { kind: "noValuation", purchasePrice: javorovaPrice, asOf: BASE_DATE },
    ]);
  });

  it("an expired valuation stays in use, as in the engine: stale, not none (ADR 0122)", () => {
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
    expect(check("javorova", BASE_DATE, p).attention).toEqual([
      {
        kind: "valuationStale",
        validFrom: isoDate("2025-01-01"),
        months: 17,
      },
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

  it("a lease ending on the as-of date is flagged; after it, that it ended", () => {
    const end = isoDate("2026-08-30");
    expect(check("lipova", end, noFollowOn).attention).toEqual([
      { kind: "leaseEnding", endDate: end },
    ]);
    // The projection keeps renting the last lease, so this is not "rent counts as 0".
    expect(
      check("lipova", isoDate("2026-08-31"), noFollowOn).attention,
    ).toEqual([{ kind: "leaseEnded", endDate: end }]);
    expect(
      check("lipova", isoDate("2026-12-07"), noFollowOn).attention,
    ).toEqual([{ kind: "leaseEnded", endDate: end }]);
  });

  it("no lease in force and none the projection renews: rent counts as 0", () => {
    const only = (endDate?: IsoDate): Portfolio => ({
      ...portfolio,
      leases: [
        ...portfolio.leases.filter((l) => l.propertyId !== "javorova"),
        {
          id: "l-only",
          propertyId: "javorova",
          startDate: isoDate("2025-01-01"),
          endDate,
          monthlyRent: money("27000"),
        },
      ],
    });
    // Ended before the base date: the projection does not renew it either.
    expect(
      check("javorova", BASE_DATE, only(isoDate("2026-06-06"))).attention,
    ).toEqual([{ kind: "noLease", asOf: BASE_DATE }]);
    // Ended on the base date: renewed by the projection.
    expect(
      check("javorova", isoDate("2026-06-08"), only(BASE_DATE)).attention,
    ).toEqual([{ kind: "leaseEnded", endDate: BASE_DATE }]);
    // A lease that starts later leaves a gap now: no lease, rent 0 until it starts.
    const later: Portfolio = {
      ...without(portfolio, ["l-javorova"]),
      leases: [
        ...without(portfolio, ["l-javorova"]).leases,
        {
          id: "l-later",
          propertyId: "javorova",
          startDate: isoDate("2026-09-01"),
          monthlyRent: money("27000"),
        },
      ],
    };
    expect(check("javorova", BASE_DATE, later).attention).toEqual([
      { kind: "noLease", asOf: BASE_DATE },
    ]);
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

  it("a block starting after the first floating payment leaves a gap (ADR 0129 §4)", () => {
    const later = (start: string): Portfolio => ({
      ...portfolio,
      mortgages: [
        ...portfolio.mortgages,
        {
          id: "m-lipova-2",
          propertyId: "lipova",
          startDate: isoDate(start),
          initialPrincipal: money("4300000"),
          fixationYears: 5,
          interestRatePa: rate("0.049"),
          monthlyInstalment: money("27500"),
        },
      ],
    });
    const asOf = isoDate("2029-01-20");
    expect(
      kinds(check("lipova", asOf, later("2029-02-15")).attention),
    ).not.toContain("fixationEnded");
    expect(check("lipova", asOf, later("2029-06-15")).attention).toContainEqual(
      {
        kind: "fixationEnded",
        block: block("m-lipova"),
        fixationEnd: isoDate("2029-01-15"),
        until: isoDate("2029-06-15"),
      },
    );
  });
});

describe("data check: portfolio defaults (ADR 0118)", () => {
  // Javorova with own cash recorded, so only the growth findings are left.
  const own = (overrides: object): Portfolio => ({
    ...portfolio,
    properties: portfolio.properties.map((x) =>
      x.id === "javorova"
        ? { ...x, funding: { ownCash: money("2000000") }, ...overrides }
        : x,
    ),
  });

  it("no own growth: the portfolio appreciation and rent indexation apply", () => {
    expect(check("javorova", BASE_DATE, own({})).defaults).toEqual([
      { kind: "growthDefault", appreciation: true, rentIndexation: true },
    ]);
  });

  it("an own appreciation leaves only rent indexation; both own leave none", () => {
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

describe("data check: own cash unknown (ADR 0118, #178)", () => {
  const funded = (funding: object | undefined): Portfolio => ({
    ...portfolio,
    properties: portfolio.properties.map((x) =>
      x.id === "javorova" ? { ...x, funding } : x,
    ),
  });
  const funding = (p: Portfolio) =>
    check("javorova", BASE_DATE, p).defaults.filter(
      (f) => f.kind === "fundingUnknown",
    );

  it("no funding record: listed under the portfolio defaults, not counted", () => {
    const { attention, defaults } = check("javorova");
    expect(defaults).toContainEqual({ kind: "fundingUnknown", future: false });
    expect(kinds(attention)).not.toContain("fundingUnknown");
  });

  it("a record without own cash still lists it: own cash drives Cash invested", () => {
    expect(funding(funded({ note: "from savings" }))).toEqual([
      { kind: "fundingUnknown", future: false },
    ]);
    expect(
      funding(
        funded({
          transactionCosts: money("150000"),
          initialWorks: money("300000"),
        }),
      ),
    ).toEqual([{ kind: "fundingUnknown", future: false }]);
  });

  it("recording own cash resolves it, 0 included", () => {
    expect(funding(funded({ ownCash: money("2500000") }))).toEqual([]);
    expect(funding(funded({ ownCash: money("0") }))).toEqual([]);
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

  it("a property bought after the as-of date has only the own-cash finding until its purchase date", () => {
    // Its own cash is the projection's down payment (ADR 0119), so it is listed early.
    expect(check("future", BASE_DATE, future)).toEqual({
      attention: [],
      defaults: [{ kind: "fundingUnknown", future: true }],
    });
    const onPurchase = check("future", isoDate("2027-01-01"), future);
    expect(kinds(onPurchase.attention)).toEqual(["noValuation", "noLease"]);
    expect(kinds(onPurchase.defaults)).toEqual([
      "growthDefault",
      "costDefaults",
      "fundingUnknown",
    ]);
    expect(onPurchase.defaults).toContainEqual({
      kind: "fundingUnknown",
      future: true,
    });
    expect(
      dataCheckItems(future.properties, future, BASE_DATE, BASE_DATE)
        .defaults.filter((r) => r.propertyId === "future")
        .map((r) => r.finding),
    ).toEqual([{ kind: "fundingUnknown", future: true }]);
    const recorded: Portfolio = {
      ...future,
      properties: future.properties.map((x) =>
        x.id === "future"
          ? { ...x, funding: { ownCash: money("1500000") } }
          : x,
      ),
    };
    expect(check("future", BASE_DATE, recorded)).toEqual({
      attention: [],
      defaults: [],
    });
  });
});

describe("data check: the sample portfolio (ADR 0118)", () => {
  const growth: DataFinding = {
    kind: "growthDefault",
    appreciation: true,
    rentIndexation: true,
  };

  const items = (asOf: Date) =>
    dataCheckItems(portfolio.properties, portfolio, asOf, BASE_DATE);

  const funding: DataFinding = { kind: "fundingUnknown", future: false };

  it("at the base date nothing needs attention; all three use the portfolio growth and have no own cash recorded", () => {
    expect(items(BASE_DATE)).toEqual({
      attention: [],
      defaults: [
        { propertyId: "javorova", name: "Byt Javorova", finding: growth },
        { propertyId: "javorova", name: "Byt Javorova", finding: funding },
        { propertyId: "lipova", name: "Byt Lipova", finding: growth },
        { propertyId: "lipova", name: "Byt Lipova", finding: funding },
        { propertyId: "dubova", name: "Byt Dubova", finding: growth },
        { propertyId: "dubova", name: "Byt Dubova", finding: funding },
      ],
    });
  });

  it("five years on, every valuation is stale and every fixation has ended", () => {
    const { attention, defaults } = items(edate(BASE_DATE, 60)); // 2031-06-07
    expect(defaults).toEqual(items(BASE_DATE).defaults);
    expect(attention.map((r) => `${r.propertyId}:${r.finding.kind}`)).toEqual([
      "javorova:valuationStale",
      "javorova:fixationEnded",
      "lipova:valuationStale",
      "lipova:fixationEnded",
      "dubova:valuationStale",
      "dubova:fixationEnded",
    ]);
    expect(attention[0].finding).toEqual({
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
      "The valuation in use is 26 months old (01.08.2024). Value, equity and LTV rest on it.",
    );
    expect(
      text({
        kind: "noValuation",
        purchasePrice: javorovaPrice,
        asOf: BASE_DATE,
      }),
    ).toBe(
      `No valuation is recorded, so the purchase price of ${fmtCzk(javorovaPrice)} stands in as the market value.`,
    );
    expect(text({ kind: "noLease", asOf: BASE_DATE })).toBe(
      "No lease is in force on 07.06.2026, so rent counts as 0.",
    );
    expect(text({ kind: "leaseEnding", endDate: isoDate("2026-08-30") })).toBe(
      "The lease ends on 30.08.2026 and no next lease is entered. The projection assumes it is renewed.",
    );
    expect(text({ kind: "leaseEnded", endDate: isoDate("2026-08-30") })).toBe(
      "The lease ended on 30.08.2026 and no next lease is entered. The snapshot counts no rent after that date; the projection assumes the lease is renewed.",
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
    expect(text({ kind: "fundingUnknown", future: false })).toBe(
      "Own cash paid at purchase is not recorded, so Cash invested is not known.",
    );
    expect(text({ kind: "fundingUnknown", future: true })).toBe(
      "Own cash for this purchase is not recorded, so Cash invested is not known and the projection derives the down payment: the price less the loan, plus any recorded costs and works.",
    );
  });

  it("links each finding to the place that fixes it", () => {
    expect(findingFix({ kind: "noLease", asOf: BASE_DATE })).toBe("records");
    expect(
      findingFix({
        kind: "noValuation",
        purchasePrice: javorovaPrice,
        asOf: BASE_DATE,
      }),
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
    expect(findingFix({ kind: "leaseEnded", endDate: BASE_DATE })).toBe(
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
    expect(findingFix({ kind: "fundingUnknown", future: false })).toBe(
      "editFunding",
    );
  });

  it("labels the fix link with its section, or the property form", () => {
    expect(fixLabel(en, "records")).toBe("Go to Records");
    expect(fixLabel(en, "financing")).toBe("Go to Financing");
    expect(fixLabel(en, "holding")).toBe("Go to Holding costs");
    expect(fixLabel(en, "edit")).toBe("Edit property");
    expect(fixLabel(en, "editFunding")).toBe("Record funding");
  });
});

describe("data check lists (ADR 0118)", () => {
  it("lists every property's findings by group, each row with its property", () => {
    const asOf = isoDate("2029-01-15");
    const p = without(portfolio, ["v-dubova"]);
    const lists = dataCheckItems(p.properties, p, asOf, BASE_DATE);
    expect(
      lists.attention.map((r) => `${r.propertyId}:${r.finding.kind}`),
    ).toEqual([
      "javorova:valuationStale",
      "lipova:valuationStale",
      "lipova:fixationEnded",
      "dubova:noValuation",
    ]);
    expect(
      lists.defaults.map((r) => `${r.propertyId}:${r.finding.kind}`),
    ).toEqual([
      "javorova:growthDefault",
      "javorova:fundingUnknown",
      "lipova:growthDefault",
      "lipova:fundingUnknown",
      "dubova:growthDefault",
      "dubova:fundingUnknown",
    ]);
    expect(dataCheckItems([], p, asOf, BASE_DATE)).toEqual({
      attention: [],
      defaults: [],
    });
  });
});

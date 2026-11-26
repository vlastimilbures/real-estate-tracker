// ADR 0206 (#378): the Dashboard Data check groups its findings by problem, one chip per
// property with that property's detail; portfolio rows first.
import { describe, it, expect } from "vitest";
import { edate, isoDate, type Portfolio } from "../../../engine";
import {
  BASE_DATE,
  assumptions,
  portfolio,
} from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { fmtCzk, fmtDate, fmtPct } from "../../../lib/format";
import { dashboardDataCheck, type DataCheckItem } from "../dataCheck";
import { dataCheckGroups, findingText } from "../dataCheckText";

const d = en.dataCheck;
const resetRate = assumptions.postFixationResetRatePa;
const check = (p: Portfolio, asOf: Date, horizonYears = 30, base = BASE_DATE) =>
  dashboardDataCheck(p, { asOf, baseDate: base, horizonYears });
const fiveYears = edate(BASE_DATE, 60); // 07.06.2031

describe("dashboardDataCheck (ADR 0206)", () => {
  it("lists the active properties' findings, the portfolio's own rows first", () => {
    const p: Portfolio = {
      ...portfolio,
      properties: portfolio.properties.map((x) =>
        x.id === "dubova" ? { ...x, active: false } : x,
      ),
    };
    const { attention, defaults } = check(p, fiveYears, 150);
    expect(attention[0]).toMatchObject({ propertyId: null, name: null });
    expect(attention.slice(1).map((r) => r.propertyId)).toEqual([
      "javorova",
      "javorova",
      "lipova",
      "lipova",
    ]);
    expect(defaults.map((r) => r.propertyId)).not.toContain("dubova");
  });
});

describe("dataCheckGroups (ADR 0206 §4)", () => {
  it("the sample at +5 years: two attention lines and two default lines, a chip per property", () => {
    const { attention, defaults } = check(portfolio, fiveYears);
    const a = dataCheckGroups(en, attention, resetRate);
    expect(a.map((g) => g.headline)).toEqual([
      d.valuationStaleGroup("12", 12),
      d.fixationEndedGroup(fmtPct(resetRate)),
    ]);
    const months = en.propertyDetail.monthsCount(60);
    expect(a[0].chips).toEqual([
      {
        propertyId: "javorova",
        name: "Byt Javorova",
        detail: `${months} · 01.06.2026`,
        fix: "records",
      },
      {
        propertyId: "lipova",
        name: "Byt Lipova",
        detail: `${months} · 01.06.2026`,
        fix: "records",
      },
      {
        propertyId: "dubova",
        name: "Byt Dubova",
        detail: `${months} · 01.06.2026`,
        fix: "records",
      },
    ]);
    expect(a[1].chips.map((c) => [c.name, c.detail, c.fix])).toEqual([
      ["Byt Javorova", "17.01.2031", "financing"],
      ["Byt Lipova", "15.01.2029", "financing"],
      ["Byt Dubova", "12.03.2031", "financing"],
    ]);
    const def = dataCheckGroups(en, defaults, resetRate);
    expect(def.map((g) => [g.headline, g.chips.length])).toEqual([
      [d.growthBoth, 3],
      [d.fundingUnknown, 3],
    ]);
    expect(def[0].chips.every((c) => c.detail === null)).toBe(true);
    expect(def[1].chips[0].fix).toBe("editFunding");
  });

  it("keeps different sentences on their own lines", () => {
    const p: Portfolio = {
      ...portfolio,
      properties: portfolio.properties.map((x) =>
        x.id === "lipova"
          ? { ...x, rentIndexOverridePa: assumptions.rentIndexationPa }
          : x,
      ),
    };
    const g = dataCheckGroups(en, check(p, BASE_DATE).defaults, resetRate);
    expect(
      g.map((x) => [x.headline, x.chips.map((c) => c.propertyId)]),
    ).toEqual([
      [d.growthBoth, ["javorova", "dubova"]],
      [d.fundingUnknown, ["javorova", "lipova", "dubova"]],
      [d.growthAppreciation, ["lipova"]],
    ]);
  });

  it("a portfolio row comes first with its own sentence; its chip has no property", () => {
    const { attention } = check(portfolio, BASE_DATE, 150);
    const [first] = dataCheckGroups(en, attention, resetRate);
    expect(first.headline).toBe(
      findingText(en, attention[0].finding, resetRate),
    );
    expect(first.chips).toEqual([
      { propertyId: null, name: null, detail: null, fix: "assumptions" },
    ]);
  });

  it("a fixation gap before a later block keeps its own sentence", () => {
    const item: DataCheckItem = {
      propertyId: "lipova",
      name: "Byt Lipova",
      finding: {
        kind: "fixationEnded",
        block: portfolio.mortgages.find((m) => m.id === "m-lipova")!,
        fixationEnd: isoDate("2029-01-15"),
        until: isoDate("2029-06-01"),
      },
    };
    const [g] = dataCheckGroups(en, [item], resetRate);
    expect(g.headline).toBe(findingText(en, item.finding, resetRate));
    expect(g.chips[0].detail).toBeNull();
  });

  it("gives no valuation and lease ends a line each, the property's value on its chip", () => {
    const lipova = portfolio.properties.find((x) => x.id === "lipova")!;
    const item = (finding: DataCheckItem["finding"]): DataCheckItem => ({
      propertyId: lipova.id,
      name: lipova.name,
      finding,
    });
    const g = dataCheckGroups(
      en,
      [
        item({
          kind: "noValuation",
          purchasePrice: lipova.purchasePrice,
          purchaseDate: lipova.purchaseDate,
          asOf: BASE_DATE,
        }),
        item({ kind: "leaseEnded", endDate: isoDate("2026-04-30") }),
        item({ kind: "leaseEnding", endDate: isoDate("2026-08-31") }),
      ],
      resetRate,
    );
    expect(
      g.map((x) => [x.headline, x.chips[0].detail, x.chips[0].fix]),
    ).toEqual([
      [
        d.noValuationGroup,
        `${fmtCzk(lipova.purchasePrice)} · ${fmtDate(lipova.purchaseDate)}`,
        "records",
      ],
      [d.leaseEndedGroup, "30.04.2026", "records"],
      [d.leaseEndingGroup("3", 3), "31.08.2026", "records"],
    ]);
  });

  it("states each grouped problem in every language", () => {
    for (const t of [en, cs, ru]) {
      const { attention } = check(portfolio, fiveYears);
      const g = dataCheckGroups(t, attention, resetRate);
      expect(g.map((x) => x.headline)).toEqual([
        t.dataCheck.valuationStaleGroup("12", 12),
        t.dataCheck.fixationEndedGroup(fmtPct(resetRate)),
      ]);
      expect(g[0].chips[0].detail).toBe(
        `${t.propertyDetail.monthsCount(60)} · 01.06.2026`,
      );
    }
  });
});

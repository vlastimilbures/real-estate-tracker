// ADR 0133 (#129 item 5): with no value the engine gives no LTV (null). The models keep the
// null: no band, no badge, a gap in the charts and a blank Excel cell — never 0 %.
import { describe, it, expect } from "vitest";
import {
  applyScenario,
  cpiIndex,
  portfolioKpis,
  portfolioProjection,
  rate,
  realProjection,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { D } from "../../../lib/money";
import { en } from "../../../i18n/en";
import { ltvBadge, ltvBand, ltvBandWord } from "../health";
import { projectionColumns, projectionSeries } from "../projection";
import { toChartRows } from "../chartData";
import { mergeCompareMetric, type CompareResult } from "../compare";
import { compareWorkbook } from "../compareXlsx";

// A 100 % value crash at the start: Y0 owes 9.5 M Kč on a value of 0.
const crashed = applyScenario(assumptions, {
  valueShock: { pct: rate("1"), atYear: 0 },
});
const projection = portfolioProjection(portfolio, crashed);
const series = projectionSeries(projection, "nominal", crashed);

function result(id: string, assn = assumptions): CompareResult {
  const p = portfolioProjection(portfolio, assn);
  return {
    id,
    name: id,
    projection: p,
    realProjection: realProjection(p, cpiIndex(assn)),
    kpis: portfolioKpis(portfolio, assn),
  };
}

describe("health: no LTV has no band and no badge", () => {
  it("ltvBand / ltvBandWord / ltvBadge of null", () => {
    expect(ltvBand(null)).toBe("neutral");
    expect(ltvBandWord(en, null)).toBeNull();
    expect(ltvBadge(en, null)).toBeUndefined();
  });

  it("ltvBadge of a number is its band and word", () => {
    expect(ltvBadge(en, D("0.33"))).toEqual({
      band: "good",
      text: en.dashboard.badgeConservative,
    });
    expect(ltvBadge(en, D("0.9"))).toEqual({
      band: "bad",
      text: en.dashboard.badgeHigh,
    });
  });
});

describe("projection model keeps the null", () => {
  it("series row and the Excel LTV cell", () => {
    expect(series[0]?.ltv).toBeNull();
    const col = projectionColumns(en, crashed.baseDate, series).find(
      (c) => c.header === en.projGrid.ltv,
    );
    expect(col?.value(series[0]!)).toBeNull();
  });

  it("chart rows leave a gap, not 0", () => {
    expect(toChartRows(series)[0]?.ltv).toBeNull();
  });
});

describe("scenario compare keeps the null", () => {
  const results = [result("base"), result("crash", crashed)];

  it("mergeCompareMetric: the crash column is null, Base is a number", () => {
    const rows = mergeCompareMetric(results, "nominal", (y) => y.ltv);
    expect(rows[0]?.s0).toBeGreaterThan(0);
    expect(rows[0]?.s1).toBeNull();
  });

  it("the LTV sheet writes a blank cell", () => {
    const sheet = compareWorkbook(en, results, "nominal").sheets.find(
      (s) => s.name === en.xlsx.sheetNames.compareLtv,
    );
    expect(sheet?.rows[0]?.[2]?.value).toBeNull();
    expect(sheet?.rows[0]?.[1]?.value).toBeGreaterThan(0);
  });
});

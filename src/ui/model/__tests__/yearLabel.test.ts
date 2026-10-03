// UX-032 (D-22): projection rows and tooltips show "Y5 · 2031" — the projection year and
// its calendar year.
import { describe, it, expect } from "vitest";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { portfolioProjection } from "../../../engine";
import { projectionSeries, yearLabel } from "../projection";
import { toChartRows, toEquityChangeRows } from "../chartData";
import { getDict } from "../../../i18n";

const series = projectionSeries(
  portfolioProjection(portfolio, assumptions),
  "nominal",
  assumptions,
);

describe("yearLabel (UX-032)", () => {
  it("joins the projection and calendar year in each language", () => {
    expect(yearLabel(getDict("en"), 5, 2031)).toBe("Y5 · 2031");
    expect(yearLabel(getDict("cs"), 5, 2031)).toBe("R5 · 2031");
    expect(yearLabel(getDict("ru"), 5, 2031)).toBe("Г5 · 2031");
  });

  it("labels the opening row Y0", () => {
    expect(yearLabel(getDict("en"), 0, 2026)).toBe("Y0 · 2026");
  });
});

describe("chart rows carry the projection year (UX-032)", () => {
  it("toChartRows", () => {
    expect(toChartRows(series).map((r) => r.year)).toEqual(
      series.map((s) => s.year),
    );
  });

  it("toEquityChangeRows starts at year 1", () => {
    const rows = toEquityChangeRows(series);
    expect(rows[0]!.year).toBe(1);
    expect(rows.map((r) => r.year)).toEqual(series.slice(1).map((s) => s.year));
  });
});

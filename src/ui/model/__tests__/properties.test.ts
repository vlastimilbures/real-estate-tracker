// ADR 0205 (#379): the Properties totals row is the Dashboard's portfolio tiles at the
// page's as-of basis (Today, "All"), and the band legend under the table.
import { describe, it, expect } from "vitest";
import { isoDate, portfolioOutputs } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { asOfView, tilesForAsOf } from "../dashboard";
import { projectionSeries } from "../projection";
import { bandLegend, propertiesTotal } from "../properties";

const at = (asOf: string, isToday: boolean) => {
  const out = portfolioOutputs(portfolio, assumptions, isoDate(asOf));
  const basis = asOfView(assumptions.baseDate, out.snapshot.asOf, isToday);
  return { out, basis };
};

describe("propertiesTotal (ADR 0205 §5)", () => {
  it("equals the Dashboard tiles at Today with All, in nominal Kč", () => {
    const { out, basis } = at("2026-10-01", true);
    const dash = tilesForAsOf(
      out.snapshot,
      projectionSeries(out.projection, "nominal", assumptions),
      basis,
      "nominal",
      assumptions,
    );
    const total = propertiesTotal(
      out.snapshot,
      out.projection,
      basis,
      assumptions,
      portfolio.properties,
      en,
    )!;
    expect(total).toEqual({
      label: en.properties.totalRow,
      value: dash.totalReportedValue,
      debt: dash.totalDebt,
      undrawnDebt: dash.totalUndrawnDebt,
      equity: dash.totalEquity,
      noi: dash.noi,
      netCashFlow: dash.netCashFlow,
      ltv: dash.ltv,
      dscr: dash.dscr,
    });
  });

  it("follows a projection-year basis as the Dashboard does", () => {
    const { out, basis } = at("2028-06-07", false);
    expect(basis.kind).toBe("projection");
    const dash = tilesForAsOf(
      out.snapshot,
      projectionSeries(out.projection, "nominal", assumptions),
      basis,
      "nominal",
      assumptions,
    );
    const total = propertiesTotal(
      out.snapshot,
      out.projection,
      basis,
      assumptions,
      portfolio.properties,
      en,
    )!;
    expect(total.value).toBe(dash.totalReportedValue);
    expect(total.netCashFlow).toBe(dash.netCashFlow);
  });

  it("says when an inactive property is listed but not counted", () => {
    const { out, basis } = at("2026-10-01", true);
    const properties = portfolio.properties.map((p, i) =>
      i === 0 ? { ...p, active: false } : p,
    );
    expect(
      propertiesTotal(
        out.snapshot,
        out.projection,
        basis,
        assumptions,
        properties,
        en,
      )?.label,
    ).toBe(en.properties.totalRowActive);
  });

  it("is null with fewer than two properties", () => {
    const { out, basis } = at("2026-10-01", true);
    expect(
      propertiesTotal(
        out.snapshot,
        out.projection,
        basis,
        assumptions,
        portfolio.properties.slice(0, 1),
        en,
      ),
    ).toBeNull();
  });
});

describe("bandLegend (ADR 0205 §2)", () => {
  it("names each band with the words the cells use", () => {
    const d = en.dashboard;
    expect(bandLegend(en)).toEqual([
      {
        label: en.properties.colLtv,
        items: [
          { bands: ["good"], word: d.badgeConservative },
          { bands: ["warn"], word: d.badgeModerate },
          { bands: ["bad"], word: d.badgeHigh },
        ],
      },
      {
        label: en.properties.colDscr,
        items: [
          { bands: ["good", "warn"], word: d.badgeCoversDebt },
          { bands: ["bad"], word: d.badgeShortfall },
        ],
      },
    ]);
  });
});

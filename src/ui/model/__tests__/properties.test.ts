// ADR 0205 (#379): the Properties totals row is the Dashboard's portfolio tiles at the
// page's as-of basis (Today, "All"), and the band legend under the table.
import { describe, it, expect } from "vitest";
import { isoDate, portfolioOutputs } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { asOfView, tilesForAsOf } from "../dashboard";
import { projectionSeries } from "../projection";
import { bandLegend, hasMarkers, propertiesTotal } from "../properties";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { D } from "../../../lib/money";

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
      {
        snapshot: out.snapshot,
        projection: out.projection,
        basis,
        assumptions,
        properties: portfolio.properties,
      },
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
      {
        snapshot: out.snapshot,
        projection: out.projection,
        basis,
        assumptions,
        properties: portfolio.properties,
      },
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
        {
          snapshot: out.snapshot,
          projection: out.projection,
          basis,
          assumptions,
          properties,
        },
        en,
      )?.label,
    ).toBe(en.properties.totalRowActive);
  });

  it("is null when fewer than two properties are active", () => {
    const { out, basis } = at("2026-10-01", true);
    const total = (inactive: number[]) =>
      propertiesTotal(
        {
          snapshot: out.snapshot,
          projection: out.projection,
          basis,
          assumptions,
          properties: portfolio.properties.map((p, i) =>
            inactive.includes(i) ? { ...p, active: false } : p,
          ),
        },
        en,
      );
    expect(total([0, 1])).toBeNull();
    expect(total([0, 1, 2])).toBeNull();
  });

  it("says a pending purchase's value and flows are not in the total", () => {
    // mixed at 01.10.2026: "future" is bought in 2028, "dev" is owned, "inactive" is not
    // in the portfolio.
    const out = portfolioOutputs(mixed, assumptions, isoDate("2026-10-01"));
    const basis = asOfView(assumptions.baseDate, out.snapshot.asOf, true);
    const total = propertiesTotal(
      {
        snapshot: out.snapshot,
        projection: out.projection,
        basis,
        assumptions,
        properties: mixed.properties,
      },
      en,
    )!;
    expect(total.label).toBe(en.properties.totalRowOwned);
    expect(total.value).toBe(out.snapshot.totalReportedValue);
    expect(total.debt).toBe(out.snapshot.totalDebt);
    expect(total.undrawnDebt.isZero()).toBe(false);
  });

  it("is null with fewer than two properties", () => {
    const { out, basis } = at("2026-10-01", true);
    expect(
      propertiesTotal(
        {
          snapshot: out.snapshot,
          projection: out.projection,
          basis,
          assumptions,
          properties: portfolio.properties.slice(0, 1),
        },
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

describe("hasMarkers (ADR 0205 §2)", () => {
  const row = (owned: boolean, ltv: string | null, dscr: string | null) => ({
    owned,
    ltv: ltv === null ? null : D(ltv),
    dscr: dscr === null ? null : D(dscr),
  });
  it("is true when an owned row has an LTV or a DSCR", () => {
    expect(hasMarkers([row(true, "0.3", null)])).toBe(true);
    expect(hasMarkers([row(true, null, "1.1")])).toBe(true);
  });
  it("is false with only pending rows or rows without figures", () => {
    expect(hasMarkers([row(false, "0.3", "1.5"), row(true, null, null)])).toBe(
      false,
    );
    expect(hasMarkers([])).toBe(false);
  });
});

// ADR 0169: while a development loan draws, the charts and the projection grid show the
// drawn debt, and the value less the tranches not drawn yet; equity and LTV do not move.
// The undrawn part stays visible: a dashed committed-debt line and an Undrawn column.
import { describe, it, expect } from "vitest";
import { portfolioProjection, type Portfolio } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { hasUndrawn, toChartRows } from "../chartData";
import {
  projectionColumns,
  projectionExtras,
  projectionSeries,
} from "../projection";
import { en } from "../../../i18n/en";
import { toNumber } from "../../../lib/format";

const only = <T extends { propertyId: string }>(rows: T[]) =>
  rows.filter((r) => r.propertyId === "dev");
// The mixed fixture's dev flat: 2.0 M drawn at baseDate, tranches of 1.5 M (2026-11-15,
// year 1) and 1.0 M (2027-08-20, year 2).
const devOnly: Portfolio = {
  properties: mixed.properties.filter((p) => p.id === "dev"),
  mortgages: only(mixed.mortgages),
  valuations: only(mixed.valuations),
  leases: only(mixed.leases),
  holdingCosts: [],
};
const series = projectionSeries(
  portfolioProjection(devOnly, assumptions),
  "nominal",
  assumptions,
);
const seedSeries = projectionSeries(
  portfolioProjection(portfolio, assumptions),
  "nominal",
  assumptions,
);

describe("value and debt chart", () => {
  const rows = toChartRows(series);

  it("plots the drawn debt and the reported value", () => {
    for (const [i, r] of rows.entries()) {
      expect(r.balance).toBe(toNumber(series[i].balance));
      expect(r.value).toBe(toNumber(series[i].reportedValue));
      expect(r.equity).toBe(toNumber(series[i].equity));
    }
    // The 1.5 M tranche lands in year 1: drawn debt steps up, the value with it.
    expect(rows[1].balance - rows[0].balance).toBeGreaterThan(1_400_000);
  });

  it("draws committed debt while a tranche is ahead and meets the drawn line after the last draw", () => {
    expect(rows[0].committedDebt).toBe(toNumber(series[0].committedDebt));
    expect(rows[1].committedDebt).toBe(toNumber(series[1].committedDebt));
    // Year 2: all drawn, the dashed line ends on the solid one.
    expect(rows[2].committedDebt).toBe(rows[2].balance);
    expect(rows[3].committedDebt).toBeNull();
    expect(hasUndrawn(rows)).toBe(true);
  });

  it("has no committed line when every loan is drawn", () => {
    const seedRows = toChartRows(seedSeries);
    expect(hasUndrawn(seedRows)).toBe(false);
    expect(seedRows.every((r) => r.committedDebt === null)).toBe(true);
  });
});

describe("projection grid and export", () => {
  const g = en.projGrid;
  const cols = projectionColumns(en, assumptions.baseDate, series);
  const col = (header: string) => {
    const c = cols.find((x) => x.header === header);
    if (!c) throw new Error(`no ${header} column`);
    return c;
  };

  it("Value is the reported value, Debt the drawn balance, Undrawn the tranches ahead", () => {
    const r = series[0];
    expect(col(g.value).value(r)).toBe(r.reportedValue);
    expect(col(g.debt).value(r)).toBe(r.balance);
    expect(col(g.undrawn).value(r)).toBe(r.undrawnDebt);
    // Undrawn sits right after Debt.
    expect(cols.indexOf(col(g.undrawn))).toBe(cols.indexOf(col(g.debt)) + 1);
  });

  it("New debt is the drawn new debt, so Debt reconciles year to year", () => {
    expect(projectionExtras(series, g)[0]).toEqual({
      key: "draws",
      header: g.draws,
    });
  });

  it("has no Undrawn column when every loan is drawn", () => {
    const seedCols = projectionColumns(en, assumptions.baseDate, seedSeries);
    expect(seedCols.some((c) => c.header === g.undrawn)).toBe(false);
  });
});

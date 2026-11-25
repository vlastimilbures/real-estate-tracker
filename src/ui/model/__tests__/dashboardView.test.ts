// #485: the Dashboard's view and the helpers it shares with Property detail and
// Projections, built from the engine's output without rendering a page.
import { describe, expect, it, vi } from "vitest";
import { edate, type Portfolio } from "../../../engine";
import {
  BASE_DATE,
  assumptions,
  portfolio,
} from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { getEngineModel } from "../../../state/engineModel";
import { en } from "../../../i18n/en";
import { toChartRows } from "../chartData";
import {
  dashboardSeries,
  resetMarkerHeading,
  valueSeries,
} from "../chartSeries";
import { dashboardFilter } from "../dashboard";
import { dashboardView } from "../dashboardView";
import { reviewPill } from "../dataCheck";
import { DEFAULT_RESET_WINDOW, financingView } from "../financing";
import { lensKpis } from "../lensKpis";
import { projectionSeries } from "../projection";
import { projectionExport } from "../tableContext";

const d = en.dashboard;
const today = { date: BASE_DATE, isToday: true };

function engineOf(p: Portfolio, ids: string[] = [], asOf = BASE_DATE) {
  return getEngineModel(p, assumptions).outputs(ids, asOf);
}

describe("dashboardFilter (ADR 0155, 0180 §7)", () => {
  const inactive: Portfolio = {
    ...portfolio,
    properties: portfolio.properties.map((p) =>
      p.id === "dubova" ? { ...p, active: false } : p,
    ),
  };

  it("keeps the active ids; a filter of some is active", () => {
    const f = dashboardFilter(portfolio, ["lipova", "gone"]);
    expect(f.properties.map((p) => p.id)).toEqual([
      "javorova",
      "lipova",
      "dubova",
    ]);
    expect(f.effectiveIds).toEqual(["lipova"]);
    expect(f.filterActive).toBe(true);
    expect(f.pruned).toEqual(["lipova"]);
  });

  it("all kept or none is no filter, and nothing to store back", () => {
    expect(dashboardFilter(portfolio, []).filterActive).toBe(false);
    const all = dashboardFilter(portfolio, ["javorova", "lipova", "dubova"]);
    expect(all.filterActive).toBe(false);
    expect(all.pruned).toBeNull();
  });

  it("drops a deactivated property's id and chip", () => {
    const f = dashboardFilter(inactive, ["lipova", "dubova"]);
    expect(f.properties.map((p) => p.id)).toEqual(["javorova", "lipova"]);
    expect(f.effectiveIds).toEqual(["lipova"]);
    expect(f.pruned).toEqual(["lipova"]);
  });

  it("stores nothing before the portfolio loads", () => {
    const f = dashboardFilter(null, ["lipova"]);
    expect(f.properties).toEqual([]);
    expect(f.effectiveIds).toEqual([]);
    expect(f.filterActive).toBe(false);
    expect(f.pruned).toBeNull();
  });
});

describe("dashboardView", () => {
  const filter = dashboardFilter(portfolio, []);

  it("builds each panel's slice from one lens pick", () => {
    const engine = engineOf(portfolio);
    const v = dashboardView(engine, "real", today, en, filter);
    const lens = lensKpis(engine.kpis, "real");
    expect(v.strip.lens).toEqual(lens);
    expect(v.kpiList.lens).toBe(v.strip.lens);
    expect(v.strip.modeWord).toBe(en.common.realLower);
    expect(v.strip.horizonEndYear).toBe(
      v.charts.rows[v.charts.rows.length - 1].calendarYear,
    );
    expect(v.subtitle).toBe(d.subtitleDefault);
    expect(v.pickerHint).toBeNull();
    expect(v.strip.basis).toEqual({ kind: "today" });
  });

  it("names a filter and an as-of date in the subtitle; the Data check counts", () => {
    const asOf = edate(BASE_DATE, 60);
    const f = dashboardFilter(portfolio, ["lipova"]);
    const v = dashboardView(
      engineOf(portfolio, ["lipova"], asOf),
      "nominal",
      { date: asOf, isToday: false },
      en,
      f,
    );
    expect(v.subtitle).toBe(`${d.subFilter(1, 3)} · ${d.asOf("07.06.2031")}`);
    expect(v.pickerHint).not.toBeNull();
    expect(v.toReview).toBe(v.check.attention.length);
    expect(v.toReview).toBeGreaterThan(0);
  });

  it("marks the fixation ends of the properties in view (ADR 0210)", () => {
    const v = dashboardView(engineOf(portfolio), "nominal", today, en, filter);
    expect(v.charts.markers?.length).toBeGreaterThan(0);
  });
});

describe("chart series (ADR 0169)", () => {
  const rowsOf = (p: Portfolio) =>
    toChartRows(
      projectionSeries(engineOf(p).projection, "nominal", assumptions),
    );

  it("adds the dashed committed debt only while tranches are ahead", () => {
    const names = (x: typeof d | typeof en.propertyDetail) => ({
      value: x.seriesValue,
      debt: x.seriesDebt,
      committedDebt: x.seriesCommittedDebt,
      equity: x.seriesEquity,
    });
    expect(valueSeries(names(d), rowsOf(portfolio)).map((s) => s.key)).toEqual([
      "value",
      "balance",
      "equity",
    ]);
    const dev = valueSeries(names(en.propertyDetail), rowsOf(mixed));
    expect(dev.map((s) => s.key)).toEqual([
      "value",
      "balance",
      "committedDebt",
      "equity",
    ]);
    expect(dev[2].name).toBe(en.propertyDetail.seriesCommittedDebt);
  });

  it("names the Dashboard's six charts' series", () => {
    const s = dashboardSeries(en, rowsOf(portfolio), []);
    expect(s.equitySeries.map((x) => x.key)).toEqual([
      "appreciation",
      "paydown",
      "drawdown",
    ]);
    expect(s.ltvSeries).toEqual([
      { key: "ltv", name: d.seriesLtv, color: "var(--series-3)" },
    ]);
  });

  it("says the marker amounts are nominal in the real lens", () => {
    expect(resetMarkerHeading(en, "nominal")).toBe(en.charts.rateReset);
    expect(resetMarkerHeading(en, "real")).toBe(en.charts.rateResetNominal);
  });
});

describe("reviewPill (ADR 0218 §1)", () => {
  it("is the count and its sentence, or nothing", () => {
    const go = vi.fn();
    expect(reviewPill(en, 0, go)).toBeUndefined();
    expect(reviewPill(en, 3, go)).toEqual({
      count: 3,
      label: en.dataCheck.reviewPill(3),
      onSelect: go,
    });
  });
});

describe("projectionExport (ADR 0159)", () => {
  it("names the entity in the file and the notes, under the lens", () => {
    const rows = projectionSeries(
      engineOf(portfolio).projection,
      "real",
      assumptions,
    );
    const x = projectionExport(
      en,
      { name: "Byt Lipova", id: "lipova" },
      rows,
      "real",
      assumptions.baseDate,
    );
    expect(x.filename).toBe("byt-lipova-projection-real.xlsx");
    expect(x.sheetName).toBe(en.xlsx.sheetNames.projection);
    expect(x.rows).toBe(rows);
    expect(x.notes[0]).toBe("Byt Lipova");
    expect(x.columns(rows)[0].header).toBe(en.projGrid.year);
  });
});

describe("financingView (ADR 0214 §3)", () => {
  const input = (p: Portfolio, mode: "nominal" | "real") => {
    const out = engineOf(p);
    return {
      fx: out.financing,
      portfolio: p,
      kpis: out.kpis,
      mode,
      horizonYears: assumptions.horizonYears,
    };
  };

  it("nominal: the disclaimer; real: the nominal note before it", () => {
    const n = financingView(input(mixed, "nominal"), DEFAULT_RESET_WINDOW, en);
    expect(n.note).toBe(d.financingDisclaimer);
    expect(n.showWindow).toBe(true);
    const r = financingView(input(mixed, "real"), DEFAULT_RESET_WINDOW, en);
    expect(r.timeline.rows.length).toBeGreaterThan(0);
    expect(r.note).toBe(`${d.financingRowsNominal} ${d.financingDisclaimer}`);
    expect(r.labels.balanceAtReset).toBe(d.financingBalanceAtResetNominal);
  });

  it("no rows: the disclaimer alone, even in the real lens; no window toggle", () => {
    const none: Portfolio = { ...portfolio, mortgages: [], leases: [] };
    const v = financingView(input(none, "real"), DEFAULT_RESET_WINDOW, en);
    expect(v.timeline.rows).toEqual([]);
    expect(v.panel.hasLoans).toBe(false);
    expect(v.showWindow).toBe(false);
    expect(v.note).toBe(d.financingDisclaimer);
  });
});

// @vitest-environment jsdom
//
// ADR 0165 (#126 item 2): the equity-change chart shows a "Purchases" stack only when a
// purchase falls inside the projection, so a portfolio owned at baseDate is unchanged.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { portfolioProjection } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { useUiStore } from "../../../state/uiStore";
import { projectionSeries } from "../../model/projection";
import { toChartRows, toEquityChangeRows } from "../../model/chartData";
import { TrajectoryCharts } from "../DashboardPanels";

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

function renderCharts(p: typeof portfolio) {
  const series = projectionSeries(
    portfolioProjection(p, assumptions),
    "nominal",
    assumptions,
  );
  render(
    <TrajectoryCharts
      mode="nominal"
      rows={toChartRows(series)}
      eqChange={toEquityChangeRows(series)}
      horizonYears={assumptions.horizonYears}
    />,
  );
}

describe("Dashboard equity-change chart: purchases (ADR 0165)", () => {
  it("shows a Purchases series when a property is bought in the projection", () => {
    renderCharts(mixed);
    expect(screen.getAllByText("Purchases").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Appreciation").length).toBeGreaterThan(0);
  });

  it("has no Purchases series when every property is owned at baseDate", () => {
    renderCharts(portfolio);
    expect(screen.queryByText("Purchases")).toBeNull();
    expect(screen.getAllByText("Appreciation").length).toBeGreaterThan(0);
  });
});

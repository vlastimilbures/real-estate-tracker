// @vitest-environment jsdom
//
// ADR 0165 (#126 item 2): the equity-change chart shows a "Purchases & construction" stack
// only when a purchase or a development draw (ADR 0170) falls inside the projection, so a
// portfolio owned at baseDate without one is unchanged.
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
    expect(
      screen.getAllByText("Purchases & construction").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Appreciation").length).toBeGreaterThan(0);
  });

  it("the subtitle names what the bars split equity into", () => {
    renderCharts(portfolio);
    expect(
      screen.getByText(/— appreciation, purchases and debt$/),
    ).toBeTruthy();
  });

  it("shows it for a development flat owned at baseDate, whose draws add value (ADR 0170)", () => {
    const only = <T extends { propertyId: string }>(rows: T[]) =>
      rows.filter((r) => r.propertyId === "dev");
    renderCharts({
      properties: mixed.properties.filter((p) => p.id === "dev"),
      mortgages: only(mixed.mortgages),
      valuations: only(mixed.valuations),
      leases: only(mixed.leases),
      holdingCosts: [],
    });
    expect(
      screen.getAllByText("Purchases & construction").length,
    ).toBeGreaterThan(0);
  });

  it("has no Purchases series when every property is owned at baseDate", () => {
    renderCharts(portfolio);
    expect(screen.queryByText("Purchases & construction")).toBeNull();
    expect(screen.getAllByText("Appreciation").length).toBeGreaterThan(0);
  });
});

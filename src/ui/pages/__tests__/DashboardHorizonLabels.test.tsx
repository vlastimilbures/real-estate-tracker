// @vitest-environment jsdom
//
// ADR 0084 (#12): the Dashboard's horizon-dependent labels name the configured projection
// horizon instead of a hardcoded 30 years.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { portfolioKpis, portfolioSnapshot } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { KpiListPanel, TrajectoryCharts } from "../DashboardPanels";

const a25 = { ...assumptions, horizonYears: 25 };
const s = portfolioSnapshot(portfolio, a25);
const kpis = portfolioKpis(portfolio, a25);

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("Dashboard horizon labels (ADR 0084)", () => {
  it("label the trajectory and KPI rows with a 25-year horizon", () => {
    const { container } = render(
      <>
        <TrajectoryCharts
          mode="nominal"
          rows={[]}
          eqChange={[]}
          horizonYears={a25.horizonYears}
        />
        <KpiListPanel
          s={s}
          kpis={kpis}
          mode="nominal"
          horizon={kpis.netWorthNominal}
          horizonYears={a25.horizonYears}
          irr={{ rate: null, reason: "NOT_UNIQUE" }}
        />
      </>,
    );
    expect(screen.getByText("25-year trajectory")).toBeTruthy();
    expect(
      screen.getByText("Cumulative net cash flow (Yrs 1–25)"),
    ).toBeTruthy();
    expect(screen.getByText("Σ principal repaid (Yrs 1–25)")).toBeTruthy();
    expect(container.textContent).not.toMatch(/30-year|1–30/);
  });
});

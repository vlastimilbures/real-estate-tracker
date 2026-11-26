// @vitest-environment jsdom
//
// ADR 0084 (#12): the Dashboard's horizon-dependent labels name the configured projection
// horizon instead of a hardcoded 30 years.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  portfolioKpis,
  portfolioSnapshot,
} from "../../../engine/__tests__/support/seams";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { KpiListPanel, ProjectionCharts } from "../DashboardPanels";
import { kpiListView } from "./dashboardViewSupport";
import { rowLabel } from "./kpiStripSupport";

const a25 = { ...assumptions, horizonYears: 25 };
const s = portfolioSnapshot(portfolio, a25);
const kpis = portfolioKpis(portfolio, a25);

describe("Dashboard horizon labels (ADR 0084)", () => {
  it("label the trajectory and KPI rows with a 25-year horizon", () => {
    const { container } = render(
      <>
        <>
          <ProjectionCharts
            view={{
              mode: "nominal",
              rows: [],
              eqChange: [],
              horizonYears: a25.horizonYears,
            }}
          />
        </>
        <KpiListPanel
          view={kpiListView({
            s,
            basis: { kind: "today" },
            kpis,
            mode: "nominal",
            horizonYears: a25.horizonYears,
            cashInvested: null,
          })}
        />
      </>,
    );
    expect(screen.getByText("25-year projection")).toBeTruthy();
    expect(
      screen.getByText(rowLabel("Cumulative cash to owner (Yrs 1–25)")),
    ).toBeTruthy();
    expect(
      screen.getByText(rowLabel("Σ principal repaid (Yrs 1–25)")),
    ).toBeTruthy();
    expect(container.textContent).not.toMatch(/30-year|1–30/);
  });
});

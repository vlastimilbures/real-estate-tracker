// @vitest-environment jsdom
//
// ADR 0202 (#376): the projection first. The hero chart (value vs debt vs equity) leads,
// full width under a panel-style h2; Financing and the Data check follow; the five other
// charts are small multiples in a section of their own; the KPI list ends the page.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { Dashboard } from "../Dashboard";

const d = en.dashboard;
const n = assumptions.horizonYears;

beforeEach(() =>
  act(() => {
    usePortfolioStore.setState({
      status: "ready",
      portfolio,
      assumptions,
      scenarios: [],
      sample: { active: false, dismissed: true },
    });
    useUiStore.setState({
      language: "en",
      mode: "nominal",
      route: "dashboard",
      dashboardPropertyIds: [],
      asOf: null,
      dataCheckOpen: null,
      unsavedChanges: false,
      unsavedSources: [],
      pendingLeave: null,
    });
  }),
);

const h2s = () =>
  screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

describe("Dashboard order (ADR 0202 §1)", () => {
  it("projection, Financing, Data check, the other charts, then the KPI list", () => {
    render(<Dashboard />);
    const order = [
      d.projectionTitle(n),
      d.financingTitle,
      en.dataCheck.title,
      d.moreCharts(n),
      d.kpiTitle,
    ];
    expect(h2s().filter((h) => order.includes(h!))).toEqual(order);
  });

  it("the page is the dense Dashboard layout (24 px between sections)", () => {
    render(<Dashboard />);
    expect(
      document.querySelector("main.page")?.classList.contains("dashboard"),
    ).toBe(true);
  });
});

describe("hero chart (ADR 0202 §2)", () => {
  it("is headed like a panel, with the lens, over the unchanged chart", async () => {
    render(<Dashboard />);
    const head = screen.getByRole("heading", {
      level: 2,
      name: d.projectionTitle(n),
    });
    const hero = head.closest<HTMLElement>(".chart-hero")!;
    expect(hero).not.toBeNull();
    expect(within(hero).getByText(d.nominalKc)).toBeTruthy();
    expect(within(hero).getByText(d.chartValueVsDebtVsEquity)).toBeTruthy();
    expect(hero.querySelectorAll(".chart-card")).toHaveLength(1);
    // Its table view keeps the chart's own title, 300 px tall.
    await userEvent.click(
      within(hero).getByRole("button", { name: en.charts.table }),
    );
    const table = within(hero).getByRole("region", {
      name: d.chartValueVsDebtVsEquity,
    });
    expect(table.style.height).toBe("300px");
  });

  it("names the real lens in the real lens", () => {
    act(() => useUiStore.setState({ mode: "real" }));
    render(<Dashboard />);
    const hero = screen
      .getByRole("heading", { level: 2, name: d.projectionTitle(n) })
      .closest<HTMLElement>(".chart-hero")!;
    expect(within(hero).getByText(d.realTerms)).toBeTruthy();
  });
});

describe("small multiples (ADR 0202 §3–§4)", () => {
  it("five charts in order, under a visible heading with the lens", async () => {
    render(<Dashboard />);
    const head = screen.getByRole("heading", {
      level: 2,
      name: d.moreCharts(n),
    });
    expect(head.classList.contains("sr-only")).toBe(false);
    const section = head.closest<HTMLElement>("section")!;
    // Far below the hero, they name the lens again.
    expect(within(section).getByText(d.nominalKc)).toBeTruthy();
    const grid = section.querySelector<HTMLElement>(".chart-grid.small")!;
    const titles = Array.from(
      grid.querySelectorAll(":scope > .chart-card .chart-title"),
    ).map((e) => e.textContent);
    expect(titles).toEqual([
      d.chartNetCashFlowByYear,
      d.chartEquityChange,
      d.chartNoiVsDebtService,
      d.chartRentGrossVsEffective,
      d.chartLoanToValue,
    ]);
    // Each keeps its Table view, 180 px tall.
    const ltv = grid.querySelectorAll<HTMLElement>(":scope > .chart-card")[4]!;
    await userEvent.click(
      within(ltv).getByRole("button", { name: en.charts.table }),
    );
    expect(
      within(ltv).getByRole("region", { name: d.chartLoanToValue }).style
        .height,
    ).toBe("180px");
  });

  it("the old trajectory heading is gone", () => {
    render(<Dashboard />);
    expect(document.querySelector(".section-head")).toBeNull();
  });
});

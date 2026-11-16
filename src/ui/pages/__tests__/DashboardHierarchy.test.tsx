// @vitest-environment jsdom
//
// ADR 0202 (#376), amended by ADR 0218 (#420): the projection first. Six charts in one
// grid, two per row, under one heading with the lens; then Financing, the KPI list and
// the Data check.
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

describe("Dashboard order (ADR 0218 §3)", () => {
  it("charts, Financing, the KPI list, then the Data check", () => {
    render(<Dashboard />);
    const order = [
      d.projectionTitle(n),
      d.financingTitle,
      d.kpiTitle,
      en.dataCheck.title,
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

describe("one chart section (ADR 0218 §2)", () => {
  const section = () =>
    screen
      .getByRole("heading", { level: 2, name: d.projectionTitle(n) })
      .closest<HTMLElement>("section")!;

  it("six charts in one grid, the value chart first, the lens named once", () => {
    render(<Dashboard />);
    const grid = section().querySelector<HTMLElement>(".chart-grid.pairs")!;
    const titles = Array.from(
      grid.querySelectorAll(":scope > .chart-card .chart-title"),
    ).map((e) => e.textContent);
    expect(titles).toEqual([
      d.chartValueVsDebtVsEquity,
      d.chartNetCashFlowByYear,
      d.chartEquityChange,
      d.chartNoiVsDebtService,
      d.chartRentGrossVsEffective,
      d.chartLoanToValue,
    ]);
    expect(within(section()).getAllByText(d.nominalKc)).toHaveLength(1);
    expect(document.querySelector(".chart-hero")).toBeNull();
  });

  it("every chart has the same plot height (220 px)", async () => {
    render(<Dashboard />);
    const cards = section().querySelectorAll<HTMLElement>(".chart-card");
    expect(cards).toHaveLength(6);
    for (const card of cards) {
      const title = card.querySelector(".chart-title")!.textContent!;
      await userEvent.click(
        within(card).getByRole("button", { name: en.charts.table }),
      );
      expect(
        within(card).getByRole("region", { name: title }).style.height,
      ).toBe("220px");
    }
  });

  it("names the real lens in the real lens", () => {
    act(() => useUiStore.setState({ mode: "real" }));
    render(<Dashboard />);
    expect(within(section()).getByText(d.realTerms)).toBeTruthy();
  });

  it("there is no second charts heading", () => {
    render(<Dashboard />);
    expect(h2s().filter((h) => /chart/i.test(h ?? ""))).toEqual([]);
    expect(document.querySelector(".section-head")).toBeNull();
  });
});

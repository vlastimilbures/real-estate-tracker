// @vitest-environment jsdom
//
// #127 (ADR 0155): the pages over the `mixed` fixture's lifecycle states — every property
// deactivated, one deactivated, only a pending purchase active, no property at all. Real
// stores and the real engine; no page mocks.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { Dashboard } from "../Dashboard";
import { Projections } from "../Projections";
import { Scenarios } from "../Scenarios";
import { PropertyDetail } from "../PropertyDetail";
import { Properties } from "../Properties";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { Portfolio, Scenario } from "../../../engine";
import { assumptions } from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";

vi.mock("../../../lib/day", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/day")>()),
  todayUtc: () => new Date(Date.UTC(2026, 9, 1)),
}));
vi.mock("../../../data/errorLog", () => ({ logFailure: vi.fn() }));

const en = getDict("en");
const pd = en.propertyDetail;

/** `mixed` with only the listed properties active (all others deactivated). */
function activeOnly(...ids: string[]): Portfolio {
  return {
    ...mixed,
    properties: mixed.properties.map((p) => ({
      ...p,
      active: ids.includes(p.id),
    })),
  };
}
const allInactive = activeOnly();
const empty: Portfolio = {
  properties: [],
  mortgages: [],
  valuations: [],
  leases: [],
  holdingCosts: [],
};
const saved: Scenario = { id: "s1", name: "Rates up", overrides: {} };

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function load(
  p: Portfolio,
  ui: Partial<ReturnType<typeof useUiStore.getState>>,
) {
  act(() => {
    usePortfolioStore.setState({
      portfolio: p,
      assumptions,
      status: "ready",
      scenarios: [saved],
      unreadableScenarios: [],
    });
    useUiStore.setState({
      language: "en",
      mode: "nominal",
      asOf: null,
      dashboardPropertyIds: [],
      ...ui,
    });
  });
}

beforeEach(() => vi.stubGlobal("IntersectionObserver", NoopObserver));
afterEach(() => vi.unstubAllGlobals());

describe("every property deactivated (#127 item 1)", () => {
  it("Dashboard says so and links to Properties, without the first-run advice", () => {
    load(allInactive, { route: "dashboard" });
    render(<Dashboard />);
    expect(screen.getByText(en.common.allInactiveTitle(6))).toBeTruthy();
    expect(
      screen.getByRole("button", { name: en.common.openProperties }),
    ).toBeTruthy();
    expect(screen.queryByText(en.common.noPortfolioTitle)).toBeNull();
    expect(screen.queryByText(en.sample.gettingStartedTitle)).toBeNull();
    expect(
      screen.queryByRole("button", { name: en.common.importCsv }),
    ).toBeNull();
  });

  it("Projections shows the notice instead of a table of zeros", () => {
    load(allInactive, { route: "projections" });
    render(<Projections />);
    expect(screen.getByText(en.common.allInactiveTitle(6))).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      screen.queryByRole("button", { name: en.xlsx.exportToExcel }),
    ).toBeNull();
  });

  it("Scenarios replaces only the comparison; saved scenarios stay editable", () => {
    load(allInactive, { route: "scenarios" });
    render(<Scenarios />);
    expect(screen.getByText(en.common.allInactiveTitle(6))).toBeTruthy();
    expect(screen.queryByText(en.scenarios.keyFiguresTitle)).toBeNull();
    expect(screen.getByText(saved.name)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: en.scenarios.newScenario }),
    ).toBeTruthy();
  });
});

describe("no property at all (#127 item 1, the same selector)", () => {
  it("Projections shows the empty-portfolio notice", () => {
    load(empty, { route: "projections" });
    render(<Projections />);
    expect(screen.getByText(en.common.noPortfolioTitle)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("Scenarios shows the empty-portfolio notice in the comparison slot", () => {
    load(empty, { route: "scenarios" });
    render(<Scenarios />);
    expect(screen.getByText(en.common.noPortfolioTitle)).toBeTruthy();
    expect(screen.queryByText(en.scenarios.keyFiguresTitle)).toBeNull();
    expect(screen.getByText(saved.name)).toBeTruthy();
  });
});

describe("one property deactivated (mixed as is)", () => {
  it("Properties marks it Inactive", () => {
    load(mixed, { route: "properties" });
    render(<Properties />);
    const row = screen.getByText("Sold flat").closest("tr")!;
    expect(within(row).getByText(en.properties.badgeInactive)).toBeTruthy();
  });

  it("Projections offers only the active properties", () => {
    load(mixed, { route: "projections" });
    render(<Projections />);
    expect(screen.queryByRole("option", { name: "Sold flat" })).toBeNull();
    expect(screen.queryByText("Sold flat")).toBeNull();
  });

  it("its detail page raises no loan nudge and says what the figures are (#127 item 2)", () => {
    load(mixed, { route: "property", selectedPropertyId: "inactive" });
    render(<PropertyDetail />);
    expect(screen.getByText(pd.inactiveNote)).toBeTruthy();
    expect(screen.getByText(pd.inactivePreviewNote)).toBeTruthy();
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    const nav = screen.getByRole("navigation", { name: pd.sectionNavLabel });
    expect(
      within(nav).queryByRole("link", { name: en.dataCheck.title }),
    ).toBeNull();
    expect(screen.queryByText(en.dataCheck.title)).toBeNull();
  });

  it("an active property's detail page keeps its Data check", () => {
    load(mixed, { route: "property", selectedPropertyId: "dev" });
    render(<PropertyDetail />);
    const nav = screen.getByRole("navigation", { name: pd.sectionNavLabel });
    expect(
      within(nav).getByRole("link", { name: en.dataCheck.title }),
    ).toBeTruthy();
    expect(screen.queryByText(pd.inactivePreviewNote)).toBeNull();
  });
});

describe("Dashboard filter (#127 item 3)", () => {
  it("a filter left with one active property is no filter", () => {
    load(activeOnly("dev"), {
      route: "dashboard",
      dashboardPropertyIds: ["dev", "inactive"],
    });
    render(<Dashboard />);
    expect(screen.getByText(en.dashboard.subtitleDefault)).toBeTruthy();
    expect(screen.queryByText(en.dashboard.subFilter(1, 1))).toBeNull();
  });

  it("a filter that keeps every active property is no filter", () => {
    const ids = mixed.properties
      .filter((p) => p.active !== false)
      .map((p) => p.id);
    load(mixed, { route: "dashboard", dashboardPropertyIds: ids });
    render(<Dashboard />);
    expect(screen.getByText(en.dashboard.subtitleDefault)).toBeTruthy();
  });

  it("a real subset still reads n of N", () => {
    load(mixed, { route: "dashboard", dashboardPropertyIds: ["dev"] });
    render(<Dashboard />);
    expect(screen.getByText(en.dashboard.subFilter(1, 5))).toBeTruthy();
  });
});

describe("only a pending purchase active", () => {
  it("Dashboard shows the portfolio, not an empty state", () => {
    load(activeOnly("future"), { route: "dashboard" });
    render(<Dashboard />);
    expect(screen.queryByText(en.common.noPortfolioTitle)).toBeNull();
    expect(screen.getByText(en.dashboard.subtitleDefault)).toBeTruthy();
  });
});

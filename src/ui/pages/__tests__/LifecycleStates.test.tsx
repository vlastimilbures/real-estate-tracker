// @vitest-environment jsdom
//
// #127 (ADR 0155): the pages over the `mixed` fixture's lifecycle states — every property
// deactivated, one deactivated, only a pending purchase active, no property at all. Real
// stores and the real engine; no page mocks.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
import { fmtCzk, fmtCzkM, fmtPct } from "../../../lib/format";
import { D } from "../../../lib/money";

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
    // Nothing to switch between nominal and real.
    expect(
      screen.queryByRole("group", { name: en.shell.nominalOrReal }),
    ).toBeNull();
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
    const { container } = render(<Projections />);
    // Six choices: past five, the selector is a closed dropdown; open it.
    fireEvent.click(container.querySelector('[aria-haspopup="listbox"]')!);
    const names = screen.getAllByRole("option").map((o) => o.textContent);
    expect(names).toContain("Dev unit");
    expect(names).toContain("Future buy");
    expect(names).not.toContain("Sold flat");
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

  it("Dashboard totals are today's: nothing owned yet (ADR 0156 leaves them)", () => {
    load(activeOnly("future"), { route: "dashboard" });
    render(<Dashboard />);
    expect(screen.getByTestId("kpi-networth").textContent).toBe(
      fmtCzk(D(0), { suffix: false }),
    );
    const ltv = tile(en.dashboard.portfolioLtv);
    expect(ltv.textContent).toContain(fmtPct(D(0), 1));
    expect(ltv.textContent).toContain(en.dashboard.badgeConservative);
  });
});

/** The KPI tile whose label is `label` (the label may also head a table column). */
function tile(label: string): HTMLElement {
  const tiles = screen
    .getAllByText(label)
    .map((e) => e.closest<HTMLElement>(".tile"))
    .filter((e) => e !== null);
  expect(tiles).toHaveLength(1);
  return tiles[0]!;
}
const hasTile = (label: string) =>
  screen.queryAllByText(label).some((e) => e.closest(".tile") !== null);

describe("a pending purchase (#126 item 1, ADR 0156)", () => {
  const purchase = "15.03.2028";

  it("Properties shows its purchase date and no figures", () => {
    load(mixed, { route: "properties" });
    render(<Properties />);
    const row = screen.getByText("Future buy").closest("tr")!;
    expect(within(row).getByText(en.properties.badgePending)).toBeTruthy();
    expect(
      within(row).getByText(en.properties.pendingPurchaseOn(purchase)),
    ).toBeTruthy();
    expect(within(row).queryByText(en.dashboard.badgeConservative)).toBeNull();
    // Every figure column (LTV, net cash flow, DSCR, value, debt, equity, NOI) is "—".
    const figures = Array.from(row.querySelectorAll("td")).slice(1, -1);
    expect(figures.map((c) => c.textContent)).toEqual(Array(7).fill("—"));
  });

  it("an owned row keeps its figures", () => {
    load(mixed, { route: "properties" });
    render(<Properties />);
    const row = screen.getByText("Dev unit").closest("tr")!;
    expect(within(row).queryByText(en.properties.badgePending)).toBeNull();
    // Value, debt, equity and NOI are figures, not "—".
    const figures = Array.from(row.querySelectorAll("td")).slice(4, -1);
    expect(figures).toHaveLength(4);
    for (const c of figures) expect(c.textContent).toMatch(/\d/);
  });

  it("its detail page says it is not owned yet instead of the tiles", () => {
    load(mixed, { route: "property", selectedPropertyId: "future" });
    render(<PropertyDetail />);
    const panel = screen
      .getByText(pd.notOwnedTitle)
      .closest<HTMLElement>(".panel")!;
    expect(panel.textContent).toContain(purchase);
    expect(panel.textContent).toContain(fmtCzk(D("6000000")));
    expect(panel.textContent).toContain(fmtCzk(D("4200000")));
    expect(hasTile(pd.marketValue)).toBe(false);
    expect(screen.queryByText(en.dashboard.badgeConservative)).toBeNull();
    // The projection charts stay: they show the years before the purchase as zero.
    expect(screen.getByText(pd.chartValueVsDebtVsEquity)).toBeTruthy();
    // The Data check stays, reduced to the own-cash finding (dataCheck.ts).
    expect(screen.getByText(en.dataCheck.fundingUnknownFuture)).toBeTruthy();
  });

  it("a projection year still before the purchase keeps the panel", () => {
    load(mixed, {
      route: "property",
      selectedPropertyId: "future",
      asOf: new Date(Date.UTC(2027, 5, 7)),
    });
    render(<PropertyDetail />);
    expect(screen.getByText(pd.notOwnedTitle)).toBeTruthy();
  });

  it("a projection year that holds the purchase shows the tiles, as the subtitle says", () => {
    // 01.02.2028 rounds to year 2 (to 07.06.2028), which holds 15.03.2028 (ADR 0150).
    load(mixed, {
      route: "property",
      selectedPropertyId: "future",
      asOf: new Date(Date.UTC(2028, 1, 1)),
    });
    render(<PropertyDetail />);
    expect(screen.queryByText(pd.notOwnedTitle)).toBeNull();
    expect(hasTile(pd.marketValue)).toBe(true);
    expect(document.body.textContent).toContain(pd.purchased(purchase));
  });
});

describe("other lifecycle states keep their tiles (#276 item 1)", () => {
  it("a developing property's detail page shows its tiles", () => {
    load(mixed, { route: "property", selectedPropertyId: "dev" });
    render(<PropertyDetail />);
    expect(hasTile(pd.marketValue)).toBe(true);
    expect(screen.queryByText(pd.notOwnedTitle)).toBeNull();
  });

  it("a debt-free property: hero shows no debt, LTV 0 % Conservative, no DSCR", () => {
    const debtFree: Portfolio = {
      ...activeOnly("javorova"),
      mortgages: mixed.mortgages.filter((m) => m.propertyId !== "javorova"),
    };
    load(debtFree, { route: "dashboard" });
    render(<Dashboard />);
    const hero = tile(en.dashboard.netWorth);
    expect(screen.getByTestId("kpi-networth").textContent).not.toBe(
      fmtCzk(D(0), { suffix: false }),
    );
    // The foot reads the value as assets and a zero debt.
    const foot = hero.querySelector(".foot")!.textContent;
    const assets = foot.match(/^Assets (.+?) · /)![1]!;
    expect(foot).toBe(en.dashboard.assetsDebtEquity(assets, fmtCzkM(D(0))));
    const ltv = tile(en.dashboard.portfolioLtv);
    expect(ltv.textContent).toContain(fmtPct(D(0), 1));
    expect(ltv.textContent).toContain(en.dashboard.badgeConservative);
    expect(tile(en.dashboard.portfolioDscr).textContent).toContain("—");
  });
});

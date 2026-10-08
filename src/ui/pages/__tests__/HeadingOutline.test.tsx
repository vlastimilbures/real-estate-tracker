// @vitest-environment jsdom
//
// #128 R5-15 and #276 item 2 (ADR 0157): every page has one <h1> (its title) and the
// headings below it never skip a level, so the VoiceOver heading rotor reads an outline.
// The empty and lifecycle notices sit right under the h1, so they are h2. Also: the
// action columns have a name, and the loan warnings are status, not alerts.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { Dashboard } from "../Dashboard";
import { Projections } from "../Projections";
import { Scenarios } from "../Scenarios";
import { PropertyDetail } from "../PropertyDetail";
import { Properties } from "../Properties";
import { SettingsPage } from "../Settings";
import { Guide } from "../Guide";
import { Import } from "../Import";
import { AboutModal } from "../../components/AboutModal";
import { BootFailure } from "../../components/BootFailure";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { Portfolio } from "../../../engine";
import { assumptions } from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";

vi.mock("../../../lib/day", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/day")>()),
  todayUtc: () => new Date(Date.UTC(2026, 9, 1)),
}));
vi.mock("../../../data/errorLog", () => ({ logFailure: vi.fn() }));

const en = getDict("en");

const empty: Portfolio = {
  properties: [],
  mortgages: [],
  valuations: [],
  leases: [],
  holdingCosts: [],
};
const allInactive: Portfolio = {
  ...mixed,
  properties: mixed.properties.map((p) => ({ ...p, active: false })),
};
// "Sold flat" reactivated: its 2019 block's fixation ended with no follow-on block, so
// its detail page shows a loan warning.
const withWarning: Portfolio = {
  ...mixed,
  properties: mixed.properties.map((p) => ({ ...p, active: true })),
};

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
  ui: Partial<ReturnType<typeof useUiStore.getState>> = {},
) {
  act(() => {
    usePortfolioStore.setState({
      portfolio: p,
      assumptions,
      status: "ready",
      error: null,
      startupError: null,
      scenarios: [],
      unreadableScenarios: [],
    });
    useUiStore.setState({
      language: "en",
      mode: "nominal",
      asOf: null,
      dashboardPropertyIds: [],
      settingsTab: "assumptions",
      ...ui,
    });
  });
}

/** Heading levels in document order. */
function levels(root: ParentNode = document.body): number[] {
  return Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((h) =>
    Number(h.tagName[1]),
  );
}

/** One h1 first, and no level more than one below the heading before it. */
function expectOutline(found: number[]) {
  expect(found[0]).toBe(1);
  expect(found.filter((l) => l === 1)).toHaveLength(1);
  const skips = found.filter((l, i) => i > 0 && l > found[i - 1]! + 1);
  expect({ found, skips }).toEqual({ found, skips: [] });
}

beforeEach(() => vi.stubGlobal("IntersectionObserver", NoopObserver));
afterEach(() => vi.unstubAllGlobals());

const seedId = mixed.properties[0]!.id;

describe("page heading outline (#128 R5-15)", () => {
  it.each<
    [
      string,
      Portfolio,
      Partial<ReturnType<typeof useUiStore.getState>>,
      () => JSX.Element,
    ]
  >([
    ["Dashboard", mixed, { route: "dashboard" }, () => <Dashboard />],
    [
      "Dashboard, empty (#276 item 2)",
      empty,
      { route: "dashboard" },
      () => <Dashboard />,
    ],
    [
      "Dashboard, all inactive (#276 item 2)",
      allInactive,
      { route: "dashboard" },
      () => <Dashboard />,
    ],
    ["Properties", mixed, { route: "properties" }, () => <Properties />],
    ["Properties, empty", empty, { route: "properties" }, () => <Properties />],
    [
      "Property detail",
      mixed,
      { route: "property", selectedPropertyId: seedId },
      () => <PropertyDetail />,
    ],
    [
      "Property detail, pending",
      mixed,
      { route: "property", selectedPropertyId: "future" },
      () => <PropertyDetail />,
    ],
    ["Projections", mixed, { route: "projections" }, () => <Projections />],
    [
      "Projections, all inactive (#276 item 2)",
      allInactive,
      { route: "projections" },
      () => <Projections />,
    ],
    ["Scenarios", mixed, { route: "scenarios" }, () => <Scenarios />],
    [
      "Scenarios, all inactive",
      allInactive,
      { route: "scenarios" },
      () => <Scenarios />,
    ],
    [
      "Settings, assumptions",
      mixed,
      { route: "settings", settingsTab: "assumptions" },
      () => <SettingsPage />,
    ],
    [
      "Settings, backup",
      mixed,
      { route: "settings", settingsTab: "backup" },
      () => <SettingsPage />,
    ],
    ["Guide", mixed, { route: "guide" }, () => <Guide />],
    ["Import", mixed, { route: "import" }, () => <Import />],
  ])("%s", (_name, p, ui, page) => {
    load(p, ui);
    render(page());
    expectOutline(levels());
  });

  it("the page title is the h1", () => {
    load(mixed, { route: "projections" });
    render(<Projections />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      en.projections.title,
    );
  });

  it("About: the dialog's title is an h2 and its sections h3", () => {
    load(mixed);
    render(<AboutModal onClose={() => {}} />);
    expect(levels(screen.getByRole("dialog"))).toEqual([2, 3, 3, 3, 3]);
  });
});

// The axe best-practice scan (ADR 0157) also covers the screens before the app shell.
describe("the startup screens (#128, axe best-practice)", () => {
  it("a startup failure is the main landmark, titled by an h1", () => {
    act(() => {
      useUiStore.setState({ language: "en" });
      usePortfolioStore.setState({
        status: "error",
        error: { kind: "other", message: "x" },
        startupError: null,
      } as never);
    });
    render(<BootFailure />);
    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { level: 1 }).textContent).toBe(
      en.app.dbErrorEyebrow,
    );
  });
});

describe("action columns have a name (#128 G2-3-09)", () => {
  it("Properties", () => {
    load(mixed, { route: "properties" });
    render(<Properties />);
    expect(
      screen.getByRole("columnheader", { name: en.common.actions }),
    ).toBeTruthy();
  });

  it("the records tables on Property detail", () => {
    load(mixed, { route: "property", selectedPropertyId: seedId });
    render(<PropertyDetail />);
    const tables = screen.getAllByRole("table");
    const named = tables.filter(
      (tb) =>
        within(tb).queryAllByRole("columnheader", { name: en.common.actions })
          .length === 1,
    );
    expect(named.length).toBeGreaterThanOrEqual(3);
    const blank = screen
      .getAllByRole("columnheader")
      .filter((th) => (th.textContent ?? "").trim() === "");
    expect(blank).toHaveLength(0);
  });
});

describe("loan warnings are status, not alerts (#128 R5-15)", () => {
  it("Property detail", () => {
    load(withWarning, { route: "property", selectedPropertyId: "inactive" });
    render(<PropertyDetail />);
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    const warn = document.querySelectorAll(".banner.warn");
    expect(warn.length).toBeGreaterThan(0);
    for (const w of warn) expect(w.getAttribute("role")).toBe("status");
  });
});

// @vitest-environment jsdom
//
// ADR 0146 (#131): when stored data breaks an engine rule, a page that needs engine
// figures shows the invalid-data notice inside the app shell, so the sidebar stays and
// Settings and Import remain reachable. Navigating away clears the notice.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { App } from "../App";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore, type Route } from "../../state/uiStore";
import { portfolio, assumptions } from "../../engine/__tests__/support/seed";
import { en } from "../../i18n/en";
import { money } from "../../engine";

vi.mock("../../data/errorLog", () => ({ logFailure: vi.fn() }));

const loan = portfolio.mortgages[0];
// An instalment below the monthly interest breaks D-17: the engine refuses the inputs.
const broken = {
  ...portfolio,
  mortgages: portfolio.mortgages.map((m) =>
    m.id === loan.id ? { ...m, monthlyInstalment: money(1) } : m,
  ),
};

async function renderAt(route: Route) {
  act(() => useUiStore.setState({ route }));
  render(<App />);
  await settled();
}

/** Lazy pages load after the first render: wait until a page or a notice shows. */
const settled = () =>
  waitFor(() => expect(notice() || pageTitle() !== undefined).toBe(true));

const sidebar = () =>
  screen.queryByRole("button", { name: en.nav.settings }) !== null;
// The shell's page title; the nav buttons carry the same words.
const pageTitle = () => document.querySelector(".page-title")?.textContent;
const notice = () =>
  screen.queryByText(en.errorBoundary.invalidDataTitle) !== null;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  act(() => {
    usePortfolioStore.setState({
      portfolio: broken,
      assumptions,
      status: "ready",
      error: null,
      init: async () => {},
    } as never);
    useUiStore.setState({
      language: "en",
      asOf: null,
      dashboardPropertyIds: [],
      unsavedChanges: false,
      pendingLeave: null,
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("app shell with invalid stored data (ADR 0146)", () => {
  it.fails.each(["dashboard", "properties", "projections"] as const)(
    "R5-04A: %s keeps the sidebar around the notice (#131)",
    async (route) => {
      await renderAt(route);
      expect(notice()).toBe(true);
      expect(sidebar()).toBe(true);
    },
  );

  it("R4-10A: Import opens; it needs only the property names (#131)", async () => {
    await renderAt("import");
    expect(notice()).toBe(false);
    expect(pageTitle()).toBe(en.importPage.title);
  });

  it.fails("VG2504A: navigating away clears the notice (#131)", async () => {
    await renderAt("dashboard");
    expect(notice()).toBe(true);
    // The native menu (⌘,) changes the route from outside the page.
    await act(async () => useUiStore.getState().navigate("settings"));
    await settled();
    expect(notice()).toBe(false);
    expect(pageTitle()).toBe(en.settings.title);
  });
});

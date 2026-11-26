// @vitest-environment jsdom
//
// #483 (ADR 0146): a page that throws while rendering shows the page boundary's fallback
// inside the app's chrome: the sidebar, the page's title (Property detail's is Properties)
// and no lens. Pinned for every route before the page list moves into one table. Each page
// module is wrapped so the test can make it throw.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { createElement, type ComponentType } from "react";
import { App } from "../App";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore, type Route } from "../../state/uiStore";
import { portfolio, assumptions } from "../../engine/__tests__/support/seed";
import { en } from "../../i18n/en";

const boom = vi.hoisted(() => ({ on: false }));

/** `Page`, throwing while `boom.on`. */
function throwing(Page: ComponentType): ComponentType {
  return function Throwing() {
    if (boom.on) throw new Error("page bug");
    return createElement(Page);
  };
}

vi.mock("../pages/Dashboard", async (orig) => {
  const m = await orig<typeof import("../pages/Dashboard")>();
  return { ...m, Dashboard: throwing(m.Dashboard) };
});
vi.mock("../pages/Properties", async (orig) => {
  const m = await orig<typeof import("../pages/Properties")>();
  return { ...m, Properties: throwing(m.Properties) };
});
vi.mock("../pages/PropertyDetail", async (orig) => {
  const m = await orig<typeof import("../pages/PropertyDetail")>();
  return { ...m, PropertyDetail: throwing(m.PropertyDetail) };
});
vi.mock("../pages/Projections", async (orig) => {
  const m = await orig<typeof import("../pages/Projections")>();
  return { ...m, Projections: throwing(m.Projections) };
});
vi.mock("../pages/Scenarios", async (orig) => {
  const m = await orig<typeof import("../pages/Scenarios")>();
  return { ...m, Scenarios: throwing(m.Scenarios) };
});
vi.mock("../pages/Import", async (orig) => {
  const m = await orig<typeof import("../pages/Import")>();
  return { ...m, Import: throwing(m.Import) };
});
vi.mock("../pages/Settings", async (orig) => {
  const m = await orig<typeof import("../pages/Settings")>();
  return { ...m, SettingsPage: throwing(m.SettingsPage) };
});
vi.mock("../pages/Guide", async (orig) => {
  const m = await orig<typeof import("../pages/Guide")>();
  return { ...m, Guide: throwing(m.Guide) };
});

const TITLES: Record<Route, string> = {
  dashboard: en.dashboard.title,
  properties: en.properties.title,
  property: en.properties.title,
  projections: en.projections.title,
  scenarios: en.scenarios.title,
  import: en.importPage.title,
  settings: en.settings.title,
  guide: en.guide.title,
};

beforeEach(() => {
  boom.on = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
  act(() => {
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: { kind: "ready" },
      init: async () => {},
    } as never);
    useUiStore.setState({
      language: "en",
      selectedPropertyId: portfolio.properties[0]!.id,
    });
  });
});

describe("the page boundary's fallback on every route (#483, ADR 0146)", () => {
  it.each(Object.entries(TITLES) as [Route, string][])(
    "%s: the sidebar, the page's title, no lens and the notice",
    async (route, title) => {
      act(() => useUiStore.setState({ route }));
      boom.on = true;
      render(<App />);
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(en.errorBoundary.title);
      expect(document.querySelector(".page-title")?.textContent).toBe(title);
      expect(
        screen.queryByRole("group", { name: en.shell.nominalOrReal }),
      ).toBeNull();
      const sidebar = document.querySelector<HTMLElement>("aside.sidebar")!;
      expect(
        within(sidebar).getByRole("button", { name: en.nav.settings }),
      ).toBeTruthy();
      // Try again renders the page once more: it shows once it no longer throws.
      boom.on = false;
      await act(async () =>
        screen.getByRole("button", { name: en.errorBoundary.tryAgain }).click(),
      );
      expect(screen.queryByRole("alert")).toBeNull();
    },
  );
});

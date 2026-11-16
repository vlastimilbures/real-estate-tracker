// @vitest-environment jsdom
//
// ADR 0219 (#419): the left bar's navigation in two groups, the pages on top and the
// tools above the footer; the footer is unchanged.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { AppShell } from "../AppShell";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";

const n = en.nav;

beforeEach(() =>
  act(() =>
    useUiStore.setState({
      language: "en",
      route: "dashboard",
      sidebarCollapsed: false,
    }),
  ),
);

const shell = () =>
  render(
    <AppShell title="Dashboard">
      <p>page</p>
    </AppShell>,
  );

const groupNames = (g: Element) =>
  within(g as HTMLElement)
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label"));

describe("left bar groups (ADR 0219)", () => {
  it("pages on top, tools in a second group, in one nav", () => {
    shell();
    const nav = screen.getByRole("navigation");
    const groups = nav.querySelectorAll(":scope > .nav-group");
    expect(groups).toHaveLength(2);
    expect(groupNames(groups[0]!)).toEqual([
      n.dashboard,
      n.properties,
      n.projections,
      n.scenarios,
    ]);
    expect(groups[1]!.classList.contains("tools")).toBe(true);
    expect(groupNames(groups[1]!)).toEqual([n.importData, n.settings, n.guide]);
  });

  it("the tools come right before the footer, which is unchanged", () => {
    shell();
    const nav = screen.getByRole("navigation");
    expect(nav.nextElementSibling?.className).toBe("sidebar-foot");
    expect(
      within(nav.nextElementSibling as HTMLElement).getByRole("group", {
        name: en.shell.language,
      }),
    ).toBeTruthy();
  });

  it("collapsed, both groups stay and every item keeps its tooltip", () => {
    act(() => useUiStore.setState({ sidebarCollapsed: true }));
    shell();
    const nav = screen.getByRole("navigation");
    expect(nav.querySelectorAll(":scope > .nav-group")).toHaveLength(2);
    for (const b of within(nav).getAllByRole("button"))
      expect(b.getAttribute("title")).toBe(b.getAttribute("aria-label"));
  });

  it("the active state still follows the route, in either group", () => {
    act(() => useUiStore.setState({ route: "guide" }));
    const { unmount } = shell();
    expect(
      screen
        .getByRole("button", { name: n.guide })
        .getAttribute("aria-current"),
    ).toBe("page");
    unmount();
    act(() => useUiStore.setState({ route: "property" }));
    shell();
    expect(
      screen
        .getByRole("button", { name: n.properties })
        .getAttribute("aria-current"),
    ).toBe("page");
  });
});

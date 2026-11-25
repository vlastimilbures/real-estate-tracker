// @vitest-environment jsdom
//
// #483: pins of how long the app's chrome lives, before the shell is split into a layout
// rendered once and a frame each page renders. Today every page renders its own shell, so
// a page change, and the page boundary's fallback coming or going, mounts the chrome
// again: its nodes are new, focus inside it is lost, the sidebar starts at the top, and a
// kept banner is no longer announced (ADR 0146, ADR 0189, ADR 0194). A switch between a
// page's own variants, or to another property, keeps it. These tests hold that lifetime.
// shellMemory keeps the last shown route, so each test loads fresh modules (#256).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { portfolio, assumptions } from "../../engine/__tests__/support/seed";
import { money } from "../../engine";
import { en } from "../../i18n/en";

let App: typeof import("../App").App;
let useUiStore: typeof import("../../state/uiStore").useUiStore;
let usePortfolioStore: typeof import("../../state/portfolioStore").usePortfolioStore;

const sidebar = () => document.querySelector("aside.sidebar");
const shell = () => document.querySelector<HTMLElement>(".shell");
const title = () => document.querySelector(".page-title");
const banner = () => document.querySelector(".error-banner");

const loan = portfolio.mortgages[0];
// An instalment below the monthly interest breaks D-17: the engine refuses the inputs.
const broken = {
  ...portfolio,
  mortgages: portfolio.mortgages.map((m) =>
    m.id === loan.id ? { ...m, monthlyInstalment: money(1) } : m,
  ),
};

// The Dashboard's "every property deactivated" variant (ADR 0155).
const inactive = {
  ...portfolio,
  properties: portfolio.properties.map((p) => ({ ...p, active: false })),
};

async function go(route: Parameters<typeof navigate>[0]) {
  await act(async () => navigate(route));
}
function navigate(route: import("../../state/uiStore").Route): void {
  useUiStore.getState().navigate(route);
}

beforeEach(async () => {
  vi.resetModules();
  await import("../../i18n/__tests__/preload");
  ({ App } = await import("../App"));
  ({ useUiStore } = await import("../../state/uiStore"));
  ({ usePortfolioStore } = await import("../../state/portfolioStore"));
  act(() => {
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: { kind: "ready" },
      error: null,
      init: async () => {},
    } as never);
    useUiStore.setState({ language: "en", route: "dashboard" });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("chrome lifetime across pages (#483)", () => {
  it("a page change mounts the sidebar again", async () => {
    render(<App />);
    const before = sidebar();
    await go("properties");
    expect(sidebar()).not.toBeNull();
    expect(sidebar()).not.toBe(before);
  });

  it("a switch between a page's variants keeps the sidebar and the title", async () => {
    render(<App />);
    const before = sidebar();
    const h1 = title();
    // Another Dashboard variant, then the full one again.
    act(() =>
      usePortfolioStore.setState({
        portfolio: inactive,
      } as never),
    );
    expect(title()?.textContent).toBe(en.dashboard.title);
    act(() => usePortfolioStore.setState({ portfolio } as never));
    expect(sidebar()).toBe(before);
    expect(title()).toBe(h1);
  });

  it("another property in Property detail keeps the sidebar and the title", async () => {
    render(<App />);
    const [a, b] = portfolio.properties;
    await act(async () => useUiStore.getState().openProperty(a!.id));
    await waitFor(() => expect(title()?.textContent).toBe(a!.name));
    const before = sidebar();
    const h1 = title();
    await act(async () => useUiStore.getState().openProperty(b!.id));
    await waitFor(() => expect(title()?.textContent).toBe(b!.name));
    expect(sidebar()).toBe(before);
    expect(title()).toBe(h1);
  });

  it("scrolls the window to the top on a page change and a property change only", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo");
    render(<App />);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    act(() =>
      usePortfolioStore.setState({
        portfolio: inactive,
      } as never),
    );
    act(() => usePortfolioStore.setState({ portfolio } as never));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    await go("projections");
    await waitFor(() =>
      expect(title()?.textContent).toBe(en.projections.title),
    );
    expect(scrollTo).toHaveBeenCalledTimes(2);
    const [a, b] = portfolio.properties;
    await act(async () => useUiStore.getState().openProperty(a!.id));
    await waitFor(() => expect(title()?.textContent).toBe(a!.name));
    expect(scrollTo).toHaveBeenCalledTimes(3);
    await act(async () => useUiStore.getState().openProperty(b!.id));
    expect(scrollTo).toHaveBeenCalledTimes(4);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it("measures the top bar again on every page, and stops when it leaves", async () => {
    const observed: Element[] = [];
    let disconnects = 0;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(el: Element) {
          observed.push(el);
        }
        unobserve() {}
        disconnect() {
          disconnects += 1;
        }
      },
    );
    render(<App />);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--topbar-h")).toBe("0px");
    const first = document.querySelector("header.topbar");
    expect(observed).toContain(first);
    const before = disconnects;
    await go("settings");
    await waitFor(() => expect(title()?.textContent).toBe(en.settings.title));
    expect(disconnects).toBeGreaterThan(before);
    const next = document.querySelector("header.topbar");
    expect(next).not.toBe(first);
    expect(observed).toContain(next);
    expect(root.style.getPropertyValue("--topbar-h")).toBe("0px");
  });

  it("hides the whole chrome while a page's code loads for the first time", async () => {
    render(<App />);
    act(() => navigate("guide"));
    // The old page and its chrome stay in the DOM, hidden, until the new page is ready.
    expect(shell()?.style.display).toBe("none");
    await waitFor(() => expect(title()?.textContent).toBe(en.guide.title));
    expect(shell()?.style.display).toBe("");
    expect(document.querySelectorAll(".shell")).toHaveLength(1);
  });
});

describe("focus across pages (#483, ADR 0146)", () => {
  it("a sidebar click moves focus to the new page's main region", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: en.nav.properties }));
    await waitFor(() => expect(document.activeElement?.id).toBe("main"));
  });

  it("a page change from outside moves focus from the skip link to main", async () => {
    render(<App />);
    screen.getByRole("button", { name: en.shell.skipToContent }).focus();
    await go("properties");
    expect(document.activeElement?.id).toBe("main");
  });

  it("a page change from outside moves focus from the page's content to main", async () => {
    render(<App />);
    const inPage = document.querySelector<HTMLElement>("main button")!;
    inPage.focus();
    expect(document.activeElement).toBe(inPage);
    await go("properties");
    expect(document.activeElement?.id).toBe("main");
  });

  it("keeps focus the owner put outside the app's chrome", async () => {
    render(<App />);
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    await go("properties");
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("a crash screen coming in drops focus from the sidebar to the page body", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<App />);
    screen.getByRole("button", { name: en.nav.guide }).focus();
    // Same route: the page boundary's fallback replaces the shell, focus is lost and
    // stays lost (no route change, so it is not moved to main).
    act(() => usePortfolioStore.setState({ portfolio: broken } as never));
    expect(
      screen.queryByText(en.errorBoundary.invalidDataTitle),
    ).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("announcements across pages (#483, ADR 0189, ADR 0194)", () => {
  const writeError = () =>
    act(() =>
      usePortfolioStore.setState({
        error: { kind: "other", message: "disk full" },
      } as never),
    );

  it("a kept write error is announced on its page only", async () => {
    render(<App />);
    writeError();
    expect(banner()?.getAttribute("role")).toBe("alert");
    await go("properties");
    expect(banner()).not.toBeNull();
    expect(banner()?.getAttribute("role")).toBeNull();
    await go("dashboard");
    expect(banner()?.getAttribute("role")).toBeNull();
  });

  it("stays announced while its page switches variants", async () => {
    render(<App />);
    writeError();
    act(() =>
      usePortfolioStore.setState({
        portfolio: inactive,
      } as never),
    );
    expect(banner()?.getAttribute("role")).toBe("alert");
  });

  it("a kept notice is a status on its page only", async () => {
    render(<App />);
    act(() =>
      useUiStore.getState().setNotice({ kind: "restored", file: "x.db" }),
    );
    const notice = () => document.querySelector(".banner.info");
    expect(notice()?.getAttribute("role")).toBe("status");
    await go("properties");
    expect(notice()).not.toBeNull();
    expect(notice()?.getAttribute("role")).toBeNull();
  });
});

describe("the page boundary's fallback (#483, ADR 0146)", () => {
  it("shows the sidebar, the page title, no lens and the notice in a chrome of its own", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<App />);
    const before = sidebar();
    act(() => usePortfolioStore.setState({ portfolio: broken } as never));
    expect(sidebar()).not.toBeNull();
    expect(sidebar()).not.toBe(before);
    expect(title()?.textContent).toBe(en.dashboard.title);
    expect(
      screen.queryByRole("group", { name: en.shell.nominalOrReal }),
    ).toBeNull();
    expect(
      screen.queryByText(en.errorBoundary.invalidDataTitle),
    ).not.toBeNull();
    const fallback = sidebar();
    // Recovery: valid data again on another page.
    act(() => usePortfolioStore.setState({ portfolio } as never));
    await go("properties");
    expect(title()?.textContent).toBe(en.properties.title);
    expect(sidebar()).not.toBe(fallback);
    expect(screen.queryByText(en.errorBoundary.invalidDataTitle)).toBeNull();
  });
});

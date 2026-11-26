// @vitest-environment jsdom
//
// ADR 0146 (#131), ADR 0263: after a page change, focus that fell to <body> or stayed in
// the chrome (the pressed nav button, the skip link) moves to the new page's main region.
// Focus is not moved at startup, and focus a page sets on purpose wins. The layout keeps
// the last shown route in module state (shellMemory), so each test loads fresh modules
// (#256).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { portfolio, assumptions } from "../../engine/__tests__/support/seed";
import { en } from "../../i18n/en";

const pageTitle = () => document.querySelector(".page-title")?.textContent;

let App: typeof import("../App").App;
let useUiStore: typeof import("../../state/uiStore").useUiStore;

beforeEach(async () => {
  vi.resetModules();
  await import("../../i18n/__tests__/preload"); // the fresh i18n needs its dictionaries
  ({ App } = await import("../App"));
  ({ useUiStore } = await import("../../state/uiStore"));
  const { usePortfolioStore } = await import("../../state/portfolioStore");
  act(() => {
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: { kind: "ready" },
      error: null,
      init: async () => {},
    } as never);
    useUiStore.setState({
      language: "en",
      route: "dashboard",
      asOf: null,
      dashboardPropertyIds: [],
      unsavedSources: [],
      pendingLeave: null,
      request: null,
    });
  });
});

describe("focus after navigation (ADR 0146)", () => {
  it("does not move focus at startup", () => {
    render(<App />);
    expect(document.activeElement).toBe(document.body);
  });

  it("VR503A: a sidebar page change focuses the main region (#131)", async () => {
    const user = userEvent.setup();
    render(<App />);
    screen.getByRole("button", { name: en.nav.guide }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(pageTitle()).toBe(en.guide.title));
    // The focus move can land after the title on a slow runner (#335).
    await waitFor(() => expect(document.activeElement?.id).toBe("main"));
  });

  // Guide's focus effect runs before the layout's (a child's effect runs before its
  // parent's, ADR 0263 §2), so this pin exercises the "focus lost" guard, as the dialog
  // pin below does.
  it("keeps the focus a page sets: a glossary term from a metric link", async () => {
    render(<App />);
    act(() => useUiStore.getState().openGuide("fixation"));
    await waitFor(() =>
      expect(document.activeElement?.id).toBe("glossary-fixation"),
    );
  });

  it("keeps the focus a page sets: the New Property dialog (⌘N)", async () => {
    render(<App />);
    act(() => useUiStore.getState().requestNewProperty());
    const dialog = await screen.findByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});

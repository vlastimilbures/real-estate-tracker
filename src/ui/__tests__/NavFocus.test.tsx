// @vitest-environment jsdom
//
// ADR 0146 (#131): every page renders its own shell, so a page change removes the nav
// button that was pressed. Focus then moves to the new page's main region, not <body>.
// Focus is not moved at startup, and focus a page sets on purpose wins.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { portfolio, assumptions } from "../../engine/__tests__/support/seed";
import { en } from "../../i18n/en";

vi.mock("../../data/errorLog", () => ({ logFailure: vi.fn() }));

const pageTitle = () => document.querySelector(".page-title")?.textContent;

beforeEach(() => {
  act(() => {
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: "ready",
      error: null,
      init: async () => {},
    } as never);
    useUiStore.setState({
      language: "en",
      route: "dashboard",
      asOf: null,
      dashboardPropertyIds: [],
      unsavedChanges: false,
      pendingLeave: null,
      guideTerm: null,
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
    expect(document.activeElement?.id).toBe("main");
  });

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

// @vitest-environment jsdom
//
// UX-017: the Currency tab is gone; Settings has only Assumptions and Backup. Moved out
// of state/__tests__/currencyLocked.test.tsx (DR-170): there the page was imported
// dynamically after vi.resetModules(), and that cold import of the UI graph (~1.2 s)
// counted against the 5 s test timeout and timed out under CPU load. Static imports
// load during collection instead.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "../Settings";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";

describe("Settings tabs (UX-017)", () => {
  it("shows only the Assumptions and Backup tabs", () => {
    const en = getDict("en");
    act(() => useUiStore.setState({ language: "en", route: "settings" }));
    render(<SettingsPage />);
    const tabs = screen.getAllByRole("tab").map((b) => b.textContent);
    expect(tabs).toEqual([
      en.settings.tabs.assumptions,
      en.settings.tabs.backup,
    ]);
  });
});

// #128 R5-15 (ADR 0157): the tabs follow the tab pattern. One Tab stop, the arrows move
// between tabs, and Enter or Space switches (manual activation: a switch can raise the
// unsaved-changes guard, so moving focus alone never switches).
describe("Settings tab pattern (#128 R5-15)", () => {
  const en = getDict("en");
  beforeEach(() =>
    act(() =>
      useUiStore.setState({
        language: "en",
        route: "settings",
        settingsTab: "assumptions",
        unsavedChanges: false,
        pendingLeave: null,
      }),
    ),
  );
  const tab = (name: string) => screen.getByRole("tab", { name });

  it("has one Tab stop, on the selected tab", () => {
    render(<SettingsPage />);
    expect(tab(en.settings.tabs.assumptions).tabIndex).toBe(0);
    expect(tab(en.settings.tabs.backup).tabIndex).toBe(-1);
  });

  it("moves focus with the arrows, Home and End without switching", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    tab(en.settings.tabs.assumptions).focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(tab(en.settings.tabs.backup));
    expect(useUiStore.getState().settingsTab).toBe("assumptions");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(tab(en.settings.tabs.assumptions));
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(tab(en.settings.tabs.backup));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(tab(en.settings.tabs.assumptions));
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(tab(en.settings.tabs.backup));
  });

  it("switches with Enter", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    tab(en.settings.tabs.assumptions).focus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(useUiStore.getState().settingsTab).toBe("backup");
    expect(tab(en.settings.tabs.backup).tabIndex).toBe(0);
  });

  it("wires the tabs and the panel to each other", () => {
    render(<SettingsPage />);
    const active = tab(en.settings.tabs.assumptions);
    const panel = screen.getByRole("tabpanel", {
      name: en.settings.tabs.assumptions,
    });
    expect(active.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(active.id);
  });

  it("puts the tablist on a plain element, not a navigation landmark", () => {
    render(<SettingsPage />);
    const list = screen.getByRole("tablist");
    expect(list.tagName).not.toBe("NAV");
    expect(list.getAttribute("aria-orientation")).toBe("vertical");
  });
});

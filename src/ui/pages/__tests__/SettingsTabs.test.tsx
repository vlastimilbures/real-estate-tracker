// @vitest-environment jsdom
//
// UX-017: the Currency tab is gone; Settings has only Assumptions and Backup. Moved out
// of state/__tests__/currencyLocked.test.tsx (DR-170): there the page was imported
// dynamically after vi.resetModules(), and that cold import of the UI graph (~1.2 s)
// counted against the 5 s test timeout and timed out under CPU load. Static imports
// load during collection instead.
import { describe, it, expect } from "vitest";
import { act, render, screen } from "@testing-library/react";
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

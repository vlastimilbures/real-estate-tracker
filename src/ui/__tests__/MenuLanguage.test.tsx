// @vitest-environment jsdom
//
// UX-076 (DR-155): App sends the native menu labels in the UI language at start and on
// every language change; outside Tauri (browser, E2E) it sends nothing.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { App } from "../App";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { getDict } from "../../i18n";
import { menuLabels } from "../model/menu";

const invoke = vi.hoisted(() =>
  vi.fn<(cmd: string, args?: unknown) => Promise<undefined>>(
    async () => undefined,
  ),
);
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => undefined),
}));

const sent = () =>
  invoke.mock.calls.filter(([cmd]) => cmd === "set_menu_labels");

beforeEach(() => {
  invoke.mockClear();
  act(() => {
    useUiStore.setState({ language: "en" });
    // The error screen keeps the render small; the menu bridge is mounted regardless.
    usePortfolioStore.setState({
      status: "error",
      error: { kind: "other", message: "x" },
      startupError: null,
      init: async () => {},
    } as never);
  });
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  document.body.innerHTML = "";
});

describe("native menu language (UX-076)", () => {
  it("sends the labels at start and when the language changes", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    render(<App />);
    await act(async () => {});
    expect(sent()).toEqual([
      ["set_menu_labels", { labels: menuLabels(getDict("en")) }],
    ]);

    act(() => useUiStore.getState().setLanguage("cs"));
    await act(async () => {});
    expect(sent().at(-1)).toEqual([
      "set_menu_labels",
      { labels: menuLabels(getDict("cs")) },
    ]);
  });

  it("sends nothing outside the desktop app", async () => {
    render(<App />);
    await act(async () => {});
    expect(sent()).toEqual([]);
  });
});

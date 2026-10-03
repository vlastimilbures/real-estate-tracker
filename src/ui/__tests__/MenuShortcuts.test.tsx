// @vitest-environment jsdom
//
// UX-066 (DR-143): the native menu's New Property (⌘N) and View (⌘1–⌘5) items reach the
// webview as events; App turns them into the same navigation as the sidebar. While a
// dialog is open they do nothing (the dialog may hold unsaved input).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { App } from "../App";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";

type Handler = (e: { payload: unknown }) => void;
const handlers = vi.hoisted(() => new Map<string, Handler>());
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, h: Handler) => {
    handlers.set(name, h);
    return () => handlers.delete(name);
  }),
}));

function emit(name: string, payload: unknown = null) {
  const h = handlers.get(name);
  if (!h) throw new Error(`no listener for ${name}`);
  act(() => h({ payload }));
}

beforeEach(() => {
  handlers.clear();
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  act(() => {
    useUiStore.setState({
      language: "en",
      route: "dashboard",
      newPropertyRequested: false,
      unsavedChanges: false,
      pendingLeave: null,
    });
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

describe("menu shortcuts (UX-066)", () => {
  it("View items switch pages", async () => {
    render(<App />);
    await act(async () => {});
    emit("menu://navigate", "projections");
    expect(useUiStore.getState().route).toBe("projections");
  });

  it("an unknown page is ignored", async () => {
    render(<App />);
    await act(async () => {});
    emit("menu://navigate", "settings");
    expect(useUiStore.getState().route).toBe("dashboard");
  });

  it("New Property opens the Add form on Properties", async () => {
    render(<App />);
    await act(async () => {});
    emit("menu://new-property");
    const s = useUiStore.getState();
    expect(s.route).toBe("properties");
    expect(s.newPropertyRequested).toBe(true);
  });

  it("does nothing while a dialog is open", async () => {
    render(<App />);
    await act(async () => {});
    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);
    emit("menu://navigate", "projections");
    emit("menu://new-property");
    const s = useUiStore.getState();
    expect(s.route).toBe("dashboard");
    expect(s.newPropertyRequested).toBe(false);
  });
});

describe("About menu item", () => {
  it("opens the About dialog", async () => {
    act(() => useUiStore.setState({ aboutOpen: false }));
    render(<App />);
    await act(async () => {});
    emit("menu://about");
    expect(useUiStore.getState().aboutOpen).toBe(true);
  });
});

// UX-074 (DR-154, ADR 0077): ⌘, follows the same rule as the other shortcuts.
describe("Settings shortcut (UX-074)", () => {
  it("opens Settings", async () => {
    render(<App />);
    await act(async () => {});
    emit("menu://settings");
    expect(useUiStore.getState().route).toBe("settings");
  });

  it("does nothing while a dialog is open", async () => {
    render(<App />);
    await act(async () => {});
    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);
    emit("menu://settings");
    expect(useUiStore.getState().route).toBe("dashboard");
  });
});

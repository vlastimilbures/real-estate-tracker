// @vitest-environment jsdom
//
// UX-057 (DR-086): the startup error screen is no longer a dead end: it says what to do
// next and offers Try again, which re-runs the startup.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { en } from "../../i18n/en";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const init = vi.fn(async () => {});

beforeEach(() => {
  init.mockClear();
  act(() => {
    useUiStore.setState({ language: "en" });
    usePortfolioStore.setState({
      status: "error",
      error: { kind: "other", message: "disk I/O error" },
      startupError: null,
      init,
    } as never);
  });
});

describe("startup error screen (UX-057)", () => {
  it("says what to do next and points at the log", () => {
    render(<App />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(en.app.bootRetryHint);
    expect(alert.textContent).toContain(en.dataErrors.logHint);
  });

  it("Try again re-runs the startup", async () => {
    render(<App />);
    const before = init.mock.calls.length;
    await userEvent.click(
      screen.getByRole("button", { name: en.app.tryAgain }),
    );
    expect(init.mock.calls.length).toBe(before + 1);
  });
});

// @vitest-environment jsdom
//
// UX-030: leaving Settings → Assumptions with unsaved edits asks first instead of
// silently dropping them.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "../../pages/Settings";
import { LeaveGuard } from "../LeaveGuard";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

beforeEach(() => {
  act(() => {
    useUiStore.setState({
      language: "en",
      route: "settings",
      settingsTab: "assumptions",
      unsavedChanges: false,
      pendingLeave: null,
    });
    usePortfolioStore.setState({ portfolio, assumptions, status: "ready" });
  });
});

function renderPanel() {
  render(
    <>
      <SettingsPage />
      <LeaveGuard />
    </>,
  );
}

async function editInflation() {
  const input = screen.getByLabelText(/^Inflation/);
  await userEvent.clear(input);
  await userEvent.type(input, "3");
}

describe("unsaved Assumptions guard (UX-030)", () => {
  it("an untouched form leaves without asking", () => {
    renderPanel();
    act(() => useUiStore.getState().setSettingsTab("backup"));
    expect(useUiStore.getState().settingsTab).toBe("backup");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("an edited form asks; Keep editing stays with the edit", async () => {
    renderPanel();
    await editInflation();
    act(() => useUiStore.getState().navigate("dashboard"));
    expect(useUiStore.getState().route).toBe("settings");
    expect(
      screen.getByRole("dialog", { name: /unsaved changes/i }),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: /keep editing/i }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useUiStore.getState().route).toBe("settings");
    expect(
      (screen.getByLabelText(/^Inflation/) as HTMLInputElement).value,
    ).toBe("3");
  });

  it("Discard leaves to the requested place", async () => {
    renderPanel();
    await editInflation();
    act(() => useUiStore.getState().setSettingsTab("backup"));
    // The guard's own Discard, not the form's "Discard changes" (ADR 0095).
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /discard/i,
      }),
    );
    expect(useUiStore.getState().settingsTab).toBe("backup");
    expect(useUiStore.getState().unsavedChanges).toBe(false);
    // Back on the tab the saved values show: the discarded draft is gone (ADR 0221 §3).
    act(() => useUiStore.getState().setSettingsTab("assumptions"));
    expect(
      (screen.getByLabelText(/^Inflation/) as HTMLInputElement).value,
    ).not.toBe("3");
    expect(useUiStore.getState().unsavedChanges).toBe(false);
  });

  it("after a successful save the form leaves without asking", async () => {
    const saveAssumptions = vi.fn(async () => ({ ok: true as const }));
    act(() => usePortfolioStore.setState({ saveAssumptions }));
    renderPanel();
    await editInflation();
    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );
    expect(saveAssumptions).toHaveBeenCalledTimes(1);
    act(() => useUiStore.getState().navigate("dashboard"));
    expect(useUiStore.getState().route).toBe("dashboard");
  });

  it("a save still running when the guard drops the draft leaves no errors behind (ADR 0221 §3)", async () => {
    let finish: (r: unknown) => void = () => undefined;
    const saveAssumptions = vi.fn(
      () => new Promise((r) => (finish = r)),
    ) as never;
    act(() => usePortfolioStore.setState({ saveAssumptions }));
    renderPanel();
    await editInflation();
    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );
    act(() => useUiStore.getState().setSettingsTab("backup"));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /discard/i,
      }),
    );
    await act(async () =>
      finish({
        ok: false,
        error: { kind: "input", message: "inflationPa: out of range" },
      }),
    );
    act(() => useUiStore.getState().setSettingsTab("assumptions"));
    expect(document.querySelector(".error-summary")).toBeNull();
    expect(document.querySelector(".field.invalid")).toBeNull();
    expect(screen.getByText(/all changes saved/i)).toBeTruthy();
  });
});

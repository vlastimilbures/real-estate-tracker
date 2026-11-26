// @vitest-environment jsdom
//
// ADR 0154, 0189: what the toast region shows, and for how long. One duration for every
// toast, counted from when it was raised; a newer toast replaces it and restarts the
// count; an older toast's count never ends a newer one; a page change keeps it. The
// count runs whether or not the region is mounted: a toast raised while the app shows the
// error screen (a committed write whose read-back failed, ADR 0228) has expired if the
// app comes back more than 4 s later. Characterisation for #468, which may move the
// timer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ToastRegion } from "../OutcomeRegions";
import { TOAST_MS, useUiStore } from "../../../state/uiStore";

const ui = () => useUiStore.getState();
const shown = () => screen.getByRole("status").textContent;
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  act(() => useUiStore.setState({ toast: null, route: "settings" }));
});

afterEach(() => {
  // Let any timer left by a test expire before the next one starts.
  act(() => vi.runOnlyPendingTimers());
  vi.useRealTimers();
});

describe("the toast region's timing", () => {
  it("shows a toast for 4 s, then nothing", () => {
    render(<ToastRegion />);
    act(() => ui().showToast("Saved"));
    wait(TOAST_MS - 1);
    expect(shown()).toBe("Saved");
    wait(1);
    expect(shown()).toBe("");
  });

  it("a newer toast replaces it and counts 4 s from its own start", () => {
    render(<ToastRegion />);
    act(() => ui().showToast("First"));
    wait(TOAST_MS - 100);
    act(() => ui().showToast("Second"));
    expect(shown()).toBe("Second");
    wait(TOAST_MS - 1);
    expect(shown()).toBe("Second");
    wait(1);
    expect(shown()).toBe("");
  });

  it("the same text again also restarts the count", () => {
    render(<ToastRegion />);
    act(() => ui().showToast("Saved"));
    wait(TOAST_MS - 100);
    act(() => ui().showToast("Saved"));
    wait(TOAST_MS - 1);
    expect(shown()).toBe("Saved");
    wait(1);
    expect(shown()).toBe("");
  });

  it("an older toast's count does not end a toast set since then (#274)", () => {
    render(<ToastRegion />);
    act(() => ui().showToast("Old"));
    act(() => useUiStore.setState({ toast: { message: "New", id: -1 } }));
    wait(TOAST_MS);
    expect(shown()).toBe("New");
  });

  it("a page change keeps it", () => {
    render(<ToastRegion />);
    act(() => ui().showToast("Saved"));
    act(() => ui().navigate("dashboard"));
    expect(shown()).toBe("Saved");
  });
});

describe("a toast raised while the region is not mounted", () => {
  it("shows for what is left of its 4 s once the region mounts", () => {
    act(() => ui().showToast("Saved"));
    wait(2000);
    render(<ToastRegion />);
    expect(shown()).toBe("Saved");
    wait(TOAST_MS - 2000);
    expect(shown()).toBe("");
  });

  it("is gone if the region mounts after its 4 s", () => {
    act(() => ui().showToast("Saved"));
    wait(TOAST_MS);
    render(<ToastRegion />);
    expect(shown()).toBe("");
  });
});

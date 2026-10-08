// @vitest-environment jsdom
//
// useToast shows through the store (ADR 0154): the timer lives there, so unmounting the
// page that raised a toast keeps it. Duration and restart: uiStoreOutcomes.test.ts.
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useToast } from "../useToast";
import { TOAST_MS, useUiStore } from "../../../state/uiStore";

afterEach(() => vi.useRealTimers());

describe("useToast", () => {
  it("shows the message in the store's toast", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast("Saved"));
    expect(useUiStore.getState().toast?.message).toBe("Saved");
    act(() => vi.advanceTimersByTime(TOAST_MS));
    expect(useUiStore.getState().toast).toBeNull();
  });

  it("unmounting the page keeps the toast until its time is up", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useToast());
    act(() => result.current.showToast("Bye"));
    unmount();
    expect(useUiStore.getState().toast?.message).toBe("Bye");
    act(() => vi.advanceTimersByTime(TOAST_MS));
    expect(useUiStore.getState().toast).toBeNull();
  });
});

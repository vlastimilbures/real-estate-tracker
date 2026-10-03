// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useToast } from "../useToast";

afterEach(() => vi.useRealTimers());

describe("useToast", () => {
  it("clears the message after the duration", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast(1000));
    act(() => result.current.showToast("Saved"));
    expect(result.current.toast).toBe("Saved");
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.toast).toBeNull();
  });

  it("a newer toast restarts the timer instead of being cut short", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast(1000));
    act(() => result.current.showToast("First"));
    act(() => vi.advanceTimersByTime(800));
    act(() => result.current.showToast("Second"));
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.toast).toBe("Second");
  });

  it("unmounting cancels the pending timer", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useToast(1000));
    act(() => result.current.showToast("Bye"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

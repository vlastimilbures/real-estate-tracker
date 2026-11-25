// @vitest-environment jsdom
//
// #489: one registration with the leave guard (UX-030, UX-073). A form registers under its
// key while dirty, unregisters when clean, when its key changes and when it unmounts, and
// never clears another form's key.
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLeaveGuard } from "../useLeaveGuard";
import { useUiStore } from "../../../state/uiStore";

const sources = () => useUiStore.getState().unsavedSources;

beforeEach(() =>
  act(() => useUiStore.setState({ unsavedSources: [], unsavedChanges: false })),
);

describe("useLeaveGuard (#489)", () => {
  it("registers while dirty and unregisters when clean", () => {
    const hook = renderHook(({ dirty }) => useLeaveGuard("a", dirty), {
      initialProps: { dirty: false },
    });
    expect(sources()).toEqual([]);
    hook.rerender({ dirty: true });
    expect(sources()).toEqual(["a"]);
    expect(useUiStore.getState().unsavedChanges).toBe(true);
    hook.rerender({ dirty: false });
    expect(sources()).toEqual([]);
  });

  it("unregisters on unmount and on a key change", () => {
    const hook = renderHook(({ k }) => useLeaveGuard(k, true), {
      initialProps: { k: "a" },
    });
    hook.rerender({ k: "b" });
    expect(sources()).toEqual(["b"]);
    hook.unmount();
    expect(sources()).toEqual([]);
  });

  it("leaves another form's key alone", () => {
    renderHook(() => useLeaveGuard("other", true));
    const hook = renderHook(() => useLeaveGuard("mine", true));
    hook.unmount();
    expect(sources()).toEqual(["other"]);
  });
});

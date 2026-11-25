// @vitest-environment jsdom
//
// #491: the one dismiss hook and the layer stack under it. The orders themselves are
// pinned by src/ui/__tests__/LayerEscapeOrder.test.tsx through the real components.
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { useDismiss, type DismissOptions } from "../useDismiss";
import { anyOpen, pushLayer } from "../../layers";

function Layer({
  onDismiss,
  options,
}: {
  onDismiss: (cause: string) => void;
  options: Omit<DismissOptions, "inside">;
}) {
  const box = useRef<HTMLDivElement>(null);
  useDismiss(onDismiss, { ...options, inside: [box] });
  return (
    <div ref={box}>
      <button type="button">Inside</button>
    </div>
  );
}

describe("layers (#491)", () => {
  it("the last pushed layer is the top one; popping twice is harmless", () => {
    const a = pushLayer();
    const b = pushLayer();
    expect([a.isTop(), b.isTop(), anyOpen()]).toEqual([false, true, true]);
    b.pop();
    b.pop();
    expect(a.isTop()).toBe(true);
    a.pop();
    expect(anyOpen()).toBe(false);
  });
});

describe("useDismiss (#491)", () => {
  it("names the cause, and ignores a press inside", () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(
      <Layer
        onDismiss={onDismiss}
        options={{ escape: "first", outside: "mousedown" }}
      />,
    );
    fireEvent.mouseDown(getByRole("button", { name: "Inside" }));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(document.body, { key: "Escape" });
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(onDismiss.mock.calls).toEqual([["outside"], ["escape"]]);
  });

  it("listens only while open, and a closed top layer leaves the stack", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <Layer onDismiss={onDismiss} options={{ open: false, escape: "top" }} />,
    );
    expect(anyOpen()).toBe(false);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
    rerender(<Layer onDismiss={onDismiss} options={{ escape: "top" }} />);
    expect(anyOpen()).toBe(true);
    rerender(
      <Layer onDismiss={onDismiss} options={{ open: false, escape: "top" }} />,
    );
    expect(anyOpen()).toBe(false);
  });

  it("a tip stops the Escape by default, and lets it through when `stops` says so", () => {
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    const stopping = renderHook(() => useDismiss(() => {}, { escape: "tip" }));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(outer).not.toHaveBeenCalled();
    stopping.unmount();
    renderHook(() =>
      useDismiss(() => {}, { escape: "tip", stops: () => false }),
    );
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(outer).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", outer);
  });

  it("is the top layer only while it is one", () => {
    const { result } = renderHook(() =>
      useDismiss(() => {}, { escape: "top" }),
    );
    expect(result.current()).toBe(true);
    const other = pushLayer();
    expect(result.current()).toBe(false);
    other.pop();
    const plain = renderHook(() => useDismiss(() => {}, { escape: "first" }));
    expect(plain.result.current()).toBe(false);
  });
});

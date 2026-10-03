// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRenderTiming } from "../useRenderTiming";

const entries = (name: string, type: "mark" | "measure") =>
  performance.getEntriesByName(name, type).length;

afterEach(() => {
  performance.clearMarks();
  performance.clearMeasures();
});

describe("useRenderTiming", () => {
  it("does not time a null output", () => {
    renderHook(() => useRenderTiming("page-a", null));
    expect(entries("page-a-render", "measure")).toBe(0);
    expect(entries("page-a-rendered", "mark")).toBe(0);
  });

  it("measures each new output and marks the first one once", () => {
    const hook = renderHook(({ out }) => useRenderTiming("page-b", out), {
      initialProps: { out: { v: 1 } as object | null },
    });
    expect(entries("page-b-render", "measure")).toBe(1);
    expect(entries("page-b-rendered", "mark")).toBe(1);
    performance.clearMarks("page-b-rendered");
    hook.rerender({ out: { v: 2 } });
    expect(entries("page-b-render", "measure")).toBe(1);
    expect(entries("page-b-rendered", "mark")).toBe(0);
  });
});

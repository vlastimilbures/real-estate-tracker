// @vitest-environment jsdom
//
// ADR 0107 (#23): the section in view is the first one in the observed band, the last
// one at the bottom of the page, and a nav click marks a section at once.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSectionSpy } from "../useSectionSpy";

class FakeObserver {
  static all: FakeObserver[] = [];
  readonly targets: Element[] = [];
  disconnected = false;
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeObserver.all.push(this);
  }
  observe(el: Element) {
    this.targets.push(el);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  takeRecords() {
    return [];
  }
}

const ids = ["s-a", "s-b", "s-c"];
const last = () => FakeObserver.all.at(-1)!;

function report(changes: Record<string, boolean>) {
  const o = last();
  act(() =>
    o.callback(
      Object.entries(changes).map(
        ([id, isIntersecting]) =>
          ({
            target: document.getElementById(id),
            isIntersecting,
          }) as unknown as IntersectionObserverEntry,
      ),
      o as unknown as IntersectionObserver,
    ),
  );
}

function scrollTo(y: number, scrollHeight: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  Object.defineProperty(window, "innerHeight", {
    value: 800,
    configurable: true,
  });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    value: scrollHeight,
    configurable: true,
  });
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

beforeEach(() => {
  FakeObserver.all = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  document.body.innerHTML =
    '<header class="topbar"></header>' +
    ids.map((id) => `<section id="${id}"></section>`).join("");
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("useSectionSpy (ADR 0107)", () => {
  it("starts on the first section and observes every section", () => {
    const { result } = renderHook(() => useSectionSpy(ids));
    expect(result.current[0]).toBe("s-a");
    expect(last().targets.map((t) => t.id)).toEqual(ids);
    // The band starts under the topbar and ends mid-window.
    expect(last().options?.rootMargin).toBe("-0px 0px -50% 0px");
  });

  it("follows the first section in the band and keeps it while none is", () => {
    const { result } = renderHook(() => useSectionSpy(ids));
    report({ "s-c": true, "s-b": true });
    expect(result.current[0]).toBe("s-b");
    report({ "s-b": false });
    expect(result.current[0]).toBe("s-c");
    report({ "s-c": false });
    expect(result.current[0]).toBe("s-c");
  });

  it("is the last section at the bottom of the page", () => {
    const { result } = renderHook(() => useSectionSpy(ids));
    scrollTo(200, 1000);
    expect(result.current[0]).toBe("s-c");
    scrollTo(100, 1000);
    report({ "s-a": true });
    expect(result.current[0]).toBe("s-a");
  });

  it("never counts a page that does not scroll as at the bottom", () => {
    const { result } = renderHook(() => useSectionSpy(ids));
    scrollTo(0, 800);
    expect(result.current[0]).toBe("s-a");
  });

  it("marks a selected section at once", () => {
    const { result } = renderHook(() => useSectionSpy(ids));
    act(() => result.current[1]("s-b"));
    expect(result.current[0]).toBe("s-b");
  });

  it("drops a current id that is no longer a section", () => {
    const { result, rerender } = renderHook(({ list }) => useSectionSpy(list), {
      initialProps: { list: ids },
    });
    act(() => result.current[1]("s-c"));
    const first = last();
    rerender({ list: ["s-a", "s-b"] });
    expect(first.disconnected).toBe(true);
    expect(result.current[0]).toBe("s-a");
  });

  it("disconnects and stops listening on unmount", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useSectionSpy(ids));
    unmount();
    expect(last().disconnected).toBe(true);
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    remove.mockRestore();
  });

  it("stays on the first section without IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { result } = renderHook(() => useSectionSpy(ids));
    expect(result.current[0]).toBe("s-a");
    expect(FakeObserver.all).toEqual([]);
  });

  it("moves the band when the topbar grows (the section nav wraps, ADR 0158)", () => {
    let resized: ResizeObserverCallback = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: ResizeObserverCallback) {
          resized = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const bar = document.querySelector(".topbar")!;
    let height = 100;
    vi.spyOn(bar, "getBoundingClientRect").mockImplementation(
      () => ({ height }) as DOMRect,
    );
    renderHook(() => useSectionSpy(ids));
    expect(last().options?.rootMargin).toBe("-100px 0px -50% 0px");
    const first = last();
    height = 140;
    act(() => resized([], {} as ResizeObserver));
    expect(first.disconnected).toBe(true);
    expect(last().options?.rootMargin).toBe("-140px 0px -50% 0px");
  });

  it("is null for a page with no sections", () => {
    const { result } = renderHook(() => useSectionSpy([]));
    expect(result.current[0]).toBeNull();
  });
});

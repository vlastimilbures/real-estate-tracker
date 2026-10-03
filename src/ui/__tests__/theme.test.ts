// @vitest-environment jsdom
//
// The "system" appearance follows the OS (prefers-color-scheme) and re-themes on change.
import { describe, it, expect, afterEach, vi } from "vitest";
import { applyTheme, onSystemThemeChange, resolveTheme } from "../theme";

function stubMatchMedia(matches: boolean) {
  const mq = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mq),
  );
  return mq;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("theme", () => {
  it("an explicit preference wins", () => {
    stubMatchMedia(true);
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("system follows the OS", () => {
    stubMatchMedia(true);
    expect(resolveTheme("system")).toBe("dark");
    stubMatchMedia(false);
    expect(resolveTheme("system")).toBe("light");
  });

  it("system is light where the OS cannot be asked", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(resolveTheme("system")).toBe("light");
    expect(onSystemThemeChange(() => {})).toBeTypeOf("function");
  });

  it("applies the resolved value to <html data-theme>", () => {
    stubMatchMedia(true);
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("subscribes to OS changes and unsubscribes", () => {
    const mq = stubMatchMedia(false);
    const cb = () => {};
    const off = onSystemThemeChange(cb);
    expect(mq.addEventListener).toHaveBeenCalledWith("change", cb);
    off();
    expect(mq.removeEventListener).toHaveBeenCalledWith("change", cb);
  });
});

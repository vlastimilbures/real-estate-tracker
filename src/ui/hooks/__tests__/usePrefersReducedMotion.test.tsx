// @vitest-environment jsdom
//
// UX-058 (DR-147): charts skip their entry animation when the OS asks for reduced motion.
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("usePrefersReducedMotion", () => {
  it("is true when the OS asks for reduced motion", () => {
    mockMatchMedia(true);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(
      true,
    );
  });
  it("is false otherwise", () => {
    mockMatchMedia(false);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(
      false,
    );
  });
});

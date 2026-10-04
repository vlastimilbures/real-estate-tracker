// @vitest-environment jsdom
//
// UX-017: the Currency tab is gone and amounts always show in Kč. A currency picked
// before (stored in localStorage) is ignored and cleared. The Settings-tabs check lives
// in ui/pages/__tests__/SettingsTabs.test.tsx (DR-170).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// A fresh Map-backed storage per test, so a stored value never reaches the next one.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => vi.unstubAllGlobals());

describe("currency is locked to CZK (UX-017)", () => {
  it("ignores and clears a stored non-CZK choice", async () => {
    localStorage.setItem("ui.currency", "EUR");
    await import("../uiStore");
    const { fmtCzk } = await import("../../lib/format");
    expect(fmtCzk(1000)).toMatch(/Kč$/);
    expect(localStorage.getItem("ui.currency")).toBeNull();
  });
});

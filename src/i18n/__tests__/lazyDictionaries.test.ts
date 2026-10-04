// DR-009: each dictionary is its own chunk, loaded on demand, so startup carries only
// the active language. Every case imports a fresh copy of the module: the shared one is
// preloaded with all three by the test setup (preload.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cs } from "../cs";

async function freshI18n() {
  return import("../index");
}

beforeEach(() => {
  vi.resetModules();
});

describe("lazy dictionaries (DR-009)", () => {
  it("holds no dictionary until one is loaded", async () => {
    const i18n = await freshI18n();
    expect(i18n.isDictionaryLoaded("en")).toBe(false);
    expect(() => i18n.getDict("cs")).toThrow(
      'i18n: dictionary "cs" used before loadDictionary',
    );
  });

  it("loads only the requested language", async () => {
    const i18n = await freshI18n();
    const dict = await i18n.loadDictionary("cs");
    expect(dict.nav.dashboard).toBe(cs.nav.dashboard);
    expect(i18n.getDict("cs")).toBe(dict);
    expect(i18n.isDictionaryLoaded("cs")).toBe(true);
    expect(i18n.isDictionaryLoaded("en")).toBe(false);
    expect(i18n.isDictionaryLoaded("ru")).toBe(false);
  });

  it("shares one load between concurrent callers", async () => {
    const i18n = await freshI18n();
    const a = i18n.loadDictionary("ru");
    const b = i18n.loadDictionary("ru");
    expect(b).toBe(a);
    expect(await a).toBe(await b);
  });

  it("retries a load that failed", async () => {
    vi.doMock("../cs", () => {
      throw new Error("chunk missing");
    });
    const i18n = await freshI18n();
    await expect(i18n.loadDictionary("cs")).rejects.toThrow();
    expect(i18n.isDictionaryLoaded("cs")).toBe(false);

    vi.doUnmock("../cs");
    const dict = await i18n.loadDictionary("cs");
    expect(dict.nav.dashboard).toBe(cs.nav.dashboard);
  });
});

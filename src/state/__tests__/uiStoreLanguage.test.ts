// @vitest-environment jsdom
//
// DR-009: the UI switches language only once that language's dictionary has loaded, so
// a switch never shows a blank or half-translated frame; startup loads the saved one.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Language } from "../../i18n/types";
import { loadStartupDictionary, useUiStore } from "../uiStore";

const i18n = vi.hoisted(() => {
  const loaded = new Set<string>();
  const pending = new Map<
    string,
    { resolve: () => void; reject: (e: Error) => void }
  >();
  return {
    loaded,
    pending,
    isDictionaryLoaded: (lang: string) => loaded.has(lang),
    loadDictionary: vi.fn(
      (lang: string) =>
        new Promise<void>((resolve, reject) => {
          pending.set(lang, {
            resolve: () => {
              loaded.add(lang);
              resolve();
            },
            reject,
          });
        }),
    ),
  };
});

vi.mock("../../i18n", () => ({
  isDictionaryLoaded: i18n.isDictionaryLoaded,
  loadDictionary: i18n.loadDictionary,
}));

/** Let the store's `.then` callbacks run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

function finish(lang: Language) {
  i18n.pending.get(lang)?.resolve();
  return settle();
}

function fail(lang: Language) {
  i18n.pending.get(lang)?.reject(new Error("chunk missing"));
  return settle();
}

beforeEach(() => {
  i18n.loaded.clear();
  i18n.loaded.add("en");
  i18n.pending.clear();
  i18n.loadDictionary.mockClear();
  localStorage.clear();
  useUiStore.setState({ language: "en" });
});

afterEach(() => vi.restoreAllMocks());

describe("setLanguage (DR-009)", () => {
  it("switches at once to a language that is already loaded", () => {
    i18n.loaded.add("cs");
    useUiStore.getState().setLanguage("cs");
    expect(useUiStore.getState().language).toBe("cs");
    expect(localStorage.getItem("ui.language")).toBe("cs");
    expect(i18n.loadDictionary).not.toHaveBeenCalled();
  });

  it("keeps the current language until the new dictionary has loaded", async () => {
    useUiStore.getState().setLanguage("ru");
    expect(i18n.loadDictionary).toHaveBeenCalledWith("ru");
    expect(useUiStore.getState().language).toBe("en");
    expect(localStorage.getItem("ui.language")).toBeNull();

    await finish("ru");
    expect(useUiStore.getState().language).toBe("ru");
    expect(localStorage.getItem("ui.language")).toBe("ru");
  });

  it("ends on the last language chosen when loads finish out of order", async () => {
    useUiStore.getState().setLanguage("cs");
    useUiStore.getState().setLanguage("ru");
    await finish("ru");
    await finish("cs");
    expect(useUiStore.getState().language).toBe("ru");
    expect(localStorage.getItem("ui.language")).toBe("ru");
  });

  it("ends on a loaded language chosen while another one is loading", async () => {
    useUiStore.getState().setLanguage("cs");
    useUiStore.getState().setLanguage("en");
    await finish("cs");
    expect(useUiStore.getState().language).toBe("en");
  });

  it("stays on the current language when the load fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    useUiStore.getState().setLanguage("cs");
    await fail("cs");
    expect(useUiStore.getState().language).toBe("en");
    expect(localStorage.getItem("ui.language")).toBeNull();
    expect(error).toHaveBeenCalled();
  });
});

describe("loadStartupDictionary (DR-009)", () => {
  it("loads the saved language before the first render", async () => {
    useUiStore.setState({ language: "cs" });
    const done = loadStartupDictionary();
    expect(i18n.loadDictionary).toHaveBeenCalledWith("cs");
    await finish("cs");
    await done;
    expect(useUiStore.getState().language).toBe("cs");
  });

  it("falls back to English for the session when the saved one fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    i18n.loaded.clear();
    localStorage.setItem("ui.language", "ru");
    useUiStore.setState({ language: "ru" });
    const done = loadStartupDictionary();
    await fail("ru");
    await finish("en");
    await done;
    expect(useUiStore.getState().language).toBe("en");
    expect(localStorage.getItem("ui.language")).toBe("ru");
  });
});

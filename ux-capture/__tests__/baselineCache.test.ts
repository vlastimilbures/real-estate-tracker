// The shared baseline cache (`pnpm ux:baseline`): matrix keys, cache paths, the
// completion marker, pruning, and where ux:diff / ux:axe-check find a run (a name
// under ux-screens/ or an absolute baseline path).
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cachePath,
  cacheRoot,
  makeMarker,
  shouldPrune,
  validMarker,
} from "../baselineCache.ts";
import { matrixKey, matrixOf } from "../matrix.ts";
import { runDir } from "../runPath.ts";

const SHA = "e808d2ee0123456789abcdef0123456789abcdef";

describe("matrixKey", () => {
  it("defaults to en, light, 1280x800", () => {
    expect(matrixKey({})).toBe("en_light_1280x800");
  });

  it("is the same however the matrix is spelt", () => {
    const key = matrixKey({
      UX_LANG: "en,cs",
      UX_THEME: "both",
      UX_VIEWPORT: "min,1280x800",
    });
    expect(key).toBe("cs.en_dark.light_1280x800.min");
    expect(
      matrixKey({
        UX_LANG: " CS , en,en",
        UX_THEME: "dark,light",
        UX_VIEWPORT: "1280x800,min",
      }),
    ).toBe(key);
  });

  it("expands all", () => {
    expect(
      matrixKey({ UX_LANG: "all", UX_THEME: "all", UX_VIEWPORT: "all" }),
    ).toBe("cs.en.ru_dark.light_1100x800.1200x800.1280x800.min");
  });

  it("rejects an empty or unsafe value", () => {
    expect(() => matrixKey({ UX_LANG: "" })).toThrow(/unexpected value/);
    expect(() => matrixKey({ UX_VIEWPORT: "../x" })).toThrow(
      /unexpected value/,
    );
  });

  it("keeps the config's run order (the projects)", () => {
    expect(matrixOf({ UX_LANG: "ru,en", UX_THEME: "both" })).toEqual({
      langs: ["ru", "en"],
      themes: ["light", "dark"],
      viewports: ["1280x800"],
    });
  });
});

describe("cache path", () => {
  it("uses UX_BASELINE_CACHE, else ~/Library/Caches/rtracker-ux", () => {
    expect(cacheRoot({ UX_BASELINE_CACHE: "/c" }, "/home/u")).toBe("/c");
    expect(cacheRoot({ UX_BASELINE_CACHE: " " }, "/home/u")).toBe(
      join("/home/u", "Library", "Caches", "rtracker-ux"),
    );
    expect(cacheRoot({}, "/home/u")).toBe(
      join("/home/u", "Library", "Caches", "rtracker-ux"),
    );
  });

  it("is <root>/<sha>/<matrix key>", () => {
    expect(cachePath("/c", SHA, "en_light_1280x800")).toBe(
      join("/c", SHA, "en_light_1280x800"),
    );
  });

  it("takes only a full sha and a safe key", () => {
    expect(() => cachePath("/c", "e808d2ee", "en_light_1280x800")).toThrow(
      /full commit sha/,
    );
    expect(() => cachePath("/c", "origin/main", "k")).toThrow(/full commit/);
    expect(() => cachePath("/c", SHA, "../x")).toThrow(/bad matrix key/);
  });
});

describe("completion marker", () => {
  const key = "en_light_1280x800";
  const marker = makeMarker(SHA, {}, 90, new Date("2026-11-24T10:00:00Z"));

  it("records the sha, matrix, screen count and date", () => {
    expect(marker).toEqual({
      sha: SHA,
      key,
      matrix: { langs: ["en"], themes: ["light"], viewports: ["1280x800"] },
      screens: 90,
      date: "2026-11-24T10:00:00.000Z",
    });
    expect(validMarker(marker, SHA, key)).toBe(true);
  });

  it("rejects a marker of another commit or matrix", () => {
    expect(validMarker(marker, SHA.replace("e", "f"), key)).toBe(false);
    expect(validMarker(marker, SHA, "en_dark_1280x800")).toBe(false);
  });

  it("rejects a missing, empty or malformed marker", () => {
    expect(validMarker(null, SHA, key)).toBe(false);
    expect(validMarker("done", SHA, key)).toBe(false);
    expect(validMarker({ ...marker, screens: 0 }, SHA, key)).toBe(false);
    expect(validMarker({ ...marker, screens: 1.5 }, SHA, key)).toBe(false);
    expect(validMarker({ ...marker, date: "later" }, SHA, key)).toBe(false);
    expect(validMarker({ ...marker, matrix: null }, SHA, key)).toBe(false);
  });
});

describe("shouldPrune", () => {
  const now = new Date("2026-11-24T10:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  it("keeps a recent entry main still reaches", () => {
    expect(shouldPrune(true, daysAgo(14), now)).toBe(false);
  });

  it("prunes one main no longer reaches, or older than 14 days", () => {
    expect(shouldPrune(false, daysAgo(0), now)).toBe(true);
    expect(shouldPrune(true, daysAgo(14.1), now)).toBe(true);
    expect(shouldPrune(true, new Date("bad"), now)).toBe(true);
  });
});

describe("runDir", () => {
  it("takes a name under ux-screens/", () => {
    expect(runDir("p07c-before")).toBe(join("ux-screens", "p07c-before"));
  });

  it("takes an absolute path as it is", () => {
    expect(runDir("/cache/abc/en_light_1280x800")).toBe(
      "/cache/abc/en_light_1280x800",
    );
    expect(runDir("/cache//abc/./x/")).toBe("/cache/abc/x/");
  });
});

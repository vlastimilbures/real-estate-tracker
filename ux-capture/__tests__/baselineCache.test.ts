// The shared baseline cache (`pnpm ux:baseline`): matrix keys, cache paths, the
// completion marker, pruning, and where ux:diff / ux:axe-check find a run (a name
// under ux-screens/ or an absolute baseline path).
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cachePath,
  cacheRoot,
  lockStale,
  makeMarker,
  planPrune,
  readCacheTree,
  shouldPrune,
  validMarker,
  type CacheItem,
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

describe("lockStale", () => {
  it("follows a known pid's process", () => {
    expect(lockStale(123, true, 3_600_000)).toBe(false);
    expect(lockStale(123, false, 0)).toBe(true);
  });

  it("treats a lock with no pid as live for 30 s", () => {
    expect(lockStale(null, false, 5_000)).toBe(false);
    expect(lockStale(null, false, 31_000)).toBe(true);
  });

  it("treats any lock older than 2 h as stale, even with a live pid", () => {
    expect(lockStale(123, true, 2 * 3_600_000 + 1)).toBe(true);
    expect(lockStale(123, true, 10_000, 5_000)).toBe(true);
  });
});

describe("planPrune", () => {
  const now = new Date("2026-11-24T10:00:00Z");
  const MAIN = "b1dd29799800b0f8162ba275ade024e53c71113c";
  const OLD = "b5b85728fd8f4562016a2730b79a453d23a70753";
  const GONE = "0123456789abcdef0123456789abcdef01234567";
  const ODD = "fedcba9876543210fedcba9876543210fedcba98";
  const fresh = "2026-11-24T09:00:00Z";
  const stale = "2026-10-01T00:00:00Z";
  const run = (sha: string, name: string, date: string | null): CacheItem => ({
    name,
    isDir: true,
    marker: date
      ? {
          sha,
          key: name,
          matrix: { langs: [], themes: [], viewports: [] },
          screens: 3,
          date,
        }
      : null,
  });
  const lock = (name: string, staleLock: boolean): CacheItem => ({
    name,
    isDir: true,
    marker: null,
    staleLock,
  });
  const plan = (tree: Record<string, CacheItem[]>) =>
    planPrune({
      tree,
      reachable: (sha) => (sha === ODD ? null : sha !== GONE),
      mainSha: MAIN,
      now,
    }).sort();

  it("touches no folder that is not a full sha", () => {
    expect(
      plan({
        notasha: [run("notasha", "precious", stale)],
        "origin-main": [run("origin-main", "en_light_1280x800", stale)],
      }),
    ).toEqual([]);
  });

  it("deletes only finished runs and unfinished .tmp runs", () => {
    expect(
      plan({
        [GONE]: [
          run(GONE, "en_light_1280x800", fresh),
          run(GONE, "notes", null),
          { name: "readme.txt", isDir: false, marker: null },
        ],
      }),
    ).toEqual([`${GONE}/en_light_1280x800`]);
  });

  it("needs a valid marker of this sha and key, not any JSON", () => {
    expect(
      plan({
        [GONE]: [
          { name: "a", isDir: true, marker: { date: stale } },
          {
            name: "b",
            isDir: true,
            marker: { ...run(OLD, "b", stale).marker! },
          },
          {
            name: "c",
            isDir: true,
            marker: { ...run(GONE, "x", stale).marker! },
          },
          { name: "d", isDir: true, marker: "complete" },
        ],
      }),
    ).toEqual([]);
  });

  it("never prunes origin/main's own entry, however old", () => {
    expect(plan({ [MAIN]: [run(MAIN, "en_light_1280x800", stale)] })).toEqual(
      [],
    );
  });

  it("keeps a sha git could not judge", () => {
    expect(plan({ [ODD]: [run(ODD, "en_light_1280x800", stale)] })).toEqual([]);
  });

  it("prunes an old entry of an ancestor, keeps a fresh one", () => {
    expect(
      plan({
        [OLD]: [
          run(OLD, "en_light_1280x800", stale),
          run(OLD, "en_dark_min", fresh),
        ],
      }),
    ).toEqual([`${OLD}/en_light_1280x800`]);
  });

  it("keeps a run and its .tmp under a live lock", () => {
    expect(
      plan({
        [GONE]: [
          lock("en_light_1280x800.lock", false),
          run(GONE, "en_light_1280x800", fresh),
          run(GONE, "en_light_1280x800.tmp-4242", null),
        ],
      }),
    ).toEqual([]);
  });

  it("removes a dead lock with its .tmp run, and a set-aside lock", () => {
    expect(
      plan({
        [OLD]: [
          lock("en_light_1280x800.lock", true),
          run(OLD, "en_light_1280x800.tmp-4242", null),
          run(OLD, "en_light_1280x800", fresh),
          run(OLD, "en_dark_min.lock.stale-77", null),
        ],
      }),
    ).toEqual([
      `${OLD}/en_dark_min.lock.stale-77`,
      `${OLD}/en_light_1280x800.lock`,
      `${OLD}/en_light_1280x800.tmp-4242`,
    ]);
  });
});

describe("readCacheTree", () => {
  const SHA_A = "a".repeat(40);
  const SHA_B = "b".repeat(40);
  let root = "";
  let outside = "";
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  const realFs = {
    readdir: (dir: string) => readdirSync(dir),
    lstat: (path: string) => lstatSync(path),
    readMarker: (dir: string) => (dir.endsWith("run") ? { date: "x" } : null),
    staleLock: () => true,
  };

  it("skips a symlinked sha folder and a symlinked item", () => {
    root = mkdtempSync(join(tmpdir(), "ux-cache-"));
    outside = mkdtempSync(join(tmpdir(), "ux-outside-"));
    mkdirSync(join(outside, "precious"));
    mkdirSync(join(root, SHA_A));
    mkdirSync(join(root, SHA_A, "run"));
    symlinkSync(join(outside, "precious"), join(root, SHA_A, "linked"));
    symlinkSync(outside, join(root, SHA_B));
    const tree = readCacheTree(root, realFs);
    expect(Object.keys(tree)).toEqual([SHA_A]);
    expect(tree[SHA_A]!.map((i) => i.name)).toEqual(["run"]);
    expect(tree[SHA_A]![0]!.marker).toEqual({ date: "x" });
  });

  it("skips a dangling link and an item that vanished", () => {
    root = mkdtempSync(join(tmpdir(), "ux-cache-"));
    outside = mkdtempSync(join(tmpdir(), "ux-outside-"));
    mkdirSync(join(root, SHA_A));
    mkdirSync(join(root, SHA_A, "run"));
    symlinkSync(join(outside, "nothing"), join(root, SHA_A, "dangling"));
    const tree = readCacheTree(root, {
      ...realFs,
      readdir: (dir) =>
        dir.endsWith(SHA_A) ? [...readdirSync(dir), "gone"] : readdirSync(dir),
    });
    expect(tree[SHA_A]!.map((i) => i.name)).toEqual(["run"]);
  });

  it("reads lock staleness, not markers, for a lock", () => {
    root = mkdtempSync(join(tmpdir(), "ux-cache-"));
    outside = mkdtempSync(join(tmpdir(), "ux-outside-"));
    mkdirSync(join(root, SHA_A, "k.lock"), { recursive: true });
    expect(readCacheTree(root, realFs)[SHA_A]).toEqual([
      { name: "k.lock", isDir: true, marker: null, staleLock: true },
    ]);
  });
});

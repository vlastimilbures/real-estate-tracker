import { describe, it, expect, afterEach, vi } from "vitest";
import {
  clearPerfMark,
  hasPerfMark,
  perfMark,
  perfMeasure,
  perfReport,
  setPerfSink,
  timed,
} from "../perf";

afterEach(() => {
  vi.unstubAllGlobals();
  performance.clearMarks();
  performance.clearMeasures();
});

describe("perf marks", () => {
  it("records and clears a mark", () => {
    perfMark("a");
    expect(hasPerfMark("a")).toBe(true);
    clearPerfMark("a");
    expect(hasPerfMark("a")).toBe(false);
  });

  it("measures from a mark to now", () => {
    perfMark("start");
    const ms = perfMeasure("span", "start");
    expect(ms).not.toBeNull();
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(performance.getEntriesByName("span", "measure")).toHaveLength(1);
  });

  it("keeps only the latest mark and measure of a name", () => {
    perfMark("a");
    perfMark("a");
    perfMeasure("span", "a");
    perfMeasure("span", "a");
    expect(performance.getEntriesByName("a", "mark")).toHaveLength(1);
    expect(performance.getEntriesByName("span", "measure")).toHaveLength(1);
  });

  it("hands measures and reported marks to the sink", () => {
    const seen: [string, number | null][] = [];
    setPerfSink((name, ms) => seen.push([name, ms]));
    try {
      perfMark("s");
      perfMeasure("m", "s");
      perfReport("milestone");
    } finally {
      setPerfSink(null);
    }
    expect(seen.map(([n]) => n)).toEqual(["m", "milestone"]);
    expect(seen[0]![1]).toBeGreaterThanOrEqual(0);
    expect(seen[1]![1]).toBeNull();
    expect(hasPerfMark("milestone")).toBe(true);
  });

  it("returns null without the start mark", () => {
    expect(perfMeasure("span", "missing")).toBeNull();
  });

  it("times a function and returns its result, also when it throws", () => {
    expect(timed("work", () => 42)).toBe(42);
    expect(() =>
      timed("fail", () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(performance.getEntriesByName("work", "measure")).toHaveLength(1);
    expect(performance.getEntriesByName("fail", "measure")).toHaveLength(1);
  });

  it("is a no-op without the User Timing API", () => {
    vi.stubGlobal("performance", undefined);
    expect(() => perfMark("a")).not.toThrow();
    expect(hasPerfMark("a")).toBe(false);
    expect(perfMeasure("span", "a")).toBeNull();
    expect(timed("work", () => 1)).toBe(1);
    expect(() => clearPerfMark("a")).not.toThrow();
  });
});

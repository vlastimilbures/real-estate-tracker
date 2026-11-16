import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  disablePerf,
  enablePerf,
  hasPerfMark,
  perfMark,
  perfMeasure,
  perfReport,
  timed,
} from "../perf";

const seen: [string, number | null][] = [];
const sink = (name: string, ms: number | null) => seen.push([name, ms]);

afterEach(() => {
  disablePerf();
  seen.length = 0;
  vi.unstubAllGlobals();
  performance.clearMarks();
  performance.clearMeasures();
});

describe("perf marks while timing is off (ADR 0233)", () => {
  it("records nothing and never calls the sink until enabled", () => {
    perfMark("a");
    expect(hasPerfMark("a")).toBe(false);
    expect(perfMeasure("span", "a")).toBeNull();
    expect(timed("work", () => 7)).toBe(7);
    perfReport("milestone");
    expect(performance.getEntriesByType("mark")).toHaveLength(0);
    expect(performance.getEntriesByType("measure")).toHaveLength(0);
    expect(seen).toEqual([]);
  });

  it("stops recording again after disablePerf", () => {
    enablePerf(sink);
    disablePerf();
    perfReport("milestone");
    expect(hasPerfMark("milestone")).toBe(false);
    expect(seen).toEqual([]);
  });
});

describe("perf marks", () => {
  beforeEach(() => enablePerf(sink));

  it("records a mark", () => {
    expect(hasPerfMark("a")).toBe(false);
    perfMark("a");
    expect(hasPerfMark("a")).toBe(true);
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
    perfMark("s");
    perfMeasure("m", "s");
    perfReport("milestone");
    expect(seen.map(([n]) => n)).toEqual(["m", "milestone"]);
    expect(seen[0]![1]).toBeGreaterThanOrEqual(0);
    expect(seen[1]![1]).toBeNull();
    expect(hasPerfMark("milestone")).toBe(true);
  });

  it("records marks without a sink", () => {
    enablePerf(null);
    perfReport("milestone");
    expect(hasPerfMark("milestone")).toBe(true);
    expect(seen).toEqual([]);
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
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { disablePerf, hasPerfMark, perfReport } from "../../lib/perf";

const invoke = vi.fn();
const isTauri = vi.fn(() => true);
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("../../lib/tauri", () => ({ isTauri }));

const { installPerf, tauriPerfSink } = await import("../perfReport");

afterEach(() => {
  disablePerf();
  invoke.mockReset();
  isTauri.mockReturnValue(true);
  performance.clearMarks();
  performance.clearMeasures();
});

describe("tauriPerfSink", () => {
  it("sends the name and duration to perf_report and swallows a failure", async () => {
    invoke.mockRejectedValueOnce(new Error("no bridge"));
    expect(() => tauriPerfSink("engine-recompute", 12.5)).not.toThrow();
    invoke.mockResolvedValueOnce(undefined);
    tauriPerfSink("dashboard-rendered", null);
    await Promise.resolve();
    expect(invoke.mock.calls).toEqual([
      ["perf_report", { name: "engine-recompute", ms: 12.5 }],
      ["perf_report", { name: "dashboard-rendered", ms: null }],
    ]);
  });
});

// ADR 0233: the release build measures only when Rust says RTRACKER_PERF=1 was set.
describe("installPerf", () => {
  it("leaves timing off when the app says it is off", async () => {
    invoke.mockResolvedValueOnce(false);
    await installPerf(false);
    perfReport("dashboard-rendered");
    expect(invoke.mock.calls).toEqual([["perf_enabled"]]);
    expect(hasPerfMark("dashboard-rendered")).toBe(false);
  });

  it("sends today's lines when the app says it is on", async () => {
    invoke.mockResolvedValueOnce(true).mockResolvedValue(undefined);
    await installPerf(false);
    perfReport("dashboard-rendered");
    expect(invoke.mock.calls).toEqual([
      ["perf_enabled"],
      ["perf_report", { name: "dashboard-rendered", ms: null }],
    ]);
    expect(hasPerfMark("dashboard-rendered")).toBe(true);
  });

  it("leaves timing off and resolves when the question fails", async () => {
    invoke.mockRejectedValueOnce(new Error("no bridge"));
    await expect(installPerf(false)).resolves.toBeUndefined();
    perfReport("dashboard-rendered");
    expect(invoke.mock.calls).toEqual([["perf_enabled"]]);
    expect(hasPerfMark("dashboard-rendered")).toBe(false);
  });

  it("measures in a development build without asking", async () => {
    invoke.mockResolvedValue(undefined);
    await installPerf(true);
    perfReport("dashboard-rendered");
    expect(invoke.mock.calls).toEqual([
      ["perf_report", { name: "dashboard-rendered", ms: null }],
    ]);
  });

  it("records nothing in a production browser build", async () => {
    isTauri.mockReturnValue(false);
    await installPerf(false);
    perfReport("dashboard-rendered");
    expect(invoke).not.toHaveBeenCalled();
    expect(hasPerfMark("dashboard-rendered")).toBe(false);
  });

  it("keeps marks without a sink in a development browser build", async () => {
    isTauri.mockReturnValue(false);
    await installPerf(true);
    perfReport("dashboard-rendered");
    expect(invoke).not.toHaveBeenCalled();
    expect(hasPerfMark("dashboard-rendered")).toBe(true);
  });

  it("gives up after a second, and a late answer turns nothing on", async () => {
    vi.useFakeTimers();
    try {
      let answer: (on: boolean) => void = () => undefined;
      invoke.mockReturnValueOnce(
        new Promise<boolean>((resolve) => (answer = resolve)),
      );
      let settled = false;
      const installed = installPerf(false).then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await installed;
      expect(settled).toBe(true);
      invoke.mockResolvedValue(undefined);
      answer(true);
      await Promise.resolve();
      await Promise.resolve();
      perfReport("dashboard-rendered");
      expect(invoke.mock.calls).toEqual([["perf_enabled"]]);
      expect(hasPerfMark("dashboard-rendered")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("records nothing while the answer is pending", async () => {
    let answer: (on: boolean) => void = () => undefined;
    invoke.mockReturnValueOnce(
      new Promise<boolean>((resolve) => (answer = resolve)),
    );
    const installed = installPerf(false);
    perfReport("early");
    expect(hasPerfMark("early")).toBe(false);
    invoke.mockResolvedValue(undefined);
    answer(true);
    await installed;
    expect(invoke.mock.calls).toEqual([["perf_enabled"]]);
  });
});

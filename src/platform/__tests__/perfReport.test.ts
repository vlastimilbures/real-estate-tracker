import { describe, it, expect, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const { tauriPerfSink } = await import("../perfReport");

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

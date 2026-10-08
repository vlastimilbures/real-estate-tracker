// #136 (ADR 0154): one outcome path. A toast lives in the store with one duration, so it
// survives a page change; a notice (the outcome of a whole-database action) stays until
// dismissed; replacing the data clears what described the old data.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_MS, useUiStore } from "../uiStore";
import type { CsvImportReport } from "../csv";

const ui = () => useUiStore.getState();

beforeEach(() => {
  vi.useFakeTimers();
  useUiStore.setState({
    route: "settings",
    toast: null,
    notice: null,
    lastImport: null,
    unsavedChanges: false,
    unsavedSources: [],
    pendingLeave: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toast (ADR 0154)", () => {
  it("shows for one duration, 4000 ms", () => {
    expect(TOAST_MS).toBe(4000);
    ui().showToast("Saved");
    expect(ui().toast?.message).toBe("Saved");
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(ui().toast?.message).toBe("Saved");
    vi.advanceTimersByTime(1);
    expect(ui().toast).toBeNull();
  });

  it("a newer toast replaces the text and restarts the timer (DR-058)", () => {
    ui().showToast("First");
    vi.advanceTimersByTime(TOAST_MS - 100);
    ui().showToast("Second");
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(ui().toast?.message).toBe("Second");
    vi.advanceTimersByTime(1);
    expect(ui().toast).toBeNull();
  });

  it("survives a page change", () => {
    ui().showToast("Saved");
    ui().navigate("dashboard");
    expect(ui().toast?.message).toBe("Saved");
  });
});

describe("notice (ADR 0154)", () => {
  it("stays until dismissed", () => {
    ui().setNotice({ kind: "restored", file: "safety.json" });
    vi.advanceTimersByTime(60_000);
    ui().navigate("dashboard");
    expect(ui().notice).toEqual({ kind: "restored", file: "safety.json" });
    ui().dismissNotice();
    expect(ui().notice).toBeNull();
  });

  it("Clear sample names its backup in the notice and opens the Dashboard", () => {
    ui().showSampleCleared("before-clear.json");
    expect(ui().notice).toEqual({
      kind: "sampleCleared",
      file: "before-clear.json",
    });
    expect(ui().route).toBe("dashboard");
  });

  it("dataReplaced clears the notice and the last import report", () => {
    const report = { items: [] } as unknown as CsvImportReport;
    ui().setLastImport(report);
    ui().showSampleCleared("before-clear.json");
    ui().dataReplaced();
    expect(ui().notice).toBeNull();
    expect(ui().lastImport).toBeNull();
  });
});

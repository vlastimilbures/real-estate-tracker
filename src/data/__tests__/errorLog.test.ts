// P5a step 5: what the local error log records. No personal financial values: a
// DataError gives code + details (ids, columns, rules); other messages are masked.
import { describe, it, expect, vi, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { describeFailure, logFailure, maskNumbers } from "../errorLog";
import { DataError } from "../errors";
import { isTauri } from "../../lib/tauri";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../lib/tauri", () => ({ isTauri: vi.fn(() => false) }));

afterEach(() => {
  vi.mocked(isTauri).mockReturnValue(false);
  vi.mocked(invoke).mockReset();
});

describe("error log lines", () => {
  it("masks amounts in free-text messages", () => {
    expect(maskNumbers("[DecimalError] Invalid argument: 9515405.13")).toBe(
      "[DecimalError] Invalid argument: #",
    );
    // ADR 0147: every number, so the row number too (it was kept before).
    expect(maskNumbers("rent 21 675 Kč on row 7")).toBe("rent # Kč on row #");
  });

  it("masks every number, short ones too (#122)", () => {
    expect(maskNumbers("rent 850 Kč")).toBe("rent # Kč");
    expect(maskNumbers("rate 4.59 %")).toBe("rate # %");
    expect(maskNumbers("valid from 2026-10-03")).toBe("valid from #-#-#");
  });

  it("a DataError logs its code and details as-is", () => {
    const e = new DataError("ROW_INVALID", "msg", [
      "leases l1: monthly_rent is not a finite decimal number",
    ]);
    expect(describeFailure("STARTUP", e)).toEqual({
      code: "ROW_INVALID",
      context:
        "STARTUP: leases l1: monthly_rent is not a finite decimal number",
    });
  });

  it("any other failure logs <WHERE>_FAILED with a masked message", () => {
    expect(describeFailure("WRITE", new Error("disk full at 123456"))).toEqual({
      code: "WRITE_FAILED",
      context: "disk full at #",
    });
    expect(describeFailure("WRITE", "plain string")).toEqual({
      code: "WRITE_FAILED",
      context: "plain string",
    });
  });

  it("is a silent no-op outside the desktop app", () => {
    expect(() => logFailure("STARTUP", new Error("x"))).not.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("in the desktop app, sends the line to log_error (#115)", () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue(undefined);
    logFailure("WRITE", new Error("disk full at 123456"));
    expect(invoke).toHaveBeenCalledWith("log_error", {
      code: "WRITE_FAILED",
      context: "disk full at #",
    });
  });

  it("swallows a failed log_error, so logging is never a second failure (#115)", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const rejected = Promise.reject(new Error("log plugin gone"));
    // The rejection must get a handler; an unhandled one would surface as a new error.
    const handled = vi.spyOn(rejected, "catch");
    vi.mocked(invoke).mockReturnValue(rejected);
    expect(() => logFailure("STARTUP", new Error("x"))).not.toThrow();
    expect(handled).toHaveBeenCalledOnce();
    await expect(handled.mock.results[0]?.value).resolves.toBeUndefined();
  });
});

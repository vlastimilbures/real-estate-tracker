// P5a step 5: what the local error log records. No personal financial values: a
// DataError gives code + details (ids, columns, rules); other messages are masked.
import { describe, it, expect, vi, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { describeFailure, logFailure, maskNumbers } from "../errorLog";
import { DataError } from "../errors";
import { FileStepError } from "../backup";
import { COMMAND_ERROR_CODES, CommandError } from "../../platform/commandError";
import { isTauri } from "../../lib/tauri";
import { unhandledRejections } from "../../__tests__/support/unhandled";

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

  it("keeps an OS or SQLite error code (ADR 0175, #258 item 5)", () => {
    expect(maskNumbers("Permission denied (os error 13)")).toBe(
      "Permission denied (os error 13)",
    );
    expect(
      maskNumbers(
        "error returned from database: (code: 2067) UNIQUE constraint failed",
      ),
    ).toBe(
      "error returned from database: (code: 2067) UNIQUE constraint failed",
    );
    expect(maskNumbers("SQLITE_BUSY code 5 on row 7")).toBe(
      "SQLITE_BUSY code 5 on row #",
    );
  });

  it("still masks a long run or an amount after `code` (ADR 0175)", () => {
    expect(maskNumbers("code 1234567")).toBe("code #");
    expect(maskNumbers("code: 12 345 Kč")).toBe("code: # Kč");
    expect(maskNumbers("code 4.59 %")).toBe("code # %");
    expect(maskNumbers("postcode 11000, zipcode 12345")).toBe(
      "postcode #, zipcode #",
    );
    expect(maskNumbers("unicode 1234")).toBe("unicode #");
    expect(maskNumbers("rent 21 675 Kč (os error 2)")).toBe(
      "rent # Kč (os error 2)",
    );
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

  // ADR 0270 point 7: the context starts with the Rust code, the log code stays the site.
  it("a failed command logs its Rust code before the masked detail", () => {
    const e = new CommandError("IO", "disk full at 123456");
    expect(describeFailure("WRITE", e)).toEqual({
      code: "WRITE_FAILED",
      context: "IO: disk full at #",
    });
    // Kept as the cause of the data layer's own error.
    expect(describeFailure("WRITE", new FileStepError("safety", e))).toEqual({
      code: "WRITE_FAILED",
      context: "IO: Could not save the safety backup: disk full at #",
    });
    expect(describeFailure("WRITE", new Error("disk full at 123456"))).toEqual({
      code: "WRITE_FAILED",
      context: "disk full at #",
    });
  });

  it("finds the command error further down the cause chain", () => {
    const rust = new CommandError(
      "BACKUP_EXISTS",
      "BACKUP_EXISTS: /b/x-2026.json",
    );
    const outer = new Error("restore failed", {
      cause: new Error("step 1", { cause: rust }),
    });
    expect(describeFailure("RESTORE", outer).context).toBe(
      "BACKUP_EXISTS: restore failed",
    );
  });

  // ADR 0270 point 7: a DataError that wraps a failed command (the startup upgrade's
  // MIGRATION_* errors) also logs the Rust code, so an upgrade failure is diagnosable.
  it("a DataError wrapping a failed command logs its Rust code first", () => {
    const rust = new CommandError("BACKUP_FAILED", "verify failed");
    const e = new DataError(
      "MIGRATION_BACKUP_FAILED",
      "msg",
      ["verify failed"],
      {
        cause: rust,
      },
    );
    expect(describeFailure("STARTUP", e)).toEqual({
      code: "MIGRATION_BACKUP_FAILED",
      context: "BACKUP_FAILED: STARTUP: verify failed",
    });
  });

  it("finds the command error below a DataError's cause chain", () => {
    const rust = new CommandError("SQL", "no such table");
    const e = new DataError("MIGRATION_FAILED", "msg", ["no such table"], {
      cause: new Error("step", { cause: rust }),
    });
    expect(describeFailure("STARTUP", e)).toEqual({
      code: "MIGRATION_FAILED",
      context: "SQL: STARTUP: no such table",
    });
  });

  it("a DataError without a failed command logs as before", () => {
    const e = new DataError("MIGRATION_FAILED", "msg", ["boom"], {
      cause: new Error("boom"),
    });
    expect(describeFailure("STARTUP", e)).toEqual({
      code: "MIGRATION_FAILED",
      context: "STARTUP: boom",
    });
  });

  it("stops on a cause chain that loops", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    Object.defineProperty(a, "cause", { value: b });
    expect(describeFailure("WRITE", a)).toEqual({
      code: "WRITE_FAILED",
      context: "a",
    });
  });

  it("the prefix is a code from the closed list, written as it is", () => {
    for (const code of COMMAND_ERROR_CODES) {
      const { context } = describeFailure(
        "WRITE",
        new CommandError(code, "at 12345"),
      );
      const prefix = context.slice(0, context.indexOf(": "));
      // Upper snake case (letters, digits, underscores), never masked: a digit in a
      // code such as BACKUP_PATH_NOT_UTF8 stays.
      expect(prefix).toBe(code);
      expect(prefix).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(context).toBe(`${code}: at #`);
    }
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
    vi.mocked(invoke).mockRejectedValue(new Error("log plugin gone"));
    // The rejection must get a handler; an unhandled one would surface as a new error.
    const unhandled = await unhandledRejections(() => {
      expect(() => logFailure("STARTUP", new Error("x"))).not.toThrow();
    });
    expect(invoke).toHaveBeenCalledOnce();
    expect(unhandled).toEqual([]);
  });
});

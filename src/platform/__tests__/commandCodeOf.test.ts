// ADR 0270 point 7, ADR 0271: the code of the failed command behind an error, found in the
// error itself or down its `cause` chain, for the log and for the shown text.
import { describe, expect, it } from "vitest";
import { CommandError, commandCodeOf } from "../commandError";

describe("commandCodeOf", () => {
  it("a command error gives its own code", () => {
    expect(commandCodeOf(new CommandError("IO", "disk full"))).toBe("IO");
  });

  it("a code only in the cause chain is found", () => {
    const rust = new CommandError("BACKUP_EXISTS", "BACKUP_EXISTS: /b/x.json");
    const outer = new Error("outer", {
      cause: new Error("step", { cause: rust }),
    });
    expect(commandCodeOf(outer)).toBe("BACKUP_EXISTS");
  });

  it("a plain error or a thrown string has no code", () => {
    expect(commandCodeOf(new Error("no workbook"))).toBeNull();
    expect(commandCodeOf("denied")).toBeNull();
  });

  it("stops on a cause chain that loops", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    Object.defineProperty(a, "cause", { value: b });
    expect(commandCodeOf(a)).toBeNull();
  });
});

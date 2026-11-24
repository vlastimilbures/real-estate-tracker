// ADR 0193: a failed save's text for a translated sentence — the OS text without the
// English wrapper, else the error's message, else the value itself.
import { describe, expect, it } from "vitest";
import { SaveFileError, saveFailureDetail } from "../saveFileTypes";

describe("saveFailureDetail (ADR 0193)", () => {
  it("a failed save gives the OS text only", () => {
    expect(saveFailureDetail(new SaveFileError(new Error("disk full")))).toBe(
      "disk full",
    );
  });

  it("any other error gives its message", () => {
    expect(saveFailureDetail(new Error("no workbook"))).toBe("no workbook");
  });

  it("a thrown value that is not an error gives itself", () => {
    expect(saveFailureDetail("denied")).toBe("denied");
  });
});

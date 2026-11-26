// cx() builds the same class strings the templates it replaces did:
// `base${on ? " extra" : ""}` and `[…].filter(Boolean).join(" ")`.
import { describe, it, expect } from "vitest";
import { cx } from "../cx";

describe("cx", () => {
  it("joins the classes given, one space apart, in order", () => {
    expect(cx("pill", "on")).toBe("pill on");
    expect(cx("import-row-file", "num is-chosen")).toBe(
      "import-row-file num is-chosen",
    );
  });

  it("leaves out false, null, undefined and empty parts, with no stray space", () => {
    expect(cx("pill", false)).toBe("pill");
    expect(cx("btn", "", undefined, null, "sm")).toBe("btn sm");
    expect(cx(false, "a")).toBe("a");
    expect(cx()).toBe("");
  });

  it("matches the template it replaces for both values of the condition", () => {
    for (const on of [true, false])
      expect(cx("panel-body", on && "flush")).toBe(
        `panel-body${on ? " flush" : ""}`,
      );
  });
});

import { describe, expect, it } from "vitest";
import { D } from "../money";
import { EMPTY, fmtPct, orDash } from "../format";

describe("orDash", () => {
  it("is the em dash for no value, and the formatted value otherwise", () => {
    expect(EMPTY).toBe("—");
    expect(orDash(null, fmtPct)).toBe("—");
    expect(orDash(undefined, String)).toBe("—");
    expect(orDash(D("0.331"), fmtPct)).toBe(fmtPct(D("0.331")));
  });

  it("formats a zero, which is a value", () => {
    expect(orDash(0, String)).toBe("0");
    expect(orDash(D(0), fmtPct)).toBe(fmtPct(D(0)));
  });
});

// UX_AXE=0 (a faster local proof): the switch, the marker the gate reads and the
// summary's wording.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AXE_SKIPPED,
  axeEnabled,
  axeSkipped,
  variantLine,
} from "../axeFiles.ts";

describe("axeEnabled", () => {
  it("is on unless UX_AXE=0", () => {
    expect(axeEnabled({})).toBe(true);
    expect(axeEnabled({ UX_AXE: "1" })).toBe(true);
    expect(axeEnabled({ UX_AXE: "0" })).toBe(false);
  });

  it("stops on a typo", () => {
    expect(() => axeEnabled({ UX_AXE: "off" })).toThrow(/UX_AXE must be 0/);
    expect(() => axeEnabled({ UX_AXE: "" })).toThrow(/UX_AXE must be 0/);
  });
});

describe("axe-skipped marker", () => {
  it("marks a variant folder", () => {
    const dir = mkdtempSync(join(tmpdir(), "ux-axe-"));
    expect(axeSkipped(dir)).toBe(false);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, AXE_SKIPPED), "{}");
    expect(axeSkipped(dir)).toBe(true);
  });
});

describe("variantLine", () => {
  it("counts screenshots and scans", () => {
    expect(variantLine(90, 90, false)).toBe("90 screenshots, 90 axe scans.");
  });

  it("says plainly that the scan was skipped", () => {
    const line = variantLine(90, 0, true);
    expect(line).toMatch(
      /^90 screenshots\. \*\*Axe scan skipped \(UX_AXE=0\)\*\*/,
    );
    expect(line).toContain("`pnpm ux:axe-check` fails on this run");
    expect(line).not.toContain("axe scans.");
  });
});

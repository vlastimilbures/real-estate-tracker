// UX_AXE=0 (a faster local proof): the switch, the marker the gate reads and the
// summary's wording, and ux:axe-check refusing such a run.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
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
  let root = "";
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("marks a variant folder", () => {
    root = mkdtempSync(join(tmpdir(), "ux-axe-"));
    expect(axeSkipped(root)).toBe(false);
    writeFileSync(join(root, AXE_SKIPPED), "{}");
    expect(axeSkipped(root)).toBe(true);
  });

  it("makes ux:axe-check fail with exit 2, not pass", () => {
    root = mkdtempSync(join(tmpdir(), "ux-axe-"));
    const variant = join(root, "en-light-1280x800");
    mkdirSync(variant);
    writeFileSync(join(variant, "01-dashboard.png"), "");
    writeFileSync(join(variant, AXE_SKIPPED), "{}");
    const r = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../axeCheck.ts", import.meta.url)), root],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("AXE SKIPPED");
    expect(r.stderr).toContain("en-light-1280x800");
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

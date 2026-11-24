// UX_AXE=0 (a faster local proof): the switch, the marker the gate reads and the
// summary's wording, and ux:axe-check refusing such a run.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  AXE_EXPECTED,
  AXE_SKIPPED,
  axeEnabled,
  axeSkipped,
  missingScans,
  variantLine,
} from "../axeFiles.ts";

const AXE_CHECK = fileURLToPath(new URL("../axeCheck.ts", import.meta.url));
const axeCheck = (run: string) =>
  spawnSync(process.execPath, [AXE_CHECK, run], { encoding: "utf8" });

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
    const r = axeCheck(root);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("AXE SKIPPED");
    expect(r.stderr).toContain("en-light-1280x800");
  });
});

describe("captures that owe a scan", () => {
  let root = "";
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  /** A variant whose captures `owed` owe a scan and `scanned` have one. */
  function run(owed: string[], scanned: string[]) {
    root = mkdtempSync(join(tmpdir(), "ux-axe-"));
    const variant = join(root, "en-light-1280x800");
    mkdirSync(join(variant, AXE_EXPECTED), { recursive: true });
    mkdirSync(join(variant, "axe"));
    for (const id of owed) writeFileSync(join(variant, AXE_EXPECTED, id), "");
    for (const id of scanned)
      writeFileSync(
        join(variant, "axe", `${id}.json`),
        JSON.stringify({ screen: id, violations: [] }),
      );
    // A shot()-only PNG owes nothing.
    writeFileSync(join(variant, "90-keyboard-focus-tab1.png"), "");
  }

  it("lists the captures without a scan", () => {
    expect(missingScans(["01", "02", "03"], ["02"])).toEqual(["01", "03"]);
    expect(missingScans([], ["02"])).toEqual([]);
  });

  it("fails ux:axe-check on a partial scanning re-capture (exit 2)", () => {
    run(["01-dashboard", "29-property-prepayment-outputs"], ["01-dashboard"]);
    const r = axeCheck(root);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("MISSING AXE SCANS");
    expect(r.stderr).toContain(
      "en-light-1280x800/29-property-prepayment-outputs",
    );
  });

  it("passes when every capture has its scan", () => {
    run(["01-dashboard"], ["01-dashboard"]);
    const r = axeCheck(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("1 axe scans, 0 violation(s).");
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

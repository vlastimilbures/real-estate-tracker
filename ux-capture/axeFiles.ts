// The per-screen axe JSON that `ux.capture()` writes (helpers.ts), read back by the
// summary (summary.ts) and the CI gate (axeCheck.ts), and the UX_AXE=0 switch that skips
// the scan. Node built-ins only.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface AxeFile {
  screen: string;
  violations: {
    id: string;
    impact: string | null;
    help: string;
    nodes: number;
    targets: { target: string }[];
  }[];
}

/** Every scan in `<variantDir>/axe`, sorted by file name; none when there is no folder. */
export function readAxeScans(variantDir: string): AxeFile[] {
  const axeDir = join(variantDir, "axe");
  if (!existsSync(axeDir)) return [];
  return readdirSync(axeDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(axeDir, f), "utf8")) as AxeFile);
}

/** The marker the capture leaves in a variant folder when its run skipped the scan. */
export const AXE_SKIPPED = "axe-skipped.json";

/**
 * Whether the capture runs the axe scan: on unless `UX_AXE=0` (a faster local proof; CI
 * never sets it). A value other than `0` or `1` is a typo and stops the run.
 */
export function axeEnabled(env: Record<string, string | undefined>): boolean {
  const v = env.UX_AXE;
  if (v === undefined || v === "1") return true;
  if (v === "0") return false;
  throw new Error(`UX_AXE must be 0 or 1, got "${v}"`);
}

/** Whether a run skipped the axe scan in this variant folder. */
export function axeSkipped(variantDir: string): boolean {
  return existsSync(join(variantDir, AXE_SKIPPED));
}

/** The summary's line under a variant's heading. */
export function variantLine(
  pngs: number,
  scans: number,
  skipped: boolean,
): string {
  if (skipped)
    return (
      `${pngs} screenshots. **Axe scan skipped (UX_AXE=0)**: no accessibility rule was ` +
      `checked, and \`pnpm ux:axe-check\` fails on this run. Capture without UX_AXE=0 ` +
      `into a new folder for a scan.`
    );
  return `${pngs} screenshots, ${scans} axe scans.`;
}

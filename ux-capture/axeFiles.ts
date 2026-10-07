// The per-screen axe JSON that `ux.capture()` writes (helpers.ts), read back by the
// summary (summary.ts) and the CI gate (axeCheck.ts). Node built-ins only.
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

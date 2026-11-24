// Where a capture run named on the command line lives (ux:diff, ux:axe-check): a name is a
// folder under ux-screens/, an absolute path is used as it is (e.g. a cached main baseline
// from `pnpm ux:baseline`). Node built-ins only.
import { isAbsolute, join, normalize } from "node:path";

export function runDir(arg: string): string {
  return isAbsolute(arg) ? normalize(arg) : join("ux-screens", arg);
}

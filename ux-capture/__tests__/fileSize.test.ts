// Ratchet (#496): no TypeScript file of the capture harness grows past 600 lines. A new
// screen goes into its area's file under screens/; when an area outgrows the limit, split
// it into two contiguous files in flow order.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const MAX_LINES = 600;

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return tsFiles(full);
    return e.name.endsWith(".ts") ? [full] : [];
  });
}

describe("ux-capture file sizes", () => {
  const files = tsFiles(ROOT);

  it("finds the harness files", () => {
    const names = files.map((f) => relative(ROOT, f));
    expect(names).toContain("helpers.ts");
    expect(names).toContain(join("screens", "index.ts"));
  });

  it.each(files.map((f) => [relative(ROOT, f), f]))(
    "%s has at most 600 lines",
    (_, file) => {
      const text = readFileSync(file, "utf8");
      const lines = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
      expect(lines).toBeLessThanOrEqual(MAX_LINES);
    },
  );
});

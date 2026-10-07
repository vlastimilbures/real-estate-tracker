// Global teardown: fold the per-screen axe JSON into `<run>/summary.md`.
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readAxeScans } from "./axeFiles.ts";
import { UX_DATE } from "./clock.ts";

const IMPACTS = ["critical", "serious", "moderate", "minor"] as const;

export default function summary() {
  const out = process.env.UX_OUT;
  if (!out || !existsSync(out)) return;
  const lines: string[] = [
    `# UX capture — ${path.basename(out)}`,
    "",
    `Frozen date: ${UX_DATE}${process.env.UX_DATE === undefined ? " (default)" : ""}`,
    "",
  ];

  const variants = readdirSync(out, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name)
    .sort();

  for (const variant of variants) {
    const dir = path.join(out, variant);
    const pngs = readdirSync(dir)
      .filter((f) => f.endsWith(".png"))
      .sort();
    const scans = readAxeScans(dir);

    lines.push(
      `## ${variant}`,
      "",
      `${pngs.length} screenshots, ${scans.length} axe scans.`,
      "",
    );
    lines.push("| Screen | critical | serious | moderate | minor | Rules |");
    lines.push("| ------ | -------- | ------- | -------- | ----- | ----- |");
    const rules = new Map<
      string,
      { impact: string; help: string; screens: number; nodes: number }
    >();
    for (const s of scans) {
      const count = (impact: string) =>
        s.violations.filter((v) => v.impact === impact).length;
      lines.push(
        `| ${s.screen} | ${IMPACTS.map(count).join(" | ")} | ${s.violations.map((v) => v.id).join(", ") || "—"} |`,
      );
      for (const v of s.violations) {
        const r = rules.get(v.id) ?? {
          impact: v.impact ?? "?",
          help: v.help,
          screens: 0,
          nodes: 0,
        };
        r.screens += 1;
        r.nodes += v.nodes;
        rules.set(v.id, r);
      }
    }
    lines.push("", "### Rules violated", "");
    lines.push("| Rule | Impact | Screens | Nodes | Help |");
    lines.push("| ---- | ------ | ------- | ----- | ---- |");
    for (const [id, r] of [...rules].sort((a, b) => b[1].nodes - a[1].nodes)) {
      lines.push(
        `| ${id} | ${r.impact} | ${r.screens} | ${r.nodes} | ${r.help} |`,
      );
    }
    lines.push("");
  }

  writeFileSync(path.join(out, "summary.md"), lines.join("\n"));
  console.log(`UX capture written to ${out}`);
}

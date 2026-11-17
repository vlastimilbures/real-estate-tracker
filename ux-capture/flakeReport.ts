// Playwright reporter for the capture run (#496): with a retry (UX_RETRIES, one on CI),
// a screen that failed every attempt is a regression and fails the run; one that failed
// and then passed is flaky: the run stays green, but each flake gets a `::warning`
// annotation, a row in the job summary ($GITHUB_STEP_SUMMARY) and an entry in
// `<UX_OUT>/flaky.json`, so flakes are visible without hiding regressions.
import { appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  FullConfig,
  Reporter,
  Suite,
  TestCase,
} from "@playwright/test/reporter";

/** One test as the reporter sees it at the end of the run. */
export interface Entry {
  project: string;
  title: string;
  outcome: ReturnType<TestCase["outcome"]>;
  /** The error messages of the failed attempts, in attempt order. */
  errors: string[];
}

export interface Row {
  project: string;
  /** The screen id: the test title up to " — ". */
  id: string;
  /** The first line of the first error. */
  error: string;
}

export interface Classified {
  regressions: Row[];
  flaky: Row[];
}

// Playwright's messages carry terminal colours.
const ANSI = new RegExp(String.raw`\u001b\[[0-9;]*m`, "g");

function firstLine(message: string | undefined): string {
  const text = (message ?? "").replace(ANSI, "");
  return (
    text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l !== "") ?? "(no error message)"
  );
}

const rowOf = (e: Entry): Row => ({
  project: e.project,
  id: e.title.split(" — ")[0]!,
  error: firstLine(e.errors[0]),
});

/** Regressions (failed every attempt) and flakes (failed, then passed). */
export function classify(entries: Entry[]): Classified {
  return {
    regressions: entries.filter((e) => e.outcome === "unexpected").map(rowOf),
    flaky: entries.filter((e) => e.outcome === "flaky").map(rowOf),
  };
}

/** GitHub workflow commands, one per flake. */
export function annotations(c: Classified): string[] {
  // The workflow-command escapes for a message.
  const esc = (s: string) =>
    s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  return c.flaky.map(
    (r) =>
      `::warning title=Flaky capture::${esc(`${r.project} ${r.id}: ${r.error}`)}`,
  );
}

/** The job-summary section: a Regressions and a Flaky table, or one line when clean. */
export function toMarkdown(c: Classified, run: string): string {
  // Backslashes first, so an escaped pipe in the message cannot end its cell.
  const cell = (s: string) => s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
  const table = (title: string, rows: Row[]) =>
    rows.length === 0
      ? []
      : [
          `**${title} (${rows.length})**`,
          "",
          "| Project | Screen | First error |",
          "| --- | --- | --- |",
          ...rows.map(
            (r) => `| ${cell(r.project)} | ${cell(r.id)} | ${cell(r.error)} |`,
          ),
          "",
        ];
  const head = `### UX capture \`${run}\``;
  if (c.regressions.length === 0 && c.flaky.length === 0)
    return `${head}\n\nNo regressions, no flaky captures.\n`;
  return [
    head,
    "",
    ...table("Regressions: failed every attempt", c.regressions),
    ...table("Flaky: failed, then passed on a retry", c.flaky),
  ].join("\n");
}

export default class FlakeReport implements Reporter {
  private suite: Suite | undefined;

  onBegin(_config: FullConfig, suite: Suite) {
    this.suite = suite;
  }

  onEnd() {
    const entries: Entry[] = (this.suite?.allTests() ?? []).map((t) => ({
      project: t.parent.project()?.name ?? "",
      title: t.title,
      outcome: t.outcome(),
      errors: t.results
        .filter((r) => r.status !== "passed" && r.status !== "skipped")
        .map((r) => r.error?.message ?? r.errors[0]?.message ?? ""),
    }));
    const c = classify(entries);
    for (const line of annotations(c)) console.log(line);
    const out = process.env.UX_OUT;
    if (out && c.flaky.length > 0)
      writeFileSync(
        path.join(out, "flaky.json"),
        JSON.stringify(c.flaky, null, 2),
      );
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary)
      appendFileSync(
        summary,
        `${toMarkdown(c, process.env.UX_RUN_ID ?? path.basename(out ?? ""))}\n`,
      );
  }

  printsToStdio() {
    return false;
  }
}

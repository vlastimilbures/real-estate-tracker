// Performance marks and measures (P9): User Timing entries, plus an optional sink that
// receives every measure and reported mark (the desktop app prints them to stderr,
// src-tauri/src/perf.rs). Timing is off until `enablePerf` is called (ADR 0233: the
// release build measures only when started with RTRACKER_PERF=1; platform/perfReport.ts
// decides once, before the first render). While off, and where the User Timing API is
// missing, every helper is a no-op, so callers never need to guard.

/** Receives each measure (`ms`) and each `perfReport` mark (`ms` null). */
export type PerfSink = (name: string, ms: number | null) => void;

let enabled = false;
let sink: PerfSink | null = null;

const timing = (): Performance | null =>
  enabled &&
  typeof performance !== "undefined" &&
  typeof performance.mark === "function" &&
  typeof performance.measure === "function"
    ? performance
    : null;

/** Turn timing on, handing measures and reported marks to `next` (null: marks only). */
export function enablePerf(next: PerfSink | null): void {
  enabled = true;
  sink = next;
}

/** Turn timing off again and drop the sink.
 *  @internal test seam: test teardown; the app decides once, at start. */
export function disablePerf(): void {
  enabled = false;
  sink = null;
}

/** Mark `name`, replacing an earlier mark of that name (only the latest is kept, so
 *  marks made on every render or recompute never pile up). */
export function perfMark(name: string): void {
  const p = timing();
  p?.clearMarks(name);
  p?.mark(name);
}

/** Whether a mark named `name` is recorded. */
export function hasPerfMark(name: string): boolean {
  return (timing()?.getEntriesByName(name, "mark").length ?? 0) > 0;
}

/** Measure from the `start` mark to now, replacing an earlier measure of that name;
 *  returns the duration in ms, or null when timing is off, there is no API or no
 *  `start` mark. */
export function perfMeasure(name: string, start: string): number | null {
  const p = timing();
  if (!p || !hasPerfMark(start)) return null;
  p.clearMeasures(name);
  const ms = p.measure(name, start).duration;
  sink?.(name, ms);
  return ms;
}

/** Run `f` between `${name}:start` and a `name` measure. */
export function timed<T>(name: string, f: () => T): T {
  perfMark(`${name}:start`);
  try {
    return f();
  } finally {
    perfMeasure(name, `${name}:start`);
  }
}

/** Mark `name` and hand it to the sink (a milestone such as the first dashboard). */
export function perfReport(name: string): void {
  perfMark(name);
  sink?.(name, null);
}

/** The milestones already reported in the app's lifetime, whether timing was on or not. */
const reported = new Set<string>();

/** `perfReport(name)` the first time only in the app's lifetime: a page's first render
 *  is the cold-start end (P9); later renders of that page are not. */
export function perfReportOnce(name: string): void {
  if (reported.has(name)) return;
  reported.add(name);
  perfReport(name);
}

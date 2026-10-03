// Performance marks and measures (P9): User Timing entries, plus an optional sink that
// receives every measure and reported mark (the desktop app prints them to stderr,
// src-tauri/src/perf.rs). Every helper is a no-op where the User Timing API is missing,
// so callers never need to guard.
const timing = (): Performance | null =>
  typeof performance !== "undefined" &&
  typeof performance.mark === "function" &&
  typeof performance.measure === "function"
    ? performance
    : null;

/** Receives each measure (`ms`) and each `perfReport` mark (`ms` null). */
export type PerfSink = (name: string, ms: number | null) => void;

let sink: PerfSink | null = null;

export function setPerfSink(next: PerfSink | null): void {
  sink = next;
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
 *  returns the duration in ms, or null when there is no API or no `start` mark. */
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

export function clearPerfMark(name: string): void {
  timing()?.clearMarks(name);
}

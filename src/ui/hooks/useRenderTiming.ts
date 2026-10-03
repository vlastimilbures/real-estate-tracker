// Render timing for a page (P9): marks `${name}:render` when the page renders and, once
// the render that shows `output` has committed, measures `${name}-render`. The first
// such commit in the app's lifetime also marks `${name}-rendered` (the cold-start end).
import { useEffect } from "react";
import { perfMark, perfMeasure, perfReport } from "../../lib/perf";

const firstDone = new Set<string>();

/** Called on every commit that shows new `output`; null output is not timed. */
export function useRenderTiming(name: string, output: unknown): void {
  perfMark(`${name}:render`);
  useEffect(() => {
    if (output === null) return;
    perfMeasure(`${name}-render`, `${name}:render`);
    if (firstDone.has(name)) return;
    firstDone.add(name);
    perfReport(`${name}-rendered`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [output]);
}

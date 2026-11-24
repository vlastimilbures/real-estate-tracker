// The pure half of the shared baseline cache (`pnpm ux:baseline`, baseline.ts): where a
// cached capture of one commit and one matrix lives, and when a cached run counts as
// complete or stale. Node built-ins only.
import { join } from "node:path";
import { matrixKey, matrixOf, normalizeMatrix, type Matrix } from "./matrix.ts";

type Env = Record<string, string | undefined>;

/** Written last into a finished run; a folder without a valid one is never reused. */
export const MARKER = "complete.json";

/** Entries older than this are pruned even when main still reaches their commit. */
export const MAX_AGE_DAYS = 14;

export interface Marker {
  sha: string;
  key: string;
  matrix: Matrix;
  screens: number;
  date: string;
}

/** `$UX_BASELINE_CACHE`, else `~/Library/Caches/rtracker-ux`. */
export function cacheRoot(env: Env, home: string): string {
  const own = env.UX_BASELINE_CACHE?.trim();
  return own ? own : join(home, "Library", "Caches", "rtracker-ux");
}

const SHA = /^[0-9a-f]{40}$/;

/** `<root>/<sha>/<matrix key>`; the sha must be a full commit id, never a branch name. */
export function cachePath(root: string, sha: string, key: string): string {
  if (!SHA.test(sha)) throw new Error(`not a full commit sha: "${sha}"`);
  if (!/^[a-z0-9._]+$/.test(key)) throw new Error(`bad matrix key: "${key}"`);
  return join(root, sha, key);
}

/** The cache key and normalised matrix of the environment's UX_LANG/THEME/VIEWPORT. */
export function matrixFor(env: Env): { key: string; matrix: Matrix } {
  return { key: matrixKey(env), matrix: normalizeMatrix(matrixOf(env)) };
}

export function makeMarker(
  sha: string,
  env: Env,
  screens: number,
  now: Date,
): Marker {
  return { sha, ...matrixFor(env), screens, date: now.toISOString() };
}

/** Whether `data` (a parsed complete.json) marks a finished run of this sha and key. */
export function validMarker(data: unknown, sha: string, key: string): boolean {
  if (typeof data !== "object" || data === null) return false;
  const m = data as Partial<Marker>;
  return (
    m.sha === sha &&
    m.key === key &&
    typeof m.matrix === "object" &&
    m.matrix !== null &&
    Number.isInteger(m.screens) &&
    (m.screens ?? 0) > 0 &&
    typeof m.date === "string" &&
    !Number.isNaN(Date.parse(m.date))
  );
}

/** Prune an entry whose commit main no longer reaches, or that is too old. */
export function shouldPrune(
  reachable: boolean,
  date: Date,
  now: Date,
  maxAgeDays = MAX_AGE_DAYS,
): boolean {
  const age = (now.getTime() - date.getTime()) / 86_400_000;
  return !reachable || !(age <= maxAgeDays);
}

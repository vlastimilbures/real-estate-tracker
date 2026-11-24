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

/** A lock older than this with no readable pid is a crashed taker's (it writes the pid
 *  right after creating the lock). */
export const LOCK_GRACE_MS = 30_000;

/**
 * Whether a lock is stale: its holder's pid is known and dead, or no pid could be read
 * and the lock is older than the grace period (a fresh one may be mid-creation).
 */
export function lockStale(
  pid: number | null,
  holderAlive: boolean,
  ageMs: number,
): boolean {
  if (pid !== null && Number.isInteger(pid) && pid > 0) return !holderAlive;
  return ageMs > LOCK_GRACE_MS;
}

/** One second-level item of the cache, as read from disk for `planPrune`. */
export interface CacheItem {
  name: string;
  isDir: boolean;
  /** The parsed complete.json, or null when there is none. */
  marker: { date?: string } | null;
  mtime: Date;
  /** For a `<key>.lock`: whether it is stale (see `lockStale`). */
  staleLock?: boolean;
}

export interface PruneInput {
  /** First-level folder name → its items. */
  tree: Record<string, CacheItem[]>;
  /** Whether origin/main reaches a sha. */
  reachable: (sha: string) => boolean;
  /** origin/main's own sha: its entries are never pruned. */
  mainSha: string;
  now: Date;
}

const TMP = /^(.+)\.tmp-\d+$/;

/**
 * The cache paths (`<sha>/<item>`) `--prune` deletes. Only full-sha folders are looked at.
 * In each: a stale lock goes; a `.tmp-<pid>` run goes unless a live lock guards its key;
 * a finished run (with complete.json) goes when origin/main no longer reaches its sha or
 * it is older than 14 days, except origin/main's own. Nothing else is ever touched.
 */
export function planPrune(input: PruneInput): string[] {
  const out: string[] = [];
  for (const [sha, items] of Object.entries(input.tree)) {
    if (!SHA.test(sha)) continue;
    const busy = new Set<string>();
    for (const it of items) {
      if (!it.name.endsWith(".lock")) continue;
      if (it.staleLock) out.push(`${sha}/${it.name}`);
      else busy.add(it.name.slice(0, -".lock".length));
    }
    const reachable = input.reachable(sha);
    for (const it of items) {
      if (!it.isDir || it.name.endsWith(".lock")) continue;
      const tmp = TMP.exec(it.name);
      if (tmp) {
        if (!busy.has(tmp[1]!)) out.push(`${sha}/${it.name}`);
        continue;
      }
      if (!it.marker || busy.has(it.name) || sha === input.mainSha) continue;
      const date = it.marker.date ? new Date(it.marker.date) : it.mtime;
      if (shouldPrune(reachable, date, input.now))
        out.push(`${sha}/${it.name}`);
    }
  }
  return out;
}

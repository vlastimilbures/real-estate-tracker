// The capture matrix: languages × themes × viewports, read from UX_LANG, UX_THEME and
// UX_VIEWPORT. Shared by the Playwright config (one project per cell) and the baseline
// cache (ux-capture/baseline.ts), which keys a cached run by the same matrix. Node
// built-ins only.

export const LANGS = ["en", "cs", "ru"];
export const THEMES = ["light", "dark"];

export const VIEWPORTS: Record<string, { width: number; height: number }> = {
  // Tauri window default (tauri.conf.json) is 1200×800; 1280×800 is the audit baseline.
  "1280x800": { width: 1280, height: 800 },
  // tauri.conf.json minWidth × minHeight.
  min: { width: 900, height: 600 },
  // The Tauri window's default size; run on demand (UX_VIEWPORT=1200x800).
  "1200x800": { width: 1200, height: 800 },
  // Two small multiples per row on the Dashboard (ADR 0202); run on demand.
  "1100x800": { width: 1100, height: 800 },
};

export interface Matrix {
  langs: string[];
  themes: string[];
  viewports: string[];
}

type Env = Record<string, string | undefined>;

function list(env: string | undefined, all: string[], fallback: string) {
  const v = env ?? fallback;
  return v === "all" ? all : v.split(",").map((s) => s.trim());
}

/** The matrix in the order the config runs it (one Playwright project per cell). */
export function matrixOf(env: Env): Matrix {
  return {
    langs: list(env.UX_LANG, LANGS, "en"),
    themes: list(env.UX_THEME?.replace("both", "light,dark"), THEMES, "light"),
    viewports: list(env.UX_VIEWPORT, Object.keys(VIEWPORTS), "1280x800"),
  };
}

/** Sorted, de-duplicated, lower-case, without empty entries. */
function norm(values: string[]): string[] {
  const clean = values.map((v) => v.trim().toLowerCase()).filter(Boolean);
  return [...new Set(clean)].sort();
}

/** The same matrix however it was spelt: `UX_THEME=both` and `dark,light` match. */
export function normalizeMatrix(m: Matrix): Matrix {
  return {
    langs: norm(m.langs),
    themes: norm(m.themes),
    viewports: norm(m.viewports),
  };
}

/** A folder-safe key for the matrix, e.g. `en_light_1280x800` or `cs.en_dark.light_min`. */
export function matrixKey(env: Env): string {
  const m = normalizeMatrix(matrixOf(env));
  const parts = [m.langs, m.themes, m.viewports].map((p) => p.join("."));
  for (const p of parts)
    if (!/^[a-z0-9.]+$/.test(p))
      throw new Error(`capture matrix: unexpected value in "${p}"`);
  return parts.join("_");
}

/** `UX_WORKERS` as Playwright's worker cap; unset keeps Playwright's own default. */
export function workersOf(env: Env): number | undefined {
  const raw = env.UX_WORKERS;
  if (!raw) return undefined;
  if (!/^[1-9]\d*$/.test(raw))
    throw new Error(`UX_WORKERS: "${raw}" is not a positive whole number`);
  return Number(raw);
}

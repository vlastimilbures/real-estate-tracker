// The stored appearance preference (moved from src/ui/theme.ts, ADR 0072, DR-165): the
// UI store persists it, and main.tsx reads it before first paint. Free of React and
// store imports so that pre-paint read does not pull in the store.

/** Appearance: explicit light/dark, or follow the OS ("system"). */
export type Theme = "light" | "dark" | "system";

/** localStorage key of the appearance preference (written by the UI store). */
export const THEME_KEY = "ui.theme";

/** Synchronous, store-independent read for the pre-paint init in main.tsx. */
export function readPersistedTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}
